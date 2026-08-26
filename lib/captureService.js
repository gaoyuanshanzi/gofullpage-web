const puppeteer = require('puppeteer');

/**
 * Helper to normalize and validate URL
 */
function normalizeUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) {
    throw new Error('URL을 입력해주세요.');
  }

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('유효한 HTTP 또는 HTTPS URL이어야 합니다.');
    }
    return parsed.href;
  } catch (err) {
    throw new Error(`잘못된 URL 형식입니다: ${url}`);
  }
}

/**
 * Intelligent Auto Scroll Helper
 * Scrolls down smoothly to trigger lazy-loaded images, dynamic fonts, and animations,
 * then scrolls back to top for a clean capture.
 */
async function autoScroll(page, maxScrollTimeMs = 15000) {
  await page.evaluate(async (maxTime) => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const startTime = Date.now();

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight || document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        // Check if bottom reached or timeout exceeded
        if (totalHeight >= scrollHeight || Date.now() - startTime >= maxTime) {
          clearInterval(timer);
          window.scrollTo(0, 0); // Reset to top
          resolve();
        }
      }, 100);
    });
  }, maxScrollTimeMs);

  // Wait a brief moment for assets at top/bottom to settle and render
  await new Promise((r) => setTimeout(r, 600));
}

/**
 * Launch Chromium browser instance depending on environment (Local vs Serverless/AWS Lambda)
 */
async function getBrowserInstance() {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.AWS_REGION);

  if (isServerless) {
    const chromium = require('@sparticuz/chromium-min');
    const puppeteerCore = require('puppeteer-core');

    // Configure sparticuz chromium for serverless
    chromium.setGraphicsMode = false;

    // Download & extract standalone Chromium with complete system libraries (libnss3.so, libnspr4.so, etc.)
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
    );

    return await puppeteerCore.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });
  } else {
    // Local / Node server environment
    return await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
  }
}

/**
 * Capture full webpage according to format
 * @param {Object} options
 * @param {string} options.url
 * @param {'png'|'pdf'|'html'} options.format
 * @param {number} [options.viewportWidth=1920]
 * @param {number} [options.viewportHeight=1080]
 * @param {number} [options.deviceScaleFactor=2]
 * @param {number} [options.delayMs=500]
 * @returns {Promise<{ format: string, data: string, buffer: Buffer, mimeType: string, filename: string, title: string, dimensions?: { width: number, height: number } }>}
 */
async function captureWebPage({
  url,
  format = 'png',
  viewportWidth = 1920,
  viewportHeight = 1080,
  deviceScaleFactor = 2,
  delayMs = 500,
}) {
  const targetUrl = normalizeUrl(url);
  let browser = null;

  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: Math.min(Math.max(parseInt(viewportWidth, 10) || 1920, 320), 3840),
      height: Math.min(Math.max(parseInt(viewportHeight, 10) || 1080, 480), 2160),
      deviceScaleFactor: Math.min(Math.max(parseFloat(deviceScaleFactor) || 2, 1), 3),
    });

    // Emulate standard modern Chrome user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Navigate to page with fallback timeout
    await page.goto(targetUrl, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 30000,
    });

    // Page title
    let pageTitle = 'capture';
    try {
      pageTitle = (await page.title()) || 'capture';
      // Sanitize title for filename
      pageTitle = pageTitle.replace(/[/\\?%*:|"<>]/g, '-').trim().substring(0, 50) || 'capture';
    } catch (_) {}

    // Additional settle delay if specified
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 5000)));
    }

    // Perform auto scroll to trigger lazy loaded assets
    await autoScroll(page);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeFormat = (format || 'png').toLowerCase();

    if (safeFormat === 'png') {
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      // Get page dimensions
      const bodyDimensions = await page.evaluate(() => ({
        width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      }));

      const base64 = screenshotBuffer.toString('base64');
      const filename = `${pageTitle}_${timestamp}.png`;

      return {
        format: 'png',
        data: `data:image/png;base64,${base64}`,
        buffer: screenshotBuffer,
        mimeType: 'image/png',
        filename,
        title: pageTitle,
        sizeBytes: screenshotBuffer.length,
        dimensions: bodyDimensions,
      };
    } else if (safeFormat === 'pdf') {
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });

      const base64 = pdfBuffer.toString('base64');
      const filename = `${pageTitle}_${timestamp}.pdf`;

      return {
        format: 'pdf',
        data: `data:application/pdf;base64,${base64}`,
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        filename,
        title: pageTitle,
        sizeBytes: pdfBuffer.length,
      };
    } else if (safeFormat === 'html') {
      const htmlContent = await page.content();
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      const filename = `${pageTitle}_${timestamp}.html`;

      return {
        format: 'html',
        data: htmlContent,
        buffer: htmlBuffer,
        mimeType: 'text/html; charset=utf-8',
        filename,
        title: pageTitle,
        sizeBytes: htmlBuffer.length,
      };
    } else {
      throw new Error(`지원하지 않는 포맷입니다: ${format}. (png, pdf, html 중 선택)`);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  normalizeUrl,
  autoScroll,
  captureWebPage,
};

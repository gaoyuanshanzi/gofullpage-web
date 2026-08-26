// Ensure AWS Lambda / Vercel runtime is properly recognized BEFORE importing @sparticuz/chromium
if (process.env.VERCEL || process.env.AWS_REGION || process.env.NOW_REGION) {
  process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';
  process.env.FONTCONFIG_PATH = '/tmp/fonts';
  process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', '/tmp/al2/lib', '/tmp/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

const puppeteer = require('puppeteer');
const fs = require('fs');

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
      }, 120);
    });
  }, maxScrollTimeMs);

  // Wait a brief moment for assets at top/bottom to settle and render
  await new Promise((r) => setTimeout(r, 800));
}

/**
 * Launch Chromium browser instance depending on environment (Local vs Serverless/AWS Lambda)
 */
async function getBrowserInstance() {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.AWS_REGION || process.env.NOW_REGION);

  if (isServerless) {
    process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';
    process.env.FONTCONFIG_PATH = '/tmp/fonts';
    process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', '/tmp/al2/lib', '/tmp/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

    const chromium = require('@sparticuz/chromium');
    const puppeteerCore = require('puppeteer-core');

    // If /tmp/chromium exists without /tmp/al2023/lib, clean it so lambdafs extracts the full al2023 libraries
    try {
      if (fs.existsSync('/tmp/chromium') && !fs.existsSync('/tmp/al2023/lib')) {
        fs.unlinkSync('/tmp/chromium');
      }
    } catch (_) {}

    const executablePath = await chromium.executablePath();

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
      headless: chromium.headless,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/al2/lib', '/tmp/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      },
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
      // Emulate screen media for PDF so CSS looks exactly like desktop screen instead of print-mode
      await page.emulateMediaType('screen');

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
      // Process DOM to resolve lazy-loaded images, convert relative URLs to absolute, and unblock hotlinking
      await page.evaluate((baseUrl) => {
        // 1. Resolve all <img> elements
        document.querySelectorAll('img').forEach((img) => {
          const realSrc = img.currentSrc ||
                          img.getAttribute('data-src') ||
                          img.getAttribute('data-original') ||
                          img.getAttribute('data-lazy-src') ||
                          img.getAttribute('data-actualsrc') ||
                          img.getAttribute('data-url') ||
                          img.getAttribute('src') ||
                          img.src;
          if (realSrc) {
            try {
              img.src = new URL(realSrc, baseUrl).href;
              img.setAttribute('src', img.src);
            } catch (_) {}
          }
          // Fix srcset
          if (img.srcset) {
            try {
              const resolvedSrcset = img.srcset.split(',').map((part) => {
                const [u, size] = part.trim().split(/\s+/);
                if (u) {
                  const fullUrl = new URL(u, baseUrl).href;
                  return size ? `${fullUrl} ${size}` : fullUrl;
                }
                return part;
              }).join(', ');
              img.setAttribute('srcset', resolvedSrcset);
            } catch (_) {}
          }
          img.removeAttribute('loading');
        });

        // 2. Resolve stylesheets
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          const href = link.getAttribute('href');
          if (href) {
            try {
              link.setAttribute('href', new URL(href, baseUrl).href);
            } catch (_) {}
          }
        });

        // 3. Resolve <source> elements (picture tags, audio, video)
        document.querySelectorAll('source').forEach((source) => {
          const src = source.getAttribute('src');
          if (src) {
            try {
              source.setAttribute('src', new URL(src, baseUrl).href);
            } catch (_) {}
          }
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            try {
              const resolvedSrcset = srcset.split(',').map((part) => {
                const [u, size] = part.trim().split(/\s+/);
                if (u) {
                  const fullUrl = new URL(u, baseUrl).href;
                  return size ? `${fullUrl} ${size}` : fullUrl;
                }
                return part;
              }).join(', ');
              source.setAttribute('srcset', resolvedSrcset);
            } catch (_) {}
          }
        });

        // 4. Resolve background images in inline styles
        document.querySelectorAll('*[style*="background"]').forEach((el) => {
          const style = el.getAttribute('style');
          if (style && style.includes('url(')) {
            const updated = style.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, u) => {
              if (u.startsWith('data:') || u.startsWith('http://') || u.startsWith('https://')) return match;
              try {
                return `url("${new URL(u, baseUrl).href}")`;
              } catch (_) {
                return match;
              }
            });
            el.setAttribute('style', updated);
          }
        });
      }, targetUrl);

      let htmlContent = await page.content();

      // Inject base tag and referrer policy so images and styles load properly on local offline file viewing
      const injection = `\n  <base href="${targetUrl}">\n  <meta name="referrer" content="no-referrer">`;
      if (htmlContent.includes('<head')) {
        htmlContent = htmlContent.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
      } else {
        htmlContent = `<head>${injection}</head>\n` + htmlContent;
      }

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

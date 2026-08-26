// Ensure AWS Lambda / Vercel runtime is properly recognized BEFORE any other imports
if (process.env.VERCEL || process.env.AWS_REGION || process.env.NOW_REGION) {
  process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';
  process.env.FONTCONFIG_PATH = '/tmp/fonts';
  process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', '/tmp/al2/lib', '/tmp/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

const { captureWebPage } = require('../lib/captureService');

// Vercel Serverless Function handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. POST is required.' });
  }

  const {
    url,
    format = 'png',
    viewportWidth = 1920,
    viewportHeight = 1080,
    deviceScaleFactor = 2,
    delayMs = 500,
    download = false,
  } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL은 필수 입력 항목입니다.' });
  }

  try {
    const startTime = Date.now();
    const result = await captureWebPage({
      url,
      format,
      viewportWidth: Number(viewportWidth),
      viewportHeight: Number(viewportHeight),
      deviceScaleFactor: Number(deviceScaleFactor),
      delayMs: Number(delayMs),
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (download || req.query.download === 'true') {
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      return res.send(result.buffer);
    }

    return res.status(200).json({
      success: true,
      filename: result.filename,
      format: result.format,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      title: result.title,
      dimensions: result.dimensions || null,
      data: result.data,
      durationSeconds: Number(duration),
    });
  } catch (error) {
    console.error('[VERCEL-CAPTURE] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '웹페이지 캡처 중 오류가 발생했습니다.',
    });
  }
};

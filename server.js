const express = require('express');
const cors = require('cors');
const path = require('path');
const { captureWebPage } = require('./lib/captureService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Capture API Endpoint
 * Supports JSON response with base64 for preview, or direct binary download (?download=true)
 */
app.post('/api/capture', async (req, res) => {
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
    console.log(`[CAPTURE] Started: URL=${url}, Format=${format}`);
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
    console.log(`[CAPTURE] Finished in ${duration}s: ${result.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB)`);

    // If client requested direct file attachment
    if (download || req.query.download === 'true') {
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      return res.send(result.buffer);
    }

    // Default: return JSON with preview payload and metadata
    return res.json({
      success: true,
      filename: result.filename,
      format: result.format,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      title: result.title,
      dimensions: result.dimensions || null,
      data: result.data, // Base64 Data URL or HTML string
      durationSeconds: Number(duration),
    });
  } catch (error) {
    console.error('[CAPTURE] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || '웹페이지 캡처 중 오류가 발생했습니다.',
    });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 GoFullPage Web server is running at http://localhost:${PORT}`);
});

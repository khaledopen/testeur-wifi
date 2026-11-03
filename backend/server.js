const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8000;

app.use(cors());

// 1MB buffer
const CHUNK_SIZE = 1024 * 1024;
const CHUNK_BUFFER = Buffer.alloc(CHUNK_SIZE, 0);

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/download', (req, res) => {
  let sizeMb = parseInt(req.query.size_mb, 10) || 25;
  sizeMb = Math.max(1, Math.min(sizeMb, 250));

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', sizeMb * CHUNK_SIZE);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  let sent = 0;
  function sendChunk() {
    while (sent < sizeMb) {
      sent++;
      const ok = res.write(CHUNK_BUFFER);
      if (!ok) {
        res.once('drain', sendChunk);
        return;
      }
    }
    res.end();
  }
  sendChunk();
});

app.post('/api/upload', (req, res) => {
  let receivedBytes = 0;
  req.on('data', chunk => {
    receivedBytes += chunk.length;
  });
  req.on('end', () => {
    res.json({ status: 'success', received_bytes: receivedBytes });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Speedtest backend running at http://localhost:${PORT}`);
});


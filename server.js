const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', (req, res) => {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'API key not configured' });
    return;
  }

  const body = JSON.stringify(req.body);
  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const r = https.request(options, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('end', () => {
      res.writeHead(resp.statusCode, { 'Content-Type': 'application/json' });
      res.end(d);
    });
  });

  r.on('error', (e) => {
    res.status(500).json({ error: e.message });
  });

  r.write(body);
  r.end();
});

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Вера запущена на порту ${PORT}`);
});

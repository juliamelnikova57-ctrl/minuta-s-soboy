const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Кэш слова дня — хранится в памяти сервера
let todayCache = { date: null, data: null };

function anthropicRequest(body) {
  return new Promise((resolve, reject) => {
    const API_KEY = process.env.ANTHROPIC_API_KEY;
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const r = https.request(options, (resp) => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => resolve({ status: resp.statusCode, body: d }));
    });
    r.on('error', reject);
    r.write(bodyStr);
    r.end();
  });
}

// Слово дня — одно для всех, генерируется по дате
app.get('/api/today', async (req, res) => {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  // Если кэш свежий — отдаём сразу
  if (todayCache.date === today && todayCache.data) {
    return res.json(todayCache.data);
  }

  try {
    const prompt = `Сегодняшняя дата: ${today}. На основе этой даты сгенерируй для дневника рефлексии:
1. Одно русское слово (существительное) которое несёт глубину и может открыть рефлексию. Не банальное. Каждый день слово должно быть разным — дата определяет выбор.
2. Короткий образ из природы (2-3 предложения, максимум 40 слов). Тихий, поэтичный, без морали.
3. Один вопрос для рефлексии (не более 15 слов). Про сейчас. Открытый.
Ответь строго JSON без markdown: {"word":"...","nature":"...","question":"..."}`;

    const result = await anthropicRequest({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: 'Ты создаёшь поэтичный контент для дневника рефлексии. Отвечаешь только JSON без markdown.',
      messages: [{ role: 'user', content: prompt }]
    });

    if (result.status !== 200) {
      console.error('Anthropic error:', result.body);
      return res.status(500).json({ error: 'Anthropic error' });
    }

    const parsed = JSON.parse(result.body);
    const text = parsed.content[0].text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
    data.date = today;

    todayCache = { date: today, data };
    res.json(data);

  } catch (e) {
    console.error('Today generation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Чат с Верой
app.post('/api/chat', (req, res) => {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY не задан');
    return res.status(500).json({ error: { message: 'API key not configured on server' } });
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
      if (resp.statusCode !== 200) console.error('Anthropic error', resp.statusCode, d);
      res.writeHead(resp.statusCode, { 'Content-Type': 'application/json' });
      res.end(d);
    });
  });

  r.on('error', (e) => {
    console.error('Request error:', e.message);
    res.status(500).json({ error: { message: e.message } });
  });

  r.write(body);
  r.end();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Вера запущена на порту ${PORT}`);
  console.log('API_KEY задан:', !!process.env.ANTHROPIC_API_KEY);
});

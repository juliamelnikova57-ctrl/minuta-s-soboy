const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Структура метафорических карт по категориям.
// Каждая категория несёт свой круг подходящих слов и вопросов —
// так слово и вопрос никогда не разойдутся по смыслу с образом,
// но при этом не привязаны жёстко к одной конкретной картинке.
const CARD_CATEGORIES = {
  "put-i-vybor": {
    title: "Путь и выбор",
    theme: "переход, движение, момент между \"было\" и \"будет\", выбор направления",
    words: ["Преддверие", "Развилка", "Перепутье", "Порог", "Направление", "Распутье", "Зов"],
    questions: [
      "Что первым привлекло твоё внимание в этом образе?",
      "На какую деталь в этой картине хочется смотреть дольше?",
      "Куда тянет двинуться, если довериться этому образу?",
      "Что в этой картине задерживает взгляд сильнее всего?"
    ],
    images: ["crossroad.png", "bridge.png", "mountain-path.png", "stone-gate.png"]
  },
  "vnutrennee-sostoyanie": {
    title: "Внутреннее состояние",
    theme: "чувства и переживания, контакт с тем, что происходит внутри прямо сейчас",
    words: ["Отголосок", "Туман", "Глубина", "Гул", "Прилив", "Затишье", "Дрожь"],
    questions: [
      "Что первым привлекло твоё внимание в этом образе?",
      "На какую деталь в этой картине хочется смотреть дольше?",
      "Что в этой картине задерживает взгляд сильнее всего?",
      "Если задержаться на этом образе подольше — что начинаешь замечать?"
    ],
    images: ["windy-field.png", "rain.png", "boat.png", "fog-cliff.png"]
  },
  "opora-i-resursy": {
    title: "Опора и ресурсы",
    theme: "устойчивость, то на что можно опереться, источник сил",
    words: ["Корень", "Опора", "Убежище", "Тепло", "Почва", "Гнездо", "Якорь"],
    questions: [
      "Что первым привлекло твоё внимание в этом образе?",
      "На какую деталь в этой картине хочется смотреть дольше?",
      "Что в этой картине задерживает взгляд сильнее всего?",
      "Если задержаться на этом образе подольше — что начинаешь замечать?"
    ],
    images: ["tree-roots.png", "rock-flowers.png", "bowl.png", "cottage.png"]
  },
  "otnosheniya-i-granitsy": {
    title: "Отношения и границы",
    theme: "связь с другими, дистанция и близость, личные границы",
    words: ["Близость", "Расстояние", "Нить", "Грань", "Полёт", "Касание", "Свобода"],
    questions: [
      "Что первым привлекло твоё внимание в этом образе?",
      "На какую деталь в этой картине хочется смотреть дольше?",
      "Что в этой картине задерживает взгляд сильнее всего?",
      "Если задержаться на этом образе подольше — что начинаешь замечать?"
    ],
    images: ["two-birds.png", "cage.png", "garden-path.png", "dock.png"]
  },
  "rost-i-izmeneniya": {
    title: "Рост и изменения",
    theme: "развитие, перемены, то что становится другим со временем",
    words: ["Прорастание", "Перемена", "Восход", "Развёртывание", "Созревание", "Перерождение", "Раскрытие"],
    questions: [
      "Что первым привлекло твоё внимание в этом образе?",
      "На какую деталь в этой картине хочется смотреть дольше?",
      "Что в этой картине задерживает взгляд сильнее всего?",
      "Если задержаться на этом образе подольше — что начинаешь замечать?"
    ],
    images: ["sunset-valley.png", "stairs-clouds.png", "eagle-fog.png", "flower-rocks.png"]
  }
};

// Кэш дня — одна и та же карта, слово, образ и вопрос для всех в этот день
let todayCache = { date: null, data: null };

function pickDailyItem(array, seedString) {
  // Простой детерминированный выбор по дате — одно и то же значение для всех в этот день
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash * 31 + seedString.charCodeAt(i)) >>> 0;
  }
  return array[hash % array.length];
}

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

// Главная практика дня — карта, слово (из круга категории), природный образ под это слово, и вопрос.
// Всё одно для всех пользователей в этот день, выбирается детерминированно по дате.
app.get('/api/today', async (req, res) => {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  if (todayCache.date === today && todayCache.data) {
    return res.json(todayCache.data);
  }

  try {
    const categoryKeys = Object.keys(CARD_CATEGORIES);
    const categoryKey = pickDailyItem(categoryKeys, today + '-category');
    const category = CARD_CATEGORIES[categoryKey];

    const image = pickDailyItem(category.images, today + '-image');
    const word = pickDailyItem(category.words, today + '-word');
    const question = pickDailyItem(category.questions, today + '-question');

    const prompt = `Слово дня — "${word}". Внутренняя тема дня: ${category.theme}.

Напиши короткий образ из природы (2-3 предложения, максимум 40 слов), который раскрывает именно эту тему и это слово. Важно: пиши не про конкретный предмет (дверь, дорогу и т.п.), а про само состояние, момент, ощущение — так чтобы образ ощущался созвучным теме, а не описывал что-то буквальное. Тихий, поэтичный, без морали. Ответь строго JSON без markdown: {"nature":"..."}`;

    const result = await anthropicRequest({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      system: 'Ты создаёшь поэтичный контент для дневника рефлексии. Отвечаешь только JSON без markdown.',
      messages: [{ role: 'user', content: prompt }]
    });

    if (result.status !== 200) {
      console.error('Anthropic error:', result.body);
      return res.status(500).json({ error: 'Anthropic error' });
    }

    const parsed = JSON.parse(result.body);
    const text = parsed.content[0].text.replace(/```json|```/g, '').trim();
    const { nature } = JSON.parse(text);

    const data = {
      date: today,
      category: category.title,
      image: `/cards/${categoryKey}/${image}`,
      word,
      nature,
      question
    };

    todayCache = { date: today, data };
    res.json(data);

  } catch (e) {
    console.error('Today generation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('API_KEY задан:', !!process.env.ANTHROPIC_API_KEY);
});


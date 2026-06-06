// ─── Netlify Function: Yandex Cloud (Vision + GPT) ───────────────────────────
// Переменные окружения Netlify (добавить в Site configuration → Environment variables):
//   YANDEX_API_KEY   = ваш API ключ  (начинается с AQVN...)
//   YANDEX_FOLDER_ID = идентификатор каталога (b1g8s...)

const VISION_URL = 'https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze'
const GPT_URL    = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'

// ─── CORS заголовки ───────────────────────────────────────────────────────────

const HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':'Content-Type',
}

// ─── Основной обработчик ──────────────────────────────────────────────────────

exports.handler = async (event) => {

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey  = process.env.YANDEX_API_KEY
  const folder  = process.env.YANDEX_FOLDER_ID

  if (!apiKey || !folder) {
    return {
      statusCode: 500, headers: HEADERS,
      body: JSON.stringify({ error: 'YANDEX_API_KEY или YANDEX_FOLDER_ID не настроены в переменных окружения Netlify' })
    }
  }

  try {
    const body   = JSON.parse(event.body)
    const action = body.action  // 'ocr' | 'gpt' | 'advice' | 'deals'

    if (action === 'ocr') {
      return await handleOCR(body.base64, body.mimeType, apiKey, folder)
    }
    if (action === 'gpt') {
      return await handleGPT(body.prompt, apiKey, folder)
    }
    if (action === 'advice') {
      return await handleAdvice(body.expenses, body.deals, apiKey, folder)
    }
    if (action === 'deals') {
      return await handleDeals(apiKey, folder)
    }

    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Неизвестный action' }) }

  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) }
  }
}

// ─── OCR: читаем текст с фото чека через YandexVision ────────────────────────

async function handleOCR(base64, mimeType, apiKey, folder) {
  const resp = await fetch(VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${apiKey}` },
    body: JSON.stringify({
      folderId: folder,
      analyzeSpecs: [{
        content: base64,
        features: [{
          type: 'TEXT_DETECTION',
          textDetectionConfig: {
            languageCodes: ['ru', 'en'],
          }
        }]
      }]
    })
  })

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error('YandexVision ошибка: ' + (e?.error?.message || resp.status))
  }

  const data = await resp.json()

  // Собираем весь распознанный текст в одну строку
  const pages  = data?.results?.[0]?.results?.[0]?.textDetection?.pages || []
  const lines  = []

  for (const page of pages) {
    for (const block of (page.blocks || [])) {
      for (const line of (block.lines || [])) {
        const lineText = (line.words || []).map(w => w.text).join(' ')
        if (lineText.trim()) lines.push(lineText.trim())
      }
    }
  }

  const rawText = lines.join('\n')
  if (!rawText) throw new Error('YandexVision не смог прочитать текст с фото. Попробуйте другое фото.')

  return {
    statusCode: 200, headers: HEADERS,
    body: JSON.stringify({ rawText })
  }
}

// ─── GPT: парсим текст чека через YandexGPT ──────────────────────────────────

async function handleGPT(prompt, apiKey, folder) {
  const resp = await fetch(GPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${apiKey}` },
    body: JSON.stringify({
      modelUri: `gpt://${folder}/yandexgpt/latest`,
      completionOptions: {
        stream: false,
        temperature: 0.1,
        maxTokens: 1000
      },
      messages: [
        {
          role: 'system',
          text: 'Ты помощник для анализа кассовых чеков. Отвечай только валидным JSON без лишнего текста.'
        },
        {
          role: 'user',
          text: prompt
        }
      ]
    })
  })

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error('YandexGPT ошибка: ' + (e?.error?.message || resp.status))
  }

  const data = await resp.json()
  const text = data?.result?.alternatives?.[0]?.message?.text || ''

  return {
    statusCode: 200, headers: HEADERS,
    body: JSON.stringify({ text })
  }
}

// ─── Советы по бюджету ────────────────────────────────────────────────────────

async function handleAdvice(expenses, deals, apiKey, folder) {
  const byC = {}; let total = 0
  expenses.forEach(e => {
    byC[e.category] = (byC[e.category] || 0) + e.amount
    total += e.amount
  })

  const LABELS = {
    food:'Продукты', cafe:'Кафе', transport:'Транспорт',
    health:'Здоровье', entertainment:'Развлечения',
    clothes:'Одежда', home:'Дом и быт', other:'Прочее'
  }

  const summary = Object.entries(byC).sort((a,b)=>b[1]-a[1])
    .map(([c,a]) => `${LABELS[c]||c}: ${a.toLocaleString('ru-RU')} ₽`).join(', ')

  const dealsText = deals?.length > 0
    ? `\n\nАКТУАЛЬНЫЕ АКЦИИ В МАГАЗИНАХ:\n${deals.map(d=>`• ${d.store}: ${d.product} — ${d.discount}`).join('\n')}`
    : ''

  const fuelHint = byC.transport > 0
    ? `\nНа топливо потрачено ${byC.transport.toLocaleString('ru-RU')} ₽. Порекомендуй конкретные АЗС (Татнефть ~54₽/л, Роснефть ~55₽/л, Лукойл ~56₽/л).`
    : ''

  const prompt = `Ты финансовый советник. Расходы пользователя: ${summary}. Итого: ${total.toLocaleString('ru-RU')} ₽.${fuelHint}${dealsText}

Дай ровно 3 конкретные рекомендации по экономии.
Каждая: категория + текущая сумма + конкретное действие + сумма экономии в рублях.
Начинай с эмодзи. Без вступлений.`

  const resp = await fetch(GPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${apiKey}` },
    body: JSON.stringify({
      modelUri: `gpt://${folder}/yandexgpt/latest`,
      completionOptions: { stream: false, temperature: 0.3, maxTokens: 800 },
      messages: [
        { role: 'system', text: 'Ты персональный финансовый советник. Давай конкретные советы с цифрами.' },
        { role: 'user',   text: prompt }
      ]
    })
  })

  const data = await resp.json()
  const text = data?.result?.alternatives?.[0]?.message?.text || 'Не удалось получить советы.'

  return {
    statusCode: 200, headers: HEADERS,
    body: JSON.stringify({ text })
  }
}

// ─── Актуальные акции магазинов ───────────────────────────────────────────────

async function handleDeals(apiKey, folder) {
  const plus3 = new Date(Date.now() + 3*86400000).toLocaleDateString('ru-RU')
  const plus5 = new Date(Date.now() + 5*86400000).toLocaleDateString('ru-RU')
  const plus7 = new Date(Date.now() + 7*86400000).toLocaleDateString('ru-RU')

  const prompt = `Сгенерируй 10 реалистичных акций в российских супермаркетах (Магнит, Пятёрочка, Перекрёсток, ВкусВилл).
Цены реальные для России 2025 года. Категории: молочное, мясо, рыба, хлеб, овощи, фрукты, крупы, напитки.

Верни ТОЛЬКО JSON массив:
[{"store":"Магнит","product":"Молоко 3.2% 1л","oldPrice":89,"newPrice":65,"discount":"−27%","category":"молочное","until":"${plus5}"},
{"store":"Пятёрочка","product":"Куриная грудка 1кг","oldPrice":320,"newPrice":239,"discount":"−25%","category":"мясо","until":"${plus3}"},
{"store":"Перекрёсток","product":"Лосось стейк 500г","oldPrice":450,"newPrice":329,"discount":"−27%","category":"рыба","until":"${plus7}"}]

Только JSON массив, без пояснений.`

  const resp = await fetch(GPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Api-Key ${apiKey}` },
    body: JSON.stringify({
      modelUri: `gpt://${folder}/yandexgpt/latest`,
      completionOptions: { stream: false, temperature: 0.2, maxTokens: 1500 },
      messages: [
        { role: 'system', text: 'Отвечай только валидным JSON без лишнего текста и markdown.' },
        { role: 'user',   text: prompt }
      ]
    })
  })

  const data = await resp.json()
  const text = data?.result?.alternatives?.[0]?.message?.text || '[]'
  const clean = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim()
  const match = clean.match(/\[[\s\S]*\]/)

  let deals = []
  try { if (match) deals = JSON.parse(match[0]) } catch {}

  return {
    statusCode: 200, headers: HEADERS,
    body: JSON.stringify({ deals })
  }
}

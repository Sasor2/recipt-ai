// Фронтенд → /.netlify/functions/yandex (наш сервер) → Yandex Cloud API
// Ключи хранятся только на сервере Netlify

const ENDPOINT = '/.netlify/functions/yandex'

// ─── Базовый запрос к нашей функции ──────────────────────────────────────────

async function callYandex(action, payload = {}) {
  const resp = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, ...payload }),
  })

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e?.error || `Ошибка сервера: ${resp.status}`)
  }

  return await resp.json()
}

// ─── Надёжный парсер JSON ─────────────────────────────────────────────────────

function extractJSON(text) {
  const s     = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim()
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (esc)               { esc = false; continue }
    if (ch==='\\' && inStr){ esc = true;  continue }
    if (ch==='"')          { inStr = !inStr; continue }
    if (inStr)             continue
    if (ch==='{')          depth++
    if (ch==='}')          { depth--; if(depth===0) return s.slice(start,i+1) }
  }
  return null
}

function parseAmount(raw) {
  if (raw == null) return 0
  const s = String(raw).replace(/[≡=\s₽руб]/gi,'').replace(/[^\d.,]/g,'').replace(',','.')
  return parseFloat(s) || 0
}

// ─── ГЛАВНАЯ ФУНКЦИЯ: распознавание чека ─────────────────────────────────────
// Шаг 1: YandexVision читает текст с фото
// Шаг 2: YandexGPT парсит текст и извлекает данные

export async function parseReceiptImage(file) {
  // Конвертируем фото в base64
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })

  const mimeType = file.type?.startsWith('image/') ? file.type : 'image/jpeg'
  const today    = new Date().toISOString().split('T')[0]

  // ── Шаг 1: OCR — читаем текст с фото ────────────────────────────────────
  let rawText = ''
  try {
    const ocrResult = await callYandex('ocr', { base64, mimeType })
    rawText = ocrResult.rawText || ''
  } catch (e) {
    throw new Error('Ошибка распознавания текста: ' + e.message)
  }

  if (!rawText.trim()) {
    throw new Error('Не удалось прочитать текст с фото. Убедитесь что чек в фокусе и хорошо освещён.')
  }

  // ── Шаг 2: GPT — парсим текст чека ──────────────────────────────────────
  const prompt = `Вот текст кассового чека распознанный с фото:

${rawText}

Найди и верни данные в JSON.

КАК НАЙТИ ИТОГОВУЮ СУММУ:
- Ищи строку с ИТОГ, ИТОГО, К ОПЛАТЕ, ВСЕГО
- Символы ≡ и = перед числом — просто оформление, игнорируй их
- Пример строки: «ИТОГ   ≡519.19» → amount = 519.19
- НЕ бери строки: НАЛИЧНЫМИ, ПОЛУЧЕНО, СДАЧА

КАК ВЫДЕЛЯТЬ ТОВАРЫ:
- Каждый товар отдельным элементом
- Для продуктов добавляй тип: "Молоко Домик 1л (молочное)", "Грудка куриная (мясо)"

КАТЕГОРИЯ: food=продукты, cafe=кафе/ресторан, transport=АЗС/топливо, health=аптека, entertainment=развлечения, clothes=одежда, home=хозтовары, other=прочее
SUBCATEGORY (только для food): мясо | молочное | хлеб | овощи | фрукты | крупы | напитки | сладкое | рыба | другое

Верни ТОЛЬКО JSON:
{"store":"название","amount":519.19,"date":"YYYY-MM-DD","items":["товар1","товар2"],"category":"food","subcategory":"молочное"}

Дата из чека YYYY-MM-DD. Если не найдена — "${today}".`

  const gptResult = await callYandex('gpt', { prompt })
  const text      = gptResult.text || ''

  const jsonStr = extractJSON(text)
  if (!jsonStr) throw new Error(`GPT не вернул JSON. Ответ: "${text.slice(0, 200)}"`)

  let p
  try { p = JSON.parse(jsonStr) }
  catch (e) { throw new Error('Ошибка разбора JSON: ' + e.message) }

  const amount = parseAmount(p.amount)
  if (amount === 0) throw new Error(`Сумма = 0. Проверьте что строка ИТОГ видна на фото.`)

  return {
    store:       String(p.store       || 'Магазин'),
    amount,
    date:        String(p.date        || today),
    items:       Array.isArray(p.items) ? p.items.filter(Boolean).slice(0, 30) : [],
    category:    String(p.category    || 'other'),
    subcategory: String(p.subcategory || ''),
  }
}

// ─── ИИ-советы по бюджету ─────────────────────────────────────────────────────

export async function getAIAdvice(expenses, deals = []) {
  const result = await callYandex('advice', { expenses, deals })
  return result.text || 'Не удалось получить советы.'
}

// ─── Актуальные акции магазинов ───────────────────────────────────────────────

export async function fetchCurrentDeals() {
  const result = await callYandex('deals')
  return result.deals || []
}

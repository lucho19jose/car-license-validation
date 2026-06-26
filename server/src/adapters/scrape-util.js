// Utilidades compartidas por los adapters de scraping (SOAT, MTC, SUNARP).
import { solveImageCaptcha } from './captcha.js'

// Normaliza una etiqueta de tabla: mayúsculas, espacios colapsados, sin ":".
export const normLabel = (s) =>
  (s || '').toUpperCase().replace(/\s+/g, ' ').replace(/:$/, '').trim()

// ¿El error vale la pena reintentarlo? (captcha mal resuelto o fallo transitorio)
export function isRetryable(err) {
  return /captcha|timeout|net::|ECONN|ETIMEDOUT|socket|navigation|target closed/i.test(
    err?.message || ''
  )
}

// Espera con backoff exponencial: intento 1 ≈ base, 2 ≈ 2·base, 3 ≈ 4·base…
export const backoff = (attempt, base = 800) =>
  new Promise((r) => setTimeout(r, base * 2 ** (attempt - 1)))

// ¿La fecha dd/mm/yyyy sigue vigente (>= hoy)? null si no parsea.
export function isVigente(ddmmyyyy) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(ddmmyyyy || '')
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59)
  return d.getTime() >= Date.now()
}

// Resuelve el captcha de imagen SOLO si existe en la página (algunos sitios no
// tienen). Devuelve true si lo resolvió, false si no había captcha.
export async function solveCaptchaIfPresent(page, captchaImgSel, captchaInputSel) {
  const img = page.locator(captchaImgSel).first()
  if ((await img.count()) === 0) return false
  const buf = await img.screenshot()
  const solution = await solveImageCaptcha(buf.toString('base64'))
  await page.fill(captchaInputSel, solution)
  return true
}

// Lee una tabla/lista de filas etiqueta→valor y la mapea a campos del DTO.
export async function parseLabeledRows(page, rowSel, labelMap) {
  const rows = await page.locator(rowSel).all()
  const out = {}
  for (const row of rows) {
    const cells = await row.locator('td, th, dt, dd').allInnerTexts()
    if (cells.length < 2) continue
    const field = labelMap[normLabel(cells[0])]
    if (field && !out[field]) out[field] = cells[1].trim()
  }
  return out
}

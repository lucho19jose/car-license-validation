import { config } from '../config.js'

// Cliente mínimo de 2captcha (https://2captcha.com/2captcha-api) usando fetch.
// Sin dependencias extra. Soporta captcha de imagen (texto distorsionado, el
// caso típico de SUNARP) y reCAPTCHA v2 (por si el sitio cambia).

const IN_URL = 'https://2captcha.com/in.php'
const RES_URL = 'https://2captcha.com/res.php'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function requireKey() {
  if (!config.twoCaptchaKey) {
    throw new Error('TWOCAPTCHA_KEY no configurada en .env')
  }
  return config.twoCaptchaKey
}

// Sondea res.php hasta que la respuesta esté lista o venza el timeout.
async function poll(key, id, { timeoutMs = 120000, intervalMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs
  await sleep(intervalMs) // 2captcha pide esperar antes del primer sondeo
  while (Date.now() < deadline) {
    const r = await fetch(
      `${RES_URL}?key=${key}&action=get&id=${id}&json=1`
    ).then((x) => x.json())
    if (r.status === 1) return r.request
    if (r.request !== 'CAPCHA_NOT_READY') {
      throw new Error('2captcha res error: ' + r.request)
    }
    await sleep(intervalMs)
  }
  throw new Error('2captcha timeout esperando solución')
}

// Resuelve un captcha de imagen. `base64` es la imagen del captcha (sin prefijo data:).
export async function solveImageCaptcha(base64) {
  const key = requireKey()
  const r = await fetch(IN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, method: 'base64', body: base64, json: '1' }),
  }).then((x) => x.json())
  if (r.status !== 1) throw new Error('2captcha in error: ' + r.request)
  return poll(key, r.request)
}

// Resuelve un reCAPTCHA v2 (si SUNARP lo usara en lugar de imagen).
export async function solveRecaptchaV2(siteKey, pageUrl) {
  const key = requireKey()
  const r = await fetch(IN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      key,
      method: 'userrecaptcha',
      googlekey: siteKey,
      pageurl: pageUrl,
      json: '1',
    }),
  }).then((x) => x.json())
  if (r.status !== 1) throw new Error('2captcha in error: ' + r.request)
  return poll(key, r.request, { timeoutMs: 180000 })
}

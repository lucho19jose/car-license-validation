import { config } from '../config.js'

// Cliente mínimo de 2captcha (https://2captcha.com/2captcha-api) usando fetch.
// Sin dependencias extra. Soporta captcha de imagen (texto distorsionado, el
// caso típico de SUNARP) y reCAPTCHA v2 (por si el sitio cambia).

const IN_URL = 'https://2captcha.com/in.php'
const RES_URL = 'https://2captcha.com/res.php'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// fetch→json resistente a blips de red: reintenta errores de conexión (no de HTTP)
// con un timeout por request, para que un corte momentáneo hacia 2captcha
// (Cloudflare) no tumbe la resolución completa del captcha.
async function fetchJson(url, opts = {}, { tries = 4, perReqMs = 20000, gapMs = 1500 } = {}) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(perReqMs) })
      return await r.json()
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await sleep(gapMs)
    }
  }
  throw new Error('2captcha: red inestable (' + (lastErr?.message || 'fetch falló') + ')')
}

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
    const r = await fetchJson(`${RES_URL}?key=${key}&action=get&id=${id}&json=1`)
    if (r.status === 1) return r.request
    if (r.request !== 'CAPCHA_NOT_READY') {
      throw new Error('2captcha res error: ' + r.request)
    }
    await sleep(intervalMs)
  }
  throw new Error('2captcha timeout esperando solución')
}

// Resuelve un captcha de imagen. `base64` es la imagen del captcha (sin prefijo data:).
// opts (pistas que mejoran la precisión del trabajador de 2captcha):
//   numeric: 1 = solo números, 2 = solo letras, 3 = números o letras, 4 = ambos.
//   minLen / maxLen: longitud esperada de la solución.
export async function solveImageCaptcha(base64, opts = {}) {
  const key = requireKey()
  const params = { key, method: 'base64', body: base64, json: '1' }
  if (opts.numeric != null) params.numeric = String(opts.numeric)
  if (opts.minLen != null) params.min_len = String(opts.minLen)
  if (opts.maxLen != null) params.max_len = String(opts.maxLen)
  const r = await fetchJson(IN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  if (r.status !== 1) throw new Error('2captcha in error: ' + r.request)
  return poll(key, r.request)
}

// Resuelve un Cloudflare Turnstile. `params` = { sitekey, pageurl, action?, cData?, chlPageData?, userAgent? }.
// Devuelve el token (cf-turnstile-response) que luego se inyecta en la página.
export async function solveTurnstile({ sitekey, pageurl, action, cData, chlPageData, userAgent }) {
  const key = requireKey()
  const body = { key, method: 'turnstile', sitekey, pageurl, json: '1' }
  if (action) body.action = action
  if (cData) body.data = cData
  if (chlPageData) body.pagedata = chlPageData
  if (userAgent) body.useragent = userAgent
  const r = await fetchJson(IN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (r.status !== 1) throw new Error('2captcha turnstile in error: ' + r.request)
  return poll(key, r.request, { timeoutMs: 180000 })
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

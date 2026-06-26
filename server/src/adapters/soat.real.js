import { withTiming } from './base.js'
import { newContext } from './browser.js'
import { solveImageCaptcha } from './captcha.js'
import { isRetryable, backoff } from './scrape-util.js'
import { config } from '../config.js'

// ───────────────────────────────────────────────────────────────────────────
// Adapter REAL de SOAT (APESEG) — CALIBRADO el 26/06/2026 con chrome-devtools.
//
// Hallazgos:
//  • La consulta vive en un iframe: webapp.apeseg.org.pe/consulta-soat
//    embebido en https://www.apeseg.org.pe/consultas-soat/
//  • Captcha de IMAGEN clásico (data URI base64) -> resoluble con 2captcha.
//  • Los datos llegan por API JSON: GET /consulta-soat/api/certificados/placa/{PLACA}
//    que EXIGE header x-referrer = https://www.apeseg.org.pe/ (si no, 403).
//  • Conducimos la página real embebida: así el login, el x-referrer y el
//    cifrado del captcha los maneja la propia webapp. Solo resolvemos la imagen
//    y leemos la respuesta de la API (más rico que el DOM: trae historial).
// ───────────────────────────────────────────────────────────────────────────

const SEL = {
  frame: 'iframe[src*="consulta-soat"]',
  placa: '#placa',
  captchaInput: '#captcha',
  captchaImg: 'img.captcha-img',
  submit: 'button[type="submit"]',
}
const API_CERTIFICADOS = '/consulta-soat/api/certificados/placa/'

export function consultarSoatReal(plate) {
  return withTiming(async () => {
    let lastErr
    const max = config.soat.maxCaptchaAttempts
    for (let i = 1; i <= max; i++) {
      try {
        return await intentar(plate)
      } catch (err) {
        lastErr = err
        if (!isRetryable(err) || i === max) break
        console.warn(`[soat] intento ${i}/${max} falló: ${err.message}`)
        await backoff(i)
      }
    }
    throw lastErr
  })
}

async function intentar(plate) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(config.soat.navTimeoutMs)
  try {
    // Cargar la página padre (da el x-referrer correcto a la webapp del iframe)
    await page.goto(config.soat.url, { waitUntil: 'domcontentloaded' })
    const frame = page.frameLocator(SEL.frame)

    await frame.locator(SEL.placa).fill(plate)

    // Captcha de imagen: tomamos el data URI directo (mejor fidelidad que screenshot)
    const src = await frame.locator(SEL.captchaImg).getAttribute('src')
    const b64 = (src || '').includes(',') ? src.split(',')[1] : src
    const solution = await solveImageCaptcha(b64)
    await frame.locator(SEL.captchaInput).fill(solution)

    // Disparamos y capturamos la respuesta de la API de certificados
    const respPromise = page.waitForResponse(
      (r) => r.url().includes(API_CERTIFICADOS),
      { timeout: config.soat.navTimeoutMs }
    )
    await frame.locator(SEL.submit).click()

    let resp
    try {
      resp = await respPromise
    } catch {
      throw new Error('captcha: SOAT no devolvió certificados (captcha incorrecto?)')
    }
    if (resp.status() === 403) throw new Error('SOAT 403: x-referrer/headers inválidos')
    if (!resp.ok()) throw new Error('SOAT API status ' + resp.status())

    const arr = await resp.json()
    return mapCertificados(arr)
  } finally {
    await page.close()
    await ctx.close()
  }
}

// La API devuelve un array con todo el historial. Tomamos el certificado VIGENTE
// (si lo hay) o el más reciente, y conservamos el historial completo.
function mapCertificados(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return { insurer: null, policyNumber: null, validUntil: null, valid: false, history: [] }
  }
  const vigente = arr.find((c) => (c.Estado || '').toUpperCase() === 'VIGENTE')
  const cur = vigente || arr[0]
  return {
    insurer: cur.NombreCompania ?? null,
    policyNumber: cur.NumeroPoliza ?? null,
    validUntil: cur.FechaFin ?? null,
    validFrom: cur.FechaInicio ?? null,
    valid: (cur.Estado || '').toUpperCase() === 'VIGENTE',
    certificateType: cur.TipoCertificado ?? null,
    history: arr.map((c) => ({
      insurer: c.NombreCompania,
      from: c.FechaInicio,
      to: c.FechaFin,
      estado: c.Estado,
    })),
  }
}

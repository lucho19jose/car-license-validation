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

// Espera hasta que un <img> tenga un src "data:..." válido (la SPA lo inyecta async).
// Devuelve el src; lanza si no aparece dentro del timeout (error reintentable).
async function esperarDataUri(locator, page, { tries = 40, intervalMs = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    const src = await locator.getAttribute('src').catch(() => null)
    if (src && src.startsWith('data:') && src.length > 200) return src
    await page.waitForTimeout(intervalMs)
  }
  throw new Error('captcha: la imagen no se cargó a tiempo (src vacío)')
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

    // Captcha de imagen: la webapp (SPA) inyecta el data URI de forma asíncrona,
    // así que esperamos a que el <img> tenga un src data: válido antes de leerlo.
    // Si no, capturaríamos un src vacío → 2captcha responde ERROR_UPLOAD.
    const src = await esperarDataUri(frame.locator(SEL.captchaImg), page)
    const b64 = src.includes(',') ? src.split(',')[1] : src
    // 2captcha a veces devuelve espacios; saneamos. Si queda vacío no enviamos un
    // submit garantizado-incorrecto: lanzamos error reintentable (captcha nuevo).
    const solution = (await solveImageCaptcha(b64)).replace(/\s+/g, '')
    if (!solution) throw new Error('captcha: 2captcha devolvió solución vacía (SOAT)')
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

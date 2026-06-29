import { withTiming } from './base.js'
import { newContext } from './browser.js'
import { solveImageCaptcha } from './captcha.js'
import { isRetryable, backoff } from './scrape-util.js'
import { config } from '../config.js'

// ───────────────────────────────────────────────────────────────────────────
// Adapter REAL de MTC (revisión técnica / CITV) — CALIBRADO 26/06/2026.
//
// Hallazgos:
//  • Portal ASP.NET (rec.mtc.gob.pe/Citv/ArConsultaCitv), captcha de IMAGEN
//    numérico (#imgCaptcha, data URI) → resoluble con 2captcha. Sin Cloudflare.
//  • Al buscar dispara: GET /CITV/JrCITVConsultarFiltro?pArrParametros=1|{PLACA}||{CAPTCHA}
//    Respuesta: { orStatus, orResult: ["<json-string array>", count] }
//  • Conducimos la página real, resolvemos la imagen y leemos esa respuesta JSON.
// ───────────────────────────────────────────────────────────────────────────

const SEL = {
  placa: '#texFiltro',
  captchaInput: '#texCaptcha',
  captchaImg: '#imgCaptcha',
  submit: '#btnBuscar',
}
const API_CONSULTA = '/CITV/JrCITVConsultarFiltro'

export function consultarMtcReal(plate) {
  return withTiming(async () => {
    let lastErr
    const max = config.mtc.maxCaptchaAttempts
    for (let i = 1; i <= max; i++) {
      try {
        return await intentar(plate)
      } catch (err) {
        lastErr = err
        if (!isRetryable(err) || i === max) break
        console.warn(`[mtc] intento ${i}/${max} falló: ${err.message}`)
        await backoff(i)
      }
    }
    throw lastErr
  })
}

async function intentar(plate) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(config.mtc.navTimeoutMs)
  try {
    await page.goto(config.mtc.url, { waitUntil: 'domcontentloaded' })

    await page.fill(SEL.placa, plate)

    // Captcha de imagen: tomamos el data URI directo
    const src = await page.locator(SEL.captchaImg).getAttribute('src')
    const b64 = (src || '').includes(',') ? src.split(',')[1].trim() : src
    const solution = await solveImageCaptcha(b64)
    await page.fill(SEL.captchaInput, solution)

    const respPromise = page.waitForResponse(
      (r) => r.url().includes(API_CONSULTA),
      { timeout: config.mtc.navTimeoutMs }
    )
    await page.click(SEL.submit)

    let resp
    try {
      resp = await respPromise
    } catch {
      throw new Error('captcha: MTC no devolvió resultados (captcha incorrecto?)')
    }
    if (!resp.ok()) throw new Error('MTC API status ' + resp.status())

    const payload = await resp.json()
    // El captcha correcto hace orStatus=true; uno incorrecto, orStatus=false/null.
    //  · orStatus=false  → captcha rechazado → reintentar con uno nuevo.
    //  · orStatus=true + lista vacía → la placa NO tiene CITV registrada (válido, N/D).
    if (payload?.orStatus !== true) {
      throw new Error('captcha: MTC rechazó el captcha (orStatus=false)')
    }
    return mapResultado(payload)
  } finally {
    await page.close()
    await ctx.close()
  }
}

// Extrae el array de documentos de la respuesta (orResult[0] es un STRING JSON).
function extraerDocs(payload) {
  try {
    const raw = payload?.orResult?.[0]
    return typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

// orResult[0] es un STRING JSON con el array de certificados/inspecciones.
function mapResultado(payload) {
  let arr = extraerDocs(payload)
  if (!Array.isArray(arr) || arr.length === 0) {
    return { result: 'N/D', validUntil: 'N/D', entity: 'N/D', valid: false, history: [] }
  }

  // Mapea TODOS los campos de un documento del MTC a nuestro formato.
  const mapDoc = (c) => ({
    plate: c.PLACA ?? null,
    certificate: c.NRO_CERTI ?? null,
    documentType: c.TIPODOCUMENTO ?? null, // NRO DE CERTIFICADO / NRO DE INFORME
    validFrom: c.REVISIONVIGENCIAINICIO || null,
    validUntil: c.REVISIONVIGENCIAFINAL || null,
    result: c.RESULTADO ?? null, // APROBADO / DESAPROBADO
    estado: c.ESTADO || null, // VIGENTE / VENCIDO / ''
    certifier: c.SRAZONSOCENTCER ?? null, // empresa certificadora
    address: c.DIRECCION ?? null,
    ambito: c.TIPO_AMBITO ?? null,
    service: c.TIPO_SERVICIO ?? null,
    observation: c.OBSERVACION ?? null,
  })

  const docs = arr.map(mapDoc)
  // Documento "actual": el VIGENTE si existe, si no el más reciente (primero).
  const cur = docs.find((d) => (d.estado || '').toUpperCase() === 'VIGENTE') || docs[0]

  return {
    // Campos canónicos que usa el pipeline/normalizador
    result: cur.result,
    validUntil: cur.validUntil,
    validFrom: cur.validFrom,
    entity: cur.certifier,
    certificate: cur.certificate,
    valid: (cur.estado || '').toUpperCase() === 'VIGENTE',
    // Detalle completo del documento actual
    documentType: cur.documentType,
    address: cur.address,
    ambito: cur.ambito,
    service: cur.service,
    observation: cur.observation,
    // Historial completo con TODOS los campos de cada documento
    history: docs,
  }
}

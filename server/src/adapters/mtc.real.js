import { withTiming } from './base.js'
import { newContext } from './browser.js'
import { solveImageCaptcha } from './captcha.js'
import { isRetryable, backoff } from './scrape-util.js'
import { config } from '../config.js'

// ───────────────────────────────────────────────────────────────────────────
// Adapter REAL de MTC (revisión técnica / CITV) — CALIBRADO 26/06/2026.
// Endurecido 28/06/2026 (anti falso "N/D" por captcha).
//
// Hallazgos:
//  • Portal ASP.NET (rec.mtc.gob.pe/Citv/ArConsultaCitv), captcha de IMAGEN
//    numérico (#imgCaptcha, data URI) → resoluble con 2captcha. Sin Cloudflare.
//  • Al buscar dispara: GET /CITV/JrCITVConsultarFiltro?pArrParametros=1|{PLACA}||{CAPTCHA}
//    Respuesta: { orStatus, orResult: ["<json-string array>", count] }
//  • Conducimos la página real, resolvemos la imagen y leemos esa respuesta JSON.
//
// Robustez (porqué de cada guarda):
//  • esperarDataUri: el <img> del captcha puede inyectarse async; leer su src
//    antes de tiempo manda a 2captcha un base64 vacío (mismo bug que tuvo SOAT).
//  • confirm-empty: orStatus=true + lista vacía DEBERÍA significar "no tiene CITV",
//    pero un captcha mal resuelto que el portal aceptara igual daría un falso
//    vacío → un falso "N/D". Antes de declarar "sin CITV" lo CONFIRMAMOS con
//    captchas independientes (config.mtc.confirmEmpty). Un resultado CON datos se
//    da por bueno de inmediato (no se puede fabricar por azar).
// ───────────────────────────────────────────────────────────────────────────

const SEL = {
  placa: '#texFiltro',
  captchaInput: '#texCaptcha',
  captchaImg: '#imgCaptcha',
  submit: '#btnBuscar',
}
const API_CONSULTA = '/CITV/JrCITVConsultarFiltro'

export function consultarMtcReal(plate) {
  return withTiming(() =>
    resolverMtc((attempt) => intentar(plate, attempt), {
      max: config.mtc.maxCaptchaAttempts,
      needEmpty: Math.max(1, config.mtc.confirmEmpty),
    })
  )
}

// Orquesta los intentos: aplica reintentos de captcha y confirm-empty sobre una
// función `intentar(attempt) -> docs[]` (o que lanza error reintentable). Pura y
// exportada para poder testear la lógica sin navegador/captcha (test/debug-mtc-logic.mjs).
//  · docs con elementos        → resultado fiable, se devuelve de inmediato.
//  · docs vacío (orStatus=true) → "sin CITV", pero se CONFIRMA con `needEmpty`
//    pasadas independientes antes de declararlo (evita falso N/D por captcha).
//  · error reintentable         → backoff y otra pasada (hasta `max`).
export async function resolverMtc(intentar, { max, needEmpty, wait = backoff }) {
  let lastErr
  let emptyHits = 0 // nº de pasadas con captcha válido (orStatus=true) que dieron vacío
  for (let i = 1; i <= max; i++) {
    try {
      const docs = await intentar(i)
      if (docs.length > 0) return mapResultado(docs) // hay CITV → listo

      emptyHits++
      if (emptyHits >= needEmpty) return mapResultado([]) // confirmado: N/D genuino
      console.warn(`[mtc] vacío ${emptyHits}/${needEmpty} — confirmando "sin CITV" con captcha nuevo…`)
      await wait(i)
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || i === max) break
      console.warn(`[mtc] intento ${i}/${max} falló: ${err.message}`)
      await wait(i)
    }
  }

  // Agotados los intentos: si AL MENOS una pasada con captcha válido dio vacío,
  // reportamos N/D (no confirmado del todo) en vez de tumbar la fuente. Si nunca
  // logramos una respuesta válida, propagamos el error → la fuente queda en fail.
  if (emptyHits > 0) {
    console.warn(`[mtc] N/D sin confirmar del todo (${emptyHits}/${needEmpty} vacíos)`)
    return mapResultado([])
  }
  throw lastErr || new Error('mtc: sin resultado tras agotar intentos')
}

// Espera a que el <img> del captcha tenga un data URI válido (la página puede
// inyectarlo async). Devuelve el src; lanza error reintentable si no aparece.
async function esperarDataUri(locator, page, { tries = 40, intervalMs = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    const src = await locator.getAttribute('src').catch(() => null)
    if (src && src.startsWith('data:') && src.length > 200) return src
    await page.waitForTimeout(intervalMs)
  }
  throw new Error('captcha: la imagen de MTC no se cargó a tiempo (src vacío)')
}

// Una pasada completa: navega, resuelve el captcha y devuelve el array de
// documentos (puede ser vacío si orStatus=true sin registros). Cada pasada usa un
// contexto/captcha nuevos → las confirmaciones son independientes. Lanza error
// reintentable si el captcha se rechaza o no llega respuesta de la API.
async function intentar(plate) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(config.mtc.navTimeoutMs)
  try {
    await page.goto(config.mtc.url, { waitUntil: 'domcontentloaded' })

    await page.fill(SEL.placa, plate)

    // Esperar el data URI antes de leerlo (si no, 2captcha recibiría un src vacío).
    const src = await esperarDataUri(page.locator(SEL.captchaImg), page)
    const b64 = src.includes(',') ? src.split(',')[1].trim() : src
    // El captcha de MTC es numérico → se lo decimos a 2captcha (numeric=1) para que
    // el trabajador solo ingrese dígitos: ataca la causa de las malas lecturas (antes
    // devolvía letras). 2captcha a veces añade espacios; saneamos. Si queda vacío, no
    // enviamos un submit garantizado-incorrecto: lanzamos error reintentable.
    const solution = (await solveImageCaptcha(b64, { numeric: 1 })).replace(/\s+/g, '')
    if (!solution) throw new Error('captcha: 2captcha devolvió solución vacía')
    // El captcha de MTC es SIEMPRE numérico; si 2captcha devolvió letras es una mala
    // lectura garantizada (visto en diagnóstico) → pedimos uno nuevo sin gastar el submit.
    if (!/^\d+$/.test(solution)) {
      throw new Error(`captcha: solución no numérica "${solution}" (mala lectura, descartada)`)
    }
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
    //  · orStatus=false → captcha rechazado → reintentar con uno nuevo.
    //  · orStatus=true  → captcha aceptado; la lista puede venir vacía (sin CITV).
    if (payload?.orStatus !== true) {
      throw new Error('captcha: MTC rechazó el captcha (orStatus=false)')
    }
    return extraerDocs(payload)
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

// Mapea el array de documentos del MTC a nuestro formato (o N/D si viene vacío).
function mapResultado(arr) {
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

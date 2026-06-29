import { withTiming } from './base.js'
import { solveTurnstile } from './captcha.js'
import { backoff } from './scrape-util.js'
import { config } from '../config.js'

// ───────────────────────────────────────────────────────────────────────────
// Adapter REAL de SUNARP — CALIBRADO el 27/06/2026 (reverse-engineering de la API).
//
// SUNARP NO es scrapeable con navegador: la consulta vehicular está tras
// Cloudflare Turnstile + bot management, que detecta la automatización por
// fingerprint. En su lugar replicamos la API directamente (fetch, sin browser):
//
//  1) GET  api.ipify.org                         → IP pública (va en el payload).
//  2) Turnstile (sitekey embebido) → 2captcha    → token "dG9rZW4".
//  3) POST .../multiservicio-consvehicular/consulta/getDatosVehiculo
//       headers: X-IBM-Client-Id: <clientId>
//       body:    { numPlaca, regPubId:null, oficRegId:null, ipAddress, appVersion, dG9rZW4 }
//       resp:    { cod:1, model:{ imagen(base64 PNG), sedes:[{nombre,numPartida,...}] } }
//  4) Los datos del vehículo vienen como IMAGEN con marca de agua (anti-scraping).
//     Hacemos OCR (tesseract + umbral con jimp) y parseamos etiqueta→valor.
//
// Hallazgos del bundle Angular (chunk-W3LJPTNT.js, var A_):
//   sitekey Turnstile : 0x4AAAAAACFzt4Xn8T1Jg9ZS
//   X-IBM-Client-Id   : 70574c7d9194834316a156b1d68fdb90
//   base consulta     : https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular
// ───────────────────────────────────────────────────────────────────────────

const SITEKEY = '0x4AAAAAACFzt4Xn8T1Jg9ZS'
const PAGEURL = 'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio'
const CLIENT_ID = '70574c7d9194834316a156b1d68fdb90'
const SEARCH_URL =
  'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Mapea las etiquetas que devuelve el OCR del recuadro de SUNARP → campos del DTO.
const norm = (s) => (s || '').toUpperCase().replace(/[^A-ZÑÁÉÍÓÚ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

function labelToField(label) {
  const l = norm(label)
  if (l.includes('PLACA VIGENTE')) return 'placaVigente'
  if (l.includes('PLACA ANTERIOR')) return 'placaAnterior'
  if (l.includes('PLACA')) return 'plate'
  if (l.includes('SERIE')) return 'serie'
  if (l.includes('VIN')) return 'vin'
  if (l.includes('MOTOR')) return 'engineNumber'
  if (l.includes('COLOR')) return 'color'
  if (l.includes('MARCA')) return 'make'
  if (l.includes('AÑO') || l.includes('ANO DE MODELO')) return 'year'
  if (l.includes('MODELO')) return 'model'
  if (l.includes('ESTADO')) return 'status'
  if (l.includes('ANOTACIONES')) return 'anotaciones'
  if (l.includes('SEDE')) return 'sede'
  if (l.includes('PROPIETARIO')) return 'owner'
  return null
}

// VIN/SERIE: el estándar ISO no usa O, I ni Q → corregimos confusiones típicas del OCR.
const fixVin = (s) => (s || '').toUpperCase().replace(/O/g, '0').replace(/[IQ]/g, (c) => (c === 'I' ? '1' : '0')).replace(/\s/g, '')

// N° de motor: alfanumérico (+ guion). El OCR a veces inserta símbolos sobre la marca
// de agua (p.ej. "4E€1485377" → "4E1485377"); quitamos lo que no sea [A-Z0-9-].
const fixEngine = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')

// ── OCR (worker único reutilizable) ─────────────────────────────────────────
let _workerPromise = null
async function getWorker() {
  if (!_workerPromise) {
    const { createWorker } = await import('tesseract.js')
    _workerPromise = createWorker('spa')
  }
  return _workerPromise
}

async function ocrImagen(base64png) {
  const { default: Jimp } = await import('jimp')
  const img = await Jimp.read(Buffer.from(base64png, 'base64'))
  // gris + 2x + contraste + umbral: elimina la marca de agua clara, deja el texto.
  img.greyscale().scale(2).contrast(0.4).threshold({ max: 140 })
  const scaledH = img.bitmap.height
  const buf = await img.getBufferAsync(Jimp.MIME_PNG)
  const worker = await getWorker()
  const { data } = await worker.recognize(buf)
  // y relativo (0-1) de la etiqueta PROPIETARIO → para redactarlo al anonimizar (Ley 29733).
  let ownerYRatio = null
  for (const w of data.words || []) {
    if (/PROPIETARIO/i.test(w.text || '') && w.bbox) { ownerYRatio = w.bbox.y0 / scaledH; break }
  }
  return { text: data.text, ownerYRatio }
}

function parsearTexto(texto) {
  const out = {}
  const lines = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ci = line.indexOf(':')
    if (ci < 0) continue
    const field = labelToField(line.slice(0, ci))
    if (!field) continue
    let value = line.slice(ci + 1).trim()
    if (field === 'owner') {
      // El/los propietario(s) van en las líneas siguientes (hasta el pie con fecha).
      const owners = []
      if (value) owners.push(value)
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(lines[j])) break // pie: fecha/hora
        if (lines[j].includes(':')) break
        owners.push(lines[j])
      }
      value = owners.join('; ')
    }
    if (field === 'vin' || field === 'serie') value = fixVin(value)
    if (value && out[field] === undefined) out[field] = value
  }
  return out
}

// ── Consulta a la API ───────────────────────────────────────────────────────
async function obtenerIp() {
  try {
    const j = await fetch(config.sunarp.urlApiIp || 'https://api.ipify.org/?format=json').then((r) => r.json())
    return j.ip || '0:0:0:0:0:0:0:1'
  } catch {
    return '0:0:0:0:0:0:0:1'
  }
}

async function getDatosVehiculo(plate, ip, token) {
  const body = {
    numPlaca: plate.toUpperCase().replace(/\s/g, ''),
    regPubId: null,
    oficRegId: null,
    ipAddress: ip,
    appVersion: '1.0',
    dG9rZW4: token, // "token" (Turnstile)
  }
  const r = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-IBM-Client-Id': CLIENT_ID,
      Origin: 'https://consultavehicular.sunarp.gob.pe',
      Referer: 'https://consultavehicular.sunarp.gob.pe/',
      Accept: 'application/json, text/plain, */*',
      'User-Agent': UA,
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`SUNARP API status ${r.status}`)
  return r.json()
}

async function intentar(plate) {
  const ip = await obtenerIp()
  const token = await solveTurnstile({ sitekey: SITEKEY, pageurl: PAGEURL, userAgent: UA })
  const resp = await getDatosVehiculo(plate, ip, token)

  if (resp.cod !== 1) {
    // cod != 1 puede ser captcha/token rechazado (REINTENTABLE con token nuevo) o
    // placa inexistente (PERMANENTE: reintentar solo malgasta Turnstile, el captcha
    // más caro). Distinguimos por el mensaje para cortar rápido en el caso permanente.
    const msg = resp.mensaje || 'sin resultado'
    const err = new Error(`SUNARP cod=${resp.cod}: ${msg}`)
    if (/no se ha encontrado|no se encontr|no existe|sin registro/i.test(msg)) {
      err.permanent = true
    }
    throw err
  }
  const model = resp.model || {}
  if (!model.imagen) throw new Error('SUNARP: respuesta sin imagen de datos')

  const { text, ownerYRatio } = await ocrImagen(model.imagen)
  const campos = parsearTexto(text)
  if (!campos.make && !campos.vin) {
    throw new Error('SUNARP: OCR no extrajo datos (revisar umbral/imagen)')
  }

  const sede = Array.isArray(model.sedes) && model.sedes[0]
  // Muchos vehículos antiguos no tienen VIN sino SERIE (el chasis). Si SUNARP no
  // trae VIN, usamos la serie como identificador del chasis en su lugar.
  const serie = campos.serie || null
  return {
    plate: campos.plate || plate.toUpperCase(),
    make: campos.make || 'N/D',
    model: campos.model || 'N/D',
    year: campos.year || 'N/D',
    color: campos.color || 'N/D',
    status: campos.status || 'N/D',
    owner: campos.owner || 'N/D',
    vin: campos.vin || serie || 'N/D',
    serie: serie,
    engineNumber: fixEngine(campos.engineNumber) || 'N/D',
    // Extras propios de SUNARP (el normalizer los propaga; enriquecen el reporte)
    placaAnterior: campos.placaAnterior || null,
    anotaciones: campos.anotaciones || null,
    sede: (sede && sede.nombre) || campos.sede || null,
    numPartida: (sede && sede.numPartida && String(sede.numPartida).trim()) || null,
    // Imagen oficial de SUNARP (los datos vienen como imagen) + posición del propietario
    imageBase64: model.imagen,
    ownerYRatio,
  }
}

export function consultarSunarpReal(plate) {
  return withTiming(async () => {
    let lastErr
    const max = config.sunarp.maxCaptchaAttempts
    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        return await intentar(plate)
      } catch (err) {
        lastErr = err
        // Error permanente (placa inexistente) → no reintentar: ahorra Turnstile.
        if (err.permanent || attempt === max) break
        console.warn(`[sunarp] intento ${attempt}/${max} falló: ${err.message}`)
        await backoff(attempt)
      }
    }
    throw lastErr
  })
}

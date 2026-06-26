import { withTiming } from './base.js'
import { newContext } from './browser.js'
import { solveImageCaptcha } from './captcha.js'
import { isRetryable, backoff } from './scrape-util.js'
import { config } from '../config.js'

// ───────────────────────────────────────────────────────────────────────────
// Adapter REAL de SUNARP (Playwright + 2captcha).
//
// ⚠️ CALIBRACIÓN REQUERIDA: los selectores de abajo son el contrato esperado
//    pero DEBEN verificarse contra el DOM en vivo. Usa:  npm run inspect:sunarp
//    para abrir la página con el inspector de Playwright y copiar los selectores
//    reales. Ajusta SEL y LABEL_MAP. Mientras tanto, el sistema usa el mock.
// ───────────────────────────────────────────────────────────────────────────

const SEL = {
  plateInput: '#txtPlaca',          // input de la placa            ← CALIBRAR
  captchaImg: '#imgCaptcha',        // <img> del captcha            ← CALIBRAR
  captchaInput: '#txtCaptcha',      // input del texto del captcha  ← CALIBRAR
  submit: '#btnBuscar',             // botón consultar              ← CALIBRAR
  resultRow: '.panel-resultado table tr', // filas del resultado    ← CALIBRAR
  errorMsg: '.alert-danger',        // captcha incorrecto / sin datos ← CALIBRAR
}

// Mapea las etiquetas del resultado de SUNARP → campos de nuestro DTO.
const LABEL_MAP = {
  PLACA: 'plate',
  MARCA: 'make',
  MODELO: 'model',
  'AÑO MODELO': 'year',
  'AÑO DE MODELO': 'year',
  COLOR: 'color',
  ESTADO: 'status',
  PROPIETARIO: 'owner',
  PROPIETARIOS: 'owner',
  VIN: 'vin',
  'SERIE/VIN': 'vin',
  'N° SERIE': 'vin',
  SERIE: 'vin',
  'N° MOTOR': 'engineNumber',
  MOTOR: 'engineNumber',
}

const norm = (s) =>
  (s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/:$/, '')
    .trim()

export function consultarSunarpReal(plate) {
  return withTiming(async () => {
    let lastErr
    const max = config.sunarp.maxCaptchaAttempts
    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        return await intentar(plate)
      } catch (err) {
        lastErr = err
        if (!isRetryable(err) || attempt === max) break
        console.warn(`[sunarp] intento ${attempt}/${max} falló: ${err.message}`)
        await backoff(attempt)
      }
    }
    throw lastErr
  })
}

async function intentar(plate) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(config.sunarp.navTimeoutMs)
  try {
    await page.goto(config.sunarp.url, { waitUntil: 'domcontentloaded' })

    // 1) Placa
    await page.fill(SEL.plateInput, plate)

    // 2) Captcha: capturamos la imagen como PNG y la mandamos a 2captcha
    const imgBuf = await page.locator(SEL.captchaImg).screenshot()
    const solution = await solveImageCaptcha(imgBuf.toString('base64'))
    await page.fill(SEL.captchaInput, solution)

    // 3) Enviar
    await page.click(SEL.submit)

    // 4) Esperar resultado o error
    await page
      .waitForSelector(`${SEL.resultRow}, ${SEL.errorMsg}`, {
        timeout: config.sunarp.navTimeoutMs,
      })
      .catch(() => {})

    const err = await page.locator(SEL.errorMsg).first()
    if (await err.count()) {
      const msg = (await err.innerText()).trim()
      throw new Error(`captcha/SUNARP: ${msg || 'sin resultado'}`)
    }

    // 5) Parsear filas etiqueta→valor
    const data = await parseResult(page)
    if (!data || Object.keys(data).length === 0) {
      throw new Error('SUNARP: no se pudo parsear el resultado (revisar selectores)')
    }
    return data
  } finally {
    await page.close()
    await ctx.close()
  }
}

async function parseResult(page) {
  const rows = await page.locator(SEL.resultRow).all()
  const out = {}
  for (const row of rows) {
    const cells = await row.locator('td, th').allInnerTexts()
    if (cells.length < 2) continue
    const field = LABEL_MAP[norm(cells[0])]
    if (field && !out[field]) out[field] = cells[1].trim()
  }
  return out
}

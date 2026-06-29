// Diagnóstico MTC: corre el flujo real N veces y muestra el captcha resuelto y
// el payload CRUDO, para distinguir "captcha incorrecto" de "placa sin CITV".
import 'dotenv/config'
import { newContext, closeBrowser } from '../src/adapters/browser.js'
import { solveImageCaptcha } from '../src/adapters/captcha.js'
import { config } from '../src/config.js'

const plate = (process.argv[2] || 'CTO632').toUpperCase()
const runs = parseInt(process.argv[3] || '3', 10)
const SEL = { placa: '#texFiltro', captchaInput: '#texCaptcha', captchaImg: '#imgCaptcha', submit: '#btnBuscar' }
const API = '/CITV/JrCITVConsultarFiltro'

for (let i = 1; i <= runs; i++) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(config.mtc.navTimeoutMs)
  try {
    await page.goto(config.mtc.url, { waitUntil: 'domcontentloaded' })
    await page.fill(SEL.placa, plate)
    const src = await page.locator(SEL.captchaImg).getAttribute('src')
    const b64 = (src || '').includes(',') ? src.split(',')[1].trim() : src
    const sol = await solveImageCaptcha(b64)
    await page.fill(SEL.captchaInput, sol)
    const respP = page.waitForResponse((r) => r.url().includes(API), { timeout: config.mtc.navTimeoutMs })
    await page.click(SEL.submit)
    let payload, status
    try {
      const resp = await respP
      status = resp.status()
      payload = await resp.json()
    } catch (e) {
      console.log(`[run ${i}] captcha="${sol}" -> sin respuesta del API (${e.message})`)
      continue
    }
    const raw = payload?.orResult?.[0]
    let arr = []
    try { arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [] } catch {}
    console.log(`[run ${i}] captcha="${sol}" httpStatus=${status} orStatus=${JSON.stringify(payload?.orStatus)} docs=${arr.length}`)
    console.log(`          orResult crudo: ${JSON.stringify(payload?.orResult)?.slice(0, 240)}`)
    if (arr.length) console.log(`          1er doc: PLACA=${arr[0].PLACA} RESULTADO=${arr[0].RESULTADO} ESTADO=${arr[0].ESTADO} CERT=${arr[0].NRO_CERTI}`)
  } finally {
    await page.close(); await ctx.close()
  }
}
await closeBrowser()
console.log('fin')

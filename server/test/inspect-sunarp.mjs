// Abre la consulta vehicular de SUNARP en un navegador VISIBLE con el inspector
// de Playwright, para que copies los selectores reales (placa, captcha, botón,
// tabla de resultados) y los pongas en src/adapters/sunarp.real.js (SEL).
//
// Uso:  node test/inspect-sunarp.mjs
//       SUNARP_URL=https://...  node test/inspect-sunarp.mjs
import { chromium } from 'playwright'

const URL = process.env.SUNARP_URL || 'https://www.sunarp.gob.pe/consulta-vehicular'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })

console.log('\n  → Página abierta:', URL)
console.log('  → Usa el inspector (botón "Pick locator") para copiar selectores.')
console.log('  → Cierra la ventana del inspector para terminar.\n')

// Pausa con el inspector de Playwright (permite elegir locators interactivamente)
await page.pause()

await browser.close()

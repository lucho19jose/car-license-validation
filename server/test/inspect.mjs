// Inspector genérico de selectores (Playwright). Abre cualquier URL en un
// navegador visible con el inspector para copiar selectores con "Pick locator".
//
// Uso:  npm run inspect -- https://consultasoat.apeseg.org.pe
//       node test/inspect.mjs https://rec.mtc.gob.pe/Citv/ConsultaCitv
import { chromium } from 'playwright'

const URL = process.argv[2] || process.env.INSPECT_URL
if (!URL) {
  console.error('Falta la URL.  Uso: npm run inspect -- <url>')
  process.exit(1)
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })

console.log('\n  → Página abierta:', URL)
console.log('  → Usa "Pick locator" del inspector para copiar selectores.')
console.log('  → Cierra el inspector para terminar.\n')

await page.pause()
await browser.close()

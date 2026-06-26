import { config } from '../config.js'

// Maneja una única instancia de Chromium reutilizable (Playwright).
// Import dinámico: el demo en modo mock NO necesita Playwright instalado.

let _browser = null

export async function getBrowser() {
  if (_browser) return _browser
  const { chromium } = await import('playwright')
  _browser = await chromium.launch({
    headless: config.sunarp.headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  return _browser
}

export async function newContext() {
  const browser = await getBrowser()
  return browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-PE',
  })
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close()
    _browser = null
  }
}

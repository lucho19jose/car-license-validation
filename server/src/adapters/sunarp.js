import { config } from '../config.js'
import { consultarSunarpMock } from './sunarp.mock.js'

// Dispatcher: decide entre el mock (demo) y el scraper real (Playwright+2captcha).
// Mantiene la firma estable consultarSunarp(plate) -> { ok, data, error, timingMs }
export async function consultarSunarp(plate) {
  if (config.useMockSunarp) {
    return consultarSunarpMock(plate)
  }
  try {
    // Import perezoso: el demo en mock no necesita Playwright instalado.
    const { consultarSunarpReal } = await import('./sunarp.real.js')
    return await consultarSunarpReal(plate)
  } catch (err) {
    // Nunca tumbamos el pipeline: la fuente queda marcada como fail (missingSections).
    return { ok: false, data: null, error: 'sunarp adapter: ' + err.message, timingMs: 0 }
  }
}

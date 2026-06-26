import { config } from '../config.js'
import { consultarSoatMock } from './soat.mock.js'

// Dispatcher SOAT: mock (demo) o real (Playwright+2captcha). Firma estable.
export async function consultarSoat(plate) {
  if (config.useMockSoat) {
    return consultarSoatMock(plate)
  }
  try {
    const { consultarSoatReal } = await import('./soat.real.js')
    return await consultarSoatReal(plate)
  } catch (err) {
    return { ok: false, data: null, error: 'soat adapter: ' + err.message, timingMs: 0 }
  }
}

import { config } from '../config.js'
import { consultarMtcMock } from './mtc.mock.js'

// Dispatcher MTC: mock (demo) o real (Playwright+2captcha). Firma estable.
export async function consultarMtc(plate) {
  if (config.useMockMtc) {
    return consultarMtcMock(plate)
  }
  try {
    const { consultarMtcReal } = await import('./mtc.real.js')
    return await consultarMtcReal(plate)
  } catch (err) {
    return { ok: false, data: null, error: 'mtc adapter: ' + err.message, timingMs: 0 }
  }
}

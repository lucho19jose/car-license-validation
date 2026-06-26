// Contrato común de todos los adapters de fuente.
// Cada consultarXxx(plate) devuelve: { ok, data, error, timingMs }

// Envuelve una consulta midiendo tiempo y capturando errores sin tumbar el pipeline.
export async function withTiming(fn) {
  const start = Date.now()
  try {
    const data = await fn()
    return { ok: true, data, error: null, timingMs: Date.now() - start }
  } catch (err) {
    return { ok: false, data: null, error: err.message, timingMs: Date.now() - start }
  }
}

// Reintentos con backoff exponencial (se usará en los adapters reales del Día 2+).
export async function retry(fn, { attempts = 3, baseDelayMs = 500 } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i))
    }
  }
  throw lastErr
}

// Latencia simulada para que los mocks se sientan como consultas reales.
export function fakeLatency(min = 300, max = 900) {
  const ms = min + Math.floor(Math.random() * (max - min))
  return new Promise((r) => setTimeout(r, ms))
}

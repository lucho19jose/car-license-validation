import { config } from '../config.js'

// Rate limiter POR CLAVE (una clave = una fuente: 'sunarp' | 'soat' | 'mtc').
// Limita la concurrencia y respeta un intervalo mínimo entre llamadas a la misma
// fuente, para no martillarla ni provocar baneos.
const buckets = new Map()

function bucket(key) {
  if (!buckets.has(key)) buckets.set(key, { active: 0, last: 0, queue: [] })
  return buckets.get(key)
}

// Ejecuta fn() respetando el límite de la clave. Devuelve lo que devuelva fn.
export function limited(key, fn) {
  const b = bucket(key)
  return new Promise((resolve, reject) => {
    b.queue.push({ fn, resolve, reject })
    drain(key)
  })
}

function drain(key) {
  const b = bucket(key)
  const { maxConcurrency, minIntervalMs } = config.rateLimit
  while (b.active < maxConcurrency && b.queue.length > 0) {
    const now = Date.now()
    const wait = Math.max(0, b.last + minIntervalMs - now)
    const item = b.queue.shift()
    b.active++
    b.last = now + wait
    setTimeout(() => {
      Promise.resolve()
        .then(item.fn)
        .then(item.resolve, item.reject)
        .finally(() => {
          b.active--
          drain(key)
        })
    }, wait)
  }
}

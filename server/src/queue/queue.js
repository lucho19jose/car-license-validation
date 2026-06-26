// Cola en memoria con límite de concurrencia (Día 1, cero infraestructura).
//
// Para producción: si config.redisUrl está seteado se debería intercambiar
// esta implementación por BullMQ (misma interfaz: setProcessor + add).
class InMemoryQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency
    this.active = 0
    this.q = []
    this.processor = null
  }

  setProcessor(fn) {
    this.processor = fn
  }

  add(job) {
    this.q.push(job)
    this._drain()
  }

  _drain() {
    while (this.active < this.concurrency && this.q.length > 0) {
      const job = this.q.shift()
      this.active++
      Promise.resolve(this.processor(job))
        .catch((err) => console.error('[queue] job error:', err))
        .finally(() => {
          this.active--
          this._drain()
        })
    }
  }
}

export const queue = new InMemoryQueue(3)

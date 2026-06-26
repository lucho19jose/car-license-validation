import express from 'express'
import { config } from './config.js'
import { router } from './api/routes.js'
import { startWorker } from './queue/worker.js'
import './db/db.js' // inicializa la DB y crea tablas

const app = express()

// Captura el cuerpo crudo para poder verificar la firma HMAC del Jetson.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  })
)

// Sirve los reportes generados (HTML hoy, PDF en Día 4).
app.use('/reports', express.static(config.paths.reports))

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use(router)

startWorker()

app.listen(config.port, () => {
  console.log(`[placas] Ingest API en http://localhost:${config.port}`)
  console.log(`[placas] POST /api/v1/plates  ·  GET /api/v1/reports/:id`)
})

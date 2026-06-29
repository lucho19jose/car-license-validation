import express from 'express'
import crypto from 'node:crypto'
import { db } from '../db/db.js'
import { queue } from '../queue/queue.js'
import { config } from '../config.js'
import { verifySignature } from './auth.js'
import { normalizePlate, isValidPlate } from '../core/plate.js'

export const router = express.Router()

// El Jetson envía una placa detectada. Responde 202 al instante (no bloquea).
router.post('/api/v1/plates', verifySignature, (req, res) => {
  const plate = normalizePlate(req.body.plate)
  if (!isValidPlate(plate)) {
    return res.status(400).json({ error: 'invalid plate', plate })
  }

  // Registrar la detección (auditoría / volumen)
  db.prepare(
    `INSERT INTO plates_seen (plate, camera_id, confidence, seen_at)
     VALUES (?, ?, ?, ?)`
  ).run(plate, req.body.camera_id || null, req.body.confidence ?? null, new Date().toISOString())

  // Antidobles: ¿ya hay un job reciente para esta placa?
  const since = new Date(Date.now() - config.dedupWindowSec * 1000).toISOString()
  const recent = db
    .prepare(
      `SELECT id, status FROM reports
       WHERE plate = ? AND requested_at > ?
       ORDER BY requested_at DESC LIMIT 1`
    )
    .get(plate, since)
  if (recent) {
    return res.status(202).json({ job_id: recent.id, status: recent.status, deduped: true })
  }

  // Crear job y encolar
  const jobId = crypto.randomUUID()
  db.prepare(
    `INSERT INTO reports (id, plate, status, requested_at)
     VALUES (?, ?, 'QUEUED', ?)`
  ).run(jobId, plate, new Date().toISOString())

  // callback_url opcional: el Jetson puede pedir que le notifiquemos al terminar.
  queue.add({ jobId, plate, callbackUrl: req.body.callback_url || null })
  res.status(202).json({ job_id: jobId, status: 'QUEUED', deduped: false })
})

// Consultar el estado/resultado de un job.
router.get('/api/v1/reports/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })

  const htmlUrl = row.status === 'COMPLETED' ? `/reports/${row.id}.html` : null
  const pdfUrl = row.pdf_path ? `/reports/${row.id}.pdf` : null

  // La imagen de SUNARP (base64 ~150KB) va incrustada en el reporte; no la
  // devolvemos en el JSON de la API para mantenerlo liviano.
  let result = row.result_json ? JSON.parse(row.result_json) : null
  if (result && result.sunarpImage) {
    delete result.sunarpImage
    delete result.sunarpOwnerYRatio
    result.sunarpImageEmbedded = true
  }

  res.json({
    job_id: row.id,
    plate: row.plate,
    status: row.status,
    result,
    report_url: pdfUrl || htmlUrl, // preferimos PDF
    html_url: htmlUrl,
    pdf_url: pdfUrl,
    is_cached: !!row.is_cached,
    data_age_hours: row.data_age_h,
    requested_at: row.requested_at,
    completed_at: row.completed_at,
  })
})

// Últimas placas vistas (útil para el dashboard / figuras del paper).
router.get('/api/v1/plates/recent', (_req, res) => {
  const rows = db
    .prepare('SELECT plate, camera_id, confidence, seen_at FROM plates_seen ORDER BY id DESC LIMIT 50')
    .all()
  res.json(rows)
})

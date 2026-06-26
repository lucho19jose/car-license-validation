import { db } from '../db/db.js'
import { queue } from './queue.js'
import { getFreshCache, putCache } from '../core/cache.js'
import { normalize } from '../core/normalizer.js'
import { limited } from '../core/limiter.js'
import { consultarSunarp } from '../adapters/sunarp.js'
import { consultarSoat } from '../adapters/soat.js'
import { consultarMtc } from '../adapters/mtc.js'
import { generateReport } from '../report/pdf.js'
import { sendWebhook } from '../report/webhook.js'
import { config } from '../config.js'

export function startWorker() {
  queue.setProcessor(processJob)
  console.log('[worker] listo (cola en memoria, concurrencia 3)')
}

async function processJob(job) {
  const { jobId, plate, callbackUrl } = job
  mark(jobId, 'PROCESSING')

  try {
    // 1) ¿hay cache fresca? -> reusar, no tocar las fuentes
    const cached = getFreshCache(plate)
    if (cached) {
      console.log(`[worker] ${plate} cache HIT (${cached.dataAgeHours}h)`)
      return await finish(jobId, plate, cached.dto, {
        isCached: true,
        dataAgeHours: cached.dataAgeHours,
      }, callbackUrl)
    }

    // 2) consultar las 3 fuentes en paralelo, cada una con su rate-limit por fuente
    const [sunarp, soat, mtc] = await Promise.all([
      limited('sunarp', () => consultarSunarp(plate)),
      limited('soat', () => consultarSoat(plate)),
      limited('mtc', () => consultarMtc(plate)),
    ])

    // 3) normalizar al DTO único
    const dto = normalize(plate, { sunarp, soat, mtc })

    // 4) cachear
    putCache(plate, dto)

    console.log(
      `[worker] ${plate} OK sources=${JSON.stringify(dto.sources)} ` +
        `t=${sunarp.timingMs}/${soat.timingMs}/${mtc.timingMs}ms`
    )

    // 5) finalizar + generar reporte
    return await finish(jobId, plate, dto, {
      isCached: false,
      dataAgeHours: 0,
      timings: {
        sunarp: sunarp.timingMs,
        soat: soat.timingMs,
        mtc: mtc.timingMs,
      },
    }, callbackUrl)
  } catch (err) {
    console.error(`[worker] ${plate} FAILED:`, err)
    db.prepare('UPDATE reports SET status=?, completed_at=? WHERE id=?').run(
      'FAILED',
      new Date().toISOString(),
      jobId
    )
  }
}

async function finish(jobId, plate, dto, meta, callbackUrl) {
  const { pdfPath } = await generateReport(jobId, dto, meta)
  db.prepare(
    `UPDATE reports SET status=?, result_json=?, pdf_path=?,
       completed_at=?, is_cached=?, data_age_h=? WHERE id=?`
  ).run(
    'COMPLETED',
    JSON.stringify({ ...dto, ...meta }),
    pdfPath, // null si no se generó PDF (queda el HTML)
    new Date().toISOString(),
    meta.isCached ? 1 : 0,
    meta.dataAgeHours || 0,
    jobId
  )

  // Webhook de vuelta (al Jetson u otro consumidor), si hay destino.
  const url = callbackUrl || config.webhookUrl
  if (url) {
    const base = config.publicBaseUrl
    await sendWebhook(url, {
      job_id: jobId,
      plate,
      status: 'COMPLETED',
      result: { ...dto, ...meta },
      html_url: `${base}/reports/${jobId}.html`,
      pdf_url: pdfPath ? `${base}/reports/${jobId}.pdf` : null,
    })
  }
}

function mark(jobId, status) {
  db.prepare('UPDATE reports SET status=? WHERE id=?').run(status, jobId)
}

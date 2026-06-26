import crypto from 'node:crypto'
import { config } from '../config.js'

// Envía el resultado de vuelta (al Jetson u otro consumidor) cuando el reporte
// está listo. Firma el cuerpo con HMAC-SHA256 para que el receptor lo verifique
// igual que el Ingest API verifica al Jetson. No bloquea el pipeline si falla.
export async function sendWebhook(url, payload) {
  if (!url) return
  const body = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', config.hmacSecret).update(body).digest('hex')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
        'X-Signature': sig,
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    console.log(`[webhook] POST ${url} -> ${res.status}`)
  } catch (err) {
    console.warn(`[webhook] fallo a ${url}: ${err.message}`)
  }
}

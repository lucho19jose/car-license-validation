import crypto from 'node:crypto'
import { config } from '../config.js'

// Middleware: valida API key + firma HMAC-SHA256 del cuerpo crudo.
// Garantiza que solo el Jetson (que comparte el secreto) pueda postear placas.
export function verifySignature(req, res, next) {
  const apiKey = req.get('X-Api-Key')
  if (apiKey !== config.apiKey) {
    return res.status(401).json({ error: 'invalid api key' })
  }

  const signature = req.get('X-Signature') || ''
  const expected = crypto
    .createHmac('sha256', config.hmacSecret)
    .update(req.rawBody || '')
    .digest('hex')

  if (!safeEqual(signature, expected)) {
    return res.status(401).json({ error: 'invalid signature' })
  }
  next()
}

function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

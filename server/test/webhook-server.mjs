// Receptor de webhook de prueba (simula el endpoint del Jetson que recibe el
// reporte terminado). Verifica la firma HMAC e imprime el payload.
// Uso:  node test/webhook-server.mjs        (escucha en :4000)
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = process.env.WH_PORT || 4000
const SECRET = process.env.HMAC_SECRET || 'dev-hmac-secret'

http
  .createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex')
      const ok = req.headers['x-signature'] === expected
      console.log(`\n[webhook-server] ${req.method} ${req.url}  firma=${ok ? 'OK ✓' : 'INVÁLIDA ✗'}`)
      try {
        console.log(JSON.stringify(JSON.parse(body), null, 2))
      } catch {
        console.log(body)
      }
      res.writeHead(ok ? 200 : 401)
      res.end(ok ? 'ok' : 'bad signature')
    })
  })
  .listen(PORT, () => console.log(`[webhook-server] escuchando en http://localhost:${PORT}/webhook`))

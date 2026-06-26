// Simula al Jetson: postea una placa firmada y sondea el reporte hasta COMPLETED.
// Uso:  npm run send                 (ALI582)
//       node test/send.mjs C3E040
//       CALLBACK_URL=http://localhost:4000/webhook node test/send.mjs ALI582
import crypto from 'node:crypto'

const BASE = process.env.BASE || 'http://localhost:3000'
const KEY = process.env.API_KEY || 'dev-api-key'
const SECRET = process.env.HMAC_SECRET || 'dev-hmac-secret'
const plate = process.argv[2] || 'ALI582'

const payload = {
  plate,
  confidence: 0.94,
  timestamp: new Date().toISOString(),
  camera_id: 'cam-01',
}
if (process.env.CALLBACK_URL) payload.callback_url = process.env.CALLBACK_URL

const body = JSON.stringify(payload)
const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex')

const post = await fetch(`${BASE}/api/v1/plates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY, 'X-Signature': sig },
  body,
})
const enqueued = await post.json()
console.log('POST /plates ->', post.status, enqueued)

if (enqueued.job_id) {
  // Sondear hasta COMPLETED (el PDF puede tardar unos segundos la 1ª vez)
  let report
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const get = await fetch(`${BASE}/api/v1/reports/${enqueued.job_id}`)
    report = await get.json()
    if (report.status === 'COMPLETED' || report.status === 'FAILED') break
  }
  console.log('\nGET /reports ->', report.status)
  console.log(JSON.stringify(report, null, 2))
  if (report.pdf_url) console.log(`\nPDF:  ${BASE}${report.pdf_url}`)
  if (report.html_url) console.log(`HTML: ${BASE}${report.html_url}`)
}

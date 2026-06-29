// PRUEBA DECISIVA: ¿se puede consultar SUNARP llamando getDatosVehiculo directo
// con un token de Turnstile resuelto por 2captcha? (sin navegador, solo fetch)
import 'dotenv/config'
import fs from 'node:fs'
import { solveTurnstile } from '../src/adapters/captcha.js'

const SITEKEY = '0x4AAAAAACFzt4Xn8T1Jg9ZS'
const PAGEURL = 'https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio'
const CLIENT_ID = '70574c7d9194834316a156b1d68fdb90'
const SEARCH = 'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo'
const plate = (process.argv[2] || 'C3E040').toUpperCase()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// 1) IP pública (la usa el payload)
const ip = await fetch('https://api.ipify.org/?format=json').then(r => r.json()).then(j => j.ip).catch(() => '0:0:0:0:0:0:0:1')
console.log('[dbg] IP pública:', ip)

// 2) Resolver Turnstile con 2captcha
console.log('[dbg] resolviendo Turnstile con 2captcha...')
const t0 = Date.now()
const token = await solveTurnstile({ sitekey: SITEKEY, pageurl: PAGEURL, userAgent: UA })
console.log(`[dbg] token Turnstile (${token.length} chars) en ${((Date.now()-t0)/1000).toFixed(1)}s`)

// 3) Llamar getDatosVehiculo
const body = { numPlaca: plate, regPubId: null, oficRegId: null, ipAddress: ip, appVersion: '1.0', dG9rZW4: token }
console.log('[dbg] POST getDatosVehiculo body:', JSON.stringify({ ...body, dG9rZW4: token.slice(0, 25) + '…' }))
const r = await fetch(SEARCH, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-IBM-Client-Id': CLIENT_ID,
    'Origin': 'https://consultavehicular.sunarp.gob.pe',
    'Referer': 'https://consultavehicular.sunarp.gob.pe/',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': UA,
  },
  body: JSON.stringify(body),
})
console.log('[dbg] HTTP', r.status)
const text = await r.text()
let j
try { j = JSON.parse(text) } catch { console.log('[dbg] respuesta no-JSON:', text.slice(0, 400)); process.exit(1) }

console.log('[dbg] cod:', j.cod, '| mensaje:', j.mensaje)
if (j.model) {
  const m = j.model
  const summary = {}
  for (const [k, v] of Object.entries(m)) {
    summary[k] = typeof v === 'string' && v.length > 60 ? `[str len=${v.length}]` : v
  }
  console.log('[dbg] model:', JSON.stringify(summary, null, 2))
  if (m.imagen) {
    fs.writeFileSync('sunarp-resultado.png', Buffer.from(m.imagen, 'base64'))
    console.log('[dbg] imagen del resultado guardada -> server/sunarp-resultado.png')
  }
} else {
  console.log('[dbg] respuesta completa:', JSON.stringify(j).slice(0, 500))
}

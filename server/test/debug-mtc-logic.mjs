// Test determinista de la orquestación de MTC (resolverMtc): reintentos de
// captcha + confirm-empty, SIN navegador ni 2captcha. Inyecta un `intentar` falso
// guiado por un guion de resultados y verifica el desenlace y el nº de pasadas.
import assert from 'node:assert'
import { resolverMtc } from '../src/adapters/mtc.real.js'

const DOC = { PLACA: 'TEST123', NRO_CERTI: 'C-1', RESULTADO: 'APROBADO', ESTADO: 'VIGENTE' }
const ERR_RETRY = () => { throw new Error('captcha: MTC rechazó el captcha (orStatus=false)') }
const ERR_FATAL = () => { throw new Error('boom no reintentable') }
const wait = () => Promise.resolve() // sin backoff real → test instantáneo

// Construye un `intentar` que sigue `seq` (cada paso: array de docs, ERR_RETRY o
// ERR_FATAL) y cuenta cuántas veces se le llamó.
function fakeIntentar(seq) {
  const state = { calls: 0 }
  const fn = async () => {
    const step = seq[state.calls] ?? seq[seq.length - 1]
    state.calls++
    if (typeof step === 'function') return step()
    return step
  }
  return { fn, state }
}

const cases = [
  {
    name: 'CITV presente → devuelve datos a la 1ª, sin confirmar',
    seq: [[DOC]], opts: { max: 5, needEmpty: 2 },
    expect: (r, calls) => r.result === 'APROBADO' && calls === 1,
  },
  {
    name: 'sin CITV → N/D solo tras confirmar (needEmpty=2)',
    seq: [[], []], opts: { max: 5, needEmpty: 2 },
    expect: (r, calls) => r.result === 'N/D' && calls === 2,
  },
  {
    name: 'vacío y luego datos → ganan los datos (no falso N/D)',
    seq: [[], [DOC]], opts: { max: 5, needEmpty: 2 },
    expect: (r, calls) => r.result === 'APROBADO' && calls === 2,
  },
  {
    name: 'captcha falla y luego acierta → datos',
    seq: [ERR_RETRY, [DOC]], opts: { max: 5, needEmpty: 2 },
    expect: (r, calls) => r.result === 'APROBADO' && calls === 2,
  },
  {
    name: 'needEmpty=1 → confía en orStatus, N/D a la 1ª',
    seq: [[]], opts: { max: 5, needEmpty: 1 },
    expect: (r, calls) => r.result === 'N/D' && calls === 1,
  },
  {
    name: 'un vacío pero no alcanza a confirmar (resto falla) → N/D no confirmado, NO throw',
    seq: [[], ERR_RETRY, ERR_RETRY, ERR_RETRY, ERR_RETRY], opts: { max: 5, needEmpty: 3 },
    expect: (r, calls) => r.result === 'N/D' && calls === 5,
  },
  {
    name: 'nunca hay respuesta válida → lanza (fuente queda en fail, no falso N/D)',
    seq: [ERR_RETRY, ERR_RETRY, ERR_RETRY], opts: { max: 3, needEmpty: 2 },
    expect: null, // se espera throw
  },
  {
    name: 'error no reintentable → corta de inmediato (1 sola pasada)',
    seq: [ERR_FATAL, [DOC]], opts: { max: 5, needEmpty: 2 },
    expect: null, throwCalls: 1,
  },
]

let ok = 0
for (const c of cases) {
  const { fn, state } = fakeIntentar(c.seq)
  try {
    const r = await resolverMtc(fn, { ...c.opts, wait })
    if (c.expect && c.expect(r, state.calls)) {
      console.log(`✓ ${c.name}  (calls=${state.calls})`)
      ok++
    } else {
      console.log(`✗ ${c.name}  → resultado inesperado: ${JSON.stringify(r)} calls=${state.calls}`)
    }
  } catch (e) {
    if (c.expect === null && (c.throwCalls === undefined || state.calls === c.throwCalls)) {
      console.log(`✓ ${c.name}  (throw esperado: "${e.message}", calls=${state.calls})`)
      ok++
    } else {
      console.log(`✗ ${c.name}  → throw inesperado: ${e.message} calls=${state.calls}`)
    }
  }
}
console.log(`\n${ok}/${cases.length} casos OK`)
assert.strictEqual(ok, cases.length, 'algún caso de resolverMtc falló')

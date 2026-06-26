// Une las respuestas de los 3 adapters en un único DTO "Vehiculo".
// Tolera que cualquier fuente falle (queda en missingSections, como mitorito).
export function normalize(plate, { sunarp, soat, mtc }) {
  const v = sunarp?.data || {}
  const s = soat?.data || {}
  const m = mtc?.data || {}

  return {
    plate,
    make: v.make ?? null,
    model: v.model ?? null,
    year: v.year ?? null,
    color: v.color ?? null,
    status: v.status ?? null,
    owner: v.owner ?? null,
    vin: v.vin ?? null,
    engineNumber: v.engineNumber ?? null,

    // Spread conserva TODOS los campos extra (historial, dirección, observaciones…)
    // garantizando que existan las claves canónicas.
    soat: soat?.ok
      ? { insurer: null, policyNumber: null, validUntil: null, valid: null, ...s }
      : null,

    inspection: mtc?.ok
      ? { result: null, validUntil: null, entity: null, valid: null, ...m }
      : null,

    riskScore: computeRisk(s, m),

    sources: {
      sunarp: sunarp?.ok ? 'ok' : 'fail',
      soat: soat?.ok ? 'ok' : 'fail',
      mtc: mtc?.ok ? 'ok' : 'fail',
    },
    missingSections: [
      !sunarp?.ok && 'sunarp',
      !soat?.ok && 'soat',
      !mtc?.ok && 'mtc',
    ].filter(Boolean),
  }
}

// Semáforo simple: SOAT + revisión técnica vigentes => verde.
function computeRisk(s, m) {
  const soatOk = !!s?.valid
  const itvOk = !!m?.valid
  if (soatOk && itvOk) return 'GREEN'
  if (soatOk || itvOk) return 'YELLOW'
  return 'RED'
}

import { withTiming, fakeLatency } from './base.js'

// MOCK (Día 1, enriquecido 26/06 con datos REALES de ALI582 capturados de APESEG).
const MOCK = {
  ALI582: {
    insurer: 'Pacifico Seguros',
    policyNumber: '000000000201245548800100',
    validUntil: '16/03/2027',
    validFrom: '16/03/2026',
    valid: true,
    certificateType: 'DIGITAL',
    history: [
      { insurer: 'Pacifico Seguros', from: '16/03/2026', to: '16/03/2027', estado: 'VIGENTE' },
      { insurer: 'Rimac Seguros', from: '15/03/2025', to: '15/03/2026', estado: 'VENCIDO' },
      { insurer: 'Interseguro', from: '15/03/2024', to: '15/03/2025', estado: 'VENCIDO' },
      { insurer: 'Interseguro', from: '14/03/2023', to: '14/03/2024', estado: 'VENCIDO' },
      { insurer: 'Mapfre Perú', from: '29/01/2020', to: '29/01/2021', estado: 'VENCIDO' },
    ],
  },
}

export function consultarSoatMock(plate) {
  return withTiming(async () => {
    await fakeLatency()
    return (
      MOCK[plate] || {
        insurer: 'N/D',
        policyNumber: 'N/D',
        validUntil: 'N/D',
        valid: false,
        history: [],
      }
    )
  })
}

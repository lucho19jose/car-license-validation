import { withTiming, fakeLatency } from './base.js'

// MOCK (Día 1, enriquecido 26/06 con datos REALES de ALI582 capturados del MTC).
const MOCK = {
  ALI582: {
    result: 'APROBADO',
    validUntil: '24/01/2027',
    validFrom: '24/01/2026',
    entity:
      'REVISIONES TECNICAS VEHICULARES-JR EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA-R.T.V.-JR E.I.R.L.',
    certificate: 'C-2026-412-622-000408',
    valid: true,
    documentType: 'NRO DE CERTIFICADO',
    address: 'AVENIDA CARLOS UGARTE S/N - CUSCO - CUSCO - SANTIAGO',
    ambito: 'NINGUNO',
    service: 'PARTICULAR',
    observation: 'Sin observaciones',
    history: [
      {
        certificate: 'C-2026-412-622-000408',
        documentType: 'NRO DE CERTIFICADO',
        validFrom: '24/01/2026',
        validUntil: '24/01/2027',
        result: 'APROBADO',
        estado: 'VIGENTE',
        certifier: 'REVISIONES TECNICAS VEHICULARES-JR E.I.R.L.',
        address: 'AVENIDA CARLOS UGARTE S/N - CUSCO - CUSCO - SANTIAGO',
        ambito: 'NINGUNO',
        service: 'PARTICULAR',
        observation: 'Sin observaciones',
      },
      {
        certificate: 'I-2025-412-622-000118',
        documentType: 'NRO DE INFORME',
        validFrom: '17/12/2025',
        validUntil: '',
        result: 'DESAPROBADO',
        estado: '',
        certifier: 'REVISIONES TECNICAS VEHICULARES-JR E.I.R.L.',
        address: 'AVENIDA CARLOS UGARTE S/N - CUSCO - CUSCO - SANTIAGO',
        ambito: 'NINGUNO',
        service: 'PARTICULAR',
        observation: 'A.4.3-Falta o no coincide el tipo de combustible',
      },
      {
        certificate: 'C-2024-302-451-010152',
        documentType: 'NRO DE CERTIFICADO',
        validFrom: '17/12/2024',
        validUntil: '17/12/2025',
        result: 'APROBADO',
        estado: 'VENCIDO',
        certifier: 'CITV AZPER CUSCO PERU SOCIEDAD ANONIMA CERRADA',
        address: 'PROLONGACIÓN AV. CUSCO CARRETERA CUSCO URCOS N° 1544 - CUSCO - CUSCO - SAYLLA',
        ambito: 'NINGUNO',
        service: 'PARTICULAR',
        observation: 'A.5.2-No presenta Informe de Inspección Técnica anterior (si corresponde)',
      },
    ],
  },
}

export function consultarMtcMock(plate) {
  return withTiming(async () => {
    await fakeLatency()
    return (
      MOCK[plate] || {
        result: 'N/D',
        validUntil: 'N/D',
        entity: 'N/D',
        valid: false,
        history: [],
      }
    )
  })
}

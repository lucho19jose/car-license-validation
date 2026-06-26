import { withTiming, fakeLatency } from './base.js'

// Datos simulados para la demo cuando USE_MOCK_SUNARP=true.
const MOCK = {
  ALI582: {
    make: 'TOYOTA',
    model: 'YARIS',
    year: '2015',
    color: 'BLANCO',
    status: 'EN CIRCULACION',
    owner: 'VASQUEZ NINANCURO, IVOSKA',
    vin: 'MR2BW9F31F1097539',
    engineNumber: '2NZ7522687',
  },
}

export function consultarSunarpMock(plate) {
  return withTiming(async () => {
    await fakeLatency()
    return (
      MOCK[plate] || {
        make: 'DESCONOCIDA',
        model: 'N/D',
        year: 'N/D',
        color: 'N/D',
        status: 'EN CIRCULACION',
        owner: 'N/D',
        vin: 'N/D',
        engineNumber: 'N/D',
      }
    )
  })
}

import { config } from '../config.js'

// Enmascara un nombre dejando solo la inicial de cada palabra:
//   "VASQUEZ NINANCURO, IVOSKA" -> "V*** N***, I***"
export function maskName(name) {
  if (!name || name === 'N/D') return name
  return name
    .split(/([,\s]+)/) // conserva separadores (espacios y comas)
    .map((tok) => {
      if (/^[,\s]+$/.test(tok) || tok === '') return tok
      return tok[0] + '***'
    })
    .join('')
}

// Devuelve una copia del DTO con el propietario enmascarado si está activada la
// anonimización (ANONYMIZE_OWNER=true). Se usa solo para presentación/figuras;
// la DB conserva el dato crudo para la investigación.
export function anonymizeDto(dto) {
  if (!config.anonymizeOwner || !dto?.owner) return dto
  return { ...dto, owner: maskName(dto.owner) }
}

// Prepara la imagen oficial de SUNARP para el reporte como data URI.
// Si ANONYMIZE_OWNER=true, tapa la franja del propietario (parte inferior de la
// tarjeta, Ley N° 29733) usando la posición detectada por OCR (o ~80% como fallback).
export async function sunarpImageDataUri(dto) {
  const b64 = dto?.sunarpImage
  if (!b64) return null
  if (!config.anonymizeOwner) return `data:image/png;base64,${b64}`

  const { default: Jimp } = await import('jimp')
  const img = await Jimp.read(Buffer.from(b64, 'base64'))
  const ratio = typeof dto.sunarpOwnerYRatio === 'number' ? dto.sunarpOwnerYRatio : 0.8
  const y0 = Math.max(0, Math.floor(img.bitmap.height * ratio) - 6)
  const h = img.bitmap.height - y0
  img.scan(0, y0, img.bitmap.width, h, function (x, y, idx) {
    this.bitmap.data[idx] = 15      // R  (slate-900)
    this.bitmap.data[idx + 1] = 23  // G
    this.bitmap.data[idx + 2] = 42  // B
    this.bitmap.data[idx + 3] = 255 // A
  })
  const out = await img.getBufferAsync(Jimp.MIME_PNG)
  return `data:image/png;base64,${out.toString('base64')}`
}

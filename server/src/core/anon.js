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

// Normaliza una placa peruana: mayúsculas, sin guiones ni espacios.
// Soporta formatos antiguos (ABC-123) y nuevos (A1B-234, C3E040).
export function normalizePlate(raw) {
  if (!raw) return null
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Valida que sea alfanumérica de 5 a 7 caracteres (cubre autos y motos).
export function isValidPlate(plate) {
  return /^[A-Z0-9]{5,7}$/.test(plate || '')
}

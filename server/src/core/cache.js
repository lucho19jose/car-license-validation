import { db } from '../db/db.js'
import { config } from '../config.js'

// Devuelve el DTO cacheado si todavía está fresco, o null.
// TTL adaptativo: si el resultado fue PARCIAL (alguna fuente falló) usa un TTL
// más corto para reintentar pronto; si fue completo, el TTL largo.
export function getFreshCache(plate) {
  const row = db
    .prepare('SELECT dto_json, fetched_at FROM vehicle_cache WHERE plate = ?')
    .get(plate)
  if (!row) return null

  const dto = JSON.parse(row.dto_json)
  const isPartial = (dto.missingSections?.length || 0) > 0
  const ttl = isPartial ? config.cachePartialTtlHours : config.cacheTtlHours

  const ageH = (Date.now() - new Date(row.fetched_at).getTime()) / 3.6e6
  if (ageH > ttl) return null

  return { dto, dataAgeHours: Math.round(ageH * 10) / 10 }
}

// Guarda/actualiza el DTO consolidado de una placa.
export function putCache(plate, dto) {
  db.prepare(
    `INSERT INTO vehicle_cache (plate, dto_json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(plate) DO UPDATE SET
       dto_json   = excluded.dto_json,
       fetched_at = excluded.fetched_at`
  ).run(plate, JSON.stringify(dto), new Date().toISOString())
}

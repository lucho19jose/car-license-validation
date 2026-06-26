import Database from 'better-sqlite3'
import fs from 'node:fs'
import { config } from '../config.js'

// Asegura que existan las carpetas de datos/reportes
fs.mkdirSync(config.paths.reports, { recursive: true })

export const db = new Database(config.paths.db)
db.pragma('journal_mode = WAL')

// Crea las tablas si no existen
const schema = fs.readFileSync(config.paths.schema, 'utf8')
db.exec(schema)

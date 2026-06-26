-- Cada detección de placa que envía el Jetson (auditoría / volumen)
CREATE TABLE IF NOT EXISTS plates_seen (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plate      TEXT NOT NULL,
  camera_id  TEXT,
  confidence REAL,
  seen_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plates_seen_plate ON plates_seen(plate);

-- Una fila por consulta consolidada (el "job")
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,          -- uuid del job
  plate        TEXT NOT NULL,
  status       TEXT NOT NULL,             -- QUEUED | PROCESSING | COMPLETED | FAILED
  result_json  TEXT,                      -- DTO normalizado + metadatos
  pdf_path     TEXT,                      -- ruta del reporte generado
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  is_cached    INTEGER DEFAULT 0,
  data_age_h   REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_plate ON reports(plate);
CREATE INDEX IF NOT EXISTS idx_reports_requested ON reports(requested_at);

-- Cache por placa para reusar consultas frescas (como el dataAgeHours de mitorito)
CREATE TABLE IF NOT EXISTS vehicle_cache (
  plate      TEXT PRIMARY KEY,
  dto_json   TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

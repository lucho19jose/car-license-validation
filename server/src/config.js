import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // Auth del Jetson hacia el Ingest API
  apiKey: process.env.API_KEY || 'dev-api-key',
  hmacSecret: process.env.HMAC_SECRET || 'dev-hmac-secret',

  // Reuso de consultas: si la placa se consultó hace < TTL horas, no se vuelve a tocar la fuente
  cacheTtlHours: parseFloat(process.env.CACHE_TTL_HOURS || '24'),
  // TTL más corto para resultados PARCIALES (alguna fuente falló): reintentar antes.
  cachePartialTtlHours: parseFloat(process.env.CACHE_PARTIAL_TTL_HOURS || '1'),

  // Antidobles: el Jetson manda la misma placa muchos frames; ignoramos repeticiones recientes
  dedupWindowSec: parseInt(process.env.DEDUP_WINDOW_SEC || '60', 10),

  redisUrl: process.env.REDIS_URL || '',
  twoCaptchaKey: process.env.TWOCAPTCHA_KEY || '',

  // Día 5: rate-limit por fuente + anonimización
  rateLimit: {
    // Máx. consultas simultáneas a UNA MISMA fuente (protege contra baneos)
    maxConcurrency: parseInt(process.env.RATE_MAX_CONCURRENCY || '2', 10),
    // Intervalo mínimo entre consultas a una misma fuente (ms). 0 = sin espera.
    minIntervalMs: parseInt(process.env.RATE_MIN_INTERVAL_MS || '0', 10),
  },
  // Enmascara el nombre del propietario en el reporte (figuras del paper, Ley 29733)
  anonymizeOwner: process.env.ANONYMIZE_OWNER === 'true',

  // Día 4: PDF + webhook
  pdfEnabled: process.env.PDF_ENABLED !== 'false',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
  // Webhook global por defecto (si la detección no trae callback_url propio)
  webhookUrl: process.env.WEBHOOK_URL || '',

  // Si true, SUNARP usa datos mock (Día 1). En false usa el scraper real (Día 2).
  // Default: mock, salvo que se desactive explícitamente Y haya clave de 2captcha.
  useMockSunarp: process.env.USE_MOCK_SUNARP !== 'false',

  sunarp: {
    // URL de la consulta vehicular de SUNARP. CALIBRAR contra el sitio en vivo.
    url: process.env.SUNARP_URL || 'https://www.sunarp.gob.pe/consulta-vehicular',
    headless: process.env.HEADLESS !== 'false',
    navTimeoutMs: parseInt(process.env.NAV_TIMEOUT_MS || '30000', 10),
    // Reintentos del flujo completo si el captcha sale mal (2captcha falla ~10-20%)
    maxCaptchaAttempts: parseInt(process.env.SUNARP_CAPTCHA_ATTEMPTS || '3', 10),
  },

  // SOAT — consulta de APESEG (Día 3, CALIBRADO 26/06/2026)
  useMockSoat: process.env.USE_MOCK_SOAT !== 'false',
  soat: {
    // Página padre (da el x-referrer correcto al iframe de la webapp)
    url: process.env.SOAT_URL || 'https://www.apeseg.org.pe/consultas-soat/',
    headless: process.env.HEADLESS !== 'false',
    navTimeoutMs: parseInt(process.env.NAV_TIMEOUT_MS || '30000', 10),
    maxCaptchaAttempts: parseInt(process.env.SOAT_CAPTCHA_ATTEMPTS || '4', 10),
  },

  // MTC — consulta de revisiones técnicas / CITV (Día 3, CALIBRADO 26/06/2026)
  useMockMtc: process.env.USE_MOCK_MTC !== 'false',
  mtc: {
    url: process.env.MTC_URL || 'https://rec.mtc.gob.pe/Citv/ArConsultaCitv',
    headless: process.env.HEADLESS !== 'false',
    navTimeoutMs: parseInt(process.env.NAV_TIMEOUT_MS || '30000', 10),
    // Margen amplio: además de reintentar captchas fallidos, puede necesitar
    // varias pasadas válidas para confirmar un "sin CITV" (ver confirmEmpty).
    maxCaptchaAttempts: parseInt(process.env.MTC_CAPTCHA_ATTEMPTS || '5', 10),
    // Nº de respuestas vacías (orStatus=true) INDEPENDIENTES exigidas para declarar
    // "sin CITV". Evita un falso N/D si un captcha mal resuelto colara una lista
    // vacía. 1 = confiar en orStatus sin confirmar (más barato, 1 captcha menos).
    confirmEmpty: parseInt(process.env.MTC_CONFIRM_EMPTY || '2', 10),
    // Cuántos 429 (rate-limit) toleramos antes de abandonar. Un throttle sostenido
    // no cede en segundos, así que reintentarlo solo malgasta captchas → tope bajo.
    maxRateLimitRetries: parseInt(process.env.MTC_RATELIMIT_RETRIES || '1', 10),
  },

  paths: {
    root,
    data: path.join(root, 'data'),
    reports: path.join(root, 'data', 'reports'),
    db: path.join(root, 'data', 'placas.db'),
    schema: path.join(__dirname, 'db', 'schema.sql'),
  },
}

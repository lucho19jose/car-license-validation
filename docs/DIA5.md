# Día 5 — Hardening, anonimización y cierre

> Objetivo: endurecer el sistema (rate-limit + retry/backoff por fuente),
> anonimizar el propietario en las figuras y dejar lista la documentación del paper.

## Qué se construyó / cambió

| Archivo | Cambio |
|---|---|
| `src/core/limiter.js` | **Nuevo**: rate limiter por fuente (concurrencia + intervalo mínimo). |
| `src/core/anon.js` | **Nuevo**: `maskName` / `anonymizeDto` para enmascarar al propietario. |
| `src/adapters/scrape-util.js` | `isRetryable(err)` + `backoff(attempt)` (backoff exponencial). |
| `src/adapters/{sunarp,soat,mtc}.real.js` | Reintentan ante errores **transitorios** (no solo captcha) con backoff. |
| `src/queue/worker.js` | Cada fuente se llama vía `limited('fuente', …)`. |
| `src/report/pdf.js` | El reporte usa `anonymizeDto(dto)` (figuras), la DB guarda el crudo. |
| `src/config.js` + `.env.example` | `rateLimit`, `anonymizeOwner`. |

## Rate-limit por fuente

`limited(key, fn)` agrupa las llamadas por clave (`sunarp`/`soat`/`mtc`) y aplica:
- **`RATE_MAX_CONCURRENCY`** (def. 2): máx. consultas simultáneas a la misma fuente.
- **`RATE_MIN_INTERVAL_MS`** (def. 0; recomendado ~1500 en real): separación mínima
  entre consultas a la misma fuente.

Esto importa cuando llegan muchas placas: el worker procesa 3 jobs en paralelo,
pero **una misma fuente** nunca recibe más de N consultas a la vez ni más rápido
que el intervalo → menos riesgo de baneo. El cache (Día 3) reduce aún más la carga.

## Retry / backoff por fuente

Los 3 adapters reales reintentan ante errores recuperables —captcha mal resuelto
**o** fallo transitorio (timeout, `net::`, socket, navegación)— hasta
`*_CAPTCHA_ATTEMPTS` veces, con **backoff exponencial** (`800ms · 2^(n-1)`).
Los errores no recuperables (p. ej. "sin resultado") cortan de inmediato.

## Anonimización (Ley N° 29733)

- `maskName("VASQUEZ NINANCURO, IVOSKA")` → `"V*** N***, I***"`.
- Con `ANONYMIZE_OWNER=true`, el **reporte HTML/PDF** sale enmascarado, pero la
  **base de datos y la API** conservan el dato crudo (la investigación lo necesita).
- Decisión consciente: anonimizar en el punto de **publicación** (figuras), no en
  el almacenamiento.

Verificado: con la bandera activa, el reporte muestra `Propietario: V*** N***, I***`
mientras `GET /reports/:id` devuelve el nombre completo.

## Cómo activar el hardening en real

```ini
RATE_MAX_CONCURRENCY=2
RATE_MIN_INTERVAL_MS=1500
ANONYMIZE_OWNER=true
```

## Estado al cierre del Día 5

- ✅ Rate-limit por fuente (concurrencia + intervalo).
- ✅ Retry/backoff ante transitorios en los 3 adapters.
- ✅ Anonimización del propietario en figuras (DB intacta), verificada.
- ✅ Sección del paper redactada → [`PAPER.md`](PAPER.md).
- ✅ Demo end-to-end verde tras todos los cambios.

## El proyecto en 5 días (resumen)

| Día | Entregable |
|---|---|
| 1 | Ingest API + cola + SQLite + adapters mock + reporte HTML |
| 2 | SUNARP real (Playwright + 2captcha) + fallback a mock |
| 3 | SOAT y MTC reales + utilidades compartidas + cache adaptativa |
| 4 | PDF real + webhook firmado de vuelta al Jetson |
| 5 | Hardening (rate-limit, retry/backoff) + anonimización + paper |

## Pendiente del usuario (para pasar de demo a real)

1. Calibrar selectores de SUNARP/SOAT/MTC con `npm run inspect -- <url>`.
2. Cargar `TWOCAPTCHA_KEY` y confirmar las URLs reales.
3. Poner `USE_MOCK_*=false`.

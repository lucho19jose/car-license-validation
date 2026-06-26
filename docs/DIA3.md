# Día 3 — Adapters reales de SOAT (APESEG) y MTC (RTV) + cache afinada

> Objetivo: replicar el patrón de SUNARP (Día 2) para las otras dos fuentes y
> mejorar la cache. El pipeline central sigue intacto.

## Qué se construyó

| Archivo | Rol |
|---|---|
| `src/adapters/soat.js` | Dispatcher SOAT (mock/real). |
| `src/adapters/soat.mock.js` | Mock SOAT extraído del Día 1. |
| `src/adapters/soat.real.js` | Scraper real de APESEG (Playwright + 2captcha). |
| `src/adapters/mtc.js` | Dispatcher MTC (mock/real). |
| `src/adapters/mtc.mock.js` | Mock MTC extraído del Día 1. |
| `src/adapters/mtc.real.js` | Scraper real de revisiones técnicas (CITV). |
| `src/adapters/scrape-util.js` | **Utilidades compartidas** de scraping (ver abajo). |
| `test/inspect.mjs` | Inspector genérico de selectores para cualquier URL. |

## Refactor: utilidades compartidas (`scrape-util.js`)

Para no repetir lógica en los 3 adapters reales, se extrajeron helpers comunes:

- `normLabel(s)` — normaliza etiquetas de tabla (mayúsculas, sin `:`).
- `isVigente(ddmmyyyy)` — ¿la fecha sigue vigente respecto a hoy? (`true/false/null`).
- `solveCaptchaIfPresent(page, imgSel, inputSel)` — resuelve el captcha **solo si
  existe** (MTC podría no tener captcha; SOAT sí).
- `parseLabeledRows(page, rowSel, labelMap)` — lee filas etiqueta→valor (soporta
  `td/th/dt/dd`) y las mapea a campos del DTO.

SOAT y MTC ya usan estos helpers. (SUNARP del Día 2 puede migrarse a ellos luego;
funciona igual con su parser propio.)

## Lógica específica por fuente

**SOAT** — además de aseguradora/póliza/vigencia, calcula `valid`:
- Si hay estado textual → `VIGENTE` y no `NO VIGENTE`.
- Si no → por la fecha de fin de vigencia (`isVigente`).

**MTC** — calcula `valid` = resultado contiene `APROBAD*` **y** la fecha de
vencimiento sigue vigente. El captcha es opcional (se resuelve si aparece).

## Cache afinada (TTL adaptativo)

`core/cache.js` ahora usa **dos TTL** según la calidad del resultado:

| Resultado | TTL | Variable |
|---|---|---|
| Completo (las 3 fuentes ok) | 24 h | `CACHE_TTL_HOURS` |
| Parcial (alguna fuente falló) | 1 h | `CACHE_PARTIAL_TTL_HOURS` |

Así, si una fuente se cayó al momento de la consulta, la placa se reintenta a la
hora en vez de quedar "pegada" con datos incompletos durante 24 h. La decisión se
toma leyendo `dto.missingSections` del propio resultado cacheado.

> Nota: en modo **mock** las fuentes nunca "fallan" (devuelven `N/D` con `ok:true`),
> por lo que `missingSections` queda vacío y siempre aplica el TTL largo. El TTL
> corto se activa en modo real cuando un scraper realmente cae.

## Calibración (idéntico flujo que SUNARP)

```bash
cd server
npm run inspect -- https://consultasoat.apeseg.org.pe        # SOAT
npm run inspect -- https://rec.mtc.gob.pe/Citv/ConsultaCitv   # MTC
```
Copiar selectores reales a `SEL` y etiquetas a `LABEL_MAP` en cada `*.real.js`.

## Activar modo real

En `server/.env`:
```ini
USE_MOCK_SOAT=false
USE_MOCK_MTC=false
TWOCAPTCHA_KEY=tu_clave
SOAT_URL=https://...     # calibrado
MTC_URL=https://...      # calibrado
```

## Estado al cierre del Día 3

- ✅ SOAT y MTC con dispatcher mock/real y scraper Playwright completo.
- ✅ Utilidades de scraping compartidas (menos duplicación).
- ✅ Cache con TTL adaptativo (completo vs parcial).
- ✅ Sintaxis verificada; demo sigue verde en modo mock (ALI582 GREEN, cache hit).
- ⏳ Pendiente del usuario: calibrar selectores SOAT/MTC + `TWOCAPTCHA_KEY`.

## Pendientes / notas

- Las URLs por defecto de SOAT y MTC son **candidatas** y deben confirmarse
  contra el sitio en vivo (las entidades cambian rutas).
- Recordatorio para el paper: anonimizar datos personales (Ley N° 29733),
  rate-limit + cache, y recomendar acceso formal en producción.

## Próximo: Día 4

PDF real (Playwright `page.pdf` sobre la plantilla HTML existente) + webhook de
vuelta al Jetson cuando el reporte está listo.

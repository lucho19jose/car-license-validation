# Placas — Consolidador vehicular en tiempo real

Demo académica: un **Jetson (ALPR)** captura placas y las envía a un **Ingest API**
que consolida datos de **SUNARP**, **SOAT (APESEG)** y **MTC**, y genera un **reporte**.

> Estado: **Día 1** — pipeline punta a punta con *adapters mock* (datos simulados).
> Los días siguientes reemplazan cada adapter por scraping real (Playwright + 2captcha)
> y el reporte HTML por PDF.

## Arquitectura

```
[Jetson ALPR] --POST firmado--> [Ingest API] --> [Cola] --> [Worker]
                                                              | (cache → si no, en paralelo)
                                              ┌───────────────┼───────────────┐
                                          [SUNARP]         [SOAT]           [MTC]
                                              └───────────────┼───────────────┘
                                                       [Normalizer] → SQLite
                                                              ↓
                                                       [Reporte HTML/PDF]
```

## Requisitos
- Node.js 18+ (usa `fetch`, `crypto.randomUUID`)
- (Jetson) Python 3 + `requests`

## Arrancar

```bash
cd server
cp .env.example .env
npm install
npm start
```

Servidor en `http://localhost:3000`.

## Probar el pipeline (simula al Jetson)

En otra terminal:

```bash
cd server
npm run send            # placa ALI582 (tiene datos mock completos)
node test/send.mjs C3E040   # placa sin datos -> muestra el manejo de "N/D"
```

Verás el `POST 202` (encolado) y, tras ~2.5 s, el `GET` con el DTO consolidado
y la URL del reporte. Ábrela en el navegador.

Cache: repite `npm run send` con la misma placa — la segunda vez responde desde
cache (`is_cached: true`).

### Cliente real del Jetson
`jetson/client.py` hace el mismo POST firmado (HMAC). Reemplaza `detectar_placas()`
por la salida de tu modelo ALPR.

## Endpoints
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/plates` | Recibe una placa (requiere `X-Api-Key` + `X-Signature` HMAC). 202 + `job_id`. |
| GET | `/api/v1/reports/:id` | Estado/resultado del job + `report_url`. |
| GET | `/api/v1/plates/recent` | Últimas placas detectadas. |
| GET | `/reports/:id.html` | Reporte generado. |

## Estructura
```
server/src/
  api/        rutas + auth HMAC
  queue/      cola en memoria + worker
  adapters/   sunarp / soat / mtc (MOCK hoy)
  core/       plate, cache, normalizer
  db/         schema.sql + better-sqlite3
  report/     plantilla + generación de reporte
jetson/       client.py
```

## Roadmap
- **Día 1 ✅** Ingest API + cola + SQLite + adapters mock + reporte HTML
- **Día 2 ✅** Adapter SUNARP real (Playwright + 2captcha) — ver [`docs/DIA2.md`](docs/DIA2.md)
- **Día 3 ✅** Adapters SOAT y MTC + cache afinada — ver [`docs/DIA3.md`](docs/DIA3.md)
- **Día 4 ✅** PDF real (Playwright) + webhook de vuelta al Jetson — ver [`docs/DIA4.md`](docs/DIA4.md)
- **Día 5 ✅** Hardening (retry/backoff, rate-limit) + anonimización + paper — ver [`docs/DIA5.md`](docs/DIA5.md) y [`docs/PAPER.md`](docs/PAPER.md)

## Notas para el paper
- Rate-limiting + cache agresivo para no sobrecargar las fuentes.
- El **nombre del propietario** es dato personal (**Ley N° 29733**): anonimizar en figuras.
- Recomendación de producción: migrar a **acceso formal** (SUNARP Publicidad Registral
  en línea / web services institucionales) en lugar de scraping.
```

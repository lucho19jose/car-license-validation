# Día 4 — PDF real (Playwright) + Webhook de vuelta al Jetson

> Objetivo: convertir el reporte HTML en **PDF** y **notificar** al Jetson (u otro
> consumidor) cuando el reporte está listo, cerrando el lazo asíncrono.

## Qué se construyó / cambió

| Archivo | Cambio |
|---|---|
| `src/report/pdf.js` | `generateReport` ahora produce HTML **y PDF** (Chromium `page.pdf`). Devuelve `{ htmlPath, pdfPath }`. |
| `src/report/webhook.js` | **Nuevo**: `sendWebhook(url, payload)` firma el cuerpo con HMAC y lo postea. No bloquea si falla. |
| `src/queue/worker.js` | Guarda el `pdfPath` y, al terminar, dispara el webhook al `callback_url` (o al `WEBHOOK_URL` global). |
| `src/api/routes.js` | `POST /plates` acepta `callback_url`. `GET /reports/:id` expone `pdf_url`, `html_url` y `report_url` (prefiere PDF). |
| `test/send.mjs` | Sondea hasta `COMPLETED` (el PDF tarda) y soporta `CALLBACK_URL`. |
| `test/webhook-server.mjs` | **Nuevo**: receptor de webhook de prueba que verifica la firma HMAC. |
| `src/config.js` | `pdfEnabled`, `publicBaseUrl`, `webhookUrl`. |

## PDF

- Se renderiza el **mismo HTML** del Día 1 con Chromium (reusa `browser.js` del
  scraper) → `page.setContent(html)` → `page.pdf({ format:'A4', printBackground:true })`.
- Reutilizar el HTML significa que **mejorar la plantilla mejora el PDF gratis**.
- **No bloqueante**: si Chromium falla o `PDF_ENABLED=false`, queda el HTML y el
  pipeline sigue (`pdfPath = null`).

## Webhook (cierre del lazo asíncrono)

El flujo real es asíncrono: el Jetson postea la placa y recibe `202` al instante;
las 3 fuentes tardan varios segundos. Dos formas de obtener el resultado:

1. **Poll**: `GET /api/v1/reports/:id` hasta `COMPLETED` (lo usa `send.mjs`).
2. **Webhook (push)**: el Jetson manda `callback_url` en el POST; al terminar le
   hacemos POST con el resultado + URLs del reporte. Firmado con HMAC (misma clave
   que protege el Ingest API) para que el Jetson lo verifique.

Payload del webhook:
```json
{
  "job_id": "…", "plate": "ALI582", "status": "COMPLETED",
  "result": { …DTO consolidado… },
  "html_url": "http://<base>/reports/<id>.html",
  "pdf_url":  "http://<base>/reports/<id>.pdf"
}
```

## Prueba end-to-end (verificada)

```bash
cd server
node test/webhook-server.mjs          # terminal 1 (escucha :4000)
npm start                             # terminal 2
CALLBACK_URL=http://localhost:4000/webhook node test/send.mjs ALI582   # terminal 3
```
Resultado observado:
- `POST /plates -> 202 QUEUED`
- `GET /reports -> COMPLETED` con `pdf_url`
- PDF generado: `%PDF-1.4`, ~113 KB
- `[webhook-server] POST /webhook firma=OK ✓` con el payload completo

## Estado al cierre del Día 4

- ✅ PDF A4 con fondo, generado desde la plantilla HTML.
- ✅ Webhook firmado (HMAC) de vuelta al Jetson; receptor de prueba incluido.
- ✅ `callback_url` por request + `WEBHOOK_URL` global como fallback.
- ✅ `GET /reports/:id` expone `pdf_url` / `html_url`.
- ✅ Probado end-to-end en modo mock.

## Notas

- El webhook usa `PUBLIC_BASE_URL` para las URLs absolutas: en despliegue real,
  setéalo al host público para que el Jetson pueda descargar el PDF.
- En el Jetson, el receptor de webhook debe verificar la firma igual que
  `webhook-server.mjs` antes de confiar en el payload.

## Próximo: Día 5

Hardening: retry/backoff por fuente, rate-limit, anonimización del propietario en
figuras, y la redacción de la sección de arquitectura/resultados para el paper.

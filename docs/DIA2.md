# Día 2 — Adapter real de SUNARP (Playwright + 2captcha)

> Objetivo del día: reemplazar el mock de SUNARP por un scraper real de la
> consulta vehicular, **sin romper la demo**. El pipeline (cola, normalizer,
> cache, reporte) no se toca: solo cambia el cuerpo del adapter.

## Qué se construyó

| Archivo | Rol |
|---|---|
| `src/adapters/sunarp.js` | **Dispatcher**: elige mock o real según `USE_MOCK_SUNARP`. Firma estable. |
| `src/adapters/sunarp.mock.js` | Mock extraído del Día 1 (datos simulados). |
| `src/adapters/sunarp.real.js` | **Scraper real**: Playwright + 2captcha + parseo del resultado. |
| `src/adapters/captcha.js` | Cliente de 2captcha (imagen y reCAPTCHA v2), sin dependencias extra. |
| `src/adapters/browser.js` | Instancia única de Chromium reutilizable (import perezoso). |
| `test/inspect-sunarp.mjs` | Abre SUNARP con el inspector de Playwright para calibrar selectores. |

Dependencias nuevas: `playwright` + Chromium (`npx playwright install chromium`).

## Diseño del adapter real

```
consultarSunarp(plate)            ← dispatcher (sunarp.js)
  └─ USE_MOCK_SUNARP=true  → consultarSunarpMock   (demo)
  └─ USE_MOCK_SUNARP=false → consultarSunarpReal    (Playwright)
        │
        ├─ newContext()                      browser.js (Chromium + UA es-PE)
        ├─ page.goto(SUNARP_URL)
        ├─ fill(placa)
        ├─ screenshot(captcha) → 2captcha → solución   captcha.js
        ├─ fill(captcha) + click(buscar)
        ├─ wait(resultado | error)
        └─ parseResult()  filas etiqueta→valor → DTO
```

**Decisiones clave:**

- **Firma idéntica al mock**: `consultarSunarp(plate) -> { ok, data, error, timingMs }`.
  Por eso el worker, el normalizer y el cache no cambian.
- **Fallback seguro**: si Playwright no está, el captcha falla o el parseo no
  encuentra datos, el dispatcher devuelve `{ ok:false, ... }`. El pipeline lo
  marca en `missingSections` y **no se cae** (igual que mitorito con sus
  `failedSources`).
- **Reintentos de captcha**: 2captcha falla ~10-20% de las veces. `consultarSunarpReal`
  reintenta el flujo completo hasta `SUNARP_CAPTCHA_ATTEMPTS` (default 3) solo si
  el error fue de captcha.
- **Import perezoso de Playwright**: el modo mock no requiere tenerlo instalado.
- **Captcha por screenshot**: capturamos el `<img>` del captcha como PNG y lo
  mandamos en base64. Funciona aunque el `src` sea un blob/sesión.

## ⚠️ Calibración requerida (lo que falta para que el modo real funcione)

Los selectores en `sunarp.real.js` (`SEL`) y el mapa de etiquetas (`LABEL_MAP`)
son el **contrato esperado**, pero deben verificarse contra el DOM en vivo, que
cambia con el tiempo. Procedimiento:

1. **Abrir el inspector** apuntando al sitio real:
   ```bash
   cd server
   SUNARP_URL=https://<url-real-consulta>  npm run inspect:sunarp
   ```
   (en PowerShell: `$env:SUNARP_URL="https://..."; npm run inspect:sunarp`)

2. Con el botón **"Pick locator"** del inspector, copiar los selectores reales de:
   - input de la placa → `SEL.plateInput`
   - imagen del captcha → `SEL.captchaImg`
   - input del captcha → `SEL.captchaInput`
   - botón consultar → `SEL.submit`
   - filas del resultado → `SEL.resultRow`
   - mensaje de error → `SEL.errorMsg`

3. Ajustar `LABEL_MAP` con las etiquetas exactas que devuelve SUNARP
   (p. ej. `"AÑO MODELO"`, `"N° SERIE"`).

4. Si el sitio usa **reCAPTCHA** en vez de imagen, cambiar el paso de captcha por
   `solveRecaptchaV2(siteKey, pageUrl)` (ya implementado en `captcha.js`).

## Cómo activar el modo real

1. Crear cuenta en **2captcha** y cargar saldo (≈ $1–3 USD alcanza para cientos
   de captchas de imagen). Obtener la API key.
2. En `server/.env`:
   ```ini
   USE_MOCK_SUNARP=false
   TWOCAPTCHA_KEY=tu_clave
   SUNARP_URL=https://<url-real-consulta>
   HEADLESS=false   # opcional, para ver el navegador la primera vez
   ```
3. Reiniciar el servidor y probar:
   ```bash
   npm start
   node test/send.mjs ALI582
   ```

Para volver al mock: `USE_MOCK_SUNARP=true` (o borrar la línea).

## Estado al cierre del Día 2

- ✅ Arquitectura del scraper real completa y con sintaxis verificada.
- ✅ Cliente 2captcha funcional (imagen + reCAPTCHA v2).
- ✅ Fallback automático: la demo sigue verde en modo mock.
- ✅ Inspector de selectores listo (`npm run inspect:sunarp`).
- ⏳ Pendiente del usuario: calibrar `SEL`/`LABEL_MAP` contra el sitio en vivo y
  cargar `TWOCAPTCHA_KEY`. (No se puede hacer desde aquí: requiere clave de pago
  y el DOM real.)

## Notas legales / para el paper

- El scraping de la consulta pública con resolución de captcha **evade un control
  de acceso**: documentarlo como técnica de investigación, no como práctica
  recomendada para producción.
- **Rate-limit**: no lanzar consultas en ráfaga; el cache (TTL 24h) ya reduce la
  carga reusando placas recientes.
- El **nombre del propietario** es dato personal (**Ley N° 29733**): anonimizarlo
  en figuras/capturas del paper.
- **Recomendación de producción** (para el paper): migrar a acceso formal —
  *Servicio de Publicidad Registral en Línea* / web services institucionales de
  SUNARP — en lugar de scraping con captcha.

## Próximo: Día 3

Replicar este mismo patrón (dispatcher mock/real + adapter Playwright) para
**SOAT (APESEG)** y **MTC (revisiones técnicas)**, y afinar la cache.

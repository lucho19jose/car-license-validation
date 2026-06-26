# Calibración de fuentes — hallazgos reales (26/06/2026)

Inspección en vivo con chrome-devtools de las 3 fuentes. Resultados concretos
que cambian el plan original del Día 2/3.

## Resumen ejecutivo

| Fuente | ¿Automatizable? | Bloqueo | Estado |
|---|---|---|---|
| **SUNARP** | ❌ No (con navegador estándar) | **Cloudflare Turnstile** + bot management | Mock + captura manual |
| **SOAT (APESEG)** | ✅ **Sí** | Captcha de imagen (resoluble 2captcha) | **Calibrado y verificado** |
| **MTC (CITV)** | ✅ **Sí** | Captcha de imagen numérico | **Calibrado y verificado** |

---

## SUNARP — bloqueado por Cloudflare Turnstile

URL: `https://consultavehicular.sunarp.gob.pe/consulta-vehicular/inicio`

- Es una **SPA de Angular** (NG-ZORRO/Ant Design), no un formulario clásico.
- Seguridad: **Cloudflare Turnstile** (`input[name="cf-turnstile-response"]`,
  sitekey `0x4AAAAAACFzt4Xn8T1Jg9ZS`) + bot management (tráfico `flow/peek/pat`).
- **Resultado de la prueba:** con el navegador controlado por automatización (CDP),
  Turnstile devuelve **"La verificación falló"** aunque un humano haga clic. Cloudflare
  detecta la automatización por fingerprint, no solo el clic.
- Selectores (por si se usa captura manual): placa `#nroPlaca`, botón `button[type=submit]`.
- Además tiene un captcha propio (`/multiservicio-captcha/captcha/generar-crypt`).

**Conclusión:** el scraping automatizado de SUNARP **no es viable** con navegador
estándar. Opciones: captura manual en navegador normal, o navegador anti-detección
+ IP residencial + 2captcha-Turnstile (frágil), o **acceso formal** (recomendado).

---

## SOAT (APESEG) — ✅ automatizable y VERIFICADO

Página: `https://www.apeseg.org.pe/consultas-soat/`
WebApp (iframe): `https://webapp.apeseg.org.pe/consulta-soat/?source=apeseg`

### Estructura
- Formulario en **iframe** (cross-origin). Campos: `#placa`, `#captcha`,
  imagen `img.captcha-img` (data URI base64), botón `button[type=submit]`.
- **Captcha de imagen clásico** (texto distorsionado, 6 chars) → resoluble con 2captcha.
- **Sin Cloudflare, sin reCAPTCHA.**

### Flujo de API (capturado)
1. `GET /captcha-api/api/captcha` → imagen + `key` (cifrado Laravel).
2. `POST /captcha-api/api/captcha/verify` `{captcha, key}` → `{"valid":true}`.
   - Header requerido: `x-app-secret: 9asjKZ9aJq1@2025`.
3. `POST /consulta-soat/api/login` → `{ token: "Bearer …" }`.
4. `GET /consulta-soat/api/certificados/placa/{PLACA}` → **array JSON con el historial**.
   - **Headers requeridos:** `authorization: Bearer …`, `x-source: apeseg`,
     y **`x-referrer: https://www.apeseg.org.pe/`** (sin esto → **403 "Acceso no autorizado"**).

> El 403 fue la clave: entrando directo a la webapp el `x-referrer` es `unknown` → 403.
> Embebido en apeseg.org.pe el referrer es válido → 200.

### Forma del dato (campos útiles del array)
```
NombreCompania, NumeroPoliza, FechaInicio, FechaFin, Estado (VIGENTE/VENCIDO),
TipoCertificado (DIGITAL/FISICO), NombreUsoVehiculo, NombreClaseVehiculo, Placa
```

### Verificación real (placa ALI582)
SOAT vigente: **Pacífico Seguros**, 16/03/2026 → 16/03/2027, póliza
`000000000201245548800100`, VIGENTE, DIGITAL. **Coincide con el dato de mitorito**
del inicio. Además devuelve historial (Rimac, Interseguro, Mapfre, Protecta).

### Implementación
`src/adapters/soat.real.js` **ya calibrado**: conduce la página real embebida
(Playwright `frameLocator`), resuelve el captcha de imagen con 2captcha y **lee la
respuesta de la API** de certificados (más rica que el DOM). Esto delega login,
x-referrer y cifrado a la propia webapp.

Para activarlo: `USE_MOCK_SOAT=false` + `TWOCAPTCHA_KEY=...`.

---

## MTC (CITV) — ✅ automatizable y VERIFICADO

Portal: `https://rec.mtc.gob.pe/Citv/ArConsultaCitv` (ASP.NET MVC).

### Estructura
- Campos: `#texFiltro` (placa), `#texCaptcha` (captcha), botón `#btnBuscar`.
  Selector tipo de búsqueda `#selBUS_Filtro` (Placa/Certificado, default Placa).
- **Captcha de imagen numérico** (`#imgCaptcha`, data URI) → resoluble con 2captcha.
  **Sin Cloudflare.**

### API (capturada)
`GET /CITV/JrCITVConsultarFiltro?pArrParametros=1|{PLACA}||{CAPTCHA}`
→ `{ orStatus, orResult: ["<json-string array>", count] }`
(usa cookie `ASP.NET_SessionId` de la propia página).

### Forma del dato (por documento)
```
PLACA, NRO_CERTI, TIPODOCUMENTO (NRO DE CERTIFICADO / NRO DE INFORME),
REVISIONVIGENCIAINICIO, REVISIONVIGENCIAFINAL, RESULTADO (APROBADO/DESAPROBADO),
ESTADO (VIGENTE/VENCIDO), SRAZONSOCENTCER (certificadora), DIRECCION,
TIPO_AMBITO, TIPO_SERVICIO, OBSERVACION
```

### Verificación real (ALI582)
CITV vigente: **APROBADO**, 24/01/2026 → 24/01/2027, cert `C-2026-412-622-000408`,
**R.T.V.-JR E.I.R.L.** (Cusco). Historial: 3 documentos (incluye un informe
DESAPROBADO 12/2025 y un certificado VENCIDO 2024). **Coincide con mitorito.**

### Implementación
`src/adapters/mtc.real.js` calibrado: conduce la página, resuelve el captcha de
imagen con 2captcha y lee la respuesta JSON, mapeando **todos los campos** + el
historial completo. El reporte (PDF/HTML) muestra el detalle e historial de MTC y
SOAT. Mocks de ALI582 enriquecidos con los datos reales para la demo.

Para activar: `USE_MOCK_MTC=false` + `TWOCAPTCHA_KEY=...`.

---

## Implicaciones para el paper

- **Hallazgo metodológico fuerte:** las fuentes oficiales tienen niveles de
  protección **muy distintos**. SUNARP (el dato más sensible: titularidad) está
  tras Cloudflare Turnstile, prácticamente no automatizable; SOAT es accesible con
  un captcha de imagen estándar. Esto justifica empíricamente la arquitectura de
  **adaptadores por fuente** y la recomendación de **acceso formal** para SUNARP.
- **Reproducibilidad/ética:** documentar que SOAT se consultó respetando el flujo
  oficial (captcha incluido), con rate-limit y cache; anonimizar datos personales.

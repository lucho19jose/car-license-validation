# Consolidación en tiempo real de información vehicular a partir de reconocimiento automático de placas (ALPR) en el borde

> Borrador de las secciones de **arquitectura**, **metodología** y **resultados**
> para el paper. Texto base en español; adaptar al formato de la revista/curso.

## Resumen (abstract)

Se presenta un sistema que integra reconocimiento automático de placas (ALPR)
ejecutado en un dispositivo de borde (NVIDIA Jetson) con la **consolidación
automática** de información vehicular proveniente de tres fuentes oficiales
peruanas —SUNARP (registro de propiedad), APESEG (SOAT) y MTC (revisión técnica)—
para generar, en segundos, un reporte unificado (HTML/PDF) por vehículo detectado.
La arquitectura desacopla la captura (borde) de la consolidación (servicio
asíncrono con cola, cache y adaptadores por fuente), logrando tolerancia a fallos
parciales y reuso de consultas. Se discuten las implicancias legales (Ley N° 29733
de Protección de Datos Personales) y se recomienda, para producción, el acceso
formal a las fuentes en lugar del scraping.

## 1. Introducción

La fiscalización vehicular (SOAT vigente, revisión técnica, situación registral)
requiere consultar múltiples portales públicos de forma manual, cada uno con su
propio captcha y formato. Este trabajo automatiza ese proceso y lo conecta a un
flujo en tiempo real: a medida que un ALPR detecta placas, el sistema produce un
reporte consolidado por vehículo. La contribución no es un dato nuevo, sino la
**integración** y la **arquitectura** que la hace operable en tiempo real.

## 2. Arquitectura del sistema

```
┌─────────────┐  POST firmado (HMAC)   ┌──────────────┐
│ Jetson ALPR │ ─────────────────────► │  Ingest API  │  202 + job_id (no bloquea)
│ (captura)   │  {placa, conf, cam}    └──────┬───────┘
└─────────────┘                                │ encola
                                               ▼
                                       ┌────────────────┐  cache fresca → reusa
                                       │ Cola + Worker  │ ───────────────────────►
                                       └──────┬─────────┘
                       ┌──────────────────────┼──────────────────────┐
                       ▼ rate-limit            ▼ rate-limit           ▼ rate-limit
                  ┌─────────┐            ┌─────────┐            ┌─────────┐
                  │ SUNARP  │            │  SOAT   │            │  MTC    │
                  │(adapter)│            │(adapter)│            │(adapter)│
                  └────┬────┘            └────┬────┘            └────┬────┘
                       └──────────────────────┼──────────────────────┘
                                    ┌──────────────────┐
                                    │   Normalizador   │ → DTO único → SQLite
                                    └────────┬─────────┘
                                             ▼
                                    ┌──────────────────┐
                                    │  Reporte HTML/PDF│ → webhook firmado al Jetson
                                    └──────────────────┘
```

### 2.1 Componentes

- **Borde (Jetson):** ejecuta el ALPR y envía cada detección al Ingest API
  mediante un POST firmado (HMAC-SHA256) con la placa, la confianza y el id de
  cámara. Antidobles en cliente y servidor (ventana temporal) evitan reprocesar la
  misma placa en frames consecutivos.
- **Ingest API:** valida la placa (formato peruano), registra la detección y
  encola un *job*. Responde `202` de inmediato: la consolidación es asíncrona.
- **Cola + Worker:** procesa los jobs con concurrencia acotada. Antes de consultar,
  revisa la **cache**; si la placa fue consultada recientemente, reusa el resultado.
- **Adaptadores por fuente:** una interfaz común `consultar(placa) → {ok, data,
  error, timingMs}` por cada fuente. Cada adaptador encapsula la navegación
  (Playwright), la resolución de captcha (servicio externo) y el parseo. El patrón
  permite intercambiar *scraping* por **acceso formal** sin tocar el resto.
- **Normalizador:** une las tres respuestas en un DTO único y calcula un
  *riskScore* (semáforo) según vigencia de SOAT y revisión técnica. Tolera fallos
  parciales: una fuente caída queda marcada y no aborta el reporte.
- **Reporte + Webhook:** genera HTML y PDF (mismo render), y notifica al Jetson
  con el resultado y las URLs, firmando el callback.

### 2.2 Decisiones de diseño

1. **Asincronía con webhook + poll:** la latencia de las fuentes (varios segundos,
   captcha incluido) no debe bloquear la captura. El borde recibe `202` y luego el
   resultado vía webhook (push) o sondeo (poll).
2. **Cache con TTL adaptativo:** resultados completos se cachean 24 h; los parciales
   (alguna fuente falló) solo 1 h, para reintentar pronto sin sobrecargar.
3. **Tolerancia a fallos parciales:** el DTO reporta `sources` y `missingSections`
   en vez de fallar completo (inspirado en cómo operan los agregadores comerciales).
4. **Adaptadores intercambiables:** aislar cada fuente detrás de una interfaz
   estable habilita migrar de scraping a API formal pieza por pieza.

## 3. Metodología / Implementación

- **Stack:** Node.js (Express) para el Ingest API y el worker; Playwright
  (Chromium) para la navegación y el render de PDF; SQLite para persistencia;
  cola en memoria (sustituible por Redis/BullMQ en producción). El cliente del
  Jetson en Python.
- **Resolución de captcha:** servicio externo de resolución (imagen y reCAPTCHA v2)
  invocado solo cuando la fuente lo exige.
- **Hardening:** *rate-limit por fuente* (concurrencia + intervalo mínimo) y
  *retry con backoff exponencial* ante errores transitorios o captcha fallido.
- **Reproducibilidad:** el sistema corre en modo **mock** (datos simulados) para
  demostración y desarrollo sin depender de la disponibilidad de las fuentes; los
  adaptadores reales se activan por configuración.

## 4. Resultados

> Completar con mediciones del entorno de prueba. Métricas sugeridas:

- **Latencia extremo a extremo** (detección → reporte): descomponer en tiempo por
  fuente (`timingMs` de cada adaptador) y tiempo de render del PDF.
- **Tasa de acierto del captcha** y número medio de reintentos por consulta.
- **Efecto de la cache:** % de placas servidas desde cache y reducción de consultas
  a las fuentes en un flujo con placas repetidas.
- **Throughput:** placas/minuto sostenidas variando la concurrencia del worker.
- **Robustez:** comportamiento ante caída de 1 de 3 fuentes (reporte parcial).

En la demostración (modo mock), el flujo completo —POST, consolidación de 3
fuentes en paralelo, normalización, generación de PDF y webhook firmado— se
completa en el orden de **1–2 s** por placa, con verificación de firma HMAC en el
receptor y PDF A4 válido (`%PDF-1.4`).

## 5. Consideraciones legales y éticas

- **Datos personales:** el nombre del propietario es dato personal protegido por la
  **Ley N° 29733**. El sistema permite **anonimizarlo** en los reportes/figuras
  (`V*** N***, I***`) conservando el dato crudo solo en almacenamiento controlado.
- **Acceso a las fuentes:** el *scraping* con resolución de captcha evade controles
  de acceso de los portales. Se documenta como **técnica de investigación**, no como
  práctica recomendada. Para producción se recomienda **acceso formal** (p. ej.
  *Servicio de Publicidad Registral en Línea* / web services institucionales de
  SUNARP, y mecanismos equivalentes de APESEG y MTC).
- **Minimización de carga:** cache agresivo y rate-limit para no afectar la
  disponibilidad de los servicios públicos.

## 6. Limitaciones y trabajo futuro

- Dependencia de la estructura de los portales (los selectores requieren
  mantenimiento); el acceso formal eliminaría esta fragilidad.
- Costo y variabilidad del servicio de captcha.
- Trabajo futuro: cola distribuida (Redis/BullMQ), panel de monitoreo,
  verificación cruzada entre fuentes y firma/sellado temporal de los reportes.

## 7. Conclusiones

La separación entre captura en el borde y consolidación asíncrona, junto con
adaptadores por fuente, cache y tolerancia a fallos parciales, permite generar
reportes vehiculares unificados en tiempo real de forma robusta. La arquitectura
es agnóstica al método de obtención de datos, lo que habilita una migración limpia
del scraping (demostración) al acceso formal (producción).

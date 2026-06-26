import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { newContext } from '../adapters/browser.js'
import { anonymizeDto } from '../core/anon.js'

// Genera el reporte: siempre HTML, y además PDF (Playwright) si está habilitado.
// Devuelve { htmlPath, pdfPath } (pdfPath = null si falla o está deshabilitado).
export async function generateReport(jobId, dto, meta) {
  // Anonimiza el propietario en las FIGURAS si ANONYMIZE_OWNER=true (la DB guarda el crudo)
  const html = render(anonymizeDto(dto), meta)
  const htmlPath = path.join(config.paths.reports, `${jobId}.html`)
  await fs.writeFile(htmlPath, html, 'utf8')

  let pdfPath = null
  if (config.pdfEnabled) {
    try {
      pdfPath = await renderPdf(jobId, html)
    } catch (err) {
      // No bloquea: si no hay Chromium/falla, queda el HTML.
      console.warn(`[pdf] no se pudo generar PDF de ${jobId}: ${err.message}`)
    }
  }
  return { htmlPath, pdfPath }
}

// Renderiza el HTML a PDF A4 con fondo, usando el mismo Chromium del scraper.
async function renderPdf(jobId, html) {
  const ctx = await newContext()
  const page = await ctx.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdfPath = path.join(config.paths.reports, `${jobId}.pdf`)
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    })
    return pdfPath
  } finally {
    await page.close()
    await ctx.close()
  }
}

const RISK_COLORS = { GREEN: '#16a34a', YELLOW: '#d97706', RED: '#dc2626' }

function esc(v) {
  if (v === null || v === undefined) return '—'
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function row(label, value) {
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`
}

function yesno(v) {
  return v === null || v === undefined ? '—' : v ? 'SÍ' : 'NO'
}

// Tabla horizontal para historiales. `cols` = [{label, key}]
function histTable(cols, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('')
  const body = rows
    .map((r) => '<tr>' + cols.map((c) => `<td>${esc(r[c.key])}</td>`).join('') + '</tr>')
    .join('')
  return `<table class="hist"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function render(dto, meta) {
  const risk = RISK_COLORS[dto.riskScore] || '#6b7280'
  const soat = dto.soat || {}
  const itv = dto.inspection || {}
  const cacheTag = meta.isCached
    ? `<span class="tag tag-cache">cache · ${esc(meta.dataAgeHours)}h</span>`
    : `<span class="tag tag-live">consulta en vivo</span>`

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte vehicular · ${esc(dto.plate)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; }
  .sheet { max-width: 820px; margin: 24px auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.08); }
  header { padding: 24px 28px; background: linear-gradient(120deg,#0f172a,#1e3a8a); color: #fff; display: flex; justify-content: space-between; align-items: center; }
  header .plate { font-size: 30px; font-weight: 800; letter-spacing: 3px; }
  header .sub { font-size: 12px; opacity: .8; }
  .risk { width: 56px; height: 56px; border-radius: 50%; background: ${risk}; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12px; }
  .body { padding: 20px 28px 28px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; font-size: 14px; border-bottom: 1px solid #eef2f7; }
  th { color: #64748b; font-weight: 600; width: 38%; }
  .tag { display: inline-block; font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
  .tag-cache { background: #fef3c7; color: #92400e; }
  .tag-live { background: #dcfce7; color: #166534; }
  .src { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 6px; margin-right: 6px; }
  .src.ok { background: #dcfce7; color: #166534; }
  .src.fail { background: #fee2e2; color: #991b1b; }
  table.hist { margin-top: 6px; }
  table.hist th { width: auto; background: #f8fafc; font-size: 12px; }
  table.hist td { font-size: 12px; }
  .muted { color: #94a3b8; font-size: 12px; margin: 4px 0 0; }
  footer { padding: 14px 28px; font-size: 11px; color: #94a3b8; border-top: 1px solid #eef2f7; }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div>
        <div class="plate">${esc(dto.plate)}</div>
        <div class="sub">${esc(dto.make)} ${esc(dto.model)} · ${esc(dto.year)} · ${cacheTag}</div>
      </div>
      <div class="risk">${esc(dto.riskScore)}</div>
    </header>
    <div class="body">
      <h2>Identificación (SUNARP)</h2>
      <table>
        ${row('Marca', dto.make)}
        ${row('Modelo', dto.model)}
        ${row('Año', dto.year)}
        ${row('Color', dto.color)}
        ${row('Estado', dto.status)}
        ${row('Propietario', dto.owner)}
        ${row('VIN / Serie', dto.vin)}
        ${row('N° Motor', dto.engineNumber)}
      </table>

      <h2>SOAT (APESEG)</h2>
      <table>
        ${row('Aseguradora', soat.insurer)}
        ${row('N° Póliza', soat.policyNumber)}
        ${row('Vigente desde', soat.validFrom)}
        ${row('Vigente hasta', soat.validUntil)}
        ${row('Tipo', soat.certificateType)}
        ${row('Vigente', yesno(soat.valid))}
      </table>
      ${
        soat.history && soat.history.length
          ? `<p class="muted">Historial de pólizas (${soat.history.length})</p>` +
            histTable(
              [
                { label: 'Aseguradora', key: 'insurer' },
                { label: 'Desde', key: 'from' },
                { label: 'Hasta', key: 'to' },
                { label: 'Estado', key: 'estado' },
              ],
              soat.history
            )
          : ''
      }

      <h2>Revisión Técnica (MTC)</h2>
      <table>
        ${row('Resultado', itv.result)}
        ${row('Estado', itv.estado)}
        ${row('Vigente desde', itv.validFrom)}
        ${row('Vigente hasta', itv.validUntil)}
        ${row('N° Certificado', itv.certificate)}
        ${row('Tipo de documento', itv.documentType)}
        ${row('Entidad certificadora', itv.entity)}
        ${row('Dirección', itv.address)}
        ${row('Tipo de servicio', itv.service)}
        ${row('Observaciones', itv.observation)}
        ${row('Vigente', yesno(itv.valid))}
      </table>
      ${
        itv.history && itv.history.length
          ? `<p class="muted">Historial de revisiones (${itv.history.length})</p>` +
            histTable(
              [
                { label: 'Certificado/Informe', key: 'certificate' },
                { label: 'Tipo', key: 'documentType' },
                { label: 'Desde', key: 'validFrom' },
                { label: 'Hasta', key: 'validUntil' },
                { label: 'Resultado', key: 'result' },
                { label: 'Estado', key: 'estado' },
                { label: 'Observación', key: 'observation' },
              ],
              itv.history
            )
          : ''
      }

      <h2>Fuentes</h2>
      <div>
        <span class="src ${dto.sources.sunarp}">SUNARP: ${esc(dto.sources.sunarp)}</span>
        <span class="src ${dto.sources.soat}">SOAT: ${esc(dto.sources.soat)}</span>
        <span class="src ${dto.sources.mtc}">MTC: ${esc(dto.sources.mtc)}</span>
      </div>
    </div>
    <footer>
      Generado automáticamente · Demo académica. Datos de fuentes públicas (SUNARP / APESEG / MTC).
      El nombre del propietario es dato personal (Ley N° 29733): anonimizar en publicaciones.
    </footer>
  </div>
</body>
</html>`
}

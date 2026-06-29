import Jimp from 'jimp'
import { createWorker } from 'tesseract.js'

const src = process.argv[2] || 'sunarp-resultado.png'

// Preproceso: gris + escalado 2x + umbral para eliminar la marca de agua (gris claro)
const img = await Jimp.read(src)
img.greyscale().scale(2).contrast(0.4)
const pre = img.clone().threshold({ max: 140 })
await pre.writeAsync('sunarp-pre.png')
console.log('[ocr] preprocesada -> sunarp-pre.png')

const worker = await createWorker('spa')
for (const [label, file] of [['RAW', src], ['THRESHOLD', 'sunarp-pre.png']]) {
  const { data } = await worker.recognize(file)
  console.log(`\n===== OCR ${label} (conf ${Math.round(data.confidence)}) =====`)
  console.log(data.text.split('\n').filter(l => l.trim()).join('\n'))
}
await worker.terminate()

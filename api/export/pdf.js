import PDFDocument from 'pdfkit'
import { supabase } from '../_lib/supabase.js'

const CHANGELOG_SEP = '--- Endringslogg ---'

const S = {
  h1Color:    '#1E3A5F',
  h2Color:    '#1E3A5F',
  h3Color:    '#2E5F8A',
  bodyColor:  '#2D2D2D',
  footerColor:'#888888',
  margin:     56,   // ~2 cm
  h1Size:     22,
  h2Size:     17,
  h3Size:     14,
  bodySize:   11,
  footerSize:  9,
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function stripHtml(html) {
  return html
    .replace(/<\/?(?:strong|b|em|i|u|p|span)[^>]*>/gi, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .trim()
}

function preprocessHtml(html) {
  return html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0
    return inner.replace(/<li[^>]*>/gi, () => `<li data-num="${++n}">`)
  })
}

function cleanInner(raw) {
  return raw.replace(/<p>([\s\S]*?)<\/p>/gi, '$1').trim()
}

function isHtml(t) { return /^\s*</.test(t ?? '') }

function parseContent(raw) {
  if (!raw) return { blocks: [], changelogLines: [] }
  const sepIdx = raw.indexOf(CHANGELOG_SEP)
  const bodyText      = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : raw.trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + CHANGELOG_SEP.length).trim() : ''

  const blocks = []
  if (isHtml(bodyText)) {
    const processed = preprocessHtml(bodyText)
    const blockRe = /<(h[1-6]|p|li|blockquote|hr)([^>]*)>([\s\S]*?)<\/\1>|<hr[^>]*\/?>/gi
    let match
    while ((match = blockRe.exec(processed)) !== null) {
      const tag   = (match[1] ?? 'hr').toLowerCase()
      const attrs = match[2] ?? ''
      const inner = cleanInner(match[3] ?? '')
      if (tag === 'hr') { blocks.push({ type: 'hr' }); continue }
      if (/^h[1-6]$/.test(tag)) {
        blocks.push({ type: tag, text: stripHtml(inner) }); continue
      }
      if (tag === 'li') {
        const numMatch = attrs.match(/data-num="(\d+)"/)
        blocks.push({ type: 'li', text: stripHtml(inner), num: numMatch ? parseInt(numMatch[1]) : null })
        continue
      }
      if (inner) blocks.push({ type: 'p', text: stripHtml(inner) })
    }
  } else {
    for (const line of bodyText.split('\n')) {
      if (line.trim()) blocks.push({ type: 'p', text: line.trim() })
      else blocks.push({ type: 'blank' })
    }
  }

  return {
    blocks,
    changelogLines: changelogText.split('\n').map(l => l.trim()).filter(Boolean),
  }
}

function renderBlocks(doc, blocks, pageWidth) {
  const textWidth = pageWidth - S.margin * 2

  for (const block of blocks) {
    if (block.type === 'hr') {
      doc.moveDown(0.3)
      doc.moveTo(S.margin, doc.y).lineTo(pageWidth - S.margin, doc.y)
        .strokeColor('#BBBBBB').lineWidth(0.5).stroke()
      doc.moveDown(0.3)
      continue
    }
    if (block.type === 'blank') { doc.moveDown(0.5); continue }

    if (block.type === 'h1') {
      doc.moveDown(0.8)
      doc.font('Helvetica-Bold').fontSize(S.h1Size).fillColor(S.h1Color)
      doc.text(block.text, S.margin, doc.y, { width: textWidth })
      doc.moveDown(0.3)
      const y = doc.y
      doc.moveTo(S.margin, y).lineTo(pageWidth - S.margin, y)
        .strokeColor(S.h1Color).lineWidth(1).stroke()
      doc.moveDown(0.4)
      continue
    }
    if (block.type === 'h2') {
      doc.moveDown(0.7)
      doc.font('Helvetica-Bold').fontSize(S.h2Size).fillColor(S.h2Color)
      doc.text(block.text, S.margin, doc.y, { width: textWidth })
      doc.moveDown(0.3)
      continue
    }
    if (block.type === 'h3') {
      doc.moveDown(0.5)
      doc.font('Helvetica-Bold').fontSize(S.h3Size).fillColor(S.h3Color)
      doc.text(block.text, S.margin, doc.y, { width: textWidth })
      doc.moveDown(0.2)
      continue
    }
    if (block.type === 'h4' || block.type === 'h5' || block.type === 'h6') {
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(S.bodySize).fillColor(S.h3Color)
      doc.text(block.text, S.margin, doc.y, { width: textWidth })
      doc.moveDown(0.2)
      continue
    }
    if (block.type === 'li') {
      doc.font('Helvetica').fontSize(S.bodySize).fillColor(S.bodyColor)
      const prefix = block.num != null ? `${block.num}.  ` : '•  '
      doc.text(prefix + block.text, S.margin + 12, doc.y, { width: textWidth - 12, lineGap: 2 })
      doc.moveDown(0.15)
      continue
    }
    // p / blockquote
    doc.font('Helvetica').fontSize(S.bodySize).fillColor(S.bodyColor)
    doc.text(block.text, S.margin, doc.y, { width: textWidth, lineGap: 2 })
    doc.moveDown(0.3)
  }
}

function renderChangelogTable(doc, changelogLines, pageWidth) {
  const col1W = 100
  const col2W = pageWidth - S.margin * 2 - col1W
  const rowH  = 18
  const headerH = 20

  doc.moveDown(0.5)

  // Header
  const hx = S.margin, hy = doc.y
  doc.rect(hx, hy, col1W + col2W, headerH).fill('#D6E8F7')
  doc.font('Helvetica-Bold').fontSize(S.bodySize).fillColor(S.bodyColor)
  doc.text('Dato', hx + 4, hy + 4, { width: col1W - 8 })
  doc.text('Endring', hx + col1W + 4, hy + 4, { width: col2W - 8 })

  let y = hy + headerH
  doc.rect(hx, hy, col1W + col2W, headerH).strokeColor('#BBBBBB').lineWidth(0.5).stroke()

  for (const line of changelogLines) {
    const colonIdx = line.indexOf(':')
    const dato    = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
    const endring = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line

    doc.font('Helvetica').fontSize(S.bodySize).fillColor(S.bodyColor)
    doc.text(dato,    hx + 4,         y + 3, { width: col1W - 8 })
    doc.text(endring, hx + col1W + 4, y + 3, { width: col2W - 8 })
    doc.rect(hx, y, col1W + col2W, rowH).strokeColor('#BBBBBB').lineWidth(0.5).stroke()
    y += rowH
  }

  doc.y = y
}

export default async function handler(req, res) {
  const { masterDocId, versionId } = req.query
  if (!masterDocId) return res.status(400).json({ error: 'masterDocId kreves' })

  const { data: doc } = await supabase
    .from('master_documents').select('*, folders(name)').eq('id', masterDocId).single()
  if (!doc) return res.status(404).json({ error: 'Dokument ikke funnet' })

  let content = doc.content
  let version = `${String(doc.version_major).padStart(2,'0')}.${String(doc.version_minor).padStart(2,'0')}`
  if (versionId) {
    const { data: ver } = await supabase
      .from('master_document_versions').select('content, version_label, version_major, version_minor').eq('id', versionId).single()
    if (ver) {
      content = ver.content
      version = `${String(ver.version_major).padStart(2,'0')}.${String(ver.version_minor).padStart(2,'0')}`
    }
  }

  const { blocks, changelogLines } = parseContent(content)

  const pdfDoc = new PDFDocument({ size: 'A4', margin: S.margin, bufferPages: true })
  const pageWidth = pdfDoc.page.width

  const chunks = []
  pdfDoc.on('data', chunk => chunks.push(chunk))

  // Tittel
  pdfDoc.font('Helvetica-Bold').fontSize(S.h1Size).fillColor(S.h1Color)
  pdfDoc.text(doc.name, S.margin, S.margin, { width: pageWidth - S.margin * 2 })
  pdfDoc.moveDown(0.2)
  const lineY = pdfDoc.y
  pdfDoc.moveTo(S.margin, lineY).lineTo(pageWidth - S.margin, lineY)
    .strokeColor(S.h1Color).lineWidth(1).stroke()
  pdfDoc.moveDown(0.4)

  // Versjon og dato
  pdfDoc.font('Helvetica-Oblique').fontSize(S.footerSize).fillColor(S.footerColor)
  pdfDoc.text(`Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, S.margin, pdfDoc.y)
  pdfDoc.moveDown(0.8)

  // Innhold
  renderBlocks(pdfDoc, blocks, pageWidth)

  // Endringslogg
  if (changelogLines.length > 0) {
    pdfDoc.moveDown(0.5)
    pdfDoc.font('Helvetica-Bold').fontSize(S.h2Size).fillColor(S.h2Color)
    pdfDoc.text('Endringslogg', S.margin, pdfDoc.y)
    pdfDoc.moveDown(0.4)
    renderChangelogTable(pdfDoc, changelogLines, pageWidth)
  }

  // Bunntekst med sidetall
  const totalPages = pdfDoc.bufferedPageRange().count
  for (let i = 0; i < totalPages; i++) {
    pdfDoc.switchToPage(i)
    pdfDoc.font('Helvetica').fontSize(S.footerSize).fillColor(S.footerColor)
    pdfDoc.text(
      `Side ${i + 1} av ${totalPages}`,
      S.margin,
      pdfDoc.page.height - S.margin,
      { width: pageWidth - S.margin * 2, align: 'right' }
    )
  }

  const endPromise = new Promise(resolve => pdfDoc.on('end', resolve))
  pdfDoc.end()
  await endPromise

  const buffer = Buffer.concat(chunks)
  const filename = `${doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g,'')}_v${version}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.send(buffer)
}

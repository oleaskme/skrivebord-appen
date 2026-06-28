import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, Footer, PageNumber, ShadingType, convertInchesToTwip,
  LineRuleType,
} from 'docx'
import PDFDocument from 'pdfkit'
import { supabase } from '../_lib/supabase.js'

const CHANGELOG_SEP = '--- Endringslogg ---'

// ── Stilguide (kravspesifikasjon_v03) ──────────────────────────────────────
const S = {
  // Farger (uten #)
  h1Color:    '1E3A5F',
  h2Color:    '1E3A5F',
  h3Color:    '2E5F8A',
  bodyColor:  '2D2D2D',
  footerColor:'888888',
  tableHeader:'D6E8F7',
  tableBorder:'BBBBBB',
  // Størrelser i half-points (pt × 2)
  h1Size:     44,  // 22 pt
  h2Size:     34,  // 17 pt
  h3Size:     28,  // 14 pt
  bodySize:   22,  // 11 pt
  footerSize: 18,  //  9 pt
  // Spacing i twips (pt × 20)
  h1Before: 560, h1After: 280,
  h2Before: 480, h2After: 180,
  h3Before: 320, h3After: 120,
  bodyBefore: 0, bodyAfter: 0,
  bodyLine: 276,  // 1,15 × 240
}

const MARGIN = convertInchesToTwip(1.1)  // ~2,8 cm

// ── PDF-stilkonstanter ──────────────────────────────────────────────────────
const P = {
  h1Color:    '#1E3A5F',
  h2Color:    '#1E3A5F',
  h3Color:    '#2E5F8A',
  bodyColor:  '#2D2D2D',
  footerColor:'#888888',
  margin:     56,
  h1Size:     22,
  h2Size:     17,
  h3Size:     14,
  bodySize:   11,
  footerSize:  9,
}

// ── DOCX-hjelpere ───────────────────────────────────────────────────────────

const border = (color = S.tableBorder) => ({
  style: BorderStyle.SINGLE, size: 1, color,
})

function styledRuns(html, size, color, forceBold = false) {
  const runs = []
  let bold = false, italic = false, underline = false
  const parts = html.split(/(<\/?(?:strong|b|em|i|u)[^>]*>)/gi)
  for (const part of parts) {
    const tag = part.toLowerCase()
    if (/^<strong|^<b(?:\s|>)/.test(tag))  { bold = true; continue }
    if (/^<\/strong|^<\/b>/.test(tag))      { bold = false; continue }
    if (/^<em|^<i(?:\s|>)/.test(tag))       { italic = true; continue }
    if (/^<\/em|^<\/i>/.test(tag))          { italic = false; continue }
    if (/^<u(?:\s|>)/.test(tag))            { underline = true; continue }
    if (/^<\/u>/.test(tag))                 { underline = false; continue }
    if (part.startsWith('<'))               continue
    const text = part.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    if (text) runs.push(new TextRun({ text, font: 'Arial', size, color, bold: forceBold || bold, italics: italic, underline: underline ? {} : undefined }))
  }
  return runs.length ? runs : [new TextRun({ text: '', font: 'Arial', size, color })]
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

function htmlToDocxParagraphs(html) {
  const out = []
  const processed = preprocessHtml(html)
  const blockRe = /<(h[1-6]|p|li|blockquote|hr)([^>]*)>([\s\S]*?)<\/\1>|<hr[^>]*\/?>/gi
  let match
  while ((match = blockRe.exec(processed)) !== null) {
    const tag   = (match[1] ?? 'hr').toLowerCase()
    const attrs = match[2] ?? ''
    const inner = cleanInner(match[3] ?? '')

    if (tag === 'hr') {
      out.push(new Paragraph({ border: { bottom: border() } })); continue
    }
    if (tag === 'h1') {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: S.h1Before, after: S.h1After },
        children: styledRuns(inner, S.h1Size, S.h1Color, true),
      })); continue
    }
    if (tag === 'h2') {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: S.h2Before, after: S.h2After },
        children: styledRuns(inner, S.h2Size, S.h2Color, true),
      })); continue
    }
    if (tag === 'h3') {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: S.h3Before, after: S.h3After },
        children: styledRuns(inner, S.h3Size, S.h3Color, true),
      })); continue
    }
    if (tag === 'li') {
      const numMatch = attrs.match(/data-num="(\d+)"/)
      if (numMatch) {
        out.push(new Paragraph({
          spacing: { before: S.bodyBefore, after: S.bodyAfter, line: S.bodyLine, lineRule: LineRuleType.AUTO },
          indent: { left: 360 },
          children: [
            new TextRun({ text: `${numMatch[1]}.\t`, font: 'Arial', size: S.bodySize, color: S.bodyColor }),
            ...styledRuns(inner, S.bodySize, S.bodyColor),
          ],
        }))
      } else {
        out.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { before: S.bodyBefore, after: S.bodyAfter, line: S.bodyLine, lineRule: LineRuleType.AUTO },
          children: styledRuns(inner, S.bodySize, S.bodyColor),
        }))
      }
      continue
    }
    if (inner) {
      out.push(new Paragraph({
        spacing: { before: S.bodyBefore, after: S.bodyAfter, line: S.bodyLine, lineRule: LineRuleType.AUTO },
        children: styledRuns(inner, S.bodySize, S.bodyColor),
      }))
    }
  }

  if (out.length === 0) {
    for (const line of html.replace(/<[^>]+>/g, '').split('\n')) {
      out.push(line.trim()
        ? new Paragraph({ spacing: { before: S.bodyBefore, after: S.bodyAfter, line: S.bodyLine, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: line.trim(), font: 'Arial', size: S.bodySize, color: S.bodyColor })] })
        : new Paragraph({ text: '' })
      )
    }
  }
  return out
}

function isHtml(t) { return /^\s*</.test(t ?? '') }

function parseContentDocx(raw) {
  if (!raw) return { bodyParagraphs: [], changelogLines: [] }
  const sepIdx = raw.indexOf(CHANGELOG_SEP)
  const bodyText      = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : raw.trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + CHANGELOG_SEP.length).trim() : ''

  const bodyParagraphs = isHtml(bodyText)
    ? htmlToDocxParagraphs(bodyText)
    : bodyText.split('\n').map(l => l.trim()
        ? new Paragraph({ spacing: { before: S.bodyBefore, after: S.bodyAfter, line: S.bodyLine, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: l.trim(), font: 'Arial', size: S.bodySize, color: S.bodyColor })] })
        : new Paragraph({ text: '' })
      )

  return {
    bodyParagraphs,
    changelogLines: changelogText.split('\n').map(l => l.trim()).filter(Boolean),
  }
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'Side ', font: 'Arial', size: S.footerSize, color: S.footerColor }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: S.footerSize, color: S.footerColor }),
          new TextRun({ text: ' av ', font: 'Arial', size: S.footerSize, color: S.footerColor }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: S.footerSize, color: S.footerColor }),
        ],
      }),
    ],
  })
}

function makeChangelogTable(changelogLines) {
  const cellBorders = {
    top: border(), bottom: border(), left: border(), right: border(),
    insideHorizontal: border(), insideVertical: border(),
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            shading: { fill: S.tableHeader, type: ShadingType.CLEAR },
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Dato', font: 'Arial', size: S.bodySize, color: S.bodyColor, bold: true })] })],
          }),
          new TableCell({
            shading: { fill: S.tableHeader, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Endring', font: 'Arial', size: S.bodySize, color: S.bodyColor, bold: true })] })],
          }),
        ],
      }),
      ...changelogLines.map(line => {
        const colonIdx = line.indexOf(':')
        const dato    = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
        const endring = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line
        return new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: dato, font: 'Arial', size: S.bodySize, color: S.bodyColor })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: endring, font: 'Arial', size: S.bodySize, color: S.bodyColor })] })] }),
          ],
        })
      }),
    ],
  })
}

// ── PDF-hjelpere ────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<\/?(?:strong|b|em|i|u|p|span)[^>]*>/gi, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .trim()
}

function parseInlineRuns(html) {
  const tokens = html.split(/(<\/?(?:strong|b|em|i)[^>]*>)/gi)
  let bold = false, italic = false
  const raw = []
  for (const token of tokens) {
    if (/^<(strong|b)(\s|>)/i.test(token)) { bold = true; continue }
    if (/^<\/(strong|b)>/i.test(token))     { bold = false; continue }
    if (/^<(em|i)(\s|>)/i.test(token))      { italic = true; continue }
    if (/^<\/(em|i)>/i.test(token))         { italic = false; continue }
    const text = token.replace(/<[^>]+>/g, '')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    if (text) raw.push({ text: sanitizeChars(text), bold, italic })
  }
  // Slå sammen påfølgende runs med samme stil
  const merged = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last && last.bold === r.bold && last.italic === r.italic) last.text += r.text
    else merged.push({ ...r })
  }
  return merged.filter(r => r.text)
}

function pdfFont(bold, italic) {
  if (bold && italic) return 'Helvetica-BoldOblique'
  if (bold) return 'Helvetica-Bold'
  if (italic) return 'Helvetica-Oblique'
  return 'Helvetica'
}

function renderInlineRuns(doc, runs, x, y, width, lineGap = 2) {
  if (!runs.length) return
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    const isLast = i === runs.length - 1
    doc.font(pdfFont(r.bold, r.italic))
    if (i === 0) doc.text(r.text, x, y, { continued: !isLast, width, lineGap })
    else         doc.text(r.text, { continued: !isLast, lineGap })
  }
}

function sanitizeChars(text) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/→/g, '->').replace(/←/g, '<-').replace(/↑/g, '^').replace(/↓/g, 'v')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=')
    .replace(/  +/g, ' ')
}

function sanitizePdfText(text) {
  return sanitizeChars(text).trim()
}

function parseContentPdf(raw) {
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
      if (/^h[1-6]$/.test(tag)) { blocks.push({ type: tag, text: sanitizePdfText(stripHtml(inner)) }); continue }
      if (tag === 'li') {
        const numMatch = attrs.match(/data-num="(\d+)"/)
        blocks.push({ type: 'li', runs: parseInlineRuns(inner), num: numMatch ? parseInt(numMatch[1]) : null })
        continue
      }
      if (inner) blocks.push({ type: 'p', runs: parseInlineRuns(inner) })
    }
  } else {
    for (const line of bodyText.split('\n')) {
      if (line.trim()) blocks.push({ type: 'p', runs: [{ text: sanitizePdfText(line.trim()), bold: false, italic: false }] })
      else blocks.push({ type: 'blank' })
    }
  }

  return {
    blocks,
    changelogLines: changelogText.split('\n').map(l => sanitizePdfText(l.trim())).filter(Boolean),
  }
}

function renderPdfBlocks(doc, blocks, pageWidth) {
  const textWidth = pageWidth - P.margin * 2
  for (const block of blocks) {
    if (block.type === 'hr') {
      doc.moveDown(0.3)
      doc.moveTo(P.margin, doc.y).lineTo(pageWidth - P.margin, doc.y).strokeColor('#BBBBBB').lineWidth(0.5).stroke()
      doc.moveDown(0.3); continue
    }
    if (block.type === 'blank') { doc.moveDown(0.5); continue }
    if (block.type === 'h1') {
      doc.moveDown(0.8)
      doc.font('Helvetica-Bold').fontSize(P.h1Size).fillColor(P.h1Color)
      doc.text(block.text, P.margin, doc.y, { width: textWidth })
      doc.moveDown(0.3)
      const y = doc.y
      doc.moveTo(P.margin, y).lineTo(pageWidth - P.margin, y).strokeColor(P.h1Color).lineWidth(1).stroke()
      doc.moveDown(0.4); continue
    }
    if (block.type === 'h2') {
      doc.moveDown(0.7)
      doc.font('Helvetica-Bold').fontSize(P.h2Size).fillColor(P.h2Color)
      doc.text(block.text, P.margin, doc.y, { width: textWidth })
      doc.moveDown(0.3); continue
    }
    if (block.type === 'h3') {
      doc.moveDown(0.5)
      doc.font('Helvetica-Bold').fontSize(P.h3Size).fillColor(P.h3Color)
      doc.text(block.text, P.margin, doc.y, { width: textWidth })
      doc.moveDown(0.2); continue
    }
    if (block.type === 'h4' || block.type === 'h5' || block.type === 'h6') {
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(P.bodySize).fillColor(P.h3Color)
      doc.text(block.text, P.margin, doc.y, { width: textWidth })
      doc.moveDown(0.2); continue
    }
    if (block.type === 'li') {
      doc.fontSize(P.bodySize).fillColor(P.bodyColor)
      const prefix = block.num != null ? `${block.num}.  ` : '•  '
      const liRuns = [{ text: prefix, bold: false, italic: false }, ...(block.runs ?? [])]
      const merged = []
      for (const r of liRuns) {
        const last = merged[merged.length - 1]
        if (last && last.bold === r.bold && last.italic === r.italic) last.text += r.text
        else merged.push({ ...r })
      }
      renderInlineRuns(doc, merged.filter(r => r.text), P.margin + 12, doc.y, textWidth - 12)
      doc.moveDown(0.15); continue
    }
    doc.fontSize(P.bodySize).fillColor(P.bodyColor)
    renderInlineRuns(doc, block.runs ?? [], P.margin, doc.y, textWidth)
    doc.moveDown(0.3)
  }
}

function renderPdfChangelogTable(doc, changelogLines, pageWidth) {
  const col1W = 100, col2W = pageWidth - P.margin * 2 - col1W
  const rowH = 18, headerH = 20
  doc.moveDown(0.5)
  const hx = P.margin, hy = doc.y
  doc.rect(hx, hy, col1W + col2W, headerH).fill('#D6E8F7')
  doc.font('Helvetica-Bold').fontSize(P.bodySize).fillColor(P.bodyColor)
  doc.text('Dato',    hx + 4,         hy + 4, { width: col1W - 8 })
  doc.text('Endring', hx + col1W + 4, hy + 4, { width: col2W - 8 })
  let y = hy + headerH
  doc.rect(hx, hy, col1W + col2W, headerH).strokeColor('#BBBBBB').lineWidth(0.5).stroke()
  for (const line of changelogLines) {
    const colonIdx = line.indexOf(':')
    const dato    = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
    const endring = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line
    doc.font('Helvetica').fontSize(P.bodySize).fillColor(P.bodyColor)
    doc.text(dato,    hx + 4,         y + 3, { width: col1W - 8 })
    doc.text(endring, hx + col1W + 4, y + 3, { width: col2W - 8 })
    doc.rect(hx, y, col1W + col2W, rowH).strokeColor('#BBBBBB').lineWidth(0.5).stroke()
    y += rowH
  }
  doc.y = y
}

async function generatePdf(doc, content, version) {
  const { blocks, changelogLines } = parseContentPdf(content)
  const pdfDoc = new PDFDocument({ size: 'A4', margin: P.margin, bufferPages: true })
  const pageWidth = pdfDoc.page.width
  const chunks = []
  pdfDoc.on('data', chunk => chunks.push(chunk))

  pdfDoc.font('Helvetica-Bold').fontSize(P.h1Size).fillColor(P.h1Color)
  pdfDoc.text(sanitizePdfText(doc.name), P.margin, P.margin, { width: pageWidth - P.margin * 2 })
  pdfDoc.moveDown(0.2)
  const lineY = pdfDoc.y
  pdfDoc.moveTo(P.margin, lineY).lineTo(pageWidth - P.margin, lineY).strokeColor(P.h1Color).lineWidth(1).stroke()
  pdfDoc.moveDown(0.4)
  pdfDoc.font('Helvetica-Oblique').fontSize(P.footerSize).fillColor(P.footerColor)
  pdfDoc.text(`Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, P.margin, pdfDoc.y)
  pdfDoc.moveDown(0.8)

  renderPdfBlocks(pdfDoc, blocks, pageWidth)

  if (changelogLines.length > 0) {
    pdfDoc.moveDown(0.5)
    pdfDoc.font('Helvetica-Bold').fontSize(P.h2Size).fillColor(P.h2Color)
    pdfDoc.text('Endringslogg', P.margin, pdfDoc.y)
    pdfDoc.moveDown(0.4)
    renderPdfChangelogTable(pdfDoc, changelogLines, pageWidth)
  }

  const totalPages = pdfDoc.bufferedPageRange().count
  for (let i = 0; i < totalPages; i++) {
    pdfDoc.switchToPage(i)
    pdfDoc.font('Helvetica').fontSize(P.footerSize).fillColor(P.footerColor)
    pdfDoc.text(`Side ${i + 1} av ${totalPages}`, P.margin, pdfDoc.page.height - P.margin, { width: pageWidth - P.margin * 2, align: 'right' })
  }

  const endPromise = new Promise(resolve => pdfDoc.on('end', resolve))
  pdfDoc.end()
  await endPromise
  return Buffer.concat(chunks)
}

// ── Felles handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { masterDocId, versionId, format } = req.query
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

  const safeName = doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g,'')

  if (format === 'pdf') {
    const buffer = await generatePdf(doc, content, version)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}_v${version}.pdf"`)
    return res.send(buffer)
  }

  // Standard: Word (DOCX)
  const { bodyParagraphs, changelogLines } = parseContentDocx(content)

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1E3A5F' } },
      children: [new TextRun({ text: doc.name, font: 'Arial', size: S.h1Size, color: S.h1Color, bold: true })],
    }),
    new Paragraph({
      spacing: { before: 160, after: 480 },
      children: [new TextRun({ text: `Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, font: 'Arial', size: 20, color: S.footerColor, italics: true })],
    }),
    ...bodyParagraphs,
  ]

  if (changelogLines.length > 0) {
    children.push(
      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: S.h2Before, after: S.h2After },
        children: [new TextRun({ text: 'Endringslogg', font: 'Arial', size: S.h2Size, color: S.h2Color, bold: true })],
      }),
      makeChangelogTable(changelogLines)
    )
  }

  const wordDoc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: S.bodySize, color: S.bodyColor } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'Arial', size: S.h1Size, color: S.h1Color, bold: true },
          paragraph: { spacing: { before: S.h1Before, after: S.h1After } },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'Arial', size: S.h2Size, color: S.h2Color, bold: true },
          paragraph: { spacing: { before: S.h2Before, after: S.h2After } },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: 'Arial', size: S.h3Size, color: S.h3Color, bold: true },
          paragraph: { spacing: { before: S.h3Before, after: S.h3After } },
        },
      ],
    },
    sections: [{
      properties: {
        page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 708, footer: 708 } },
      },
      footers: { default: makeFooter() },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(wordDoc)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}_v${version}.docx"`)
  res.send(buffer)
}

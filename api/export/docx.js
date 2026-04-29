import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, Footer, PageNumber, ShadingType, convertInchesToTwip,
} from 'docx'
import { supabase } from '../_lib/supabase.js'

const CHANGELOG_SEP = '--- Endringslogg ---'

// ── Stilguide (kravspesifikasjon_v03) ──────────────────────────────────────
const S = {
  // Farger (uten #)
  h1Color:    '2E4057',
  h2Color:    '2E4057',
  h3Color:    '4A6080',
  bodyColor:  '444441',
  footerColor:'888888',
  tableHeader:'E6F1FB',
  tableBorder:'CCCCCC',
  // Størrelser i half-points (pt × 2)
  h1Size:     36,  // 18 pt
  h2Size:     28,  // 14 pt
  h3Size:     24,  // 12 pt
  bodySize:   24,  // 12 pt
  footerSize: 18,  //  9 pt
  // Spacing i twips (pt × 20)
  h1Before: 400, h1After: 200,
  h2Before: 300, h2After: 150,
  h3Before: 200, h3After: 100,
  bodyAfter: 200,
}

const MARGIN = convertInchesToTwip(1)  // 2,54 cm ≈ 1 inch = 1440 twips

const border = (color = S.tableBorder) => ({
  style: BorderStyle.SINGLE, size: 1, color,
})

function styledRuns(html, size, color) {
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
    if (text) runs.push(new TextRun({ text, font: 'Arial', size, color, bold, italics: italic, underline: underline ? {} : undefined }))
  }
  return runs.length ? runs : [new TextRun({ text: '', font: 'Arial', size, color })]
}

function preprocessHtml(html) {
  // Mark <li> inside <ol> with a sequential counter so we can render them as numbered
  return html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0
    return inner.replace(/<li[^>]*>/gi, () => `<li data-num="${++n}">`)
  })
}

function cleanInner(raw) {
  // Strip wrapping <p> that TipTap adds inside <li>, then trim whitespace
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
        children: styledRuns(inner, S.h1Size, S.h1Color).map(r => new TextRun({ ...r, bold: true })),
      })); continue
    }
    if (tag === 'h2') {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: S.h2Before, after: S.h2After },
        children: styledRuns(inner, S.h2Size, S.h2Color).map(r => new TextRun({ ...r, bold: true })),
      })); continue
    }
    if (tag === 'h3') {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: S.h3Before, after: S.h3After },
        children: styledRuns(inner, S.h3Size, S.h3Color).map(r => new TextRun({ ...r, bold: true })),
      })); continue
    }
    if (tag === 'li') {
      const numMatch = attrs.match(/data-num="(\d+)"/)
      if (numMatch) {
        // Ordered list item — prepend number manually
        out.push(new Paragraph({
          spacing: { after: S.bodyAfter },
          indent: { left: 360 },
          children: [
            new TextRun({ text: `${numMatch[1]}.\t`, font: 'Arial', size: S.bodySize, color: S.bodyColor }),
            ...styledRuns(inner, S.bodySize, S.bodyColor),
          ],
        }))
      } else {
        out.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: S.bodyAfter },
          children: styledRuns(inner, S.bodySize, S.bodyColor),
        }))
      }
      continue
    }
    // p / blockquote
    if (inner) {
      out.push(new Paragraph({
        spacing: { after: S.bodyAfter },
        children: styledRuns(inner, S.bodySize, S.bodyColor),
      }))
    }
  }

  if (out.length === 0) {
    for (const line of html.replace(/<[^>]+>/g, '').split('\n')) {
      out.push(line.trim()
        ? new Paragraph({ spacing: { after: S.bodyAfter }, children: [new TextRun({ text: line.trim(), font: 'Arial', size: S.bodySize, color: S.bodyColor })] })
        : new Paragraph({ text: '' })
      )
    }
  }
  return out
}

function isHtml(t) { return /^\s*</.test(t ?? '') }

function parseContent(raw) {
  if (!raw) return { bodyParagraphs: [], changelogLines: [] }
  const sepIdx = raw.indexOf(CHANGELOG_SEP)
  const bodyText      = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : raw.trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + CHANGELOG_SEP.length).trim() : ''

  const bodyParagraphs = isHtml(bodyText)
    ? htmlToDocxParagraphs(bodyText)
    : bodyText.split('\n').map(l => l.trim()
        ? new Paragraph({ spacing: { after: S.bodyAfter }, children: [new TextRun({ text: l.trim(), font: 'Arial', size: S.bodySize, color: S.bodyColor })] })
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

export default async function handler(req, res) {
  const { masterDocId } = req.query
  if (!masterDocId) return res.status(400).json({ error: 'masterDocId kreves' })

  const { data: doc } = await supabase
    .from('master_documents').select('*, folders(name)').eq('id', masterDocId).single()
  if (!doc) return res.status(404).json({ error: 'Dokument ikke funnet' })

  const { bodyParagraphs, changelogLines } = parseContent(doc.content)
  const version = `${String(doc.version_major).padStart(2,'0')}.${String(doc.version_minor).padStart(2,'0')}`

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: S.h1After },
      children: [new TextRun({ text: doc.name, font: 'Arial', size: S.h1Size, color: S.h1Color, bold: true })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: `Mappe: ${doc.folders?.name ?? ''}   |   Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, font: 'Arial', size: 18, color: S.footerColor })],
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
  const filename = `${doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g,'')}_v${version}.docx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.send(buffer)
}

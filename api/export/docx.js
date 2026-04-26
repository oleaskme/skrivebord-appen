import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
import { supabase } from '../_lib/supabase.js'

const CHANGELOG_SEP = '--- Endringslogg ---'

// Parse inline HTML tags into TextRun objects
function parseInlineRuns(html, baseSize = 22) {
  const runs = []
  let bold = false, italic = false, underline = false
  const parts = html.split(/(<\/?(?:strong|b|em|i|u|s)[^>]*>)/gi)
  for (const part of parts) {
    const tag = part.toLowerCase()
    if (/^<strong|^<b(?:\s|>)/.test(tag))   { bold = true; continue }
    if (/^<\/strong|^<\/b>/.test(tag))       { bold = false; continue }
    if (/^<em|^<i(?:\s|>)/.test(tag))        { italic = true; continue }
    if (/^<\/em|^<\/i>/.test(tag))           { italic = false; continue }
    if (/^<u(?:\s|>)/.test(tag))             { underline = true; continue }
    if (/^<\/u>/.test(tag))                  { underline = false; continue }
    if (part.startsWith('<'))                continue // skip other tags
    const text = part.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    if (text) runs.push(new TextRun({ text, bold, italics: italic, underline: underline ? {} : undefined, size: baseSize }))
  }
  return runs.length ? runs : [new TextRun({ text: '', size: baseSize })]
}

// Convert HTML block-level elements to docx Paragraph objects
function htmlToDocxParagraphs(html) {
  const paragraphs = []
  // Match block-level elements (including nested li > p from TipTap)
  const blockRe = /<(h[1-6]|p|li|blockquote|hr)([^>]*)>([\s\S]*?)<\/\1>|<hr[^>]*\/>/gi
  let match

  while ((match = blockRe.exec(html)) !== null) {
    const tag     = (match[1] ?? 'hr').toLowerCase()
    const inner   = (match[3] ?? '').replace(/<p>([\s\S]*?)<\/p>/gi, '$1') // unwrap nested p in li

    if (tag === 'hr') {
      paragraphs.push(new Paragraph({ text: '', border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } } }))
      continue
    }

    const runs = parseInlineRuns(inner)

    if (tag === 'h1') {
      paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_1 }))
    } else if (tag === 'h2') {
      paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_2 }))
    } else if (tag === 'h3') {
      paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_3 }))
    } else if (tag === 'li') {
      paragraphs.push(new Paragraph({ children: runs, bullet: { level: 0 } }))
    } else if (tag === 'blockquote') {
      paragraphs.push(new Paragraph({ children: runs.map(r => new TextRun({ ...r, italics: true, color: '666666' })), indent: { left: 720 } }))
    } else {
      paragraphs.push(new Paragraph({ children: runs }))
    }
  }

  // Fallback: if no block tags found, treat as plain text
  if (paragraphs.length === 0) {
    for (const line of html.replace(/<[^>]+>/g, '').split('\n')) {
      paragraphs.push(line.trim() === ''
        ? new Paragraph({ text: '' })
        : new Paragraph({ children: [new TextRun({ text: line.trim(), size: 22 })] })
      )
    }
  }

  return paragraphs
}

function isHtml(text) {
  return /^\s*</.test(text ?? '')
}

function parseContent(raw) {
  if (!raw) return { bodyParagraphs: [], changelogLines: [] }

  const sepIdx = raw.indexOf(CHANGELOG_SEP)
  const bodyText      = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : raw.trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + CHANGELOG_SEP.length).trim() : ''

  const bodyParagraphs = isHtml(bodyText)
    ? htmlToDocxParagraphs(bodyText)
    : bodyText.split('\n').map(line =>
        line.trim() === ''
          ? new Paragraph({ text: '' })
          : new Paragraph({ children: [new TextRun({ text: line.trim(), size: 22 })] })
      )

  const changelogLines = changelogText.split('\n').map(l => l.trim()).filter(Boolean)
  return { bodyParagraphs, changelogLines }
}

export default async function handler(req, res) {
  const { masterDocId } = req.query
  if (!masterDocId) return res.status(400).json({ error: 'masterDocId kreves' })

  const { data: doc } = await supabase
    .from('master_documents')
    .select('*, folders(name)')
    .eq('id', masterDocId)
    .single()

  if (!doc) return res.status(404).json({ error: 'Dokument ikke funnet' })

  const { bodyParagraphs, changelogLines } = parseContent(doc.content)
  const version = `${String(doc.version_major).padStart(2, '0')}.${String(doc.version_minor).padStart(2, '0')}`

  const children = [
    new Paragraph({ text: doc.name, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `Mappe: ${doc.folders?.name ?? ''}   |   Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, color: '888888', size: 18 })],
      spacing: { after: 400 },
    }),
    ...bodyParagraphs,
  ]

  if (changelogLines.length > 0) {
    children.push(
      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({ text: 'Endringslogg', heading: HeadingLevel.HEADING_2 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Dato', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Endring', bold: true })] })] }),
            ],
          }),
          ...changelogLines.map(line => {
            const colonIdx = line.indexOf(':')
            const dato    = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
            const endring = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line
            return new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: dato, size: 20 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: endring, size: 20 })] })] }),
              ],
            })
          }),
        ],
      })
    )
  }

  const wordDoc = new Document({
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
  })

  const buffer = await Packer.toBuffer(wordDoc)
  const filename = `${doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '')}_v${version}.docx`

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.send(buffer)
}

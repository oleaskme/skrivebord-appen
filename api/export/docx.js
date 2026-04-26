import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
import { supabase } from '../_lib/supabase.js'

function parseContent(raw) {
  if (!raw) return { body: [], changelog: [] }

  const SEPARATOR = '--- Endringslogg ---'
  const sepIdx = raw.indexOf(SEPARATOR)

  const bodyText    = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : raw.trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + SEPARATOR.length).trim() : ''

  const bodyParagraphs = bodyText.split('\n').map(line => line.trim())
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
    new Paragraph({
      text: doc.name,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Mappe: ${doc.folders?.name ?? ''}   |   Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, color: '888888', size: 18 }),
      ],
      spacing: { after: 400 },
    }),
    ...bodyParagraphs.map(line =>
      line === ''
        ? new Paragraph({ text: '' })
        : new Paragraph({ children: [new TextRun({ text: line, size: 22 })] })
    ),
  ]

  // Endringslogg-appendiks
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
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
  })

  const buffer = await Packer.toBuffer(wordDoc)
  const filename = `${doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '')}_v${version}.docx`

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.send(buffer)
}

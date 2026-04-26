import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { supabase } from '../_lib/supabase.js'
import { getClientForUser } from '../_lib/googleClient.js'

const CHANGELOG_SEP = '--- Endringslogg ---'

function parseInlineRuns(html, size = 22) {
  const runs = []
  let bold = false, italic = false
  const parts = html.split(/(<\/?(?:strong|b|em|i|u)[^>]*>)/gi)
  for (const part of parts) {
    const tag = part.toLowerCase()
    if (/^<strong|^<b(?:\s|>)/.test(tag))  { bold = true; continue }
    if (/^<\/strong|^<\/b>/.test(tag))      { bold = false; continue }
    if (/^<em|^<i(?:\s|>)/.test(tag))       { italic = true; continue }
    if (/^<\/em|^<\/i>/.test(tag))          { italic = false; continue }
    if (part.startsWith('<'))               continue
    const text = part.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    if (text) runs.push(new TextRun({ text, bold, italics: italic, size }))
  }
  return runs.length ? runs : [new TextRun({ text: '', size })]
}

function htmlToDocxParagraphs(html) {
  const paragraphs = []
  const blockRe = /<(h[1-6]|p|li|blockquote)([^>]*)>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = blockRe.exec(html)) !== null) {
    const tag   = match[1].toLowerCase()
    const inner = match[3].replace(/<p>([\s\S]*?)<\/p>/gi, '$1')
    const runs  = parseInlineRuns(inner)
    if (tag === 'h1') paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_1 }))
    else if (tag === 'h2') paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_2 }))
    else if (tag === 'h3') paragraphs.push(new Paragraph({ children: runs, heading: HeadingLevel.HEADING_3 }))
    else if (tag === 'li') paragraphs.push(new Paragraph({ children: runs, bullet: { level: 0 } }))
    else paragraphs.push(new Paragraph({ children: runs }))
  }
  if (paragraphs.length === 0) {
    for (const line of html.replace(/<[^>]+>/g, '').split('\n')) {
      paragraphs.push(line.trim() === '' ? new Paragraph({ text: '' }) : new Paragraph({ children: [new TextRun({ text: line.trim(), size: 22 })] }))
    }
  }
  return paragraphs
}

function parseContent(raw) {
  const sepIdx = (raw ?? '').indexOf(CHANGELOG_SEP)
  const bodyText      = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : (raw ?? '').trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + CHANGELOG_SEP.length).trim() : ''
  const isHtml = /^\s*</.test(bodyText)
  return {
    bodyParagraphs: isHtml
      ? htmlToDocxParagraphs(bodyText)
      : bodyText.split('\n').map(l => l.trim() === '' ? new Paragraph({ text: '' }) : new Paragraph({ children: [new TextRun({ text: l.trim(), size: 22 })] })),
    changelogLines: changelogText.split('\n').map(l => l.trim()).filter(Boolean),
  }
}

async function buildDocx(doc, folderName) {
  const { bodyParagraphs, changelogLines } = parseContent(doc.content)
  const version = `${String(doc.version_major).padStart(2, '0')}.${String(doc.version_minor).padStart(2, '0')}`

  const children = [
    new Paragraph({ text: doc.name, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `Mappe: ${folderName}   |   Versjon: v${version}   |   ${new Date().toLocaleDateString('nb-NO')}`, color: '888888', size: 18 })],
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
  return Packer.toBuffer(wordDoc)
}

async function getOrCreateDriveFolder(drive, folderName) {
  // Finn eller opprett rotmappe "Skrivebord-appen"
  const rootSearch = await drive.files.list({
    q: "name='Skrivebord-appen' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
  })
  let rootId
  if (rootSearch.data.files.length > 0) {
    rootId = rootSearch.data.files[0].id
  } else {
    const root = await drive.files.create({
      requestBody: { name: 'Skrivebord-appen', mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    })
    rootId = root.data.id
  }

  // Finn eller opprett undermappe for denne mappen
  const subSearch = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (subSearch.data.files.length > 0) return subSearch.data.files[0].id

  const sub = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
    fields: 'id',
  })
  return sub.data.id
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode ikke støttet' })

  const { userId, masterDocId } = req.body
  if (!userId || !masterDocId) return res.status(400).json({ error: 'userId og masterDocId kreves' })

  try {
    const { data: doc } = await supabase
      .from('master_documents')
      .select('*, folders(name)')
      .eq('id', masterDocId)
      .single()
    if (!doc) return res.status(404).json({ error: 'Dokument ikke funnet' })

    const auth   = await getClientForUser(userId)
    const drive  = google.drive({ version: 'v3', auth })
    const buffer = await buildDocx(doc, doc.folders?.name ?? '')

    const folderId = await getOrCreateDriveFolder(drive, doc.folders?.name ?? 'Ukjent mappe')
    const version  = `${String(doc.version_major).padStart(2, '0')}.${String(doc.version_minor).padStart(2, '0')}`
    const filename = `${doc.name.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '')}_v${version}.docx`

    // Sjekk om filen finnes fra før — oppdater i så fall
    const existing = await drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    })

    let driveFileId
    if (existing.data.files.length > 0) {
      const updated = await drive.files.update({
        fileId: existing.data.files[0].id,
        media: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: Readable.from(buffer) },
      })
      driveFileId = updated.data.id
    } else {
      const created = await drive.files.create({
        requestBody: { name: filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: [folderId] },
        media: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: Readable.from(buffer) },
        fields: 'id,webViewLink',
      })
      driveFileId = created.data.id
    }

    // Lagre Drive fil-ID i Supabase
    await supabase.from('master_documents').update({ drive_file_id: driveFileId }).eq('id', masterDocId)

    res.json({ ok: true, driveFileId, filename })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

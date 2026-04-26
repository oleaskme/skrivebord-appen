import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { supabase } from '../_lib/supabase.js'
import { getClientForUser } from '../_lib/googleClient.js'

function parseContent(raw) {
  const SEPARATOR = '--- Endringslogg ---'
  const sepIdx = raw?.indexOf(SEPARATOR) ?? -1
  const bodyText = sepIdx >= 0 ? raw.slice(0, sepIdx).trim() : (raw ?? '').trim()
  const changelogText = sepIdx >= 0 ? raw.slice(sepIdx + SEPARATOR.length).trim() : ''
  return {
    bodyParagraphs: bodyText.split('\n').map(l => l.trim()),
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
    ...bodyParagraphs.map(line =>
      line === '' ? new Paragraph({ text: '' }) : new Paragraph({ children: [new TextRun({ text: line, size: 22 })] })
    ),
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

import { useState, useRef } from 'react'
import { useUser } from '../../context/UserContext'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { sha256 } from '../../lib/hash'
import GmailPicker from './GmailPicker'
import DrivePicker from './DrivePicker'

const TABS = [
  { id: 'note',    label: 'Notat' },
  { id: 'meeting', label: 'Møtereferat' },
  { id: 'email',   label: 'E-post (Gmail)' },
  { id: 'drive',   label: 'Drive-fil' },
  { id: 'upload',  label: 'Last opp fil' },
]

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.csv', '.html', '.docx']

async function extractFileContent(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }
  if (['.txt', '.md', '.csv', '.html'].includes(ext)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = () => reject(new Error('Kunne ikke lese filen'))
      reader.readAsText(file, 'UTF-8')
    })
  }
  throw new Error(`Filtypen "${ext}" støttes ikke. Støttede typer: ${SUPPORTED_EXTENSIONS.join(', ')}`)
}

async function checkDuplicate(folderId, hash, sourceId) {
  const { data } = await supabase
    .from('input_documents')
    .select('id')
    .eq('folder_id', folderId)
    .or(`content_hash_sha256.eq.${hash},source_id.eq.${sourceId ?? 'NULL'}`)
    .limit(1)
  return (data?.length ?? 0) > 0
}

export default function NewInputModal({ folderId, onClose, onCreated }) {
  const { activeUser } = useUser()
  const [tab, setTab] = useState('note')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [showDrive, setShowDrive] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  async function save(type, docTitle, docContent, sourceId, metadata = {}) {
    setSaving(true)
    setError(null)
    try {
      const hash = await sha256(docContent ?? '')
      const isDuplicate = await checkDuplicate(folderId, hash, sourceId)
      if (isDuplicate) {
        setError('Dette dokumentet er allerede lagt til i mappen.')
        setSaving(false)
        return
      }
      const { data, error: err } = await supabase
        .from('input_documents')
        .insert({
          folder_id: folderId,
          type,
          title: docTitle,
          content: docContent,
          content_hash_sha256: hash,
          source_id: sourceId ?? null,
          metadata,
          status: 'unprocessed',
        })
        .select()
        .single()
      if (err) throw err
      await supabase.from('folders').update({ last_activity_at: new Date().toISOString() }).eq('id', folderId)
      onCreated(data)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleNoteOrMeeting() {
    if (!title.trim() || !content.trim()) return
    await save(tab, title.trim(), content.trim(), null)
  }

  async function handleEmailSelected(email) {
    setShowGmail(false)
    const body = `Fra: ${email.from}\nDato: ${email.date}\nEmne: ${email.subject}\n\n${email.body}`
    await save('email', email.subject, body, email.messageId, {
      from: email.from,
      date: email.date,
      subject: email.subject,
    })
  }

  async function handleFileUpload(file) {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      const content = await extractFileContent(file)
      await save('upload', file.name, content, null, { fileName: file.name, fileSize: file.size })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDriveSelected(file) {
    setShowDrive(false)
    setSaving(true)
    setError(null)
    try {
      const result = await api.drive.read(activeUser.id, file.id)
      const content = result.content ?? ''
      await save('drive_file', file.name, content, file.id, { mimeType: file.mimeType })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (showGmail) return <GmailPicker userId={activeUser.id} onSelect={handleEmailSelected} onClose={() => setShowGmail(false)} />
  if (showDrive) return <DrivePicker userId={activeUser.id} onSelect={handleDriveSelected} onClose={() => setShowDrive(false)} />

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Legg til INPUT-dokument</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(null) }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t.id ? 'text-primary-600 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {(tab === 'note' || tab === 'meeting') && (
            <div className="space-y-4">
              <input
                autoFocus
                type="text"
                placeholder={tab === 'meeting' ? 'Tittel på møte...' : 'Tittel på notat...'}
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <textarea
                placeholder={tab === 'meeting' ? 'Skriv møtereferat her...' : 'Skriv notat her...'}
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={10}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-sm"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                onClick={handleNoteOrMeeting}
                disabled={saving || !title.trim() || !content.trim()}
                className="w-full bg-primary-500 text-white rounded-lg py-2.5 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Lagrer...' : 'Lagre'}
              </button>
            </div>
          )}

          {tab === 'email' && (
            <div className="text-center py-6 space-y-4">
              <p className="text-gray-500 text-sm">Velg en e-post fra Gmail-innboksen din.</p>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {saving && <p className="text-gray-400 text-sm">Importerer...</p>}
              <button
                onClick={() => setShowGmail(true)}
                disabled={saving}
                className="bg-primary-500 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                Åpne Gmail
              </button>
            </div>
          )}

          {tab === 'drive' && (
            <div className="text-center py-6 space-y-4">
              <p className="text-gray-500 text-sm">Velg en fil fra Google Drive.</p>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {saving && <p className="text-gray-400 text-sm">Henter fil...</p>}
              <button
                onClick={() => setShowDrive(true)}
                disabled={saving}
                className="bg-primary-500 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                Åpne Drive
              </button>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files[0]) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'}`}
              >
                <p className="text-2xl mb-2">📄</p>
                <p className="text-gray-600 text-sm font-medium">Dra og slipp en fil her, eller klikk for å velge</p>
                <p className="text-gray-400 text-xs mt-1">{SUPPORTED_EXTENSIONS.join(', ')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SUPPORTED_EXTENSIONS.join(',')}
                  className="hidden"
                  onChange={e => handleFileUpload(e.target.files[0])}
                />
              </div>
              {saving && <p className="text-gray-400 text-sm text-center">Leser fil...</p>}
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

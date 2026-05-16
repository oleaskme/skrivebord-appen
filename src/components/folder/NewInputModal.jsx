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

export default function NewInputModal({ folderId, masterDocs = [], onClose, onCreated }) {
  const { activeUser } = useUser()
  const [tab, setTab] = useState('note')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [showDrive, setShowDrive] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedMasterIds, setSelectedMasterIds] = useState(masterDocs.map(m => m.id))
  const [stagedFile, setStagedFile] = useState(null)
  const [stagedEmail, setStagedEmail] = useState(null)
  const [stagedDriveFile, setStagedDriveFile] = useState(null)
  const [loadingDrive, setLoadingDrive] = useState(false)
  const fileInputRef = useRef(null)

  function toggleMaster(id) {
    setSelectedMasterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleTabChange(newTab) {
    setTab(newTab)
    setError(null)
  }

  const isReady = (() => {
    if (tab === 'note' || tab === 'meeting') return !!title.trim() && !!content.trim()
    if (tab === 'upload') return !!stagedFile
    if (tab === 'email') return !!stagedEmail
    if (tab === 'drive') return !!stagedDriveFile && !loadingDrive
    return false
  })()

  function stageFile(file) {
    if (!file) return
    setStagedFile(file)
    setError(null)
  }

  async function handleEmailSelected(email) {
    setShowGmail(false)
    setStagedEmail(email)
  }

  async function handleDriveSelected(file) {
    setShowDrive(false)
    setLoadingDrive(true)
    setError(null)
    try {
      const result = await api.drive.read(activeUser.id, file.id)
      setStagedDriveFile({ ...file, content: result.content ?? '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingDrive(false)
    }
  }

  async function handleSave(withKaia) {
    if (!isReady || saving) return
    setSaving(true)
    setError(null)
    try {
      let type, docTitle, docContent, sourceId = null, metadata = {}

      if (tab === 'note' || tab === 'meeting') {
        type = tab
        docTitle = title.trim()
        docContent = content.trim()
      } else if (tab === 'upload') {
        type = 'upload'
        docTitle = stagedFile.name
        docContent = await extractFileContent(stagedFile)
        metadata = { fileName: stagedFile.name, fileSize: stagedFile.size }
      } else if (tab === 'email') {
        type = 'email'
        const body = `Fra: ${stagedEmail.from}\nDato: ${stagedEmail.date}\nEmne: ${stagedEmail.subject}\n\n${stagedEmail.body}`
        docTitle = stagedEmail.subject
        docContent = body
        sourceId = stagedEmail.messageId
        metadata = { from: stagedEmail.from, date: stagedEmail.date, subject: stagedEmail.subject }
      } else if (tab === 'drive') {
        type = 'drive_file'
        docTitle = stagedDriveFile.name
        docContent = stagedDriveFile.content
        sourceId = stagedDriveFile.id
        metadata = { mimeType: stagedDriveFile.mimeType }
      }

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
          created_by: activeUser?.id ?? null,
        })
        .select()
        .single()
      if (err) throw err

      await supabase.from('folders').update({ last_activity_at: new Date().toISOString() }).eq('id', folderId)
      onCreated(data, withKaia ? selectedMasterIds : [])
      onClose()
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
              onClick={() => handleTabChange(t.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t.id ? 'text-primary-600 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {/* Notat / Møtereferat */}
          {(tab === 'note' || tab === 'meeting') && (
            <div className="space-y-3">
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
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-sm"
              />
            </div>
          )}

          {/* E-post */}
          {tab === 'email' && (
            <div>
              {!stagedEmail ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-gray-500 text-sm">Velg en e-post fra Gmail-innboksen din.</p>
                  <button
                    onClick={() => setShowGmail(true)}
                    className="bg-primary-500 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-primary-600 transition-colors"
                  >
                    Åpne Gmail
                  </button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{stagedEmail.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Fra: {stagedEmail.from}</p>
                      <p className="text-xs text-gray-400">{stagedEmail.date}</p>
                    </div>
                    <button
                      onClick={() => setStagedEmail(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 shrink-0 border border-gray-200 rounded px-2 py-1"
                    >
                      Bytt
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Drive-fil */}
          {tab === 'drive' && (
            <div>
              {loadingDrive ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">Henter fil fra Drive...</p>
                </div>
              ) : !stagedDriveFile ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-gray-500 text-sm">Velg en fil fra Google Drive.</p>
                  <button
                    onClick={() => setShowDrive(true)}
                    className="bg-primary-500 text-white rounded-lg px-6 py-2.5 font-medium hover:bg-primary-600 transition-colors"
                  >
                    Åpne Drive
                  </button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">📄 {stagedDriveFile.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stagedDriveFile.mimeType}</p>
                    </div>
                    <button
                      onClick={() => setStagedDriveFile(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 shrink-0 border border-gray-200 rounded px-2 py-1"
                    >
                      Bytt
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opplasting */}
          {tab === 'upload' && (
            <div>
              {!stagedFile ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); stageFile(e.dataTransfer.files[0]) }}
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
                    onChange={e => stageFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">📄 {stagedFile.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{(stagedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => { setStagedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="text-xs text-gray-400 hover:text-gray-600 shrink-0 border border-gray-200 rounded px-2 py-1"
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Master-valg */}
          {masterDocs.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Velg master-dokumenter for Kaia
              </p>
              <div className="space-y-1.5">
                {masterDocs.map(m => (
                  <label key={m.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedMasterIds.includes(m.id) ? 'border-primary-200 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <input
                      type="checkbox"
                      checked={selectedMasterIds.includes(m.id)}
                      onChange={() => toggleMaster(m.id)}
                      className="w-4 h-4 accent-primary-500 shrink-0"
                    />
                    <span className="text-sm text-gray-700 truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Handlingsknapper */}
          <div className={`flex gap-3 pt-1 ${masterDocs.length > 0 ? '' : 'border-t border-gray-100'}`}>
            <button
              onClick={() => handleSave(false)}
              disabled={!isReady || saving}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
            {masterDocs.length > 0 && (
              <button
                onClick={() => handleSave(true)}
                disabled={!isReady || saving || selectedMasterIds.length === 0}
                className="flex-[2] bg-primary-600 text-white rounded-lg py-2.5 font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors"
              >
                {saving
                  ? 'Starter behandling...'
                  : selectedMasterIds.length === 0
                    ? 'Velg master for å starte'
                    : `Start behandling (${selectedMasterIds.length} master)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

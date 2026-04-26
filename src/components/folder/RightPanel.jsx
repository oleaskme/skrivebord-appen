import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatVersion } from '../../lib/hash'
import { useUser } from '../../context/UserContext'
import TasksPanel from './TasksPanel'
import MeetingsPanel from './MeetingsPanel'
import RisksPanel from './RisksPanel'

const TABS = [
  { id: 'doc',      label: 'Dokument' },
  { id: 'tasks',    label: 'Oppgaver' },
  { id: 'meetings', label: 'Møter' },
  { id: 'risks',    label: 'Risikoer' },
]

// ---- MASTER-visning ----
function MasterViewer({ doc, onSaved }) {
  const { activeUser } = useUser()
  const [content, setContent] = useState(doc.content ?? '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadingDrive, setUploadingDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState(null)

  useEffect(() => { setContent(doc.content ?? ''); setDirty(false) }, [doc.id, doc.content])

  async function handleSave() {
    setSaving(true)
    await supabase.from('master_documents')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
    setSaving(false)
    setDirty(false)
    onSaved()
  }

  async function handleDownloadDocx() {
    setExporting(true)
    try {
      const res = await fetch(`/api/export/docx?masterDocId=${doc.id}`)
      if (!res.ok) throw new Error('Eksport feilet')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${doc.name}_v${formatVersion(doc.version_major, doc.version_minor)}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveToDrive() {
    setUploadingDrive(true)
    setDriveMsg(null)
    try {
      const res  = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser.id, masterDocId: doc.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDriveMsg('✓ Lagret til Drive')
      setTimeout(() => setDriveMsg(null), 3000)
    } catch (err) {
      setDriveMsg('Feil: ' + err.message)
    } finally {
      setUploadingDrive(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded font-mono font-semibold">MASTER</span>
          <h3 className="font-semibold text-gray-800">{doc.name}</h3>
          <span className="text-xs text-gray-400 font-mono">v{formatVersion(doc.version_major, doc.version_minor)}</span>
          {doc.has_unresolved_track_changes && (
            <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded">⚠ Sporede endringer i Word</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {driveMsg && <span className={`text-xs ${driveMsg.startsWith('Feil') ? 'text-red-500' : 'text-green-600'}`}>{driveMsg}</span>}
          <button onClick={handleDownloadDocx} disabled={exporting}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-800 disabled:opacity-50 transition-colors">
            {exporting ? '...' : '⬇ Last ned'}
          </button>
          <button onClick={handleSaveToDrive} disabled={uploadingDrive}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-800 disabled:opacity-50 transition-colors">
            {uploadingDrive ? '...' : '☁ Lagre til Drive'}
          </button>
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              className="bg-primary-500 text-white text-xs rounded-lg px-4 py-1.5 hover:bg-primary-600 disabled:opacity-50 transition-colors">
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-2">
        {doc.ai_instruction && (
          <p className="text-xs text-gray-400 italic shrink-0">AI-instruksjon: {doc.ai_instruction}</p>
        )}
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true) }}
          placeholder="Innhold i MASTER-dokumentet..."
          className="flex-1 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none font-mono leading-relaxed"
        />
      </div>
    </div>
  )
}

// ---- INPUT-visning ----
function InputViewer({ doc }) {
  const TYPE_LABELS = {
    note: 'Notat', meeting: 'Møtereferat', email: 'E-post', drive_file: 'Drive-fil', upload: 'Opplastet',
  }
  const meta = doc.metadata ?? {}
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-semibold">
            INPUT · {TYPE_LABELS[doc.type] ?? doc.type}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${doc.status === 'processed' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
            {doc.status === 'processed' ? 'Behandlet' : 'Ubehandlet'}
          </span>
        </div>
        <h3 className="font-semibold text-gray-800 mt-2">{doc.title}</h3>
        {meta.from && <p className="text-xs text-gray-500 mt-1">Fra: {meta.from}</p>}
        <p className="text-xs text-gray-400 mt-1">{new Date(doc.created_at).toLocaleString('nb-NO')}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
          {doc.content || '(tomt innhold)'}
        </pre>
      </div>
    </div>
  )
}

// ---- Tom tilstand ----
function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-300 flex-col gap-2">
      <div className="text-5xl">📄</div>
      <p className="text-sm">Velg et dokument fra listen til venstre</p>
    </div>
  )
}

// ---- Hoved-komponent ----
export default function RightPanel({ selectedDoc, masterDocs, inputDocs, onMasterSaved, folderId, folderName }) {
  const [activeTab, setActiveTab] = useState('doc')

  // Bytt automatisk til Dokument-fanen når noe velges
  useEffect(() => { if (selectedDoc) setActiveTab('doc') }, [selectedDoc])

  function renderDocContent() {
    if (!selectedDoc) return <EmptyState />
    if (selectedDoc.type === 'master') {
      const doc = masterDocs.find(d => d.id === selectedDoc.id)
      return doc ? <MasterViewer key={doc.id} doc={doc} onSaved={onMasterSaved} /> : null
    }
    if (selectedDoc.type === 'input') {
      const doc = inputDocs.find(d => d.id === selectedDoc.id)
      return doc ? <InputViewer key={doc.id} doc={doc} /> : null
    }
    return <EmptyState />
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Fane-bar */}
      <div className="flex border-b border-gray-100 shrink-0 bg-white">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-primary-600 border-b-2 border-primary-500' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fane-innhold */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'doc'      && renderDocContent()}
        {activeTab === 'tasks'    && <TasksPanel    folderId={folderId} folderName={folderName} />}
        {activeTab === 'meetings' && <MeetingsPanel folderId={folderId} />}
        {activeTab === 'risks'    && <RisksPanel    folderId={folderId} />}
      </div>
    </div>
  )
}

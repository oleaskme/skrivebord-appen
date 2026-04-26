import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatVersion } from '../../lib/hash'
import { useUser } from '../../context/UserContext'
import TasksPanel from './TasksPanel'
import MeetingsPanel from './MeetingsPanel'
import RisksPanel from './RisksPanel'
import RichTextEditor from '../RichTextEditor'

const TABS = [
  { id: 'doc',      label: 'Dokument' },
  { id: 'tasks',    label: 'Oppgaver' },
  { id: 'meetings', label: 'Møter' },
  { id: 'risks',    label: 'Risikoer' },
]

const CHANGELOG_SEP = '--- Endringslogg ---'

function splitContent(raw) {
  const idx = (raw ?? '').indexOf(CHANGELOG_SEP)
  if (idx < 0) return { body: raw ?? '', changelog: '' }
  return {
    body: raw.slice(0, idx).trim(),
    changelog: raw.slice(idx + CHANGELOG_SEP.length).trim(),
  }
}

function plainToHtml(text) {
  if (!text || text.trimStart().startsWith('<')) return text ?? ''
  return text.split('\n').map(line =>
    line.trim() === '' ? '<p></p>' : `<p>${line.trim()}</p>`
  ).join('')
}

// ---- MASTER-visning ----
function MasterViewer({ doc, onSaved }) {
  const { activeUser } = useUser()
  const initial = splitContent(doc.content)
  const [bodyHtml, setBodyHtml] = useState(plainToHtml(initial.body))
  const [changelog, setChangelog] = useState(initial.changelog)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadingDrive, setUploadingDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState(null)

  useEffect(() => {
    const parts = splitContent(doc.content)
    setBodyHtml(plainToHtml(parts.body))
    setChangelog(parts.changelog)
    setDirty(false)
  }, [doc.id, doc.content])

  function buildFullContent() {
    if (!changelog.trim()) return bodyHtml
    return `${bodyHtml}\n\n${CHANGELOG_SEP}\n\n${changelog}`
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('master_documents')
      .update({ content: buildFullContent(), updated_at: new Date().toISOString() })
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
      <div className="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-3">
        {doc.ai_instruction && (
          <p className="text-xs text-gray-400 italic shrink-0">AI-instruksjon: {doc.ai_instruction}</p>
        )}
        <div className="flex-1 overflow-hidden">
          <RichTextEditor
            content={bodyHtml}
            onChange={html => { setBodyHtml(html); setDirty(true) }}
            placeholder="Begynn å skrive MASTER-dokumentet her..."
          />
        </div>
        {changelog.trim() && (
          <div className="shrink-0 border border-gray-100 rounded-lg overflow-hidden">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 bg-gray-50 border-b border-gray-100">
              Endringslogg
            </p>
            <div className="overflow-y-auto max-h-32">
              <table className="w-full text-xs">
                <tbody>
                  {changelog.split('\n').filter(Boolean).map((line, i) => {
                    const colonIdx = line.indexOf(':')
                    const dato    = colonIdx > 0 ? line.slice(0, colonIdx).trim() : ''
                    const tekst   = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line
                    return (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-1 text-gray-400 whitespace-nowrap w-32">{dato}</td>
                        <td className="px-3 py-1 text-gray-600">{tekst}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Fane-bar */}
      <div className="flex shrink-0 bg-slate-700 px-2 pt-2 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-primary-700'
                : 'text-slate-300 hover:text-white hover:bg-slate-600'
            }`}
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

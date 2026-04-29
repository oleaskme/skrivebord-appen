import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatVersion } from '../../lib/hash'
import { useUser } from '../../context/UserContext'
import TasksPanel from './TasksPanel'
import RisksPanel from './RisksPanel'
import QAPanel from './QAPanel'
import RichTextEditor from '../RichTextEditor'
import { normalizeToHtml } from '../../lib/normalizeHtml'

const TABS = [
  { id: 'doc',      label: 'Dokument' },
  { id: 'changes',  label: 'Endringer' },
  { id: 'tasks',    label: 'Oppgaver' },
  { id: 'risks',    label: 'Risikoer' },
  { id: 'qa',       label: 'Q&A' },
]

const CHANGELOG_SEP = '--- Endringslogg ---'

const SEV_LABEL = { high: 'Høy', medium: 'Middels', low: 'Lav' }
const SEV_CLS   = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-500' }

function splitContent(raw) {
  const idx = (raw ?? '').indexOf(CHANGELOG_SEP)
  if (idx < 0) return { body: raw ?? '', changelog: '' }
  return {
    body: raw.slice(0, idx).trim(),
    changelog: raw.slice(idx + CHANGELOG_SEP.length).trim(),
  }
}

const plainToHtml = normalizeToHtml

// ---- Endringer-panel ----
function ChangesPanel({ reviewResult, approvedTasks, approvedRisks, onToggleTask, onToggleRisk, onSave, onDismiss, saving }) {
  if (!reviewResult) {
    return (
      <div className="h-full flex items-center justify-center text-gray-300 flex-col gap-2">
        <div className="text-4xl">🤖</div>
        <p className="text-sm">Ingen AI-forslag ennå.</p>
        <p className="text-xs text-gray-400">Forslag vises her etter at du lagrer dokumentet.</p>
      </div>
    )
  }

  const tasks = reviewResult.suggested_tasks ?? []
  const risks = reviewResult.suggested_risks ?? []
  const totalCount = tasks.length + risks.length
  const selectedCount = approvedTasks.length + approvedRisks.length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">AI-forslag</h3>
          <p className="text-xs text-gray-400 mt-0.5">{totalCount} element{totalCount !== 1 ? 'er' : ''} funnet</p>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
          Ignorer alle
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {tasks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Oppgaver</p>
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <label key={`t${i}`} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={approvedTasks.includes(i)}
                    onChange={() => onToggleTask(i)}
                    className="w-4 h-4 accent-primary-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{t.title}</p>
                    {t.due_date && <p className="text-xs text-gray-400 mt-0.5">Frist: {t.due_date}</p>}
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium shrink-0">Oppgave</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {risks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Risikoer</p>
            <div className="space-y-2">
              {risks.map((r, i) => (
                <label key={`r${i}`} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={approvedRisks.includes(i)}
                    onChange={() => onToggleRisk(i)}
                    className="w-4 h-4 accent-primary-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{r.title}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${SEV_CLS[r.severity] ?? SEV_CLS.low}`}>
                    {SEV_LABEL[r.severity] ?? 'Lav'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 shrink-0">
        <button
          onClick={onSave}
          disabled={saving || selectedCount === 0}
          className="w-full bg-primary-600 text-white text-sm rounded-lg py-2.5 font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Lagrer...' : `Lagre valgte (${selectedCount})`}
        </button>
      </div>
    </div>
  )
}

// ---- MASTER-visning ----
function MasterViewer({ doc, folderId, onSaved, onReviewResult }) {
  const { activeUser } = useUser()
  const initial = splitContent(doc.content)
  const [bodyHtml, setBodyHtml] = useState(plainToHtml(initial.body))
  const [changelog, setChangelog] = useState(initial.changelog)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [uploadingDrive, setUploadingDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState(null)
  const [reviewing, setReviewing] = useState(false)

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
    runReview()
  }

  async function runReview() {
    setReviewing(true)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, masterDocId: doc.id, mode: 'review' }),
      })
      const data = await res.json()
      if (!res.ok) return
      if (data.suggested_tasks?.length || data.suggested_risks?.length) {
        onReviewResult(data)
      }
    } catch {}
    finally { setReviewing(false) }
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
          {reviewing && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin inline-block" />
              AI gjennomgår...
            </span>
          )}
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
  const [reviewResult, setReviewResult]     = useState(null)
  const [approvedTasks, setApprovedTasks]   = useState([])
  const [approvedRisks, setApprovedRisks]   = useState([])
  const [savingReview, setSavingReview]     = useState(false)

  useEffect(() => { if (selectedDoc) setActiveTab('doc') }, [selectedDoc])

  function handleReviewResult(data) {
    setReviewResult(data)
    setApprovedTasks(data.suggested_tasks?.map((_, i) => i) ?? [])
    setApprovedRisks(data.suggested_risks?.map((_, i) => i) ?? [])
  }

  async function handleSaveReview() {
    setSavingReview(true)
    const tasks = reviewResult.suggested_tasks ?? []
    const risks = reviewResult.suggested_risks ?? []
    if (approvedTasks.length > 0) {
      await supabase.from('tasks').insert(
        approvedTasks.map(i => ({ folder_id: folderId, title: tasks[i].title, due_date: tasks[i].due_date ?? null, ai_suggested: true }))
      )
    }
    if (approvedRisks.length > 0) {
      await supabase.from('risks').insert(
        approvedRisks.map(i => ({ folder_id: folderId, title: risks[i].title, severity: risks[i].severity ?? 'medium', source_type: 'master', source_id: selectedDoc?.id, status: 'confirmed' }))
      )
    }
    setSavingReview(false)
    setReviewResult(null)
  }

  function renderDocContent() {
    if (!selectedDoc) return <EmptyState />
    if (selectedDoc.type === 'master') {
      const doc = masterDocs.find(d => d.id === selectedDoc.id)
      return doc
        ? <MasterViewer key={doc.id} doc={doc} folderId={folderId} onSaved={onMasterSaved} onReviewResult={handleReviewResult} />
        : null
    }
    if (selectedDoc.type === 'input') {
      const doc = inputDocs.find(d => d.id === selectedDoc.id)
      return doc ? <InputViewer key={doc.id} doc={doc} /> : null
    }
    return <EmptyState />
  }

  const hasPendingChanges = !!reviewResult

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Fane-bar */}
      <div className="flex shrink-0 bg-slate-700 px-2 pt-2 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-5 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-primary-700'
                : 'text-slate-300 hover:text-white hover:bg-slate-600'
            }`}
          >
            {tab.label}
            {tab.id === 'changes' && hasPendingChanges && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Fane-innhold */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'doc'      && renderDocContent()}
        {activeTab === 'changes'  && (
          <ChangesPanel
            reviewResult={reviewResult}
            approvedTasks={approvedTasks}
            approvedRisks={approvedRisks}
            onToggleTask={i => setApprovedTasks(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
            onToggleRisk={i => setApprovedRisks(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
            onSave={handleSaveReview}
            onDismiss={() => setReviewResult(null)}
            saving={savingReview}
          />
        )}
        {activeTab === 'tasks'    && <TasksPanel folderId={folderId} folderName={folderName} />}
        {activeTab === 'risks'    && <RisksPanel folderId={folderId} />}
        {activeTab === 'qa'       && <QAPanel    folderId={folderId} />}
      </div>
    </div>
  )
}

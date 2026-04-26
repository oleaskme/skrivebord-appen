import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import LeftPanel from '../components/folder/LeftPanel'
import RightPanel from '../components/folder/RightPanel'
import NewMasterModal from '../components/folder/NewMasterModal'
import NewInputModal from '../components/folder/NewInputModal'
import AIReviewModal from '../components/folder/AIReviewModal'

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Aktiv' },
  { value: 'on_hold',  label: 'På vent' },
  { value: 'closed',   label: 'Avsluttet' },
]

export default function FolderView() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  const [folder, setFolder] = useState(null)
  const [masterDocs, setMasterDocs] = useState([])
  const [inputDocs, setInputDocs] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  const [showNewMaster, setShowNewMaster] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [selectedInputIds, setSelectedInputIds] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)

  const loadAll = useCallback(async () => {
    const [folderRes, masterRes, inputRes] = await Promise.all([
      supabase.from('folders').select('*').eq('id', folderId).single(),
      supabase.from('master_documents').select('*').eq('folder_id', folderId).order('created_at'),
      supabase.from('input_documents').select('*').eq('folder_id', folderId).order('created_at', { ascending: false }),
    ])
    if (folderRes.data) {
      setFolder(folderRes.data)
      setNameInput(folderRes.data.name)
    }
    setMasterDocs(masterRes.data ?? [])
    setInputDocs(inputRes.data ?? [])
    setLoading(false)
  }, [folderId])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleRename() {
    if (!nameInput.trim() || nameInput === folder.name) { setEditingName(false); return }
    await supabase.from('folders').update({ name: nameInput.trim() }).eq('id', folderId)
    setFolder(f => ({ ...f, name: nameInput.trim() }))
    setEditingName(false)
  }

  async function handleStatusChange(status) {
    await supabase.from('folders').update({ status }).eq('id', folderId)
    setFolder(f => ({ ...f, status }))
    setShowStatusMenu(false)
  }

  async function handleDeleteInput(inputId) {
    if (!confirm('Slett dette INPUT-dokumentet?')) return
    await supabase.from('input_documents').delete().eq('id', inputId)
    setInputDocs(prev => prev.filter(d => d.id !== inputId))
    if (selectedDoc?.id === inputId) setSelectedDoc(null)
  }

  function handleMasterCreated(doc) {
    setMasterDocs(prev => [...prev, doc])
    setSelectedDoc({ type: 'master', id: doc.id })
  }

  function handleInputCreated(doc) {
    setInputDocs(prev => [doc, ...prev])
    setSelectedDoc({ type: 'input', id: doc.id })
  }

  function handleMasterSaved() {
    loadAll()
  }

  function handleToggleInput(inputId) {
    setSelectedInputIds(prev =>
      prev.includes(inputId) ? prev.filter(id => id !== inputId) : [...prev, inputId]
    )
  }

  async function handleRunAI() {
    if (!selectedDoc || selectedDoc.type !== 'master' || selectedInputIds.length === 0) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          masterDocId: selectedDoc.id,
          inputDocIds: selectedInputIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAiResult(data)
    } catch (err) {
      alert('AI-kjøring feilet: ' + err.message)
    } finally {
      setAiLoading(false)
    }
  }

  function handleAIApproved() {
    setAiResult(null)
    setSelectedInputIds([])
    loadAll()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">Laster mappe...</div>
  }

  if (!folder) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-400 gap-4">
        <p>Mappen ble ikke funnet.</p>
        <button onClick={() => navigate('/')} className="text-primary-500 underline">Tilbake</button>
      </div>
    )
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === folder.status) ?? STATUS_OPTIONS[0]

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Toppfelt */}
      <div className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-primary-500 text-sm shrink-0 transition-colors"
          >
            ← Skrivebord
          </button>
          <span className="text-gray-200">/</span>

          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
              className="font-semibold text-gray-800 border-b-2 border-primary-400 focus:outline-none bg-transparent min-w-0 w-64"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="font-semibold text-gray-800 hover:text-primary-600 truncate transition-colors"
              title="Klikk for å endre navn"
            >
              {folder.name}
            </button>
          )}
        </div>

        {/* Status */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowStatusMenu(o => !o)}
            className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${folder.status === 'active' ? 'bg-green-400' : folder.status === 'on_hold' ? 'bg-yellow-400' : 'bg-gray-400'}`} />
            {currentStatus.label}
          </button>
          {showStatusMenu && (
            <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleStatusChange(s.value)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${s.value === folder.status ? 'text-primary-600 font-medium' : 'text-gray-700'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Innhold */}
      <div className="flex-1 flex overflow-hidden">
        {/* Venstre panel (35%) */}
        <div className="w-[35%] border-r border-gray-100 overflow-hidden">
          <LeftPanel
            masterDocs={masterDocs}
            inputDocs={inputDocs}
            selectedDoc={selectedDoc}
            onSelectDoc={setSelectedDoc}
            onAddMaster={() => setShowNewMaster(true)}
            onAddInput={() => setShowNewInput(true)}
            onDeleteInput={handleDeleteInput}
            selectedInputIds={selectedInputIds}
            onToggleInput={handleToggleInput}
            onRunAI={handleRunAI}
            aiLoading={aiLoading}
          />
        </div>

        {/* Høyre panel (65%) */}
        <div className="flex-1 overflow-hidden">
          <RightPanel
            selectedDoc={selectedDoc}
            masterDocs={masterDocs}
            inputDocs={inputDocs}
            onMasterSaved={handleMasterSaved}
          />
        </div>
      </div>

      {showNewMaster && (
        <NewMasterModal
          folderId={folderId}
          onClose={() => setShowNewMaster(false)}
          onCreated={handleMasterCreated}
        />
      )}

      {showNewInput && (
        <NewInputModal
          folderId={folderId}
          onClose={() => setShowNewInput(false)}
          onCreated={handleInputCreated}
        />
      )}

      {aiResult && (
        <AIReviewModal
          result={aiResult}
          master={masterDocs.find(d => d.id === selectedDoc.id)}
          inputDocs={inputDocs}
          selectedInputIds={selectedInputIds}
          folderId={folderId}
          onClose={() => setAiResult(null)}
          onApproved={handleAIApproved}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatVersion } from '../../lib/hash'

const TYPE_LABELS = {
  note: 'Notat', meeting: 'Møtereferat', email: 'E-post', drive_file: 'Drive-fil', upload: 'Opplastet',
}

function MasterViewer({ doc, onSaved }) {
  const [content, setContent] = useState(doc.content ?? '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setContent(doc.content ?? '')
    setDirty(false)
  }, [doc.id])

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('master_documents')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
    setSaving(false)
    setDirty(false)
    onSaved()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded font-mono font-semibold">
            MASTER
          </span>
          <h3 className="font-semibold text-gray-800">{doc.name}</h3>
          <span className="text-xs text-gray-400 font-mono">
            v{formatVersion(doc.version_major, doc.version_minor)}
          </span>
          {doc.has_unresolved_track_changes && (
            <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded">
              ⚠ Sporede endringer i Word
            </span>
          )}
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-500 text-white text-sm rounded-lg px-4 py-1.5 hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Lagrer...' : 'Lagre'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-6 py-4">
        <div className="text-xs text-gray-400 mb-2">AI-instruksjon: {doc.ai_instruction || '(ikke satt)'}</div>
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true) }}
          placeholder="Innhold i MASTER-dokumentet..."
          className="w-full h-[calc(100%-2rem)] border border-gray-200 rounded-lg p-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none font-mono leading-relaxed"
        />
      </div>
    </div>
  )
}

function InputViewer({ doc }) {
  const typeLabel = TYPE_LABELS[doc.type] ?? doc.type
  const meta = doc.metadata ?? {}

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-semibold">
            INPUT · {typeLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${doc.status === 'processed' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
            {doc.status === 'processed' ? 'Behandlet' : 'Ubehandlet'}
          </span>
        </div>
        <h3 className="font-semibold text-gray-800 mt-2">{doc.title}</h3>
        {meta.from && <p className="text-xs text-gray-500 mt-1">Fra: {meta.from}</p>}
        <p className="text-xs text-gray-400 mt-1">
          {new Date(doc.created_at).toLocaleString('nb-NO')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
          {doc.content || '(tomt innhold)'}
        </pre>
      </div>
    </div>
  )
}

export default function RightPanel({ selectedDoc, masterDocs, inputDocs, onMasterSaved }) {
  if (!selectedDoc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-300 flex-col gap-2">
        <div className="text-5xl">📄</div>
        <p className="text-sm">Velg et dokument fra listen til venstre</p>
      </div>
    )
  }

  if (selectedDoc.type === 'master') {
    const doc = masterDocs.find(d => d.id === selectedDoc.id)
    if (!doc) return null
    return <MasterViewer key={doc.id} doc={doc} onSaved={onMasterSaved} />
  }

  if (selectedDoc.type === 'input') {
    const doc = inputDocs.find(d => d.id === selectedDoc.id)
    if (!doc) return null
    return <InputViewer key={doc.id} doc={doc} />
  }

  return null
}

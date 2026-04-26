import { useState, useEffect } from 'react'
import { api } from '../../lib/api'

export default function GmailPicker({ userId, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    search('')
  }, [])

  async function search(q) {
    setLoading(true)
    try {
      const data = await api.gmail.search(userId, q)
      setThreads(data.threads)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadPreview(thread) {
    setSelected(thread)
    setPreviewLoading(true)
    try {
      const msg = await api.gmail.getMessage(userId, thread.messageId)
      setPreview(msg)
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function handleImport() {
    if (!preview) return
    onSelect({
      messageId: selected.messageId,
      threadId: selected.id,
      subject: preview.subject,
      from: preview.from,
      to: preview.to,
      date: preview.date,
      body: preview.body,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Importer e-post fra Gmail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* E-postliste */}
          <div className="w-1/2 border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Søk i Gmail..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search(query)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Henter e-poster...</div>
              ) : threads.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Ingen treff</div>
              ) : threads.map(t => (
                <button
                  key={t.id}
                  onClick={() => loadPreview(t)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.id === t.id ? 'bg-primary-50 border-l-2 border-l-primary-400' : ''}`}
                >
                  <div className="font-medium text-sm text-gray-800 truncate">{t.subject}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{t.from}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{new Date(t.date).toLocaleDateString('nb-NO')}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Forhåndsvisning */}
          <div className="w-1/2 flex flex-col">
            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Laster...</div>
            ) : preview ? (
              <>
                <div className="p-4 border-b border-gray-100 space-y-1">
                  <div className="font-semibold text-gray-800">{preview.subject}</div>
                  <div className="text-xs text-gray-500">Fra: {preview.from}</div>
                  <div className="text-xs text-gray-500">Dato: {new Date(preview.date).toLocaleString('nb-NO')}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {preview.body}
                </div>
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={handleImport}
                    className="w-full bg-primary-500 text-white rounded-lg py-2.5 font-medium hover:bg-primary-600 transition-colors"
                  >
                    Importer denne e-posten
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Velg en e-post for å forhåndsvise
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

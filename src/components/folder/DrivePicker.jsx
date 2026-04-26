import { useState, useEffect } from 'react'
import { api } from '../../lib/api'

const MIME_LABELS = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/pdf': 'PDF',
  'text/plain': 'Tekst',
  'text/markdown': 'Markdown',
}

export default function DrivePicker({ userId, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    search('')
  }, [])

  async function search(q) {
    setLoading(true)
    try {
      const data = await api.drive.files(userId, q)
      setFiles(data.files)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Velg fil fra Google Drive</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Søk i Drive..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(query)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Henter filer...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Ingen filer funnet</div>
          ) : files.map(f => (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-800 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 ml-2 shrink-0">
                  {MIME_LABELS[f.mimeType] ?? f.mimeType}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Endret: {new Date(f.modifiedTime).toLocaleDateString('nb-NO')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

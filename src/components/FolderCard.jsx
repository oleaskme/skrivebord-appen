import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const STATUS_CONFIG = {
  active:   { label: 'Aktiv',     dot: 'bg-green-400' },
  on_hold:  { label: 'På vent',   dot: 'bg-yellow-400' },
  closed:   { label: 'Avsluttet', dot: 'bg-gray-400' },
}

function formatDate(iso) {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FolderCard({ folder, onDelete }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const status = STATUS_CONFIG[folder.status] ?? STATUS_CONFIG.active

  function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete(folder.id)
  }

  return (
    <div
      onClick={() => navigate(`/mappe/${folder.id}`)}
      className="relative bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-primary-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600 text-xl font-bold">
          {folder.name.charAt(0).toUpperCase()}
        </div>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setConfirmDelete(false) }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-1 rounded transition-opacity"
        >
          ⋯
        </button>
      </div>

      <h3 className="font-semibold text-gray-800 mb-1 truncate">{folder.name}</h3>
      <p className="text-xs text-gray-400">Sist aktiv: {formatDate(folder.last_activity_at)}</p>

      <div className="flex items-center gap-1.5 mt-3">
        <span className={`w-2 h-2 rounded-full ${status.dot}`} />
        <span className="text-xs text-gray-500">{status.label}</span>
      </div>

      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-12 right-3 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]"
        >
          {!confirmDelete ? (
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              Slett mappe
            </button>
          ) : (
            <div className="px-4 py-2">
              <p className="text-xs text-gray-600 mb-2">Sikker? Dette kan ikke angres.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} className="text-xs text-red-500 font-medium hover:text-red-700">Ja, slett</button>
                <button onClick={() => { setConfirmDelete(false); setMenuOpen(false) }} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

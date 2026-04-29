import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const STATUS_CONFIG = {
  active:   { label: 'Aktiv',     dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
  on_hold:  { label: 'På vent',   dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700' },
  closed:   { label: 'Avsluttet', dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500' },
}

const CARD_COLORS = [
  { bg: 'bg-blue-600',   light: 'bg-blue-50',   text: 'text-blue-600' },
  { bg: 'bg-violet-600', light: 'bg-violet-50',  text: 'text-violet-600' },
  { bg: 'bg-emerald-600',light: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-rose-600',   light: 'bg-rose-50',    text: 'text-rose-600' },
  { bg: 'bg-amber-600',  light: 'bg-amber-50',   text: 'text-amber-600' },
  { bg: 'bg-cyan-600',   light: 'bg-cyan-50',    text: 'text-cyan-600' },
  { bg: 'bg-fuchsia-600',light: 'bg-fuchsia-50', text: 'text-fuchsia-600' },
  { bg: 'bg-teal-600',   light: 'bg-teal-50',    text: 'text-teal-600' },
]

function folderColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return CARD_COLORS[hash % CARD_COLORS.length]
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
  const color  = folderColor(folder.id)
  const initial = folder.name.charAt(0).toUpperCase()

  function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete(folder.id)
  }

  return (
    <div
      onClick={() => navigate(`/mappe/${folder.id}`)}
      className="relative bg-white border border-gray-100 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all group"
    >
      {/* Farget toppstripe */}
      <div className={`${color.bg} h-2 w-full`} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-lg ${color.light} flex items-center justify-center ${color.text} text-lg font-bold`}>
            {initial}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setConfirmDelete(false) }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-1 rounded transition-opacity"
          >
            ⋯
          </button>
        </div>

        <h3 className="font-semibold text-xl text-gray-900 mb-1 truncate">{folder.name}</h3>
        <p className="text-base text-gray-400">Sist aktiv: {formatDate(folder.last_activity_at)}</p>

        <div className="mt-3">
          <span className={`inline-flex items-center gap-1.5 text-base font-medium px-2 py-1 rounded-full ${status.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
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

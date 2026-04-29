import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../context/UserContext'
import { supabase } from '../lib/supabase'
import KPIPanel from '../components/KPIPanel'
import FolderCard from '../components/FolderCard'
import NewFolderModal from '../components/NewFolderModal'
import GoogleConnectButton from '../components/GoogleConnectButton'
import kaiaImg from '../assets/kaia.png'
import kaiaVideo from '../assets/Kaia AI med lyd.mov'

export default function Desktop() {
  const { activeUser, clearUser } = useUser()
  const [folders, setFolders] = useState([])
  const [search, setSearch] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kaiaOpen, setKaiaOpen] = useState(false)

  const loadFolders = useCallback(async () => {
    const { data } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', activeUser.id)
      .order('last_activity_at', { ascending: false })
    setFolders(data ?? [])
    setLoading(false)
  }, [activeUser.id])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  async function handleCreateFolder({ name, purpose, masters }) {
    const { data: folder, error } = await supabase
      .from('folders')
      .insert({ user_id: activeUser.id, name, purpose })
      .select()
      .single()
    if (error) throw error

    if (masters.length > 0) {
      const masterRows = masters
        .filter(m => m.name.trim())
        .map(m => ({
          folder_id: folder.id,
          name: m.name.trim(),
          ai_instruction: m.ai_instruction.trim() || null,
          drive_file_id: m.drive_file_id.trim() || null,
        }))
      if (masterRows.length > 0) {
        const { error: masterErr } = await supabase.from('master_documents').insert(masterRows)
        if (masterErr) throw masterErr
      }
    }

    setFolders(prev => [folder, ...prev])
  }

  async function handleDeleteFolder(folderId) {
    await supabase.from('folders').delete().eq('id', folderId)
    setFolders(prev => prev.filter(f => f.id !== folderId))
  }

  const filtered = folders.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Sone A — Toppfelt (10%) */}
      <div className="h-[10vh] min-h-[64px] bg-white border-b border-gray-100 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-800">
            Skrivebordet til{' '}
            <span className="text-primary-500">{activeUser.name}</span>
          </h1>
          <div className="relative">
            <input
              type="text"
              placeholder="Søk i mapper..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ml-4 border border-gray-200 rounded-lg px-4 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <GoogleConnectButton />
          <button
            onClick={clearUser}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-4 py-2 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs">
              {activeUser.name.charAt(0).toUpperCase()}
            </div>
            Bytt bruker
          </button>
          <div className="flex flex-col items-center pl-2 border-l border-gray-100 cursor-pointer group" onClick={() => setKaiaOpen(true)}>
            <img src={kaiaImg} alt="Kaia" className="w-20 h-20 rounded-full object-cover object-top shadow-sm group-hover:ring-2 group-hover:ring-primary-300 transition-all" />
            <span className="text-xs font-semibold text-gray-500 mt-1">Kaia</span>
          </div>
          {kaiaOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setKaiaOpen(false)}>
              <div className="relative" onClick={e => e.stopPropagation()}>
                <video
                  src={kaiaVideo}
                  autoPlay
                  controls
                  className="rounded-2xl shadow-2xl max-h-[80vh] max-w-[90vw]"
                />
                <button onClick={() => setKaiaOpen(false)} className="absolute top-2 right-2 bg-black/40 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/60 transition-colors">✕</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sone B — KPI-panel (30%) */}
      <div className="h-[30vh] bg-blue-50 border-b border-blue-100 px-8 py-4 shrink-0">
        <KPIPanel userId={activeUser.id} />
      </div>

      {/* Sone C — Mappeoversikt (60%) */}
      <div className="flex-1 overflow-y-auto px-8 py-6 bg-gray-50">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
            Mapper ({filtered.length})
          </h2>
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-2 bg-primary-500 text-white rounded-lg px-4 py-2 text-base font-medium hover:bg-primary-600 transition-colors"
          >
            + Ny mappe
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-16">Laster mapper...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {search ? `Ingen mapper matcher "${search}"` : 'Ingen mapper ennå — opprett din første mappe.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onDelete={handleDeleteFolder}
              />
            ))}
          </div>
        )}
      </div>

      {showNewFolder && (
        <NewFolderModal
          onClose={() => setShowNewFolder(false)}
          onCreate={handleCreateFolder}
        />
      )}

      {/* Versjonsinformasjon */}
      <div className="fixed bottom-3 left-4 text-xs text-gray-300 select-none">
        {__COMMIT__} · {new Date(__BUILD_TIME__).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

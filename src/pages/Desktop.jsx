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
  const { activeUser, users, isAdmin, clearUser, deleteUser } = useUser()
  const [folders, setFolders] = useState([])
  const [memberships, setMemberships] = useState([])
  const [search, setSearch] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kaiaOpen, setKaiaOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  const loadFolders = useCallback(async () => {
    const { data: mems } = await supabase
      .from('folder_members')
      .select('folder_id, role')
      .eq('user_id', activeUser.id)
    if (!mems?.length) { setFolders([]); setMemberships([]); setLoading(false); return }
    setMemberships(mems)
    const { data } = await supabase
      .from('folders')
      .select('*')
      .in('id', mems.map(m => m.folder_id))
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

    await supabase.from('folder_members').insert({ folder_id: folder.id, user_id: activeUser.id, role: 'owner' })

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

    setMemberships(prev => [...prev, { folder_id: folder.id, role: 'owner' }])
    setFolders(prev => [folder, ...prev])
  }

  async function handleDeleteFolder(folderId) {
    await supabase.from('folders').delete().eq('id', folderId)
    setFolders(prev => prev.filter(f => f.id !== folderId))
    setMemberships(prev => prev.filter(m => m.folder_id !== folderId))
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
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 transition-colors"
              title="Administrer brukere"
            >
              ⚙ Brukere
            </button>
          )}
          <button
            onClick={clearUser}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-4 py-2 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs">
              {activeUser.name.charAt(0).toUpperCase()}
            </div>
            Bytt bruker
          </button>
          <button
            onClick={() => setAboutOpen(true)}
            className="flex flex-col items-center justify-center w-10 h-10 rounded-full border-2 border-primary-200 text-primary-500 hover:bg-primary-50 hover:border-primary-400 transition-colors font-bold text-lg"
            title="Om skrivebordsappen"
          >
            ?
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
                isOwner={memberships.some(m => m.folder_id === folder.id && m.role === 'owner')}
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

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {showAdmin && (
        <AdminUsersModal
          users={users}
          activeUserId={activeUser.id}
          onClose={() => setShowAdmin(false)}
          onDelete={deleteUser}
        />
      )}

      {/* Versjonsinformasjon */}
      <div className="fixed bottom-3 left-4 text-xs text-gray-300 select-none">
        {__COMMIT__} · {new Date(__BUILD_TIME__).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

function AboutModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Om skrivebordsappen</h2>
            <p className="text-sm text-gray-400 mt-0.5">Din AI-drevne arbeidsassistent</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-8 py-6 space-y-7">

          {/* Hensikt */}
          <section>
            <h3 className="text-base font-bold text-primary-600 mb-2">Hva er skrivebordsappen?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Skrivebordsappen er et verktøy for deg som jobber med mange saker, kunder eller prosjekter og trenger å holde oversikt — uten å drukne i dokumenter og notater. Kaia, den innebygde AI-assistenten, leser og analyserer innkommende informasjon og kobler den opp mot dine egne retningslinjer, maler og instruksjoner. Du bestemmer hva som er viktig, Kaia passer på.
            </p>
          </section>

          {/* Logikk */}
          <section>
            <h3 className="text-base font-bold text-primary-600 mb-3">Slik er logikken bygd opp</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">M</div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Mapper</p>
                  <p className="text-sm text-gray-500">Hver mappe representerer en sak, kunde eller et prosjekt. Alt som hører sammen ligger samlet på ett sted.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">★</div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Masterdokumenter</p>
                  <p className="text-sm text-gray-500">Dette er din kunnskap og dine instruksjoner — kravspesifikasjoner, avtaler, retningslinjer eller maler. Kaia bruker disse som referansepunkt når hun leser nye dokumenter.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">↓</div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Input-dokumenter</p>
                  <p className="text-sm text-gray-500">Innkommende informasjon — møtenotater, e-poster, rapporter, vedlegg. Disse legges inn og analyseres av Kaia mot masterdokumentene.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">✦</div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Kaia analyserer</p>
                  <p className="text-sm text-gray-500">Kaia leser input opp mot master og identifiserer oppgaver, risikoer og avvik. Hun foreslår hva du bør følge opp — du bekrefter, avviser eller lukker.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Bruksanvisning */}
          <section>
            <h3 className="text-base font-bold text-primary-600 mb-3">Slik bruker du appen</h3>
            <ol className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">1.</span>
                <span><span className="font-semibold text-gray-700">Opprett en mappe</span> for saken eller prosjektet du vil følge opp.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">2.</span>
                <span><span className="font-semibold text-gray-700">Legg til masterdokumenter</span> — last opp egne filer, lim inn tekst eller koble til Google Drive. Gi gjerne Kaia en instruksjon om hva hun skal se etter.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">3.</span>
                <span><span className="font-semibold text-gray-700">Legg inn input</span> når noe nytt skjer — et møte, en e-post, et vedlegg. Du kan skrive det selv eller hente fra Drive.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">4.</span>
                <span><span className="font-semibold text-gray-700">Kjør Kaia</span> ved å krysse av masterdokumenter og input-dokumenter, og trykk «Kjør Kaia». Kaia analyserer input-dokumentene, skriver og supplerer masterdokumentene basert på dokumentinstruksen, og oppdaterer oppgaver, risikoer og andre relevante punkter.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">5.</span>
                <span><span className="font-semibold text-gray-700">Behandle forslagene</span> i fanen for oppgaver og risikoer. Bekreft det som er relevant, avvis det som ikke er det, og lukk det som er håndtert.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-primary-400 shrink-0">6.</span>
                <span><span className="font-semibold text-gray-700">Følg med på dashbordet</span> — øverst på skrivebordet ser du en samlet oversikt over aktive oppgaver og risikoer på tvers av alle mapper.</span>
              </li>
            </ol>
          </section>

          {/* Tips */}
          <section className="bg-primary-50 border border-primary-100 rounded-xl px-5 py-4">
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1.5">Tips</p>
            <ul className="text-sm text-primary-700 space-y-1.5">
              <li>— Jo tydeligere instruksjon du gir Kaia i masterdokumentet, jo mer presis blir analysen.</li>
              <li>— Bruk «Kaia: Rydd og grupper» under risikoer for å slå sammen overlappende punkter.</li>
              <li>— Lukkede risikoer og fullførte oppgaver forsvinner ikke — de arkiveres med dato og tidsstempel.</li>
            </ul>
          </section>

        </div>

        <div className="px-8 pb-6">
          <button
            onClick={onClose}
            className="w-full bg-primary-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-600 transition-colors"
          >
            Forstått, la meg jobbe!
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminUsersModal({ users, activeUserId, onClose, onDelete }) {
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(userId) {
    setDeleting(true)
    try {
      await onDelete(userId)
      setConfirming(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Brukere</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {users.map(user => (
            <div key={user.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 text-sm font-medium text-gray-700">{user.name}</span>
              {user.is_admin && (
                <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Admin</span>
              )}
              {!user.is_admin && user.id !== activeUserId && (
                confirming === user.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sikker?</span>
                    <button
                      disabled={deleting}
                      onClick={() => handleDelete(user.id)}
                      className="text-xs text-red-500 font-semibold hover:text-red-700"
                    >
                      Ja, slett
                    </button>
                    <button onClick={() => setConfirming(null)} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(user.id)}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-0.5 transition-colors"
                  >
                    Slett
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


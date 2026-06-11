import { useState } from 'react'
import { useUser } from '../context/UserContext'

export default function UserSelector() {
  const { users, selectUser, createUser, verifyPassword } = useUser()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const [passwordUser, setPasswordUser] = useState(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(null)
  const [verifying, setVerifying] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const user = await createUser(newName.trim())
      selectUser(user)
    } catch {
      setError('Kunne ikke opprette bruker. Prøv igjen.')
    } finally {
      setCreating(false)
    }
  }

  function handleUserClick(user) {
    if (user.has_password) {
      setPasswordUser(user)
      setPassword('')
      setPasswordError(null)
    } else {
      selectUser(user)
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setVerifying(true)
    setPasswordError(null)
    try {
      const ok = await verifyPassword(passwordUser.id, password)
      if (ok) {
        selectUser(passwordUser)
      } else {
        setPasswordError('Feil passord. Prøv igjen.')
      }
    } catch {
      setPasswordError('Noe gikk galt. Prøv igjen.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-primary-500 mb-2">Skrivebord-appen</h1>
      <p className="text-gray-500 mb-10">Velg hvem du er for å fortsette</p>

      {passwordUser ? (
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-lg">
                {passwordUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-gray-800 text-lg">{passwordUser.name}</span>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                autoFocus
                type="password"
                placeholder="Passord"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifying || !password}
                  className="flex-1 bg-primary-500 text-white rounded-lg py-2 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {verifying ? 'Sjekker...' : 'Logg inn'}
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordUser(null)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Tilbake
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => handleUserClick(user)}
              className="w-full text-left px-6 py-4 bg-white border border-gray-200 rounded-xl hover:border-primary-400 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-lg">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-800">{user.name}</span>
                {user.is_admin && (
                  <span className="ml-auto text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
                {user.has_password && !user.is_admin && (
                  <span className="ml-auto text-xs text-gray-400">🔒</span>
                )}
              </div>
            </button>
          ))}

          {!showNew ? (
            <button
              onClick={() => setShowNew(true)}
              className="w-full px-6 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-all"
            >
              + Ny bruker
            </button>
          ) : (
            <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <input
                autoFocus
                type="text"
                placeholder="Navn"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 bg-primary-500 text-white rounded-lg py-2 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Oppretter...' : 'Opprett'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNew(false); setNewName('') }}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Avbryt
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useUser } from '../context/UserContext'

export default function UserSelector() {
  const { users, selectUser, createUser } = useUser()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-primary-500 mb-2">Skrivebord-appen</h1>
      <p className="text-gray-500 mb-10">Velg hvem du er for å fortsette</p>

      <div className="w-full max-w-md space-y-3">
        {users.map(user => (
          <button
            key={user.id}
            onClick={() => selectUser(user)}
            className="w-full text-left px-6 py-4 bg-white border border-gray-200 rounded-xl hover:border-primary-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-lg">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-gray-800">{user.name}</span>
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
    </div>
  )
}

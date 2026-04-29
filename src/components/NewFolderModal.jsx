import { useState } from 'react'

const EMPTY_MASTER = () => ({ name: '', ai_instruction: '', drive_file_id: '' })

export default function NewFolderModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [masters, setMasters] = useState([EMPTY_MASTER()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function addMaster() {
    setMasters(prev => [...prev, EMPTY_MASTER()])
  }

  function removeMaster(i) {
    setMasters(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateMaster(i, field, value) {
    setMasters(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), purpose: purpose.trim(), masters })
      onClose()
    } catch (err) {
      setError(err.message ?? 'Noe gikk galt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800 mb-6">Opprett ny mappe</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mappenavn *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="f.eks. Strategiplan 2026"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Formål med mappen</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              rows={3}
              placeholder="Beskriv hva mappen brukes til og hvilken kontekst den representerer..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">MASTER-dokumenter</label>
              <button
                type="button"
                onClick={addMaster}
                className="text-sm text-primary-500 hover:text-primary-700 font-medium"
              >
                + Legg til dokument
              </button>
            </div>

            <div className="space-y-4">
              {masters.map((m, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      MASTER {i + 1}
                    </span>
                    {masters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMaster(i)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Fjern
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Navn på dokumentet (f.eks. Prosjektplan)"
                    value={m.name}
                    onChange={e => updateMaster(i, 'name', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                  />
                  <textarea
                    placeholder="Instruksjon til Kaia — beskriv dokumentets formål, struktur og hva Kaia skal se etter og oppdatere..."
                    value={m.ai_instruction}
                    onChange={e => updateMaster(i, 'ai_instruction', e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Google Drive fil-ID (valgfritt — som startpunkt)"
                    value={m.drive_file_id}
                    onChange={e => updateMaster(i, 'drive_file_id', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-primary-500 text-white rounded-lg py-3 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Oppretter...' : 'Opprett mappe'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-gray-500 hover:text-gray-700 font-medium"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

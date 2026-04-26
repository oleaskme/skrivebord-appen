import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function NewMasterModal({ folderId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('master_documents')
        .insert({
          folder_id: folderId,
          name: name.trim(),
          ai_instruction: aiInstruction.trim() || null,
          content: '',
        })
        .select()
        .single()
      if (err) throw err
      onCreated(data)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-800 mb-6">Nytt MASTER-dokument</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Navn *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="f.eks. Prosjektplan, Beslutningslogg"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI-instruksjon</label>
            <textarea
              value={aiInstruction}
              onChange={e => setAiInstruction(e.target.value)}
              rows={4}
              placeholder="Beskriv dokumentets formål og hva AI-en skal se etter og oppdatere basert på INPUT-dokumenter..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-sm"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-primary-500 text-white rounded-lg py-2.5 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Oppretter...' : 'Opprett'}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-gray-500 hover:text-gray-700">
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

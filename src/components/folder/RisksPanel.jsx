import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const SEVERITY = {
  high:   { label: 'Høy',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-400' },
  medium: { label: 'Middels', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  low:    { label: 'Lav',    bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   dot: 'bg-gray-400' },
}

export default function RisksPanel({ folderId }) {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSeverity, setNewSeverity] = useState('medium')
  const [adding, setAdding] = useState(false)

  const loadRisks = useCallback(async () => {
    const { data } = await supabase
      .from('risks')
      .select('*')
      .eq('folder_id', folderId)
      .neq('status', 'dismissed')
      .order('identified_at', { ascending: false })
    setRisks(data ?? [])
    setLoading(false)
  }, [folderId])

  useEffect(() => { loadRisks() }, [loadRisks])

  async function handleConfirm(risk) {
    await supabase.from('risks').update({ status: 'confirmed' }).eq('id', risk.id)
    setRisks(prev => prev.map(r => r.id === risk.id ? { ...r, status: 'confirmed' } : r))
  }

  async function handleDismiss(risk) {
    await supabase.from('risks').update({ status: 'dismissed' }).eq('id', risk.id)
    setRisks(prev => prev.filter(r => r.id !== risk.id))
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      const { data } = await supabase.from('risks').insert({
        folder_id: folderId,
        title: newTitle.trim(),
        severity: newSeverity,
        source_type: 'manual',
        status: 'confirmed',
      }).select().single()
      setRisks(prev => [data, ...prev])
      setNewTitle('')
      setShowForm(false)
    } finally {
      setAdding(false)
    }
  }

  const proposed  = risks.filter(r => r.status === 'proposed')
  const confirmed = risks.filter(r => r.status === 'confirmed')

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laster risikoer...</div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-700">Risikoer</h3>
        <button onClick={() => setShowForm(f => !f)}
          className="text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition-colors">
          + Ny risiko
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0 space-y-2">
          <input
            autoFocus type="text" placeholder="Beskriv risikoen..."
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="flex gap-2">
            <select value={newSeverity} onChange={e => setNewSeverity(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="high">Høy</option>
              <option value="medium">Middels</option>
              <option value="low">Lav</option>
            </select>
            <button type="submit" disabled={adding || !newTitle.trim()}
              className="flex-1 bg-primary-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors">
              {adding ? 'Lagrer...' : 'Lagre'}
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {risks.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen risikoer registrert</p>
        )}

        {proposed.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-2">
              AI-foreslått ({proposed.length})
            </p>
            <div className="space-y-2">
              {proposed.map(r => <RiskItem key={r.id} risk={r} onConfirm={handleConfirm} onDismiss={handleDismiss} />)}
            </div>
          </div>
        )}

        {confirmed.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Bekreftet ({confirmed.length})
            </p>
            <div className="space-y-2">
              {confirmed.map(r => <RiskItem key={r.id} risk={r} onConfirm={handleConfirm} onDismiss={handleDismiss} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RiskItem({ risk, onConfirm, onDismiss }) {
  const s = SEVERITY[risk.severity] ?? SEVERITY.medium
  return (
    <div className={`p-3 border rounded-lg ${s.bg} ${s.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
          <p className={`text-sm font-medium ${s.text}`}>{risk.title}</p>
        </div>
        <span className={`text-xs font-semibold uppercase shrink-0 ${s.text}`}>{s.label}</span>
      </div>
      <div className="flex items-center gap-3 mt-2 ml-4">
        {risk.status === 'proposed' && (
          <button onClick={() => onConfirm(risk)}
            className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors">
            ✓ Bekreft
          </button>
        )}
        <button onClick={() => onDismiss(risk)}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          Avvis
        </button>
        <span className="text-xs text-gray-400">
          {new Date(risk.identified_at).toLocaleDateString('nb-NO')}
          {risk.source_type === 'manual' ? ' · Manuell' : ' · AI'}
        </span>
      </div>
    </div>
  )
}

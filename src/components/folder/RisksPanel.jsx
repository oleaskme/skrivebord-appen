import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const SEVERITY = {
  high:   { label: 'Høy',     bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-400' },
  medium: { label: 'Middels', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  low:    { label: 'Lav',     bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   dot: 'bg-gray-400' },
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 }

export default function RisksPanel({ folderId }) {
  const [risks, setRisks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [newTitle, setNewTitle]   = useState('')
  const [newSeverity, setNewSeverity] = useState('medium')
  const [adding, setAdding]       = useState(false)
  const [sortBy, setSortBy]       = useState('priority')
  const [cleaning, setCleaning]   = useState(false)
  const [cleanupResult, setCleanupResult] = useState(null)
  const [approvedMerges, setApprovedMerges] = useState([])
  const [applying, setApplying]   = useState(false)

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

  async function handleCleanup() {
    setCleaning(true)
    setCleanupResult(null)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, mode: 'cleanup', itemType: 'risks' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCleanupResult(data)
      setApprovedMerges(data.merges.map((_, i) => i))
    } catch (err) {
      alert('Feil: ' + err.message)
    } finally {
      setCleaning(false)
    }
  }

  async function applyCleanup() {
    if (!cleanupResult) return
    setApplying(true)
    try {
      // Bruk grupper på alle elementer
      for (const group of cleanupResult.groups) {
        for (const id of group.itemIds) {
          await supabase.from('risks').update({ group_name: group.name }).eq('id', id)
        }
      }
      // Utfør godkjente sammenslåinger
      for (const idx of approvedMerges) {
        const merge = cleanupResult.merges[idx]
        const [keepId, ...deleteIds] = merge.ids
        await supabase.from('risks').update({ title: merge.suggestedTitle }).eq('id', keepId)
        if (deleteIds.length) await supabase.from('risks').delete().in('id', deleteIds)
      }
      setCleanupResult(null)
      setSortBy('group')
      await loadRisks()
    } finally {
      setApplying(false)
    }
  }

  const proposed  = risks.filter(r => r.status === 'proposed')
  const confirmed = risks.filter(r => r.status === 'confirmed')
  const active    = [...proposed, ...confirmed]

  function renderByPriority() {
    const byLevel = { high: [], medium: [], low: [] }
    for (const r of active) byLevel[r.severity]?.push(r)
    return Object.entries(byLevel)
      .filter(([, items]) => items.length)
      .map(([sev, items]) => (
        <div key={sev}>
          <p className={`text-base font-bold uppercase tracking-wide mb-2 ${SEVERITY[sev].text}`}>
            {SEVERITY[sev].label} ({items.length})
          </p>
          <div className="space-y-2">
            {items.map(r => <RiskItem key={r.id} risk={r} onConfirm={handleConfirm} onDismiss={handleDismiss} />)}
          </div>
        </div>
      ))
  }

  function renderByGroup() {
    const grouped = {}
    const ungrouped = []
    for (const r of active) {
      if (r.group_name) {
        if (!grouped[r.group_name]) grouped[r.group_name] = []
        grouped[r.group_name].push(r)
      } else {
        ungrouped.push(r)
      }
    }
    const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'nb'))
    if (ungrouped.length) entries.push(['Uten gruppe', ungrouped])
    return entries.map(([name, items]) => (
      <div key={name}>
        <p className="text-base font-bold text-gray-600 uppercase tracking-wide mb-2">{name} ({items.length})</p>
        <div className="space-y-2">
          {[...items].sort((a, b) => (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2))
            .map(r => <RiskItem key={r.id} risk={r} onConfirm={handleConfirm} onDismiss={handleDismiss} />)}
        </div>
      </div>
    ))
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laster risikoer...</div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0 gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-700">Risikoer</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sorteringstoggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setSortBy('priority')}
              className={`px-2.5 py-1.5 transition-colors ${sortBy === 'priority' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Prioritet
            </button>
            <button
              onClick={() => setSortBy('group')}
              className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${sortBy === 'group' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Gruppe
            </button>
          </div>
          <button onClick={handleCleanup} disabled={cleaning || risks.length < 2}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors">
            {cleaning ? '🤖 Kaia analyserer...' : '🤖 Kaia: Rydd og grupper'}
          </button>
          <button onClick={() => setShowForm(f => !f)}
            className="text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition-colors">
            + Ny risiko
          </button>
        </div>
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

      {cleanupResult && (
        <div className="mx-4 mt-3 shrink-0 border border-primary-200 rounded-xl overflow-hidden bg-primary-50">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary-100 border-b border-primary-200">
            <p className="text-xs font-semibold text-primary-800">
              🤖 Kaia foreslår: {cleanupResult.merges.length} sammenslåing{cleanupResult.merges.length !== 1 ? 'er' : ''}, {cleanupResult.groups.length} grupper
            </p>
            <button onClick={() => setCleanupResult(null)} className="text-primary-400 hover:text-primary-600 text-xs">Avbryt</button>
          </div>
          <div className="px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
            {cleanupResult.merges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Foreslåtte sammenslåinger</p>
                {cleanupResult.merges.map((m, i) => (
                  <label key={i} className="flex items-start gap-2 mb-1.5 cursor-pointer">
                    <input type="checkbox" checked={approvedMerges.includes(i)}
                      onChange={() => setApprovedMerges(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                      className="w-3.5 h-3.5 accent-primary-500 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="text-gray-800 font-medium">"{m.suggestedTitle}"</p>
                      <p className="text-gray-400">{m.reason}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Foreslåtte grupper</p>
              {cleanupResult.groups.map((g, i) => (
                <p key={i} className="text-xs text-gray-700 mb-0.5">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-gray-400"> · {g.itemIds.length} element{g.itemIds.length !== 1 ? 'er' : ''}</span>
                </p>
              ))}
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-primary-200">
            <button onClick={applyCleanup} disabled={applying}
              className="w-full bg-primary-600 text-white text-xs rounded-lg py-1.5 font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {applying ? 'Bruker endringer...' : 'Bruk foreslåtte endringer'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {risks.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen risikoer registrert</p>
        )}
        {sortBy === 'priority' ? renderByPriority() : renderByGroup()}
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
          {risk.source_type === 'manual' ? ' · Manuell' : ' · Kaia'}
        </span>
      </div>
    </div>
  )
}

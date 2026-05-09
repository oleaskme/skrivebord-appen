import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useUser } from '../../context/UserContext'

const SEVERITY = {
  high:   { label: 'Høy',     bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-400' },
  medium: { label: 'Middels', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  low:    { label: 'Lav',     bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   dot: 'bg-gray-400' },
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 }

const AVATAR_COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-cyan-500']
function avatarColor(name = '') {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function OwnerAvatar({ members, ownerId }) {
  const m = members.find(m => m.user_id === ownerId)
  const name = m?.users?.name ?? '?'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-white font-bold shrink-0 w-5 h-5 text-[10px] ${avatarColor(name)}`} title={name}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function RisksPanel({ folderId, members = [] }) {
  const { activeUser } = useUser()
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
  const [editingRisk, setEditingRisk] = useState(null)
  const [renamingGroup, setRenamingGroup] = useState(null) // { oldName, newName }

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

  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => { loadRisks() }, [loadRisks])

  async function handleConfirm(risk) {
    await supabase.from('risks').update({ status: 'confirmed' }).eq('id', risk.id)
    setRisks(prev => prev.map(r => r.id === risk.id ? { ...r, status: 'confirmed' } : r))
  }

  async function handleDismiss(risk) {
    await supabase.from('risks').update({ status: 'dismissed' }).eq('id', risk.id)
    setRisks(prev => prev.filter(r => r.id !== risk.id))
  }

  async function handleClose(risk) {
    const closed_at = new Date().toISOString()
    await supabase.from('risks').update({ status: 'closed', closed_at }).eq('id', risk.id)
    setRisks(prev => prev.map(r => r.id === risk.id ? { ...r, status: 'closed', closed_at } : r))
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
        owner_id: activeUser.id,
      }).select().single()
      setRisks(prev => [data, ...prev])
      setNewTitle('')
      setShowForm(false)
    } finally {
      setAdding(false)
    }
  }

  async function handleEditSave(id, fields) {
    await supabase.from('risks').update(fields).eq('id', id)
    setRisks(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r))
  }

  async function handleRenameGroup(oldName, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setRenamingGroup(null); return }
    const ids = risks.filter(r => r.group_name === oldName).map(r => r.id)
    if (ids.length) await supabase.from('risks').update({ group_name: trimmed }).in('id', ids)
    setRisks(prev => prev.map(r => r.group_name === oldName ? { ...r, group_name: trimmed } : r))
    setRenamingGroup(null)
  }

  async function handleDeleteGroup(name) {
    const ids = risks.filter(r => r.group_name === name).map(r => r.id)
    if (ids.length) await supabase.from('risks').update({ group_name: null }).in('id', ids)
    setRisks(prev => prev.map(r => r.group_name === name ? { ...r, group_name: null } : r))
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
  const closed    = risks.filter(r => r.status === 'closed')

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
            {items.map(r => <RiskItem key={r.id} risk={r} members={members} onConfirm={handleConfirm} onDismiss={handleDismiss} onClose={handleClose} onEdit={() => setEditingRisk(r)} />)}
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
    const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'nb'))
    const allGroups = [...groupNames, ...(ungrouped.length ? ['Uten gruppe'] : [])]

    return allGroups.map(name => {
      const items = name === 'Uten gruppe' ? ungrouped : grouped[name]
      const isVirtual = name === 'Uten gruppe'
      const isRenaming = renamingGroup?.oldName === name
      return (
        <div key={name}>
          {isRenaming ? (
            <form
              className="flex items-center gap-1.5 mb-2"
              onSubmit={e => { e.preventDefault(); handleRenameGroup(name, renamingGroup.newName) }}
            >
              <input
                autoFocus
                value={renamingGroup.newName}
                onChange={e => setRenamingGroup(r => ({ ...r, newName: e.target.value }))}
                className="border border-primary-300 rounded px-2 py-0.5 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 w-44"
              />
              <button type="submit" className="text-xs text-primary-600 font-semibold hover:text-primary-800">Lagre</button>
              <button type="button" onClick={() => setRenamingGroup(null)} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mb-2 group/gh">
              <p className={`text-sm font-bold uppercase tracking-wide ${isVirtual ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                {name} ({items.length})
              </p>
              {!isVirtual && (
                <>
                  <button
                    onClick={() => setRenamingGroup({ oldName: name, newName: name })}
                    className="opacity-0 group-hover/gh:opacity-100 text-xs text-gray-400 hover:text-primary-600 transition-all"
                    title="Gi nytt navn"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(name)}
                    className="opacity-0 group-hover/gh:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-all"
                    title="Fjern gruppe (risikoene beholdes)"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            {[...items].sort((a, b) => (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2))
              .map(r => <RiskItem key={r.id} risk={r} members={members} onConfirm={handleConfirm} onDismiss={handleDismiss} onClose={handleClose} onEdit={() => setEditingRisk(r)} />)}
          </div>
        </div>
      )
    })
  }

  function renderByOwner() {
    const grouped = {}
    const noOwner = []
    for (const r of active) {
      const m = members.find(m => m.user_id === r.owner_id)
      const name = m?.users?.name
      if (name) {
        if (!grouped[name]) grouped[name] = []
        grouped[name].push(r)
      } else {
        noOwner.push(r)
      }
    }
    const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'nb'))
    if (noOwner.length) entries.push(['Ikke tildelt', noOwner])
    return entries.map(([name, items]) => (
      <div key={name}>
        <p className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2">{name} ({items.length})</p>
        <div className="space-y-2">
          {[...items].sort((a, b) => (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2))
            .map(r => <RiskItem key={r.id} risk={r} members={members} onConfirm={handleConfirm} onDismiss={handleDismiss} onClose={handleClose} onEdit={() => setEditingRisk(r)} />)}
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
            <button
              onClick={() => setSortBy('owner')}
              className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${sortBy === 'owner' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Ansvarlig
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
        {active.length === 0 && closed.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen risikoer registrert</p>
        )}
        {sortBy === 'priority' ? renderByPriority() : sortBy === 'group' ? renderByGroup() : renderByOwner()}

        {closed.length > 0 && (
          <div>
            <button
              onClick={() => setShowClosed(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-600 transition-colors"
            >
              <span>{showClosed ? '▾' : '▸'}</span>
              Lukkede risikoer ({closed.length})
            </button>
            {showClosed && (
              <div className="space-y-2">
                {closed
                  .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
                  .map(r => <RiskItem key={r.id} risk={r} members={members} onDismiss={handleDismiss} onEdit={() => setEditingRisk(r)} />)
                }
              </div>
            )}
          </div>
        )}
      </div>

      {editingRisk && (
        <RiskEditModal
          risk={editingRisk}
          groups={[...new Set(risks.filter(r => r.group_name).map(r => r.group_name))].sort((a, b) => a.localeCompare(b, 'nb'))}
          members={members}
          onClose={() => setEditingRisk(null)}
          onSave={handleEditSave}
          onDelete={handleDismiss}
          onCloseRisk={handleClose}
        />
      )}
    </div>
  )
}

function RiskEditModal({ risk, groups, members, onClose, onSave, onDelete, onCloseRisk }) {
  const [title, setTitle]       = useState(risk.title)
  const [severity, setSeverity] = useState(risk.severity ?? 'medium')
  const [group, setGroup]       = useState(risk.group_name ?? '')
  const [newGroup, setNewGroup] = useState('')
  const [ownerId, setOwnerId]   = useState(risk.owner_id ?? '')
  const [saving, setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)

  const resolvedGroup = group === '__new__' ? newGroup.trim() : (group || null)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave(risk.id, { title: title.trim(), severity, group_name: resolvedGroup || null, owner_id: ownerId || null })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Rediger risiko</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Beskrivelse</label>
            <textarea autoFocus rows={3} value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Alvorlighetsgrad</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="high">Høy</option>
              <option value="medium">Middels</option>
              <option value="low">Lav</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Gruppe</label>
            <select value={group} onChange={e => setGroup(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="">— Ingen gruppe —</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="__new__">+ Ny gruppe...</option>
            </select>
            {group === '__new__' && (
              <input
                autoFocus
                type="text"
                placeholder="Navn på ny gruppe"
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            )}
          </div>
          {members.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Ansvarlig</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                <option value="">– Ikke tildelt –</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.users?.name ?? m.user_id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          {!confirming && !confirmingClose && (
            <>
              <button onClick={() => setConfirmingClose(true)}
                className="text-sm text-green-600 hover:text-green-800 border border-green-200 rounded-lg px-3 py-2 transition-colors">
                Lukk risiko
              </button>
              <button onClick={() => setConfirming(true)}
                className="text-sm text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-2 transition-colors">
                Avvis
              </button>
            </>
          )}
          {confirmingClose && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Merk som lukket?</span>
              <button onClick={() => { onCloseRisk(risk); onClose() }}
                className="text-sm text-green-600 font-semibold hover:text-green-800">Ja, lukk</button>
              <button onClick={() => setConfirmingClose(false)} className="text-sm text-gray-400 hover:text-gray-600">Avbryt</button>
            </div>
          )}
          {confirming && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sikker?</span>
              <button onClick={() => { onDelete(risk); onClose() }}
                className="text-sm text-red-500 font-semibold hover:text-red-700">Ja, avvis</button>
              <button onClick={() => setConfirming(false)} className="text-sm text-gray-400 hover:text-gray-600">Avbryt</button>
            </div>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors">Avbryt</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="text-sm bg-primary-500 text-white rounded-lg px-4 py-2 font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
            {saving ? 'Lagrer...' : 'Lagre'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RiskItem({ risk, members, onConfirm, onDismiss, onClose, onEdit }) {
  const s = SEVERITY[risk.severity] ?? SEVERITY.medium
  const isClosed = risk.status === 'closed'
  return (
    <div
      onClick={!isClosed ? onEdit : undefined}
      className={`p-3 border rounded-lg transition-opacity ${isClosed ? 'opacity-60 bg-gray-50 border-gray-200' : `cursor-pointer hover:opacity-90 ${s.bg} ${s.border}`}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isClosed ? 'bg-gray-400' : s.dot}`} />
          <p className={`text-sm font-medium ${isClosed ? 'text-gray-500 line-through' : s.text}`}>{risk.title}</p>
        </div>
        <span className={`text-xs font-semibold uppercase shrink-0 ${isClosed ? 'text-gray-400' : s.text}`}>
          {isClosed ? 'Lukket' : s.label}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 ml-4 flex-wrap">
        {isClosed ? (
          <span className="text-xs text-gray-400">
            Lukket {new Date(risk.closed_at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        ) : (
          <>
            {risk.status === 'proposed' && (
              <button onClick={e => { e.stopPropagation(); onConfirm(risk) }}
                className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors">
                ✓ Bekreft
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onClose(risk) }}
              className="text-xs text-green-500 hover:text-green-700 transition-colors">
              Lukk
            </button>
            <button onClick={e => { e.stopPropagation(); onDismiss(risk) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Avvis
            </button>
            <span className="text-xs text-gray-400">
              {new Date(risk.identified_at).toLocaleDateString('nb-NO')}
            </span>
            {risk.owner_id && (() => {
              const m = members.find(m => m.user_id === risk.owner_id)
              const name = m?.users?.name
              return name ? <span className="text-xs text-gray-500 font-medium">Ansvarlig: {name}</span> : null
            })()}
          </>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useUser } from '../../context/UserContext'

const PRIORITY = {
  high:   { label: 'Høy',     bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
  medium: { label: 'Medium',  bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  low:    { label: 'Lav',     bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
}
const PRI_ORDER = { high: 0, medium: 1, low: 2, null: 3, undefined: 3 }

const AVATAR_COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-cyan-500']
function avatarColor(name = '') {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function OwnerAvatar({ members, ownerId, size = 'sm' }) {
  const m = members.find(m => m.user_id === ownerId)
  const name = m?.users?.name ?? '?'
  const sz = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-white font-bold shrink-0 ${sz} ${avatarColor(name)}`} title={name}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function TasksPanel({ folderId, folderName, members = [], inputDocs = [] }) {
  const { activeUser } = useUser()
  const [tasks, setTasks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [newTitle, setNewTitle]   = useState('')
  const [newDue, setNewDue]       = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [adding, setAdding]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [syncing, setSyncing]     = useState(false)
  const [sortBy, setSortBy]       = useState('priority')
  const [cleaning, setCleaning]   = useState(false)
  const [cleanupResult, setCleanupResult] = useState(null)
  const [approvedMerges, setApprovedMerges] = useState([])
  const [applying, setApplying]   = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingSubtask, setEditingSubtask] = useState(null)
  const [renamingGroup, setRenamingGroup] = useState(null)
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState([])
  const [showMergeModal, setShowMergeModal] = useState(false)

  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('folder_id', folderId)
      .order('created_at')
    setTasks(data ?? [])
    setLoading(false)
  }, [folderId])

  useEffect(() => { loadTasks() }, [loadTasks])

  const topLevel = tasks.filter(t => !t.parent_id)
  const subtasksOf = (id) => tasks.filter(t => t.parent_id === id)

  async function getOrCreateTaskListId() {
    const existing = tasks.find(t => t.google_tasklist_id)
    if (existing) return existing.google_tasklist_id
    const { list } = await api.tasks.createList(activeUser.id, folderName)
    return list.id
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      let googleTasksId = null
      let googleTasklistId = null
      if (activeUser.google_account_email) {
        try {
          const listId = await getOrCreateTaskListId()
          const { task } = await api.tasks.createItem(activeUser.id, listId, newTitle.trim(), newDue || null)
          googleTasksId = task.id
          googleTasklistId = listId
        } catch {}
      }
      const { data } = await supabase.from('tasks').insert({
        folder_id: folderId,
        title: newTitle.trim(),
        due_date: newDue || null,
        priority: newPriority,
        google_tasks_id: googleTasksId,
        google_tasklist_id: googleTasklistId,
        status: 'open',
        ai_suggested: false,
        owner_id: activeUser.id,
      }).select().single()
      setTasks(prev => [...prev, data])
      setNewTitle('')
      setNewDue('')
      setNewPriority('medium')
      setShowForm(false)
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(task) {
    const newStatus = task.status === 'completed' ? 'open' : 'completed'
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null
    const completedBy = newStatus === 'completed' ? activeUser.id : null
    await supabase.from('tasks').update({ status: newStatus, completed_at: completedAt, completed_by: completedBy }).eq('id', task.id)
    if (task.google_tasks_id && task.google_tasklist_id) {
      try {
        await api.tasks.updateItem(activeUser.id, task.google_tasklist_id, task.google_tasks_id, {
          status: newStatus === 'completed' ? 'completed' : 'needsAction',
          completed: completedAt,
        })
      } catch {}
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed_at: completedAt, completed_by: completedBy } : t))
  }

  async function handlePriorityChange(task, priority) {
    await supabase.from('tasks').update({ priority }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority } : t))
  }

  async function handleStatusChange(task, status) {
    const completedAt = status === 'completed' ? new Date().toISOString() : null
    const completedBy = status === 'completed' ? activeUser.id : null
    await supabase.from('tasks').update({ status, completed_at: completedAt, completed_by: completedBy }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status, completed_at: completedAt, completed_by: completedBy } : t))
  }

  async function handleDelete(task) {
    await supabase.from('tasks').delete().eq('id', task.id)
    if (task.google_tasks_id && task.google_tasklist_id) {
      try { await api.tasks.deleteItem(activeUser.id, task.google_tasklist_id, task.google_tasks_id) } catch {}
    }
    setTasks(prev => prev.filter(t => t.id !== task.id && t.parent_id !== task.id))
  }

  async function handleEditSave(id, fields) {
    await supabase.from('tasks').update(fields).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
  }

  async function handleAddSubtask(parentId, fields) {
    const { data } = await supabase.from('tasks').insert({
      folder_id: folderId,
      parent_id: parentId,
      status: 'open',
      ai_suggested: false,
      owner_id: activeUser.id,
      ...fields,
    }).select().single()
    if (data) setTasks(prev => [...prev, data])
  }

  async function handleRenameGroup(oldName, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setRenamingGroup(null); return }
    const ids = tasks.filter(t => t.group_name === oldName).map(t => t.id)
    if (ids.length) await supabase.from('tasks').update({ group_name: trimmed }).in('id', ids)
    setTasks(prev => prev.map(t => t.group_name === oldName ? { ...t, group_name: trimmed } : t))
    setRenamingGroup(null)
  }

  async function handleDeleteGroup(name) {
    const ids = tasks.filter(t => t.group_name === name).map(t => t.id)
    if (ids.length) await supabase.from('tasks').update({ group_name: null }).in('id', ids)
    setTasks(prev => prev.map(t => t.group_name === name ? { ...t, group_name: null } : t))
  }

  async function handleSync() {
    if (!activeUser.google_account_email) return
    setSyncing(true)
    try {
      let listId = tasks.find(t => t.google_tasklist_id)?.google_tasklist_id
      if (!listId) {
        const { list } = await api.tasks.createList(activeUser.id, folderName)
        listId = list.id
      }
      const unsynced = tasks.filter(t => !t.google_tasks_id && !t.parent_id)
      for (const task of unsynced) {
        try {
          const { task: gTask } = await api.tasks.createItem(activeUser.id, listId, task.title, task.due_date || null)
          await supabase.from('tasks').update({ google_tasks_id: gTask.id, google_tasklist_id: listId }).eq('id', task.id)
        } catch {}
      }
      const { items } = await api.tasks.getItems(activeUser.id, listId)
      for (const item of items) {
        const local = tasks.find(t => t.google_tasks_id === item.id)
        const status = item.status === 'completed' ? 'completed' : 'open'
        if (local && local.status !== status) {
          await supabase.from('tasks').update({ status }).eq('id', local.id)
        }
      }
      await loadTasks()
    } finally {
      setSyncing(false)
    }
  }

  async function handleAssessPriority() {
    setAssessing(true)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, mode: 'assess_priority' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadTasks()
      const parts = []
      if (data.certain > 0) parts.push(`${data.certain} oppgave${data.certain !== 1 ? 'r' : ''} fikk prioritet`)
      if (data.uncertain > 0) parts.push(`${data.uncertain} merket som «Må vurderes»`)
      if (parts.length) alert(parts.join(', ') + '.')
    } catch (err) {
      alert('Feil: ' + err.message)
    } finally {
      setAssessing(false)
    }
  }

  async function handleCleanup() {
    setCleaning(true)
    setCleanupResult(null)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, mode: 'cleanup', itemType: 'tasks' }),
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
      for (const group of cleanupResult.groups) {
        for (const id of group.itemIds) {
          await supabase.from('tasks').update({ group_name: group.name }).eq('id', id)
        }
      }
      for (const idx of approvedMerges) {
        const merge = cleanupResult.merges[idx]
        const [keepId, ...deleteIds] = merge.ids
        await supabase.from('tasks').update({ title: merge.suggestedTitle }).eq('id', keepId)
        if (deleteIds.length) await supabase.from('tasks').delete().in('id', deleteIds)
      }
      setCleanupResult(null)
      setSortBy('group')
      await loadTasks()
    } finally {
      setApplying(false)
    }
  }

  function toggleMergeSelect(id) {
    setMergeSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function exitMergeMode() {
    setMergeMode(false)
    setMergeSelected([])
    setShowMergeModal(false)
  }

  const openTasks  = topLevel.filter(t => t.status === 'open' || t.status === 'needs_review' || t.status === 'in_progress')
  const completedTasks = topLevel.filter(t => t.status === 'completed')

  function sortByPriorityThenDue(items) {
    return [...items].sort((a, b) => {
      const pd = (PRI_ORDER[a.priority] ?? 3) - (PRI_ORDER[b.priority] ?? 3)
      if (pd !== 0) return pd
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  }

  function taskItemProps(t) {
    return {
      task: t,
      members,
      inputDocs,
      subtasks: subtasksOf(t.id),
      onToggle: handleToggle,
      onDelete: handleDelete,
      onPriorityChange: handlePriorityChange,
      onStatusChange: handleStatusChange,
      onEdit: () => setEditingTask(t),
      onEditSubtask: (sub) => setEditingSubtask(sub),
      mergeMode,
      mergeSelected,
      onMergeToggle: toggleMergeSelect,
    }
  }

  function renderByPriority() {
    const sorted = sortByPriorityThenDue(openTasks)
    const byLevel = { high: [], medium: [], low: [], none: [] }
    for (const t of sorted) byLevel[t.priority ?? 'none'].push(t)

    return (
      <>
        {(['high', 'medium', 'low', 'none']).map(level => {
          const items = byLevel[level]
          if (!items.length) return null
          const label = level === 'none' ? 'Uten prioritet' : PRIORITY[level].label
          const cls   = level === 'none' ? 'text-gray-400' : PRIORITY[level].text
          return (
            <div key={level}>
              <p className={`text-base font-bold uppercase tracking-wide mb-2 ${cls}`}>
                {label} ({items.length})
              </p>
              <div className="space-y-2">
                {items.map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
              </div>
            </div>
          )
        })}
        {completedTasks.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completedTasks.length})</p>
            <div className="space-y-2">
              {completedTasks.map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderByGroup() {
    const grouped = {}
    const ungrouped = []
    for (const t of openTasks) {
      if (t.group_name) {
        if (!grouped[t.group_name]) grouped[t.group_name] = []
        grouped[t.group_name].push(t)
      } else {
        ungrouped.push(t)
      }
    }
    const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'nb'))
    if (ungrouped.length) entries.push(['Uten gruppe', ungrouped])
    return (
      <>
        {entries.map(([name, items]) => {
          const isVirtual = name === 'Uten gruppe'
          const isRenaming = renamingGroup?.oldName === name
          return (
            <div key={name}>
              {isRenaming ? (
                <form className="flex items-center gap-1.5 mb-2"
                  onSubmit={e => { e.preventDefault(); handleRenameGroup(name, renamingGroup.newName) }}>
                  <input autoFocus value={renamingGroup.newName}
                    onChange={e => setRenamingGroup(r => ({ ...r, newName: e.target.value }))}
                    className="border border-primary-300 rounded px-2 py-0.5 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400 w-44" />
                  <button type="submit" className="text-xs text-primary-600 font-semibold hover:text-primary-800">Lagre</button>
                  <button type="button" onClick={() => setRenamingGroup(null)} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
                </form>
              ) : (
                <div className="flex items-center gap-2 mb-2 group/gh">
                  <p className={`text-base font-bold uppercase tracking-wide ${isVirtual ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                    {name} ({items.length})
                  </p>
                  {!isVirtual && (
                    <>
                      <button onClick={() => setRenamingGroup({ oldName: name, newName: name })}
                        className="opacity-0 group-hover/gh:opacity-100 text-xs text-gray-400 hover:text-primary-600 transition-all" title="Gi nytt navn">✎</button>
                      <button onClick={() => handleDeleteGroup(name)}
                        className="opacity-0 group-hover/gh:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-all" title="Fjern gruppe">×</button>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {sortByPriorityThenDue(items).map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
              </div>
            </div>
          )
        })}
        {completedTasks.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completedTasks.length})</p>
            <div className="space-y-2">
              {completedTasks.map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderByOwner() {
    const grouped = {}
    const noOwner = []
    for (const t of openTasks) {
      const m = members.find(m => m.user_id === t.owner_id)
      const name = m?.users?.name
      if (name) {
        if (!grouped[name]) grouped[name] = []
        grouped[name].push(t)
      } else {
        noOwner.push(t)
      }
    }
    const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'nb'))
    if (noOwner.length) entries.push(['Ikke tildelt', noOwner])
    return (
      <>
        {entries.map(([name, items]) => (
          <div key={name}>
            <p className="text-base font-bold text-gray-600 uppercase tracking-wide mb-2">{name} ({items.length})</p>
            <div className="space-y-2">
              {sortByPriorityThenDue(items).map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
            </div>
          </div>
        ))}
        {completedTasks.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completedTasks.length})</p>
            <div className="space-y-2">
              {completedTasks.map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
            </div>
          </div>
        )}
      </>
    )
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laster oppgaver...</div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0 gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-700">Oppgaver</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {!mergeMode && (
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
          )}
          {!mergeMode && (
            <>
              <button onClick={handleAssessPriority} disabled={assessing || openTasks.length === 0}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors">
                {assessing ? '🤖 Kaia vurderer...' : '🤖 Kaia: Vurder prioritet'}
              </button>
              <button onClick={handleCleanup} disabled={cleaning || openTasks.length < 2}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors">
                {cleaning ? '🤖 Kaia analyserer...' : '🤖 Kaia: Rydd og grupper'}
              </button>
            </>
          )}
          {/* Slå sammen-knapp */}
          {!mergeMode ? (
            <button
              onClick={() => { setMergeMode(true); setMergeSelected([]) }}
              disabled={openTasks.length < 2}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors"
            >
              ⊕ Slå sammen
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMergeModal(true)}
                disabled={mergeSelected.length < 2}
                className={`text-xs rounded-lg px-2.5 py-1.5 font-semibold transition-colors border ${mergeSelected.length >= 2 ? 'bg-primary-500 text-white border-primary-500 hover:bg-primary-600' : 'text-gray-400 border-gray-200 opacity-50'}`}
              >
                ⊕ Slå sammen ({mergeSelected.length} valgt)
              </button>
              <button onClick={exitMergeMode} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
                Avbryt
              </button>
            </div>
          )}
          {!mergeMode && activeUser.google_account_email && (
            <button onClick={handleSync} disabled={syncing}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
              {syncing ? 'Synkroniserer...' : '↻ Sync'}
            </button>
          )}
          {!mergeMode && (
            <button onClick={() => setShowForm(f => !f)}
              className="text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition-colors">
              + Ny oppgave
            </button>
          )}
        </div>
      </div>

      {showForm && !mergeMode && (
        <form onSubmit={handleAdd} className="px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0 space-y-2">
          <input
            autoFocus type="text" placeholder="Oppgavetittel..."
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="flex gap-2">
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="high">Høy</option>
              <option value="medium">Medium</option>
              <option value="low">Lav</option>
            </select>
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
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
        {topLevel.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen oppgaver ennå</p>
        )}
        {sortBy === 'priority' ? renderByPriority() : sortBy === 'group' ? renderByGroup() : renderByOwner()}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          members={members}
          inputDocs={inputDocs}
          subtasks={subtasksOf(editingTask.id)}
          groups={[...new Set(tasks.filter(t => t.group_name).map(t => t.group_name))].sort((a, b) => a.localeCompare(b, 'nb'))}
          onClose={() => setEditingTask(null)}
          onSave={handleEditSave}
          onDelete={handleDelete}
          onAddSubtask={handleAddSubtask}
          onEditSubtask={(sub) => { setEditingTask(null); setEditingSubtask(sub) }}
          onComplete={async (task) => {
            const completed_at = new Date().toISOString()
            const completed_by = activeUser.id
            await supabase.from('tasks').update({ status: 'completed', completed_at, completed_by }).eq('id', task.id)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', completed_at, completed_by } : t))
          }}
          onReopen={async (task) => {
            await supabase.from('tasks').update({ status: 'open', completed_at: null, completed_by: null }).eq('id', task.id)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'open', completed_at: null, completed_by: null } : t))
          }}
        />
      )}

      {editingSubtask && (
        <SubtaskEditModal
          task={editingSubtask}
          members={members}
          onClose={() => setEditingSubtask(null)}
          onSave={handleEditSave}
          onDelete={(task) => {
            handleDelete(task)
            setEditingSubtask(null)
          }}
          onComplete={async (task) => {
            const completed_at = new Date().toISOString()
            const completed_by = activeUser.id
            await supabase.from('tasks').update({ status: 'completed', completed_at, completed_by }).eq('id', task.id)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', completed_at, completed_by } : t))
            setEditingSubtask(null)
          }}
          onReopen={async (task) => {
            await supabase.from('tasks').update({ status: 'open', completed_at: null, completed_by: null }).eq('id', task.id)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'open', completed_at: null, completed_by: null } : t))
            setEditingSubtask(null)
          }}
        />
      )}

      {showMergeModal && (
        <MergeModal
          tasks={topLevel.filter(t => mergeSelected.includes(t.id))}
          members={members}
          folderId={folderId}
          onClose={exitMergeMode}
          onDone={async () => {
            exitMergeMode()
            await loadTasks()
          }}
          subtasksOf={subtasksOf}
        />
      )}
    </div>
  )
}

// ---- TaskEditModal ----
function TaskEditModal({ task, members, inputDocs = [], subtasks = [], groups, onClose, onSave, onDelete, onAddSubtask, onEditSubtask, onComplete, onReopen }) {
  const [title, setTitle]       = useState(task.title)
  const [dueDate, setDueDate]   = useState(task.due_date ?? '')
  const [priority, setPriority] = useState(task.priority ?? '')
  const [ownerId, setOwnerId]   = useState(task.owner_id ?? '')
  const [group, setGroup]       = useState(task.group_name ?? '')
  const [newGroup, setNewGroup] = useState('')
  const [saving, setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmingComplete, setConfirmingComplete] = useState(false)
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [subTitle, setSubTitle] = useState('')
  const [subDue, setSubDue]     = useState('')
  const [subPriority, setSubPriority] = useState('medium')
  const [subOwner, setSubOwner] = useState('')
  const [addingSub, setAddingSub] = useState(false)
  const isCompleted = task.status === 'completed'
  const resolvedGroup = group === '__new__' ? newGroup.trim() : (group || null)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave(task.id, { title: title.trim(), due_date: dueDate || null, priority: priority || null, owner_id: ownerId || null, group_name: resolvedGroup || null })
    onClose()
  }

  async function handleAddSubtask(e) {
    e.preventDefault()
    if (!subTitle.trim()) return
    setAddingSub(true)
    try {
      await onAddSubtask(task.id, {
        title: subTitle.trim(),
        due_date: subDue || null,
        priority: subPriority || null,
        owner_id: subOwner || null,
      })
      setSubTitle('')
      setSubDue('')
      setSubPriority('medium')
      setSubOwner('')
      setShowSubtaskForm(false)
    } finally {
      setAddingSub(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Rediger oppgave</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Beskrivelse</label>
            <textarea autoFocus rows={3} value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">Opprettet</label>
            <p className="text-sm text-gray-500">{new Date(task.created_at).toLocaleDateString('nb-NO')}</p>
          </div>
          {task.ai_suggested && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Kildedokument{(task.source_input_ids?.length ?? 0) > 1 ? 'er' : ''}
              </label>
              {task.source_input_ids?.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.source_input_ids.map(id => {
                    const doc = inputDocs.find(d => d.id === id)
                    return doc ? (
                      <span key={id} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">
                        {doc.title}
                      </span>
                    ) : null
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Ingen kilde registrert</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Frist</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Prioritet</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="">– Ikke satt –</option>
              <option value="high">Høy</option>
              <option value="medium">Medium</option>
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
              <input autoFocus type="text" placeholder="Navn på ny gruppe" value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
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

          {/* Underoppgaver-seksjon */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Underoppgaver</label>
            {subtasks.length === 0 && !showSubtaskForm && (
              <p className="text-xs text-gray-400 italic mb-1">Ingen underoppgaver ennå</p>
            )}
            {subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map(sub => {
                  const pri = PRIORITY[sub.priority]
                  const isCompleted = sub.status === 'completed'
                  return (
                    <div key={sub.id}
                      onClick={() => onEditSubtask(sub)}
                      className="flex items-center gap-2 px-2 py-1.5 border border-gray-100 rounded-lg hover:border-primary-200 hover:bg-primary-50 cursor-pointer transition-colors">
                      <span className={`text-xs flex-1 ${isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>{sub.title}</span>
                      {sub.due_date && (
                        <span className="text-xs text-gray-400">{new Date(sub.due_date).toLocaleDateString('nb-NO')}</span>
                      )}
                      {pri && (
                        <span className={`text-xs rounded px-1.5 py-0.5 border font-medium ${pri.bg} ${pri.text} ${pri.border}`}>{pri.label}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {showSubtaskForm ? (
              <form onSubmit={handleAddSubtask} className="space-y-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                <input autoFocus type="text" placeholder="Underoppgavetittel..."
                  value={subTitle} onChange={e => setSubTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <div className="flex gap-2">
                  <input type="date" value={subDue} onChange={e => setSubDue(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  <select value={subPriority} onChange={e => setSubPriority(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400">
                    <option value="">– Prioritet –</option>
                    <option value="high">Høy</option>
                    <option value="medium">Medium</option>
                    <option value="low">Lav</option>
                  </select>
                  {members.length > 0 && (
                    <select value={subOwner} onChange={e => setSubOwner(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400">
                      <option value="">– Ansvarlig –</option>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>{m.users?.name ?? m.user_id}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addingSub || !subTitle.trim()}
                    className="flex-1 bg-primary-500 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
                    {addingSub ? 'Lagrer...' : 'Lagre underoppgave'}
                  </button>
                  <button type="button" onClick={() => setShowSubtaskForm(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                    Avbryt
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowSubtaskForm(true)}
                className="text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors">
                + Legg til underoppgave
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          {!confirming && !confirmingComplete && (
            <>
              {isCompleted ? (
                <button onClick={() => { onReopen(task); onClose() }}
                  className="text-sm text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-2 transition-colors">
                  Gjenåpne
                </button>
              ) : (
                <button onClick={() => setConfirmingComplete(true)}
                  className="text-sm text-green-600 hover:text-green-800 border border-green-200 rounded-lg px-3 py-2 transition-colors">
                  Ferdigstill
                </button>
              )}
              <button onClick={() => setConfirming(true)}
                className="text-sm text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-2 transition-colors">
                Slett
              </button>
            </>
          )}
          {confirmingComplete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Merk som ferdig?</span>
              <button onClick={() => { onComplete(task); onClose() }}
                className="text-sm text-green-600 font-semibold hover:text-green-800">Ja, ferdigstill</button>
              <button onClick={() => setConfirmingComplete(false)} className="text-sm text-gray-400 hover:text-gray-600">Avbryt</button>
            </div>
          )}
          {confirming && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sikker?</span>
              <button onClick={() => { onDelete(task); onClose() }}
                className="text-sm text-red-500 font-semibold hover:text-red-700">Ja, slett</button>
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

// ---- SubtaskEditModal ----
function SubtaskEditModal({ task, members, onClose, onSave, onDelete, onComplete, onReopen }) {
  const [title, setTitle]       = useState(task.title)
  const [dueDate, setDueDate]   = useState(task.due_date ?? '')
  const [priority, setPriority] = useState(task.priority ?? '')
  const [ownerId, setOwnerId]   = useState(task.owner_id ?? '')
  const [saving, setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmingComplete, setConfirmingComplete] = useState(false)
  const isCompleted = task.status === 'completed'

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave(task.id, { title: title.trim(), due_date: dueDate || null, priority: priority || null, owner_id: ownerId || null })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Rediger underoppgave</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Beskrivelse</label>
            <textarea autoFocus rows={3} value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Frist</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Prioritet</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="">– Ikke satt –</option>
              <option value="high">Høy</option>
              <option value="medium">Medium</option>
              <option value="low">Lav</option>
            </select>
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
          {!confirming && !confirmingComplete && (
            <>
              {isCompleted ? (
                <button onClick={() => onReopen(task)}
                  className="text-sm text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-2 transition-colors">
                  Gjenåpne
                </button>
              ) : (
                <button onClick={() => setConfirmingComplete(true)}
                  className="text-sm text-green-600 hover:text-green-800 border border-green-200 rounded-lg px-3 py-2 transition-colors">
                  Ferdigstill
                </button>
              )}
              <button onClick={() => setConfirming(true)}
                className="text-sm text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-2 transition-colors">
                Slett
              </button>
            </>
          )}
          {confirmingComplete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Merk som ferdig?</span>
              <button onClick={() => onComplete(task)}
                className="text-sm text-green-600 font-semibold hover:text-green-800">Ja, ferdigstill</button>
              <button onClick={() => setConfirmingComplete(false)} className="text-sm text-gray-400 hover:text-gray-600">Avbryt</button>
            </div>
          )}
          {confirming && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sikker?</span>
              <button onClick={() => onDelete(task)}
                className="text-sm text-red-500 font-semibold hover:text-red-700">Ja, slett</button>
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

// ---- MergeModal ----
function MergeModal({ tasks, members, folderId, onClose, onDone, subtasksOf }) {
  const [mode, setMode] = useState('one') // 'one' | 'new'
  const [winnerId, setWinnerId] = useState(tasks[0]?.id ?? '')
  const [customTitle, setCustomTitle] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue]     = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newOwner, setNewOwner] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [working, setWorking]   = useState(false)

  async function handleConfirm() {
    setWorking(true)
    try {
      if (mode === 'one') {
        const title = customTitle.trim() || tasks.find(t => t.id === winnerId)?.title
        await supabase.from('tasks').update({ title }).eq('id', winnerId)
        const losers = tasks.filter(t => t.id !== winnerId)
        for (const loser of losers) {
          const subs = subtasksOf(loser.id)
          for (const sub of subs) {
            await supabase.from('tasks').update({ parent_id: winnerId }).eq('id', sub.id)
          }
          await supabase.from('tasks').delete().eq('id', loser.id)
        }
      } else {
        if (!newTitle.trim()) return
        const { data: parent } = await supabase.from('tasks').insert({
          folder_id: folderId,
          title: newTitle.trim(),
          due_date: newDue || null,
          priority: newPriority || null,
          owner_id: newOwner || null,
          group_name: newGroup.trim() || null,
          status: 'open',
          ai_suggested: false,
        }).select().single()
        if (!parent) return
        for (const task of tasks) {
          await supabase.from('tasks').update({ parent_id: parent.id }).eq('id', task.id)
        }
      }
      await onDone()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Slå sammen oppgaver</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600 mb-1">Valgte oppgaver:</p>
          {tasks.map(t => (
            <p key={t.id} className="pl-2 border-l-2 border-primary-200">{t.title}</p>
          ))}
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="merge-mode" value="one" checked={mode === 'one'} onChange={() => setMode('one')}
              className="mt-0.5 accent-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">Slå sammen til én oppgave</p>
              <p className="text-xs text-gray-400">Velg hvilken oppgave som «vinner» – de andre slettes, underoppgaver flyttes over</p>
            </div>
          </label>
          {mode === 'one' && (
            <div className="ml-5 space-y-2">
              <select value={winnerId} onChange={e => setWinnerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <input type="text" placeholder="Eventuelt ny tittel (valgfri)"
                value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="merge-mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')}
              className="mt-0.5 accent-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">Ny hovedoppgave med underoppgaver</p>
              <p className="text-xs text-gray-400">Alle valgte oppgaver blir underoppgaver av en ny oppgave</p>
            </div>
          </label>
          {mode === 'new' && (
            <div className="ml-5 space-y-2">
              <input autoFocus type="text" placeholder="Tittel på ny oppgave *"
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                <option value="">– Prioritet –</option>
                <option value="high">Høy</option>
                <option value="medium">Medium</option>
                <option value="low">Lav</option>
              </select>
              {members.length > 0 && (
                <select value={newOwner} onChange={e => setNewOwner(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                  <option value="">– Ansvarlig –</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.users?.name ?? m.user_id}</option>)}
                </select>
              )}
              <input type="text" placeholder="Gruppe (valgfri)"
                value={newGroup} onChange={e => setNewGroup(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors">Avbryt</button>
          <div className="flex-1" />
          <button onClick={handleConfirm} disabled={working || (mode === 'new' && !newTitle.trim())}
            className="text-sm bg-primary-500 text-white rounded-lg px-4 py-2 font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
            {working ? 'Behandler...' : 'Bekreft sammenslåing'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- TaskItem ----
const STATUS = {
  open:        { label: 'Ny',       bg: 'bg-white',     text: 'text-gray-600',   border: 'border-gray-200' },
  in_progress: { label: 'Pågående', bg: 'bg-white',     text: 'text-blue-600',   border: 'border-blue-200' },
  completed:   { label: 'Fullført', bg: 'bg-green-100', text: 'text-green-700',  border: 'border-green-300' },
  needs_review:{ label: 'Vurderes', bg: 'bg-white',     text: 'text-orange-600', border: 'border-orange-200' },
}

function TaskItem({ task, members = [], inputDocs = [], subtasks = [], onToggle, onDelete, onPriorityChange, onStatusChange, onEdit, onEditSubtask, mergeMode, mergeSelected, onMergeToggle }) {
  const [expanded, setExpanded] = useState(true)
  const isOverdue = task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
  const needsReview = task.status === 'needs_review'
  const pri = PRIORITY[task.priority]
  const isSelected = mergeSelected?.includes(task.id)

  const hasSubtasks = subtasks.length > 0

  return (
    <div>
      <div onClick={mergeMode ? () => onMergeToggle(task.id) : onEdit}
        className={`flex items-center gap-3 p-3 border rounded-lg transition-colors cursor-pointer ${
          mergeMode && isSelected ? 'border-primary-400 bg-primary-50' :
          task.status === 'completed' ? 'border-gray-100 opacity-60 hover:border-primary-200 hover:bg-primary-50' :
          needsReview ? 'border-orange-200 bg-orange-50 hover:border-orange-300' :
          'border-gray-100 hover:border-primary-200 hover:bg-primary-50'
        }`}>
        {mergeMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onMergeToggle(task.id)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 accent-primary-500 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {task.title}
            </p>
            {needsReview && (
              <span className="shrink-0 text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 rounded px-1.5 py-0.5">
                Må vurderes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.due_date && (
              <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                {isOverdue ? '⚠ ' : ''}Frist: {new Date(task.due_date).toLocaleDateString('nb-NO')}
              </p>
            )}
            {task.created_at && (
              <p className="text-xs text-gray-300">
                Opprettet: {new Date(task.created_at).toLocaleDateString('nb-NO')}
              </p>
            )}
            {task.source_input_ids?.length > 0 && inputDocs.length > 0 && (() => {
              const titles = task.source_input_ids.map(id => inputDocs.find(d => d.id === id)?.title).filter(Boolean)
              return titles.length > 0 ? (
                <p className="text-xs text-blue-400">
                  Kilde: {titles.join(', ')}
                </p>
              ) : null
            })()}

            {task.owner_id && (() => {
              const m = members.find(m => m.user_id === task.owner_id)
              const name = m?.users?.name
              return name ? <span className="text-xs text-gray-500 font-medium">Ansvarlig: {name}</span> : null
            })()}
            {task.status === 'completed' && task.completed_at && (() => {
              const who = task.completed_by ? members.find(m => m.user_id === task.completed_by)?.users?.name : null
              return (
                <span className="text-xs text-gray-400">
                  Ferdig {who ? `av ${who} ` : ''}{new Date(task.completed_at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )
            })()}
          </div>
        </div>
        {hasSubtasks && !mergeMode && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            className="flex items-center gap-1 shrink-0 text-xs font-semibold bg-primary-50 text-primary-600 border border-primary-200 rounded-md px-2 py-0.5 hover:bg-primary-100 transition-colors"
            title={expanded ? 'Skjul underoppgaver' : 'Vis underoppgaver'}
          >
            {expanded ? '▾' : '▸'} {subtasks.length} underoppgave{subtasks.length !== 1 ? 'r' : ''}
          </button>
        )}
        {!mergeMode && (() => {
          const statusVal = ['open', 'in_progress', 'completed'].includes(task.status) ? task.status : 'open'
          const st = STATUS[statusVal]
          return (
            <select
              value={statusVal}
              onChange={e => { e.stopPropagation(); onStatusChange(task, e.target.value) }}
              onClick={e => e.stopPropagation()}
              className={`text-xs rounded-md px-1.5 py-0.5 border font-medium cursor-pointer focus:outline-none ${st.bg} ${st.text} ${st.border}`}
            >
              <option value="open">Ny</option>
              <option value="in_progress">Pågående</option>
              <option value="completed">Fullført</option>
            </select>
          )
        })()}
        {!mergeMode && (
          <select
            value={task.priority ?? ''}
            onChange={e => { e.stopPropagation(); onPriorityChange(task, e.target.value) }}
            onClick={e => e.stopPropagation()}
            className={`text-xs rounded-md px-1.5 py-0.5 border font-medium cursor-pointer focus:outline-none ${pri ? `${pri.bg} ${pri.text} ${pri.border}` : 'bg-gray-50 text-gray-400 border-gray-200'}`}
          >
            <option value="">–</option>
            <option value="high">Høy</option>
            <option value="medium">Medium</option>
            <option value="low">Lav</option>
          </select>
        )}
      </div>

      {/* Subtask rows */}
      {hasSubtasks && expanded && !mergeMode && (
        <div className="mt-1.5 ml-4 pl-3 border-l-2 border-primary-200 space-y-1">
          {subtasks.map(sub => {
            const subPri = PRIORITY[sub.priority]
            const subOverdue = sub.due_date && sub.status !== 'completed' && new Date(sub.due_date) < new Date()
            return (
              <div key={sub.id}
                onClick={() => onEditSubtask(sub)}
                className={`flex items-center gap-2 px-2.5 py-1.5 border rounded-lg cursor-pointer transition-colors ${sub.status === 'completed' ? 'border-gray-100 bg-gray-50 opacity-60 hover:border-primary-100' : 'border-primary-100 bg-primary-50/50 hover:border-primary-300 hover:bg-primary-50'}`}>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs ${sub.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{sub.title}</span>
                </div>
                {sub.due_date && (
                  <span className={`text-xs shrink-0 ${subOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                    {subOverdue ? '⚠ ' : ''}{new Date(sub.due_date).toLocaleDateString('nb-NO')}
                  </span>
                )}
                {subPri && (
                  <span className={`text-xs rounded px-1.5 py-0.5 border font-medium shrink-0 ${subPri.bg} ${subPri.text} ${subPri.border}`}>{subPri.label}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

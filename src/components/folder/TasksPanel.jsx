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

export default function TasksPanel({ folderId, folderName }) {
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
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    if (task.google_tasks_id && task.google_tasklist_id) {
      try {
        await api.tasks.updateItem(activeUser.id, task.google_tasklist_id, task.google_tasks_id, {
          status: newStatus === 'completed' ? 'completed' : 'needsAction',
          completed: newStatus === 'completed' ? new Date().toISOString() : null,
        })
      } catch {}
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  async function handlePriorityChange(task, priority) {
    await supabase.from('tasks').update({ priority }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority } : t))
  }

  async function handleDelete(task) {
    await supabase.from('tasks').delete().eq('id', task.id)
    if (task.google_tasks_id && task.google_tasklist_id) {
      try { await api.tasks.deleteItem(activeUser.id, task.google_tasklist_id, task.google_tasks_id) } catch {}
    }
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  async function handleEditSave(id, fields) {
    await supabase.from('tasks').update(fields).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
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
      const unsynced = tasks.filter(t => !t.google_tasks_id)
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
      for (const { id, priority } of data.priorities) {
        await supabase.from('tasks').update({ priority }).eq('id', id)
      }
      await loadTasks()
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

  const open      = tasks.filter(t => t.status === 'open')
  const completed = tasks.filter(t => t.status === 'completed')

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

  function renderByPriority() {
    const sorted = sortByPriorityThenDue(open)
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
                {items.map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} onPriorityChange={handlePriorityChange} onEdit={() => setEditingTask(t)} />)}
              </div>
            </div>
          )
        })}
        {completed.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completed.length})</p>
            <div className="space-y-2">
              {completed.map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} onPriorityChange={handlePriorityChange} onEdit={() => setEditingTask(t)} />)}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderByGroup() {
    const grouped = {}
    const ungrouped = []
    for (const t of open) {
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
        {entries.map(([name, items]) => (
          <div key={name}>
            <p className="text-base font-bold text-gray-600 uppercase tracking-wide mb-2">{name} ({items.length})</p>
            <div className="space-y-2">
              {sortByPriorityThenDue(items).map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} onPriorityChange={handlePriorityChange} onEdit={() => setEditingTask(t)} />)}
            </div>
          </div>
        ))}
        {completed.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completed.length})</p>
            <div className="space-y-2">
              {completed.map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} onPriorityChange={handlePriorityChange} onEdit={() => setEditingTask(t)} />)}
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
          <button onClick={handleAssessPriority} disabled={assessing || open.length === 0}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors">
            {assessing ? '🤖 Kaia vurderer...' : '🤖 Kaia: Vurder prioritet'}
          </button>
          <button onClick={handleCleanup} disabled={cleaning || open.length < 2}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-40 transition-colors">
            {cleaning ? '🤖 Kaia analyserer...' : '🤖 Kaia: Rydd og grupper'}
          </button>
          {activeUser.google_account_email && (
            <button onClick={handleSync} disabled={syncing}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
              {syncing ? 'Synkroniserer...' : '↻ Sync'}
            </button>
          )}
          <button onClick={() => setShowForm(f => !f)}
            className="text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition-colors">
            + Ny oppgave
          </button>
        </div>
      </div>

      {showForm && (
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
        {tasks.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen oppgaver ennå</p>
        )}
        {sortBy === 'priority' ? renderByPriority() : renderByGroup()}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleEditSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

function TaskEditModal({ task, onClose, onSave, onDelete }) {
  const [title, setTitle]       = useState(task.title)
  const [dueDate, setDueDate]   = useState(task.due_date ?? '')
  const [priority, setPriority] = useState(task.priority ?? '')
  const [saving, setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave(task.id, { title: title.trim(), due_date: dueDate || null, priority: priority || null })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Rediger oppgave</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tittel</label>
            <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
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
        </div>
        <div className="flex items-center gap-2 pt-2">
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="text-sm text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-2 transition-colors">
              Slett
            </button>
          ) : (
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

function TaskItem({ task, onToggle, onDelete, onPriorityChange, onEdit }) {
  const isOverdue = task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
  const pri = PRIORITY[task.priority]
  return (
    <div onClick={onEdit}
      className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-primary-200 hover:bg-primary-50 group transition-colors cursor-pointer">
      <input type="checkbox" checked={task.status === 'completed'} onChange={() => onToggle(task)}
        onClick={e => e.stopPropagation()}
        className="w-4 h-4 accent-primary-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.due_date && (
            <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
              {isOverdue ? '⚠ ' : ''}Frist: {new Date(task.due_date).toLocaleDateString('nb-NO')}
            </p>
          )}
          {task.ai_suggested && <span className="text-xs text-purple-400">Kaia-foreslått</span>}
        </div>
      </div>
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
    </div>
  )
}

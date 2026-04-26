import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useUser } from '../../context/UserContext'

export default function TasksPanel({ folderId, folderName }) {
  const { activeUser } = useUser()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [syncing, setSyncing] = useState(false)

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
    // Finn eksisterende tasklist-ID fra tasks-tabellen
    const existing = tasks.find(t => t.google_tasklist_id)
    if (existing) return existing.google_tasklist_id

    // Ingen ennå — opprett i Google Tasks
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
        } catch { /* Google Tasks utilgjengelig — lagre kun lokalt */ }
      }

      const { data } = await supabase.from('tasks').insert({
        folder_id: folderId,
        title: newTitle.trim(),
        due_date: newDue || null,
        google_tasks_id: googleTasksId,
        google_tasklist_id: googleTasklistId,
        status: 'open',
        ai_suggested: false,
      }).select().single()

      setTasks(prev => [...prev, data])
      setNewTitle('')
      setNewDue('')
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

  async function handleDelete(task) {
    await supabase.from('tasks').delete().eq('id', task.id)
    if (task.google_tasks_id && task.google_tasklist_id) {
      try { await api.tasks.deleteItem(activeUser.id, task.google_tasklist_id, task.google_tasks_id) } catch {}
    }
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const listId = tasks.find(t => t.google_tasklist_id)?.google_tasklist_id
      if (!listId) return
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

  const open      = tasks.filter(t => t.status === 'open')
  const proposed  = tasks.filter(t => t.ai_suggested && t.status === 'open')
  const completed = tasks.filter(t => t.status === 'completed')

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laster oppgaver...</div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-700">Oppgaver</h3>
        <div className="flex gap-2">
          {tasks.some(t => t.google_tasklist_id) && (
            <button onClick={handleSync} disabled={syncing}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 transition-colors">
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

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {tasks.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen oppgaver ennå</p>
        )}

        {open.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Åpne ({open.length})</p>
            <div className="space-y-2">
              {open.map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />)}
            </div>
          </div>
        )}

        {completed.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fullført ({completed.length})</p>
            <div className="space-y-2">
              {completed.map(t => <TaskItem key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TaskItem({ task, onToggle, onDelete }) {
  const isOverdue = task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
  return (
    <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-200 group transition-colors">
      <input type="checkbox" checked={task.status === 'completed'} onChange={() => onToggle(task)}
        className="w-4 h-4 accent-primary-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        {task.due_date && (
          <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
            {isOverdue ? '⚠ ' : ''}Frist: {new Date(task.due_date).toLocaleDateString('nb-NO')}
          </p>
        )}
        {task.ai_suggested && <span className="text-xs text-purple-400">AI-foreslått</span>}
      </div>
      <button onClick={() => onDelete(task)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity">
        ✕
      </button>
    </div>
  )
}

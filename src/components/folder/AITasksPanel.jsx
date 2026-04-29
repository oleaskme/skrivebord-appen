import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORAGE_KEY = (folderId) => `ai_tasks_executed_${folderId}`

function loadExecuted(folderId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(folderId)) || '[]') } catch { return [] }
}

function saveExecuted(folderId, executed) {
  localStorage.setItem(STORAGE_KEY(folderId), JSON.stringify(executed))
}

function buildActions(masters, openTaskCount, openRiskCount) {
  const actions = []
  for (const master of masters) {
    actions.push({
      id: `review_${master.id}`,
      title: `Gjennomgå «${master.name}»`,
      description: 'Les master-dokumentet og legg til nye oppgaver og risikoer som ikke allerede er registrert.',
      category: 'Dokumentanalyse',
      type: 'review',
      params: { masterDocId: master.id },
    })
  }
  if (openTaskCount >= 1) {
    actions.push({
      id: 'assess_priority',
      title: `Vurder prioritet på ${openTaskCount} åpne oppgave${openTaskCount !== 1 ? 'r' : ''}`,
      description: 'AI vurderer hvilke oppgaver som haster mest basert på tittel og frister.',
      category: 'Oppgaver',
      type: 'assess_priority',
      params: {},
    })
  }
  if (openTaskCount >= 3) {
    actions.push({
      id: 'cleanup_tasks',
      title: `Rydd og grupper ${openTaskCount} oppgaver`,
      description: 'Slår sammen dubletter og grupperer oppgavene i logiske kategorier.',
      category: 'Oppgaver',
      type: 'cleanup',
      params: { itemType: 'tasks' },
    })
  }
  if (openRiskCount >= 3) {
    actions.push({
      id: 'cleanup_risks',
      title: `Rydd og grupper ${openRiskCount} risikoer`,
      description: 'Slår sammen dubletter og grupperer risikoene i logiske kategorier.',
      category: 'Risikoer',
      type: 'cleanup',
      params: { itemType: 'risks' },
    })
  }
  return actions
}

async function executeAction(folderId, action) {
  const { type, params } = action

  if (type === 'review') {
    const res = await fetch('/api/ai/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, mode: 'review', masterDocId: params.masterDocId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    const tasks = data.suggested_tasks ?? []
    const risks = data.suggested_risks ?? []
    if (tasks.length > 0) {
      await supabase.from('tasks').insert(
        tasks.map(t => ({ folder_id: folderId, title: t.title, due_date: t.due_date ?? null, ai_suggested: true }))
      )
    }
    if (risks.length > 0) {
      await supabase.from('risks').insert(
        risks.map(r => ({ folder_id: folderId, title: r.title, severity: r.severity ?? 'medium', source_type: 'master', source_id: params.masterDocId, status: 'confirmed' }))
      )
    }
    return `La til ${tasks.length} oppgave${tasks.length !== 1 ? 'r' : ''} og ${risks.length} risiko${risks.length !== 1 ? 'er' : ''}.`
  }

  if (type === 'assess_priority') {
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
    return `Satte prioritet på ${data.priorities.length} oppgave${data.priorities.length !== 1 ? 'r' : ''}.`
  }

  if (type === 'cleanup') {
    const { itemType } = params
    const res = await fetch('/api/ai/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, mode: 'cleanup', itemType }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    const table = itemType === 'tasks' ? 'tasks' : 'risks'
    for (const group of (data.groups ?? [])) {
      for (const id of group.itemIds) {
        await supabase.from(table).update({ group_name: group.name }).eq('id', id)
      }
    }
    for (const merge of (data.merges ?? [])) {
      const [keepId, ...deleteIds] = merge.ids
      await supabase.from(table).update({ title: merge.suggestedTitle }).eq('id', keepId)
      if (deleteIds.length) await supabase.from(table).delete().in('id', deleteIds)
    }
    const g = data.groups?.length ?? 0
    const m = data.merges?.length ?? 0
    return `Opprettet ${g} gruppe${g !== 1 ? 'r' : ''} og slo sammen ${m} duplikat${m !== 1 ? 'er' : ''}.`
  }

  throw new Error('Ukjent handlingstype')
}

export default function AITasksPanel({ folderId }) {
  const [actions, setActions]     = useState([])
  const [selected, setSelected]   = useState(new Set())
  const [loading, setLoading]     = useState(true)
  const [executing, setExecuting] = useState(false)
  const [progress, setProgress]   = useState(null)
  const [executed, setExecuted]   = useState(() => loadExecuted(folderId))

  useEffect(() => { loadActions() }, [folderId])

  async function loadActions() {
    setLoading(true)
    try {
      const [mastersRes, tasksRes, risksRes] = await Promise.all([
        supabase.from('master_documents').select('id, name').eq('folder_id', folderId),
        supabase.from('tasks').select('id').eq('folder_id', folderId).neq('status', 'completed'),
        supabase.from('risks').select('id').eq('folder_id', folderId).neq('status', 'dismissed'),
      ])
      const built = buildActions(
        mastersRes.data ?? [],
        (tasksRes.data ?? []).length,
        (risksRes.data ?? []).length,
      )
      setActions(built)
      setSelected(new Set(built.map(a => a.id)))
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === actions.length ? new Set() : new Set(actions.map(a => a.id)))
  }

  async function handleApprove() {
    const toRun = actions.filter(a => selected.has(a.id))
    if (!toRun.length) return
    setExecuting(true)
    const newExecuted = []
    for (let i = 0; i < toRun.length; i++) {
      const action = toRun[i]
      setProgress({ current: i + 1, total: toRun.length, label: action.title })
      try {
        const result = await executeAction(folderId, action)
        newExecuted.push({ ...action, executedAt: new Date().toISOString(), result, error: null })
      } catch (err) {
        newExecuted.push({ ...action, executedAt: new Date().toISOString(), result: null, error: err.message })
      }
    }
    const updated = [...executed, ...newExecuted]
    setExecuted(updated)
    saveExecuted(folderId, updated)
    setExecuting(false)
    setProgress(null)
    await loadActions()
  }

  const selectedCount = actions.filter(a => selected.has(a.id)).length
  const grouped = actions.reduce((acc, a) => {
    ;(acc[a.category] ??= []).push(a)
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">AI oppgaver</h3>
          <p className="text-xs text-gray-400 mt-0.5">Velg oppgaver og godkjenn for å utføre</p>
        </div>
        <button
          onClick={loadActions}
          disabled={loading || executing}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
          title="Oppdater forslag"
        >
          ↻ Oppdater
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Suggested actions */}
        <div className="px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 flex-col gap-2 text-gray-300">
              <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />
              <p className="text-xs">Laster forslag...</p>
            </div>
          ) : actions.length === 0 ? (
            <div className="flex items-center justify-center py-10 flex-col gap-2 text-gray-300">
              <div className="text-3xl">✅</div>
              <p className="text-sm">Ingen AI-oppgaver tilgjengelig nå</p>
              <p className="text-xs text-gray-400">Legg til dokumenter og oppgaver for å få forslag</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="select-all-ai"
                  checked={selected.size === actions.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded accent-primary-500"
                />
                <label htmlFor="select-all-ai" className="text-xs text-gray-500 cursor-pointer select-none">
                  Velg alle ({actions.length})
                </label>
              </div>

              {Object.entries(grouped).map(([category, catActions]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{category}</p>
                  <div className="space-y-2">
                    {catActions.map(action => (
                      <label
                        key={action.id}
                        className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selected.has(action.id)
                            ? 'border-primary-200 bg-primary-50'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(action.id)}
                          onChange={() => toggleSelect(action.id)}
                          className="w-4 h-4 mt-0.5 rounded accent-primary-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 leading-snug">{action.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-snug">{action.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Executed history */}
        {executed.length > 0 && (
          <div className="px-4 pb-4">
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Utført</p>
                <button
                  onClick={() => {
                    setExecuted([])
                    saveExecuted(folderId, [])
                  }}
                  className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
                >
                  Tøm
                </button>
              </div>
              <div className="space-y-2">
                {[...executed].reverse().map((item, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border ${item.error ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-700 leading-snug">{item.title}</p>
                      <span className="shrink-0 text-base">{item.error ? '❌' : '✅'}</span>
                    </div>
                    {item.result && <p className="text-xs text-gray-500 mt-1">{item.result}</p>}
                    {item.error && <p className="text-xs text-red-500 mt-1">{item.error}</p>}
                    <p className="text-xs text-gray-300 mt-1">
                      {new Date(item.executedAt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && actions.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
          {progress && (
            <p className="text-xs text-gray-400 mb-2 truncate">
              Utfører {progress.current}/{progress.total}: {progress.label}…
            </p>
          )}
          <button
            onClick={handleApprove}
            disabled={executing || selectedCount === 0}
            className="w-full bg-primary-500 text-white text-sm font-semibold rounded-xl py-2.5 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {executing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Utfører…
              </span>
            ) : selectedCount === 0 ? (
              'Velg minst én oppgave'
            ) : (
              `Godkjenn og utfør ${selectedCount} oppgave${selectedCount !== 1 ? 'r' : ''}`
            )}
          </button>
        </div>
      )}
    </div>
  )
}

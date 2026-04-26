import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SEVERITY_STYLES = {
  high:   { label: 'Høy',     cls: 'bg-red-100 text-red-700' },
  medium: { label: 'Middels', cls: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Lav',     cls: 'bg-gray-100 text-gray-500' },
}

function KPIBox({ title, children, loading, empty }) {
  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden min-w-0">
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading
          ? <p className="text-xs text-gray-300 py-2">Laster...</p>
          : empty
            ? <p className="text-xs text-gray-300 py-2 text-center">{empty}</p>
            : children}
      </div>
    </div>
  )
}

function TasksList({ userId }) {
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: folders } = await supabase
        .from('folders').select('id').eq('user_id', userId)
      if (!folders?.length) { setLoading(false); return }

      const { data } = await supabase
        .from('tasks')
        .select('*, folders(name)')
        .in('folder_id', folders.map(f => f.id))
        .eq('status', 'open')
        .order('due_date', { ascending: true, nullsFirst: false })
      setTasks(data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  return (
    <KPIBox title="Åpne oppgaver" loading={loading} empty={tasks.length === 0 ? 'Ingen åpne oppgaver' : null}>
      <div className="space-y-1.5">
        {tasks.map(t => {
          const overdue = t.due_date && new Date(t.due_date) < new Date()
          return (
            <div key={t.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate leading-snug">{t.title}</p>
                <p className="text-xs text-gray-400 truncate">{t.folders?.name ?? '—'}</p>
              </div>
              {t.due_date && (
                <span className={`text-xs shrink-0 font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                  {overdue ? '⚠ ' : ''}{new Date(t.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </KPIBox>
  )
}

function RisksList({ userId }) {
  const [risks, setRisks]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: folders } = await supabase
        .from('folders').select('id').eq('user_id', userId)
      if (!folders?.length) { setLoading(false); return }

      const { data } = await supabase
        .from('risks')
        .select('*, folders(name)')
        .in('folder_id', folders.map(f => f.id))
        .neq('status', 'dismissed')
        .order('identified_at', { ascending: false })
      setRisks(data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  return (
    <KPIBox title="Risikoer" loading={loading} empty={risks.length === 0 ? 'Ingen aktive risikoer' : null}>
      <div className="space-y-1.5">
        {risks.map(r => {
          const sev = SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.low
          return (
            <div key={r.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate leading-snug">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">{r.folders?.name ?? '—'}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${sev.cls}`}>
                {sev.label}
              </span>
            </div>
          )
        })}
      </div>
    </KPIBox>
  )
}

export default function KPIPanel({ userId }) {
  return (
    <div className="h-full flex gap-3">
      {/* KPI-placeholder */}
      <KPIBox title="KPI">
        <div className="h-full flex items-center justify-center text-center text-gray-300">
          <div>
            <div className="text-3xl mb-1">📊</div>
            <p className="text-xs">Defineres i neste iterasjon</p>
          </div>
        </div>
      </KPIBox>

      <TasksList userId={userId} />
      <RisksList userId={userId} />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SEVERITY_STYLES = {
  high:   { label: 'Høy',     cls: 'bg-red-100 text-red-700' },
  medium: { label: 'Middels', cls: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Lav',     cls: 'bg-gray-100 text-gray-600' },
}

function RiskList({ userId }) {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: folderIds } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', userId)

      if (!folderIds?.length) { setLoading(false); return }

      const ids = folderIds.map(f => f.id)
      const { data } = await supabase
        .from('risks')
        .select('*, folders(name)')
        .in('folder_id', ids)
        .neq('status', 'dismissed')
        .order('identified_at', { ascending: false })

      setRisks(data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) return <p className="text-xs text-gray-400 py-2">Laster risikoer...</p>

  if (risks.length === 0) {
    return <p className="text-xs text-gray-400 py-2 text-center">Ingen aktive risikoer</p>
  }

  return (
    <div className="space-y-2 overflow-y-auto flex-1">
      {risks.map(r => {
        const sev = SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.low
        return (
          <div key={r.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{r.title}</p>
              <p className="text-xs text-gray-400 truncate">{r.folders?.name ?? '—'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${sev.cls}`}>
              {sev.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function KPIPanel({ userId }) {
  return (
    <div className="h-full flex gap-6">
      {/* Venstre: KPI-placeholder */}
      <div className="flex-1 flex items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          <p className="font-medium text-gray-500 text-sm">KPI-panel</p>
          <p className="text-xs mt-1 text-gray-400">Innhold defineres i neste iterasjon</p>
        </div>
      </div>

      {/* Høyre: Risikooversikt */}
      <div className="w-80 flex flex-col shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Risikoer på tvers av mapper
        </h3>
        <RiskList userId={userId} />
      </div>
    </div>
  )
}

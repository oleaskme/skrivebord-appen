import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function KPIBox({ title, children, loading, empty }) {
  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden min-w-0">
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading
          ? <p className="text-xs text-gray-300 py-2 px-3">Laster...</p>
          : empty
            ? <p className="text-xs text-gray-300 py-4 text-center">{empty}</p>
            : children}
      </div>
    </div>
  )
}

function TasksTable({ userId }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: folders } = await supabase
        .from('folders').select('id, name').eq('user_id', userId)
      if (!folders?.length) { setLoading(false); return }

      const { data } = await supabase
        .from('tasks')
        .select('folder_id, priority')
        .in('folder_id', folders.map(f => f.id))
        .eq('status', 'open')

      const folderMap = Object.fromEntries(folders.map(f => [f.id, f.name]))
      const agg = {}
      for (const t of (data ?? [])) {
        if (!agg[t.folder_id]) agg[t.folder_id] = { name: folderMap[t.folder_id], high: 0, medium: 0, low: 0 }
        const p = t.priority ?? 'low'
        if (p in agg[t.folder_id]) agg[t.folder_id][p]++
      }

      setRows(Object.values(agg).filter(r => r.high + r.medium + r.low > 0))
      setLoading(false)
    }
    load()
  }, [userId])

  return (
    <KPIBox title="Åpne oppgaver" loading={loading} empty={rows.length === 0 ? 'Ingen åpne oppgaver' : null}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Mappe</th>
            <th className="px-2 py-1.5 text-red-400 font-medium text-center">Høy</th>
            <th className="px-2 py-1.5 text-yellow-500 font-medium text-center">Medium</th>
            <th className="px-2 py-1.5 text-gray-400 font-medium text-center">Lav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-3 py-1.5 text-gray-700 truncate max-w-0" style={{ maxWidth: 1 }}>
                <span className="block truncate">{r.name}</span>
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.high > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{r.high}</span>}
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.medium > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">{r.medium}</span>}
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.low > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold">{r.low}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </KPIBox>
  )
}

function RisksTable({ userId }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: folders } = await supabase
        .from('folders').select('id, name').eq('user_id', userId)
      if (!folders?.length) { setLoading(false); return }

      const { data } = await supabase
        .from('risks')
        .select('folder_id, severity')
        .in('folder_id', folders.map(f => f.id))
        .neq('status', 'dismissed')

      const folderMap = Object.fromEntries(folders.map(f => [f.id, f.name]))
      const agg = {}
      for (const r of (data ?? [])) {
        if (!agg[r.folder_id]) agg[r.folder_id] = { name: folderMap[r.folder_id], high: 0, medium: 0, low: 0 }
        const s = r.severity ?? 'low'
        if (s in agg[r.folder_id]) agg[r.folder_id][s]++
      }

      setRows(Object.values(agg).filter(r => r.high + r.medium + r.low > 0))
      setLoading(false)
    }
    load()
  }, [userId])

  return (
    <KPIBox title="Risikoer" loading={loading} empty={rows.length === 0 ? 'Ingen aktive risikoer' : null}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Mappe</th>
            <th className="px-2 py-1.5 text-red-400 font-medium text-center">Høy</th>
            <th className="px-2 py-1.5 text-yellow-500 font-medium text-center">Medium</th>
            <th className="px-2 py-1.5 text-gray-400 font-medium text-center">Lav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-3 py-1.5 text-gray-700 truncate max-w-0" style={{ maxWidth: 1 }}>
                <span className="block truncate">{r.name}</span>
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.high > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{r.high}</span>}
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.medium > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">{r.medium}</span>}
              </td>
              <td className="px-2 py-1.5 text-center">
                {r.low > 0 && <span className="inline-block min-w-[20px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold">{r.low}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </KPIBox>
  )
}

export default function KPIPanel({ userId }) {
  return (
    <div className="h-full flex gap-3">
      <KPIBox title="KPI">
        <div className="h-full flex items-center justify-center text-center text-gray-300">
          <div>
            <div className="text-3xl mb-1">📊</div>
            <p className="text-xs">Defineres i neste iterasjon</p>
          </div>
        </div>
      </KPIBox>

      <TasksTable userId={userId} />
      <RisksTable userId={userId} />
    </div>
  )
}

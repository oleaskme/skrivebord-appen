import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SEVERITY_LABEL = { high: 'Høy', medium: 'Middels', low: 'Lav' }
const SEVERITY_COLOR = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-green-100 text-green-700',
}

export default function InputDocDetailModal({ doc, onClose }) {
  const [tasks, setTasks] = useState([])
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(doc.processing_summary ?? null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [tasksRes, risksRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, due_date, priority').contains('source_input_ids', [doc.id]),
        supabase.from('risks').select('id, title, severity, status').contains('source_input_ids', [doc.id]),
      ])
      const loadedTasks = tasksRes.data ?? []
      const loadedRisks = risksRes.data ?? []
      setTasks(loadedTasks)
      setRisks(loadedRisks)
      setLoading(false)

      if (!doc.processing_summary) {
        setSummaryLoading(true)
        try {
          const res = await fetch('/api/ai/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'summarize_input',
              inputDocId: doc.id,
              tasks: loadedTasks,
              risks: loadedRisks,
            }),
          })
          const data = await res.json()
          if (data.summary) setSummary({ summary: data.summary, retroactive: true })
        } finally {
          setSummaryLoading(false)
        }
      }
    }
    load()
  }, [doc.id])

  const processedDate = doc.processed_at
    ? new Date(doc.processed_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="font-bold text-gray-800 truncate">{doc.title}</h2>
            {processedDate && summary?.master_name && (
              <p className="text-xs text-gray-400 mt-0.5">
                Analysert {processedDate} · {summary.master_name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Laster...</p>
          ) : (
            <>
              {/* Oppsummering */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Hva bidro dokumentet med</h3>
                {summaryLoading ? (
                  <p className="text-xs text-gray-400 italic animate-pulse px-4 py-3 bg-gray-50 rounded-xl">Kaia genererer oppsummering...</p>
                ) : summary?.summary ? (
                  <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl px-4 py-3">
                    {summary.summary}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Ingen oppsummering tilgjengelig.</p>
                )}
              </section>

              {/* Oppgaver */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Oppgaver lagt til ({tasks.length})
                </h3>
                {tasks.length === 0 ? (
                  <p className="text-xs text-gray-400">Ingen oppgaver ble lagt til fra dette dokumentet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasks.map(t => (
                      <li key={t.id} className="flex items-start gap-2.5 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                        <span className={`mt-0.5 text-base leading-none ${t.status === 'completed' ? 'text-green-500' : 'text-gray-300'}`}>
                          {t.status === 'completed' ? '✓' : '○'}
                        </span>
                        <span className={t.status === 'completed' ? 'line-through text-gray-400' : ''}>{t.title}</span>
                        {t.due_date && (
                          <span className="ml-auto text-xs text-gray-400 shrink-0">
                            {new Date(t.due_date).toLocaleDateString('nb-NO')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Risikoer */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Risikoer identifisert ({risks.length})
                </h3>
                {risks.length === 0 ? (
                  <p className="text-xs text-gray-400">Ingen risikoer ble identifisert fra dette dokumentet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {risks.map(r => (
                      <li key={r.id} className="flex items-center gap-2.5 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${SEVERITY_COLOR[r.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {SEVERITY_LABEL[r.severity] ?? r.severity}
                        </span>
                        <span className={r.status === 'closed' ? 'line-through text-gray-400' : ''}>{r.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-50 transition-colors text-sm"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  )
}

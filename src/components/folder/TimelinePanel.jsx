import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

function shortLabel(title) {
  const words = (title ?? '').trim().split(/\s+/)
  return '* ' + words.slice(0, 4).join(' ')
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TimelinePanel({ folderId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('folder_id', folderId)
        .not('due_date', 'is', null)
        .in('status', ['open', 'needs_review'])
        .order('due_date', { ascending: true })
      setTasks(data ?? [])
      setLoading(false)
    }
    load()
  }, [folderId])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-300">
        <span className="text-sm">Laster tidslinje…</span>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 text-gray-300">
        <div className="text-4xl">📅</div>
        <p className="text-sm">Ingen åpne oppgaver med frist</p>
      </div>
    )
  }

  // Layout constants
  const PAD_LEFT = 40
  const PAD_RIGHT = 60
  const LINE_Y = 160
  const STEM_LEN = 60
  const LABEL_LINES = 3 // lines above/below stem
  const LABEL_LINE_H = 16
  const SVG_HEIGHT = LINE_Y + STEM_LEN + LABEL_LINES * LABEL_LINE_H + 32
  const ABOVE_HEIGHT = LINE_Y - STEM_LEN - LABEL_LINES * LABEL_LINE_H

  const usableWidth = width - PAD_LEFT - PAD_RIGHT

  const dates = tasks.map(t => new Date(t.due_date).getTime())
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  const span = maxDate - minDate || 1

  function xPos(dateStr) {
    const t = new Date(dateStr).getTime()
    return PAD_LEFT + ((t - minDate) / span) * usableWidth
  }

  const today = Date.now()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-700 text-sm">Tidslinje — åpne oppgaver med frist</h3>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-auto px-4 py-4">
        <div ref={containerRef} style={{ minWidth: Math.max(tasks.length * 120, 600) }}>
          <svg
            width="100%"
            height={SVG_HEIGHT}
            viewBox={`0 0 ${Math.max(width, tasks.length * 120)} ${SVG_HEIGHT}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Horisontal linje */}
            <line
              x1={PAD_LEFT} y1={LINE_Y}
              x2={PAD_LEFT + usableWidth + 20} y2={LINE_Y}
              stroke="#94a3b8" strokeWidth="2"
            />
            {/* Pil */}
            <polygon
              points={`${PAD_LEFT + usableWidth + 20},${LINE_Y - 6} ${PAD_LEFT + usableWidth + 36},${LINE_Y} ${PAD_LEFT + usableWidth + 20},${LINE_Y + 6}`}
              fill="#94a3b8"
            />

            {/* Today-markør */}
            {today >= minDate && today <= maxDate && (() => {
              const tx = PAD_LEFT + ((today - minDate) / span) * usableWidth
              return (
                <g key="today">
                  <line x1={tx} y1={LINE_Y - 8} x2={tx} y2={LINE_Y + 8} stroke="#6366f1" strokeWidth="2" strokeDasharray="4 2" />
                  <text x={tx} y={LINE_Y - 12} textAnchor="middle" fontSize="10" fill="#6366f1" fontWeight="600">i dag</text>
                </g>
              )
            })()}

            {tasks.map((task, i) => {
              const x = xPos(task.due_date)
              const above = i % 2 === 0
              const isOverdue = new Date(task.due_date).getTime() < today
              const dotColor = isOverdue ? '#ef4444' : '#3b82f6'
              const label = shortLabel(task.title)
              const dateLabel = formatDate(task.due_date)

              // Split label into two lines if long
              const words = label.split(' ')
              const line1 = words.slice(0, 3).join(' ')
              const line2 = words.slice(3).join(' ')

              if (above) {
                // stem goes up from line
                const stemTop = LINE_Y - STEM_LEN
                const labelBaseY = stemTop - 8
                return (
                  <g key={task.id}>
                    <line x1={x} y1={LINE_Y - 10} x2={x} y2={stemTop} stroke="#94a3b8" strokeWidth="1.5" />
                    <circle cx={x} cy={LINE_Y} r={8} fill={dotColor} />
                    <text x={x} y={LINE_Y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
                      {String(i + 1).padStart(2, '0')}
                    </text>
                    <text x={x} y={labelBaseY} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{line1}</text>
                    {line2 && <text x={x} y={labelBaseY - 14} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{line2}</text>}
                    <text x={x} y={labelBaseY + 14} textAnchor="middle" fontSize="10" fill={isOverdue ? '#ef4444' : '#64748b'}>{dateLabel}</text>
                  </g>
                )
              } else {
                // stem goes down from line
                const stemBot = LINE_Y + STEM_LEN
                const labelBaseY = stemBot + 16
                return (
                  <g key={task.id}>
                    <line x1={x} y1={LINE_Y + 10} x2={x} y2={stemBot} stroke="#94a3b8" strokeWidth="1.5" />
                    <circle cx={x} cy={LINE_Y} r={8} fill={dotColor} />
                    <text x={x} y={LINE_Y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
                      {String(i + 1).padStart(2, '0')}
                    </text>
                    <text x={x} y={labelBaseY} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{line1}</text>
                    {line2 && <text x={x} y={labelBaseY + 14} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{line2}</text>}
                    <text x={x} y={labelBaseY - 14} textAnchor="middle" fontSize="10" fill={isOverdue ? '#ef4444' : '#64748b'}>{dateLabel}</text>
                  </g>
                )
              }
            })}
          </svg>
        </div>
      </div>
      {/* Forklaringsliste */}
      <div className="shrink-0 border-t border-gray-100 px-6 py-3 flex flex-wrap gap-x-6 gap-y-1">
        {tasks.map((task, i) => {
          const isOverdue = new Date(task.due_date).getTime() < today
          return (
            <div key={task.id} className="flex items-start gap-1.5 text-xs text-gray-600 py-0.5">
              <span className={`font-bold shrink-0 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span>{task.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

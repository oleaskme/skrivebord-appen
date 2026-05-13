import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// Stem heights cycling in staircase pattern
const STEM_HEIGHTS = [48, 88, 128, 68, 108]

function shortLabel(title) {
  const words = (title ?? '').trim().split(/\s+/)
  return '* ' + words.slice(0, 4).join(' ')
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TimelinePanel({ folderId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)
  const [svgWidth, setSvgWidth] = useState(900)

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
    const ro = new ResizeObserver(entries => setSvgWidth(entries[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (loading) {
    return <div className="h-full flex items-center justify-center text-gray-300 text-sm">Laster tidslinje…</div>
  }
  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 text-gray-300">
        <div className="text-4xl">📅</div>
        <p className="text-sm">Ingen åpne oppgaver med frist</p>
      </div>
    )
  }

  const PAD_LEFT = 48
  const PAD_RIGHT = 48
  const MAX_STEM = Math.max(...STEM_HEIGHTS)
  const LINE_Y = MAX_STEM + 32          // space for labels above
  const BELOW_MAX = MAX_STEM + 32       // space for labels below
  const SVG_HEIGHT = LINE_Y + BELOW_MAX
  const CHAR_W = 7                      // approx px per char for font-size 12

  const minWidth = Math.max(svgWidth, tasks.length * 140)
  const usable = minWidth - PAD_LEFT - PAD_RIGHT

  const dates = tasks.map(t => new Date(t.due_date).getTime())
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  const span = maxDate - minDate || 1
  const today = Date.now()

  function xPos(dateStr) {
    const t = new Date(dateStr).getTime()
    return PAD_LEFT + ((t - minDate) / span) * usable
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-700 text-sm">Tidslinje — åpne oppgaver med frist</h3>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={containerRef}>
        <svg
          width={minWidth}
          height={SVG_HEIGHT}
          viewBox={`0 0 ${minWidth} ${SVG_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          {/* Horisontal linje */}
          <line x1={PAD_LEFT - 8} y1={LINE_Y} x2={minWidth - PAD_RIGHT + 12} y2={LINE_Y}
            stroke="#cbd5e1" strokeWidth="2" />
          {/* Pil */}
          <polygon
            points={`${minWidth - PAD_RIGHT + 12},${LINE_Y - 6} ${minWidth - PAD_RIGHT + 26},${LINE_Y} ${minWidth - PAD_RIGHT + 12},${LINE_Y + 6}`}
            fill="#cbd5e1"
          />

          {/* I dag-markør */}
          {today >= minDate && today <= maxDate && (() => {
            const tx = xPos(new Date().toISOString().slice(0, 10))
            return (
              <g>
                <line x1={tx} y1={LINE_Y - 12} x2={tx} y2={LINE_Y + 12}
                  stroke="#818cf8" strokeWidth="1.5" strokeDasharray="4 3" />
                <text x={tx} y={LINE_Y - 15} textAnchor="middle" fontSize="9" fill="#818cf8" fontWeight="600">i dag</text>
              </g>
            )
          })()}

          {tasks.map((task, i) => {
            const x = xPos(task.due_date)
            const above = i % 2 === 0
            const stemH = STEM_HEIGHTS[Math.floor(i / 2) % STEM_HEIGHTS.length]
            const isOverdue = new Date(task.due_date).getTime() < today
            const dotColor = isOverdue ? '#f87171' : '#60a5fa'
            const textColor = isOverdue ? '#dc2626' : '#1e40af'

            const label = `${shortLabel(task.title)} — ${formatDate(task.due_date)}`
            const labelWidth = label.length * CHAR_W
            // clamp label x so it doesn't overflow left/right
            const labelX = Math.min(Math.max(x, PAD_LEFT + labelWidth / 2), minWidth - PAD_RIGHT - labelWidth / 2)

            if (above) {
              const stemTop = LINE_Y - stemH
              return (
                <g key={task.id}>
                  <line x1={x} y1={LINE_Y - 10} x2={x} y2={stemTop}
                    stroke="#cbd5e1" strokeWidth="1.5" />
                  <circle cx={x} cy={LINE_Y} r={9} fill={dotColor} />
                  <text x={x} y={LINE_Y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
                    {String(i + 1).padStart(2, '0')}
                  </text>
                  <text x={labelX} y={stemTop - 6} textAnchor="middle" fontSize="12" fill={textColor} fontWeight="500">
                    {label}
                  </text>
                </g>
              )
            } else {
              const stemBot = LINE_Y + stemH
              return (
                <g key={task.id}>
                  <line x1={x} y1={LINE_Y + 10} x2={x} y2={stemBot}
                    stroke="#cbd5e1" strokeWidth="1.5" />
                  <circle cx={x} cy={LINE_Y} r={9} fill={dotColor} />
                  <text x={x} y={LINE_Y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
                    {String(i + 1).padStart(2, '0')}
                  </text>
                  <text x={labelX} y={stemBot + 18} textAnchor="middle" fontSize="12" fill={textColor} fontWeight="500">
                    {label}
                  </text>
                </g>
              )
            }
          })}
        </svg>
      </div>
    </div>
  )
}

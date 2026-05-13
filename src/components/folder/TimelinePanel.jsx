import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// Staircase stem heights — cycling pattern gives each task a unique level
const STEM_HEIGHTS = [56, 104, 152, 80, 128]
const FONT_SIZE = 14   // SVG font size for labels
const DOT_R = 11
const today = Date.now()

function shortTitle(title) {
  const words = (title ?? '').trim().split(/\s+/)
  return words.slice(0, 4).join(' ')
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TimelinePanel({ folderId, members = [] }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState('alle')
  const [ownerFilter, setOwnerFilter] = useState('alle')
  const containerRef = useRef(null)
  const [svgWidth, setSvgWidth] = useState(900)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, status, priority')
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

  if (loading) return (
    <div className="h-full flex items-center justify-center text-gray-300 text-sm">Laster tidslinje…</div>
  )
  if (tasks.length === 0) return (
    <div className="h-full flex items-center justify-center flex-col gap-2 text-gray-300">
      <div className="text-4xl">📅</div>
      <p className="text-sm">Ingen åpne oppgaver med frist</p>
    </div>
  )

  // Unique owners who appear in tasks with due_date
  const ownerIds = [...new Set(tasks.filter(t => t.owner_id).map(t => t.owner_id))]

  const filtered = (priorityFilter === 'alle' ? tasks
    : priorityFilter === 'high'   ? tasks.filter(t => t.priority === 'high')
    : priorityFilter === 'medium' ? tasks.filter(t => t.priority === 'medium')
    : tasks.filter(t => t.priority === 'low'))
    .filter(t => t.due_date)
    .filter(t => ownerFilter === 'alle' || t.owner_id === ownerFilter)

  const PAD_LEFT = 56
  const PAD_RIGHT = 56
  const MAX_STEM = Math.max(...STEM_HEIGHTS)
  // Reserve space above for labels, below for labels + legend
  const LINE_Y = MAX_STEM + FONT_SIZE + 48
  const BELOW_SPACE = MAX_STEM + FONT_SIZE + 24
  const SVG_HEIGHT = LINE_Y + BELOW_SPACE

  // Enough width so dots don't pile up
  const minWidth = Math.max(svgWidth, filtered.length * 160 + PAD_LEFT + PAD_RIGHT)
  const usable = minWidth - PAD_LEFT - PAD_RIGHT

  const dates = filtered.map(t => new Date(t.due_date).getTime())
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  const span = maxDate - minDate || 1

  function xPos(dateStr) {
    const t = new Date(dateStr).getTime()
    return PAD_LEFT + ((t - minDate) / span) * usable
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 shrink-0 flex items-center justify-between gap-4">
        <h3 className="font-semibold text-gray-700 text-sm">Tidslinje — åpne oppgaver med frist</h3>
        <div className="flex items-center gap-4 text-sm">
          {[['alle','Alle'],['high','Høy'],['medium','Medium'],['low','Lav']].map(([val, label]) => (
            <label key={val} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="radio"
                name="priority-filter"
                value={val}
                checked={priorityFilter === val}
                onChange={() => setPriorityFilter(val)}
                className="accent-primary-500"
              />
              <span className={`text-xs font-medium ${
                val === 'high' ? 'text-red-600' :
                val === 'medium' ? 'text-yellow-600' :
                val === 'low' ? 'text-gray-500' : 'text-gray-600'
              }`}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* SVG timeline — horizontal scroll */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
          Ingen oppgaver med valgt prioritet og frist
        </div>
      ) : null}
      <div className={`flex-1 overflow-x-auto overflow-y-hidden ${filtered.length === 0 ? 'hidden' : ''}`} ref={containerRef}>
        <svg
          width={minWidth}
          height={SVG_HEIGHT}
          viewBox={`0 0 ${minWidth} ${SVG_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          {/* Horisontal linje */}
          <line
            x1={PAD_LEFT - 10} y1={LINE_Y}
            x2={minWidth - PAD_RIGHT + 16} y2={LINE_Y}
            stroke="#94a3b8" strokeWidth="6"
          />
          <polygon
            points={`${minWidth - PAD_RIGHT + 16},${LINE_Y - 7} ${minWidth - PAD_RIGHT + 32},${LINE_Y} ${minWidth - PAD_RIGHT + 16},${LINE_Y + 7}`}
            fill="#94a3b8"
          />

          {/* I dag-markør */}
          {today >= minDate && today <= maxDate && (() => {
            const tx = xPos(new Date().toISOString().slice(0, 10))
            return (
              <g>
                <line x1={tx} y1={LINE_Y - 14} x2={tx} y2={LINE_Y + 14}
                  stroke="#818cf8" strokeWidth="2" strokeDasharray="4 3" />
                <text x={tx} y={LINE_Y - 17} textAnchor="middle" fontSize="11" fill="#818cf8" fontWeight="700">i dag</text>
              </g>
            )
          })()}

          {filtered.map((task, i) => {
            const x = xPos(task.due_date)
            const above = i % 2 === 0
            const stemH = STEM_HEIGHTS[Math.floor(i / 2) % STEM_HEIGHTS.length]
            const isOverdue = new Date(task.due_date).getTime() < today
            const dotColor = isOverdue ? '#f87171' : '#60a5fa'
            const textColor = isOverdue ? '#b91c1c' : '#1e3a8a'
            const num = String(i + 1).padStart(2, '0')
            const dateStr = formatDate(task.due_date)

            if (above) {
              const lineEnd = LINE_Y - stemH  // where the vertical line ends (top)
              return (
                <g key={task.id}>
                  {/* Vertical stem */}
                  <line x1={x} y1={LINE_Y - DOT_R} x2={x} y2={lineEnd}
                    stroke="#94a3b8" strokeWidth="1.5" />
                  {/* Dot */}
                  <circle cx={x} cy={LINE_Y} r={DOT_R} fill={dotColor} />
                  <text x={x} y={LINE_Y + 4.5} textAnchor="middle" fontSize="10" fill="white" fontWeight="800">
                    {num}
                  </text>
                  {/* Label starting at x (left-aligned from stem top) */}
                  <text x={x + 6} y={lineEnd - 6} textAnchor="start" fontSize={FONT_SIZE} fill={textColor} fontWeight="600">
                    {num} — {shortTitle(task.title)}
                  </text>
                </g>
              )
            } else {
              const lineEnd = LINE_Y + stemH  // where the vertical line ends (bottom)
              return (
                <g key={task.id}>
                  <line x1={x} y1={LINE_Y + DOT_R} x2={x} y2={lineEnd}
                    stroke="#94a3b8" strokeWidth="1.5" />
                  <circle cx={x} cy={LINE_Y} r={DOT_R} fill={dotColor} />
                  <text x={x} y={LINE_Y + 4.5} textAnchor="middle" fontSize="10" fill="white" fontWeight="800">
                    {num}
                  </text>
                  <text x={x + 6} y={lineEnd + FONT_SIZE + 2} textAnchor="start" fontSize={FONT_SIZE} fill={textColor} fontWeight="600">
                    {num} — {shortTitle(task.title)}
                  </text>
                </g>
              )
            }
          })}
        </svg>
      </div>

      {/* Legend — full task titles */}
      <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-6 py-4">
        {ownerIds.length > 0 && (
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ansvarlig:</span>
            {[['alle', 'Alle'], ...ownerIds.map(id => {
              const m = members.find(m => m.user_id === id)
              return [id, m?.users?.name ?? 'Ukjent']
            })].map(([val, label]) => (
              <label key={val} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="owner-filter"
                  value={val}
                  checked={ownerFilter === val}
                  onChange={() => setOwnerFilter(val)}
                  className="accent-primary-500"
                />
                <span className="text-xs font-medium text-gray-600">{label}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Oppgaver</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
          {filtered.map((task, i) => {
            const isOverdue = new Date(task.due_date).getTime() < today
            return (
              <div key={task.id} className="flex items-baseline gap-2 text-sm">
                <span className={`font-bold tabular-nums shrink-0 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-gray-700 leading-snug">{task.title}</span>
                <span className={`ml-auto shrink-0 text-xs ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                  {formatDate(task.due_date)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

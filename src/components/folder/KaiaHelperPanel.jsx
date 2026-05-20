import { useState, useRef, useEffect } from 'react'
import AITasksPanel from './AITasksPanel'
import kaiaImg from '../../assets/kaia.png'

const SESSION_KEY = folderId => `kaia_sessions_${folderId}`
const MAX_SESSIONS = 30

function loadSessions(folderId) {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY(folderId))) ?? [] } catch { return [] }
}
function saveSessions(folderId, sessions) {
  localStorage.setItem(SESSION_KEY(folderId), JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <img src={kaiaImg} alt="Kaia" className="w-6 h-6 rounded-full object-cover" />
            <span className="text-xs font-semibold text-gray-400">Kaia</span>
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
          {msg.content}
        </div>
        {!isUser && (msg.actionsExecuted?.length > 0 || msg.actionsErrors?.length > 0) && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.actionsExecuted?.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                ✓ Utførte {msg.actionsExecuted.length} handling{msg.actionsExecuted.length !== 1 ? 'er' : ''}
              </span>
            )}
            {msg.actionsErrors?.map((err, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700" title={err}>
                ✗ Feil: {err.length > 60 ? err.slice(0, 60) + '…' : err}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function KaiaHelperPanel({ folderId }) {
  const [sessions, setSessions] = useState(() => loadSessions(folderId))
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)
  const baseInputRef = useRef('')

  // Sync messages → active session in localStorage
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return
    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === activeSessionId ? { ...s, messages, updatedAt: Date.now() } : s
      )
      saveSessions(folderId, updated)
      return updated
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  function newSession() {
    setActiveSessionId(null)
    setMessages([])
    setInput('')
  }

  function openSession(session) {
    setActiveSessionId(session.id)
    setMessages(session.messages)
    setInput('')
  }

  function deleteSession(e, id) {
    e.stopPropagation()
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSessions(folderId, updated)
      return updated
    })
    if (activeSessionId === id) newSession()
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Tale-til-tekst støttes ikke i denne nettleseren. Prøv Chrome eller Edge.'); return }
    baseInputRef.current = input
    const rec = new SpeechRecognition()
    rec.lang = 'nb-NO'
    rec.continuous = true
    rec.interimResults = true
    let spoken = ''
    rec.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) spoken += t + ' '
        else interim = t
      }
      const base = baseInputRef.current ? baseInputRef.current.trimEnd() + ' ' : ''
      setInput(base + spoken + interim)
    }
    rec.onend = () => {
      const base = baseInputRef.current ? baseInputRef.current.trimEnd() + ' ' : ''
      setInput((base + spoken).trimEnd() + (spoken ? ' ' : ''))
      setListening(false)
    }
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: q }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    // Create new session if needed
    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      const newSess = {
        id: sessionId,
        title: q.slice(0, 60),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: nextMessages,
      }
      setSessions(prev => {
        const updated = [newSess, ...prev]
        saveSessions(folderId, updated)
        return updated
      })
      setActiveSessionId(sessionId)
    }

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, mode: 'kaia_chat', message: q, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.text,
        actionsExecuted: data.actionsExecuted ?? [],
        actionsErrors: data.actionsErrors ?? [],
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Feil: ${err.message}`,
        actionsExecuted: [],
        actionsErrors: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function formatSessionDate(ts) {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="flex flex-row h-full overflow-hidden">
      {/* Venstre: historikk-sidebar */}
      <div className="w-48 shrink-0 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 shrink-0">
          <button
            onClick={newSession}
            className="w-full text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg px-2 py-1.5 transition-colors text-left"
          >
            + Ny samtale
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-4 text-center">Ingen tidligere samtaler</p>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => openSession(s)}
              className={`group flex items-start gap-1 px-3 py-2 cursor-pointer rounded-lg mx-1 my-0.5 transition-colors ${
                activeSessionId === s.id ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate leading-tight">{s.title || 'Samtale'}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{formatSessionDate(s.updatedAt ?? s.createdAt)}</p>
              </div>
              <button
                onClick={e => deleteSession(e, s.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs leading-none mt-0.5 transition-opacity"
                title="Slett"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Midten: chat */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <img src={kaiaImg} alt="Kaia" className="w-8 h-8 rounded-full object-cover" />
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Chat med Kaia</h3>
            <p className="text-xs text-gray-400">Still spørsmål eller gi Kaia instruksjoner om mappen</p>
          </div>
        </div>

        {/* Meldingsliste */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-300 flex-col gap-3">
              <img src={kaiaImg} alt="Kaia" className="w-16 h-16 rounded-full object-cover opacity-40" />
              <p className="text-sm text-center text-gray-400">Hei! Jeg er Kaia. Jeg kan hjelpe deg med oppgaver,<br />risikoer og dokumenter i denne mappen.</p>
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2">
                <img src={kaiaImg} alt="Kaia" className="w-6 h-6 rounded-full object-cover" />
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-100">
          <div className="h-5 mb-1">
            {listening && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />
                Kaia hører deg — slipp for å stoppe
              </p>
            )}
          </div>
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv til Kaia… (Enter for å sende, Shift+Enter for ny linje)"
              disabled={loading}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 resize-none leading-relaxed"
            />
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={e => { e.preventDefault(); startListening() }}
              onTouchEnd={stopListening}
              disabled={loading}
              title="Hold inne for å tale"
              className={`shrink-0 rounded-xl px-3 py-2 text-lg transition-all select-none disabled:opacity-50 ${
                listening
                  ? 'bg-red-500 text-white shadow-lg scale-110 animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              🎙️
            </button>
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Høyre: Kaias forslag */}
      <div className="w-80 shrink-0 bg-gray-50 overflow-hidden flex flex-col">
        <AITasksPanel folderId={folderId} />
      </div>
    </div>
  )
}

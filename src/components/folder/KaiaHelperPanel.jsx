import { useState, useRef, useEffect } from 'react'
import AITasksPanel from './AITasksPanel'

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
          {msg.content}
        </div>
        {!isUser && msg.actionsExecuted?.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
              ✓ Utførte {msg.actionsExecuted.length} handling{msg.actionsExecuted.length !== 1 ? 'er' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function KaiaHelperPanel({ folderId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)

  const baseInputRef = useRef('')

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
    setMessages(prev => [...prev, userMsg])

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
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Feil: ${err.message}`,
        actionsExecuted: [],
      }
      setMessages(prev => [...prev, errMsg])
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

  return (
    <div className="flex flex-row h-full overflow-hidden">
      {/* Venstre: chat */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Chat med Kaia</h3>
          <p className="text-xs text-gray-400 mt-0.5">Still spørsmål eller gi Kaia instruksjoner om mappen</p>
        </div>

        {/* Meldingsliste */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-300 flex-col gap-2">
              <div className="text-4xl">🤖</div>
              <p className="text-sm text-center">Hei! Jeg er Kaia. Jeg kan hjelpe deg med oppgaver,<br />risikoer og dokumenter i denne mappen.</p>
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-100">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv til Kaia... (Enter for å sende, Shift+Enter for ny linje)"
              disabled={loading}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 resize-none leading-relaxed"
            />
            {/* Push-to-talk */}
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
          {listening && (
            <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />
              Kaia hører deg — slipp for å stoppe
            </p>
          )}
        </div>
      </div>

      {/* Høyre: Kaias forslag */}
      <div className="w-80 shrink-0 bg-gray-50 overflow-hidden flex flex-col">
        <AITasksPanel folderId={folderId} />
      </div>
    </div>
  )
}

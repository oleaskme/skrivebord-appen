import { useState, useRef, useEffect, useCallback } from 'react'
import AITasksPanel from './AITasksPanel'
import kaiaImg from '../../assets/kaia.png'
import { supabase } from '../../lib/supabase'
import { useUser } from '../../context/UserContext'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SESSIONS = 30

// Strip image data before saving to DB (too large for JSONB)
function sanitizeForDb(messages) {
  return messages.map(m => ({
    ...m,
    images: (m.images ?? []).map(({ id, mediaType }) => ({ id, mediaType, unavailable: true })),
  }))
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType: file.type, id: crypto.randomUUID() })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function ImageThumbnail({ img, onRemove }) {
  return (
    <div className="relative inline-block">
      <img src={img.dataUrl} alt="vedlegg" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-500 transition-colors"
      >✕</button>
    </div>
  )
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
        {msg.images?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.images.map(img => (
              img.unavailable
                ? <span key={img.id} className="text-xs text-gray-400 italic px-2 py-1 bg-gray-100 rounded-lg">📷 Bilde ikke tilgjengelig på denne enheten</span>
                : <img key={img.id} src={img.dataUrl} alt="vedlegg"
                    className="h-32 max-w-[200px] object-cover rounded-xl border border-gray-200 cursor-pointer"
                    onClick={() => window.open(img.dataUrl, '_blank')}
                  />
            ))}
          </div>
        )}
        {msg.content && (
          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
            {msg.content}
          </div>
        )}
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
  const { activeUser } = useUser()
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)
  const baseInputRef = useRef('')
  const fileInputRef = useRef(null)
  const saveTimeoutRef = useRef(null)

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    const { data } = await supabase
      .from('kaia_sessions')
      .select('id, title, created_at, updated_at, messages')
      .eq('folder_id', folderId)
      .order('updated_at', { ascending: false })
      .limit(MAX_SESSIONS)
    setSessions(data ?? [])
    setLoadingSessions(false)
  }, [folderId])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Debounced save to DB when messages change
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('kaia_sessions')
        .update({ messages: sanitizeForDb(messages), updated_at: new Date().toISOString() })
        .eq('id', activeSessionId)
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: sanitizeForDb(messages), updated_at: new Date().toISOString() } : s
      ))
    }, 1000)
    return () => clearTimeout(saveTimeoutRef.current)
  }, [messages, activeSessionId])

  function newSession() {
    setActiveSessionId(null)
    setMessages([])
    setInput('')
    setPendingImages([])
  }

  function openSession(session) {
    setActiveSessionId(session.id)
    setMessages(session.messages ?? [])
    setInput('')
    setPendingImages([])
  }

  async function deleteSession(e, id) {
    e.stopPropagation()
    await supabase.from('kaia_sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) newSession()
  }

  async function addImages(files) {
    const imageFiles = Array.from(files).filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type))
    if (!imageFiles.length) return
    const converted = await Promise.all(imageFiles.map(fileToBase64))
    setPendingImages(prev => [...prev, ...converted])
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter(i => i.kind === 'file' && ACCEPTED_IMAGE_TYPES.includes(i.type))
    if (!imageItems.length) return
    e.preventDefault()
    addImages(imageItems.map(i => i.getAsFile()))
  }

  function handleFileChange(e) {
    if (e.target.files?.length) addImages(e.target.files)
    e.target.value = ''
  }

  function removeImage(id) {
    setPendingImages(prev => prev.filter(img => img.id !== id))
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

  function stopListening() { recognitionRef.current?.stop() }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const q = input.trim()
    if ((!q && pendingImages.length === 0) || loading) return
    setInput('')
    const imgs = pendingImages
    setPendingImages([])
    setLoading(true)

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      images: imgs.map(({ id, dataUrl, mediaType }) => ({ id, dataUrl, mediaType })),
    }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    let sessionId = activeSessionId
    if (!sessionId) {
      const title = q.slice(0, 60) || (imgs.length > 0 ? '📷 Bilde' : 'Samtale')
      const { data: newSess } = await supabase
        .from('kaia_sessions')
        .insert({
          folder_id: folderId,
          user_id: activeUser?.id ?? null,
          title,
          messages: sanitizeForDb(nextMessages),
        })
        .select('id, title, created_at, updated_at, messages')
        .single()
      if (newSess) {
        sessionId = newSess.id
        setActiveSessionId(sessionId)
        setSessions(prev => [newSess, ...prev])
      }
    }

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content || '' }))
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          mode: 'kaia_chat',
          message: q,
          images: imgs.map(({ base64, mediaType }) => ({ base64, mediaType })),
          history,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.text,
        actionsExecuted: data.actionsExecuted ?? [],
        actionsErrors: data.actionsErrors ?? [],
      }])
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
          {loadingSessions && <p className="text-xs text-gray-400 px-3 py-4 text-center">Laster...</p>}
          {!loadingSessions && sessions.length === 0 && (
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
                <p className="text-[10px] text-gray-400 mt-0.5">{formatSessionDate(s.updated_at ?? s.created_at)}</p>
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
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <img src={kaiaImg} alt="Kaia" className="w-8 h-8 rounded-full object-cover" />
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Chat med Kaia</h3>
            <p className="text-xs text-gray-400">Still spørsmål eller gi Kaia instruksjoner om mappen</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-300 flex-col gap-3">
              <img src={kaiaImg} alt="Kaia" className="w-16 h-16 rounded-full object-cover opacity-40" />
              <p className="text-sm text-center text-gray-400">Hei! Jeg er Kaia. Jeg kan hjelpe deg med oppgaver,<br />risikoer og dokumenter i denne mappen.</p>
            </div>
          )}
          {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
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

        <div className="shrink-0 px-4 py-3 border-t border-gray-100">
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingImages.map(img => (
                <ImageThumbnail key={img.id} img={img} onRemove={() => removeImage(img.id)} />
              ))}
            </div>
          )}
          <div className="h-5 mb-1">
            {listening && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />
                Kaia hører deg — slipp for å stoppe
              </p>
            )}
          </div>
          <div className="flex gap-2 items-end">
            <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} title="Last opp bilde"
              className="shrink-0 rounded-xl px-3 py-2 text-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50">
              🖼️
            </button>
            <textarea
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Skriv til Kaia… eller lim inn et bilde"
              disabled={loading}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 resize-none leading-relaxed"
            />
            <button
              onMouseDown={startListening} onMouseUp={stopListening} onMouseLeave={stopListening}
              onTouchStart={e => { e.preventDefault(); startListening() }} onTouchEnd={stopListening}
              disabled={loading} title="Hold inne for å tale"
              className={`shrink-0 rounded-xl px-3 py-2 text-lg transition-all select-none disabled:opacity-50 ${listening ? 'bg-red-500 text-white shadow-lg scale-110 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              🎙️
            </button>
            <button onClick={sendMessage} disabled={loading || (!input.trim() && pendingImages.length === 0)}
              className="bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors shrink-0">
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

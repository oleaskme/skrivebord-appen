import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

function SourceBadge({ source }) {
  const ismaster = source.type === 'master'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ismaster ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
      {ismaster ? 'MASTER' : 'INPUT'} · {source.title}
    </span>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
          {msg.content}
        </div>
        {!isUser && msg.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.sources.map((s, i) => <SourceBadge key={i} source={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function QAPanel({ folderId }) {
  const [chats, setChats]         = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [creatingChat, setCreatingChat] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { loadChats() }, [folderId])

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId)
  }, [activeChatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadChats() {
    const { data } = await supabase
      .from('qa_chats')
      .select('*')
      .eq('folder_id', folderId)
      .order('updated_at', { ascending: false })
    setChats(data ?? [])
    if (data?.length && !activeChatId) setActiveChatId(data[0].id)
  }

  async function loadMessages(chatId) {
    const { data } = await supabase
      .from('qa_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at')
    setMessages(data ?? [])
  }

  async function createChat() {
    setCreatingChat(true)
    const { data } = await supabase
      .from('qa_chats')
      .insert({ folder_id: folderId, title: 'Ny chat' })
      .select()
      .single()
    setChats(prev => [data, ...prev])
    setActiveChatId(data.id)
    setMessages([])
    setCreatingChat(false)
  }

  async function sendMessage() {
    const q = input.trim()
    if (!q || loading || !activeChatId) return
    setInput('')
    setLoading(true)

    const userMsg = { id: crypto.randomUUID(), chat_id: activeChatId, role: 'user', content: q, sources: [], created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    await supabase.from('qa_messages').insert({ chat_id: activeChatId, role: 'user', content: q })

    // Oppdater chat-tittel ved første melding
    const isFirst = messages.length === 0
    if (isFirst) {
      const title = q.length > 50 ? q.slice(0, 47) + '...' : q
      await supabase.from('qa_chats').update({ title, updated_at: new Date().toISOString() }).eq('id', activeChatId)
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title } : c))
    } else {
      await supabase.from('qa_chats').update({ updated_at: new Date().toISOString() }).eq('id', activeChatId)
    }

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, mode: 'qa', question: q, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const assistantMsg = { id: crypto.randomUUID(), chat_id: activeChatId, role: 'assistant', content: data.answer, sources: data.sources ?? [], created_at: new Date().toISOString() }
      setMessages(prev => [...prev, assistantMsg])
      await supabase.from('qa_messages').insert({ chat_id: activeChatId, role: 'assistant', content: data.answer, sources: data.sources ?? [] })
    } catch (err) {
      const errMsg = { id: crypto.randomUUID(), chat_id: activeChatId, role: 'assistant', content: `Feil: ${err.message}`, sources: [], created_at: new Date().toISOString() }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const activeChat = chats.find(c => c.id === activeChatId)

  return (
    <div className="h-full flex overflow-hidden">
      {/* Venstre: chatliste */}
      <div className="w-56 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden bg-gray-50">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={createChat}
            disabled={creatingChat}
            className="w-full bg-primary-500 text-white text-xs rounded-lg py-2 font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            + Ny chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-6 px-3">Ingen chatter ennå</p>
          )}
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`w-full text-left px-3 py-2.5 text-xs border-b border-gray-100 transition-colors truncate ${chat.id === activeChatId ? 'bg-white text-primary-700 font-semibold' : 'text-gray-600 hover:bg-white'}`}
            >
              {chat.title}
            </button>
          ))}
        </div>
      </div>

      {/* Høyre: chatinnhold */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeChatId ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-2">
            <div className="text-4xl">💬</div>
            <p className="text-sm">Opprett en ny chat for å stille spørsmål</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-700 truncate">{activeChat?.title ?? 'Chat'}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-300 flex-col gap-2">
                  <p className="text-sm">Still et spørsmål om dokumentene i denne mappen</p>
                </div>
              )}
              {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
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
            <div className="px-4 py-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Still et spørsmål om dokumentene..."
                  disabled={loading}
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

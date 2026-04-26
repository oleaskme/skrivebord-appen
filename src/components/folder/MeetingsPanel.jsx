import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useUser } from '../../context/UserContext'
import { sha256 } from '../../lib/hash'

export default function MeetingsPanel({ folderId }) {
  const { activeUser } = useUser()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [minutesForId, setMinutesForId] = useState(null)
  const [form, setForm] = useState({ title: '', start: '', end: '', attendees: '' })
  const [saving, setSaving] = useState(false)

  const loadMeetings = useCallback(async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*')
      .eq('folder_id', folderId)
      .order('start_time', { ascending: false })
    setMeetings(data ?? [])
    setLoading(false)
  }, [folderId])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.start) return
    setSaving(true)
    try {
      let calendarEventId = null
      const attendees = form.attendees.split(',').map(s => s.trim()).filter(Boolean)

      if (activeUser.google_account_email) {
        try {
          const { event } = await api.calendar.create(activeUser.id, {
            summary: form.title,
            start: new Date(form.start).toISOString(),
            end: form.end ? new Date(form.end).toISOString() : new Date(new Date(form.start).getTime() + 60 * 60000).toISOString(),
            attendees,
          })
          calendarEventId = event.id
        } catch {}
      }

      const { data } = await supabase.from('meetings').insert({
        folder_id: folderId,
        title: form.title.trim(),
        start_time: form.start,
        end_time: form.end || null,
        attendees: attendees.map(e => ({ email: e })),
        google_calendar_event_id: calendarEventId,
      }).select().single()

      setMeetings(prev => [data, ...prev])
      setForm({ title: '', start: '', end: '', attendees: '' })
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMinutes(meetingId, meetingTitle, content) {
    const hash = await sha256(content)
    const { data: inputDoc } = await supabase.from('input_documents').insert({
      folder_id: folderId,
      type: 'meeting',
      title: `Referat: ${meetingTitle}`,
      content,
      content_hash_sha256: hash,
      status: 'unprocessed',
    }).select().single()

    await supabase.from('meetings').update({ input_doc_id: inputDoc.id }).eq('id', meetingId)
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, input_doc_id: inputDoc.id } : m))
    setMinutesForId(null)
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laster møter...</div>

  const upcoming = meetings.filter(m => m.start_time && new Date(m.start_time) >= new Date())
  const past     = meetings.filter(m => !m.start_time || new Date(m.start_time) < new Date())

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-700">Møter</h3>
        <button onClick={() => setShowForm(f => !f)}
          className="text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition-colors">
          + Nytt møte
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0 space-y-3">
          <input type="text" placeholder="Tittel på møte..." value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Start *</label>
              <input type="datetime-local" value={form.start}
                onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Slutt</label>
              <input type="datetime-local" value={form.end}
                onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>
          <input type="text" placeholder="Deltakere (e-poster, kommaseparert)"
            value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <button type="submit" disabled={saving || !form.title.trim() || !form.start}
            className="w-full bg-primary-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors">
            {saving ? 'Lagrer...' : 'Opprett møte'}
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {meetings.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Ingen møter registrert</p>
        )}

        {upcoming.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Kommende</p>
            <div className="space-y-2">
              {upcoming.map(m => (
                <MeetingItem key={m.id} meeting={m}
                  onWriteMinutes={() => setMinutesForId(m.id)}
                  isWritingMinutes={minutesForId === m.id}
                  onSaveMinutes={(content) => handleSaveMinutes(m.id, m.title, content)}
                  onCancelMinutes={() => setMinutesForId(null)}
                />
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tidligere</p>
            <div className="space-y-2">
              {past.map(m => (
                <MeetingItem key={m.id} meeting={m}
                  onWriteMinutes={() => setMinutesForId(m.id)}
                  isWritingMinutes={minutesForId === m.id}
                  onSaveMinutes={(content) => handleSaveMinutes(m.id, m.title, content)}
                  onCancelMinutes={() => setMinutesForId(null)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MeetingItem({ meeting, onWriteMinutes, isWritingMinutes, onSaveMinutes, onCancelMinutes }) {
  const [minutes, setMinutes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!minutes.trim()) return
    setSaving(true)
    await onSaveMinutes(minutes)
    setSaving(false)
  }

  const isPast = meeting.start_time && new Date(meeting.start_time) < new Date()

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm text-gray-800">{meeting.title}</p>
            {meeting.start_time && (
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(meeting.start_time).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {meeting.attendees?.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {meeting.attendees.map(a => a.email).join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {meeting.google_calendar_event_id && (
              <span className="text-xs text-green-500" title="Synkronisert med Google Calendar">📅</span>
            )}
            {isPast && !meeting.input_doc_id && !isWritingMinutes && (
              <button onClick={onWriteMinutes}
                className="text-xs text-primary-500 hover:text-primary-700 border border-primary-200 rounded px-2 py-0.5 transition-colors">
                Skriv referat
              </button>
            )}
            {meeting.input_doc_id && (
              <span className="text-xs text-green-600 bg-green-50 rounded px-2 py-0.5">✓ Referat</span>
            )}
          </div>
        </div>
      </div>

      {isWritingMinutes && (
        <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
          <textarea
            autoFocus
            placeholder="Skriv møtereferat her..."
            value={minutes}
            onChange={e => setMinutes(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !minutes.trim()}
              className="flex-1 bg-primary-500 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors">
              {saving ? 'Lagrer...' : 'Lagre som INPUT'}
            </button>
            <button onClick={onCancelMinutes} className="px-3 text-gray-400 hover:text-gray-600 text-sm">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

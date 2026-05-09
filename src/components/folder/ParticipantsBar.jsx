import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
]

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function ParticipantsBar({ members, folderId, currentUserId, allUsers, isOwner, onMembersChanged }) {
  const [showPopover, setShowPopover] = useState(false)
  const [loading, setLoading] = useState(false)

  const memberIds = new Set(members.map(m => m.user_id))
  const available = allUsers.filter(u => !memberIds.has(u.id))

  async function addMember(userId) {
    setLoading(true)
    await supabase.from('folder_members').insert({ folder_id: folderId, user_id: userId, role: 'member' })
    setLoading(false)
    setShowPopover(false)
    onMembersChanged()
  }

  async function removeMember(userId) {
    await supabase.from('folder_members').delete().eq('folder_id', folderId).eq('user_id', userId)
    onMembersChanged()
  }

  return (
    <div className="flex items-center gap-1.5 relative">
      {members.map(m => {
        const name = m.users?.name ?? '?'
        const isMe = m.user_id === currentUserId
        return (
          <div key={m.user_id} className="relative group/avatar">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(name)} ring-2 ring-primary-800`}
              title={`${name}${m.role === 'owner' ? ' (eier)' : ''}`}
            >
              {name.charAt(0).toUpperCase()}
              {m.role === 'owner' && (
                <span className="absolute -top-1 -right-1 text-[8px] leading-none">👑</span>
              )}
            </div>
            {isOwner && !isMe && (
              <button
                onClick={() => removeMember(m.user_id)}
                className="absolute -top-1 -right-1 hidden group-hover/avatar:flex w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] items-center justify-center leading-none hover:bg-red-700"
                title={`Fjern ${name}`}
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      {isOwner && (
        <div className="relative">
          <button
            onClick={() => setShowPopover(v => !v)}
            className="w-7 h-7 rounded-full border-2 border-dashed border-primary-400 text-primary-300 hover:border-white hover:text-white flex items-center justify-center text-sm transition-colors"
            title="Legg til deltaker"
          >
            +
          </button>
          {showPopover && (
            <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[170px]">
              {available.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400">Alle brukere er allerede deltakere</p>
              ) : (
                <>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Legg til</p>
                  {available.map(u => (
                    <button
                      key={u.id}
                      disabled={loading}
                      onClick={() => addMember(u.id)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2.5 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(u.name)}`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      {u.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

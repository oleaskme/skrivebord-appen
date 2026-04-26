import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function FolderView() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const [folder, setFolder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .single()
      .then(({ data }) => {
        setFolder(data)
        setLoading(false)
      })
  }, [folderId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Laster mappe...
      </div>
    )
  }

  if (!folder) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-400 gap-4">
        <p>Mappen ble ikke funnet.</p>
        <button onClick={() => navigate('/')} className="text-primary-500 underline">
          Tilbake til skrivebordet
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Toppfelt */}
      <div className="h-14 bg-white border-b border-gray-100 flex items-center gap-4 px-6 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-gray-700 text-sm flex items-center gap-1"
        >
          ← Skrivebord
        </button>
        <span className="text-gray-300">/</span>
        <h2 className="font-semibold text-gray-800">{folder.name}</h2>
      </div>

      {/* Innhold — venstre + høyre panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Venstre panel (35%) */}
        <div className="w-[35%] border-r border-gray-100 bg-gray-50 overflow-y-auto p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Dokumenter
          </p>
          <div className="text-gray-400 text-sm text-center py-12">
            Mappevisning implementeres i Steg 4
          </div>
        </div>

        {/* Høyre panel (65%) */}
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-gray-400 text-sm">
          Velg et dokument fra listen til venstre
        </div>
      </div>
    </div>
  )
}

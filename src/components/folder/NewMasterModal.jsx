import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeToHtml } from '../../lib/normalizeHtml'

const TYPE_LABELS = {
  note: 'Notat', meeting: 'Møtereferat', email: 'E-post',
  drive_file: 'Drive-fil', upload: 'Opplastet',
}

async function extractHtmlFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'docx') {
    const mammoth = (await import('mammoth')).default
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer })
    return result.value || ''
  }

  const text = await file.text()
  return normalizeToHtml(text) // handles .txt and .md
}

export default function NewMasterModal({ folderId, inputDocs = [], onClose, onCreated, onAIResult }) {
  const [name, setName]                   = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [selectedInputIds, setSelectedInputIds] = useState([])
  const [uploadedHtml, setUploadedHtml]   = useState(null)
  const [uploadedFileName, setUploadedFileName] = useState(null)
  const [uploading, setUploading]         = useState(false)
  const [step, setStep]                   = useState('form') // 'form' | 'running'
  const [error, setError]                 = useState(null)
  const fileRef = useRef()

  function toggleInput(id) {
    setSelectedInputIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const html = await extractHtmlFromFile(file)
      setUploadedHtml(html)
      setUploadedFileName(file.name)
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, ''))
      }
    } catch (err) {
      setError('Kunne ikke lese filen: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setStep('running')

    try {
      const { data: doc, error: err } = await supabase
        .from('master_documents')
        .insert({
          folder_id: folderId,
          name: name.trim(),
          ai_instruction: aiInstruction.trim() || null,
          content: uploadedHtml ?? '',
        })
        .select().single()
      if (err) throw err

      onCreated(doc)

      if (selectedInputIds.length > 0) {
        const res = await fetch('/api/ai/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId, masterDocId: doc.id, inputDocIds: selectedInputIds }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        onAIResult(data, selectedInputIds)
      }

      onClose()
    } catch (err) {
      setError(err.message)
      setStep('form')
    }
  }

  const isRunning = step === 'running'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={isRunning ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        <div className="px-8 pt-8 pb-4 shrink-0">
          <h2 className="text-lg font-bold text-gray-800">Nytt MASTER-dokument</h2>
        </div>

        {isRunning ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 px-8">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">
              {selectedInputIds.length > 0
                ? `Kjører AI-analyse av ${selectedInputIds.length} INPUT-dokument${selectedInputIds.length !== 1 ? 'er' : ''}...`
                : 'Oppretter dokument...'}
            </p>
            <p className="text-xs text-gray-400">Dette kan ta noen sekunder</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 pb-4 space-y-5">

              {/* Navn */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Navn *</label>
                <input
                  autoFocus type="text" value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="f.eks. Prosjektplan, Beslutningslogg"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* AI-instruksjon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AI-instruksjon</label>
                <textarea
                  value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                  rows={3} placeholder="Beskriv dokumentets formål og hva AI skal se etter i INPUT-dokumentene..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none text-sm"
                />
              </div>

              {/* Filimport */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last opp eksisterende dokument
                  <span className="ml-1 font-normal text-gray-400">(valgfritt)</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">Støtter .docx, .txt og .md — innholdet brukes som startpunkt.</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-5 py-4 cursor-pointer transition-colors text-center ${uploadedFileName ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'}`}
                >
                  {uploading ? (
                    <p className="text-sm text-gray-400">Leser fil...</p>
                  ) : uploadedFileName ? (
                    <div>
                      <p className="text-sm font-medium text-primary-700">✓ {uploadedFileName}</p>
                      <p className="text-xs text-primary-400 mt-0.5">Innholdet er lastet inn — klikk for å bytte fil</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-500">Klikk for å velge fil</p>
                      <p className="text-xs text-gray-400 mt-0.5">.docx · .txt · .md</p>
                    </div>
                  )}
                  <input
                    ref={fileRef} type="file"
                    accept=".docx,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                    onChange={handleFileChange} className="hidden"
                  />
                </div>
              </div>

              {/* INPUT-dokumenter */}
              {inputDocs.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Analyser med eksisterende INPUT-dokumenter
                    <span className="ml-1 font-normal text-gray-400">(valgfritt)</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-2">AI kombinerer opplastet dokument og valgte INPUT-dokumenter.</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-44 overflow-y-auto">
                    {inputDocs.map(doc => (
                      <label key={doc.id}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${selectedInputIds.includes(doc.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={selectedInputIds.includes(doc.id)}
                          onChange={() => toggleInput(doc.id)}
                          className="w-4 h-4 mt-0.5 accent-primary-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{TYPE_LABELS[doc.type] ?? doc.type}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${doc.status === 'processed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {doc.status === 'processed' ? 'Behandlet' : 'Ubehandlet'}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedInputIds.length > 0 && (
                    <p className="text-xs text-primary-600 font-medium mt-1.5">
                      {selectedInputIds.length} dokument{selectedInputIds.length !== 1 ? 'er' : ''} valgt — AI kjøres automatisk
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>

            <div className="flex gap-3 px-8 py-5 border-t border-gray-100 shrink-0">
              <button type="submit" disabled={!name.trim()}
                className="flex-1 bg-primary-600 text-white rounded-lg py-2.5 font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {selectedInputIds.length > 0
                  ? `Opprett og kjør AI (${selectedInputIds.length} dok.)`
                  : uploadedHtml
                    ? 'Opprett med opplastet innhold'
                    : 'Opprett'}
              </button>
              <button type="button" onClick={onClose} className="px-4 text-gray-500 hover:text-gray-700 font-medium">
                Avbryt
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

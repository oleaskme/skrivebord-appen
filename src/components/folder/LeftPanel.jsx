import { useState } from 'react'
import { formatVersion } from '../../lib/hash'

const TYPE_LABELS = {
  note:       { label: 'Notat',       color: 'bg-blue-100 text-blue-700' },
  meeting:    { label: 'Møtereferat', color: 'bg-purple-100 text-purple-700' },
  email:      { label: 'E-post',      color: 'bg-yellow-100 text-yellow-700' },
  drive_file: { label: 'Drive',       color: 'bg-green-100 text-green-700' },
  upload:     { label: 'Opplastet',   color: 'bg-gray-100 text-gray-700' },
}

const INPUT_FILTERS = ['alle', 'ubehandlet', 'behandlet']

export default function LeftPanel({
  masterDocs, inputDocs,
  selectedDoc, onSelectDoc,
  onAddMaster, onAddInput,
  onDeleteInput,
  selectedInputIds, onToggleInput,
  onRunAI, aiLoading,
}) {
  const [inputFilter, setInputFilter] = useState('alle')
  const [selectMode, setSelectMode] = useState(false)

  const filteredInputs = inputDocs.filter(d => {
    if (inputFilter === 'ubehandlet') return d.status === 'unprocessed'
    if (inputFilter === 'behandlet')  return d.status === 'processed'
    return true
  })

  function toggleSelectMode() {
    setSelectMode(m => !m)
    // Nullstill valg når select-modus slås av
    if (selectMode) filteredInputs.forEach(d => selectedInputIds.includes(d.id) && onToggleInput(d.id))
  }

  const canRunAI = selectedDoc?.type === 'master' && selectedInputIds.length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* MASTER-dokumenter */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">MASTER</span>
          <button onClick={onAddMaster} className="text-xs text-primary-500 hover:text-primary-700 font-medium">
            + Nytt
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {masterDocs.length === 0 ? (
            <p className="px-4 py-4 text-xs text-gray-400 text-center">Ingen MASTER-dokumenter</p>
          ) : masterDocs.map(doc => (
            <button
              key={doc.id}
              onClick={() => onSelectDoc({ type: 'master', id: doc.id })}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedDoc?.id === doc.id && selectedDoc?.type === 'master' ? 'bg-primary-50 border-l-2 border-l-primary-400' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-800 truncate">{doc.name}</span>
                <span className="text-xs text-gray-400 ml-2 shrink-0 font-mono">
                  v{formatVersion(doc.version_major, doc.version_minor)}
                </span>
              </div>
              {doc.has_unresolved_track_changes && (
                <span className="text-xs text-orange-500 mt-0.5 block">⚠ Sporede endringer</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 shrink-0" />

      {/* INPUT-dokumenter */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">INPUT</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectMode}
              className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${selectMode ? 'bg-primary-100 text-primary-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {selectMode ? 'Avbryt valg' : 'Velg'}
            </button>
            <button onClick={onAddInput} className="text-xs text-primary-500 hover:text-primary-700 font-medium">
              + Legg til
            </button>
          </div>
        </div>

        {/* Kjør AI-knapp */}
        {selectMode && (
          <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 shrink-0">
            {!canRunAI ? (
              <p className="text-xs text-primary-400">
                {selectedDoc?.type !== 'master'
                  ? 'Velg et MASTER-dokument og kryss av INPUT-dokumenter'
                  : 'Kryss av minst ett INPUT-dokument'}
              </p>
            ) : (
              <button
                onClick={onRunAI}
                disabled={aiLoading}
                className="w-full bg-primary-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
              >
                {aiLoading ? '⏳ Kjører AI...' : `🤖 Kjør AI (${selectedInputIds.length} dok.)`}
              </button>
            )}
          </div>
        )}

        {/* Filter */}
        <div className="flex border-b border-gray-100 shrink-0">
          {INPUT_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setInputFilter(f)}
              className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${inputFilter === f ? 'text-primary-600 border-b-2 border-primary-400' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredInputs.length === 0 ? (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">
              {inputFilter === 'alle' ? 'Ingen INPUT-dokumenter ennå' : `Ingen ${inputFilter} dokumenter`}
            </p>
          ) : filteredInputs.map(doc => {
            const typeInfo = TYPE_LABELS[doc.type] ?? { label: doc.type, color: 'bg-gray-100 text-gray-600' }
            const isSelected = selectedInputIds.includes(doc.id)
            return (
              <div
                key={doc.id}
                onClick={() => selectMode ? onToggleInput(doc.id) : onSelectDoc({ type: 'input', id: doc.id })}
                className={`group relative px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!selectMode && selectedDoc?.id === doc.id && selectedDoc?.type === 'input' ? 'bg-primary-50 border-l-2 border-l-primary-400' : ''} ${selectMode && isSelected ? 'bg-primary-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleInput(doc.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 mt-0.5 accent-primary-500 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${doc.status === 'processed' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                        {doc.status === 'processed' ? 'Behandlet' : 'Ubehandlet'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(doc.created_at).toLocaleDateString('nb-NO')}
                    </p>
                  </div>
                  {!selectMode && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteInput(doc.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity shrink-0 mt-0.5"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

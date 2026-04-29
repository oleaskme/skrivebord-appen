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
  selectedMasterIds, onToggleMaster,
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
    if (selectMode) {
      // Clear selections on exit
      selectedInputIds.forEach(id => onToggleInput(id))
      selectedMasterIds.forEach(id => onToggleMaster(id))
    }
    setSelectMode(m => !m)
  }

  const canRunAI = selectedMasterIds.length > 0 && selectedInputIds.length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-100">

      {/* ── MASTER-seksjon ── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary-700">
          <span className="text-xs font-bold text-primary-100 uppercase tracking-widest">Master</span>
          <button
            onClick={onAddMaster}
            className="text-xs font-semibold text-white bg-primary-500 hover:bg-primary-400 px-2.5 py-1 rounded-lg transition-colors"
          >
            + Nytt
          </button>
        </div>

        <div className="px-3 py-2 space-y-1.5">
          {masterDocs.length === 0 ? (
            <p className="py-3 text-xs text-slate-400 text-center">Ingen MASTER-dokumenter ennå</p>
          ) : masterDocs.map(doc => {
            const isSelected = selectedMasterIds.includes(doc.id)
            const active = !selectMode && selectedDoc?.id === doc.id && selectedDoc?.type === 'master'
            return (
              <div
                key={doc.id}
                onClick={() => selectMode ? onToggleMaster(doc.id) : onSelectDoc({ type: 'master', id: doc.id })}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                  selectMode && isSelected
                    ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-200'
                    : active
                      ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-200'
                      : 'bg-white border-transparent hover:border-slate-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleMaster(doc.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-primary-500 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className={`font-semibold text-sm truncate ${active ? 'text-primary-700' : isSelected ? 'text-primary-700' : 'text-gray-800'}`}>
                      {doc.name}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                      v{formatVersion(doc.version_major, doc.version_minor)}
                    </span>
                  </div>
                </div>
                {doc.has_unresolved_track_changes && (
                  <span className="text-xs text-orange-500 mt-1 block pl-6">⚠ Sporede endringer</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Skillelinje ── */}
      <div className="mx-3 border-t border-slate-300" />

      {/* ── INPUT-seksjon ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-600 shrink-0">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Input</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectMode}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                selectMode
                  ? 'bg-orange-500 text-white hover:bg-orange-400'
                  : 'bg-slate-500 text-slate-200 hover:bg-slate-400'
              }`}
            >
              {selectMode ? 'Avbryt' : 'Velg'}
            </button>
            <button
              onClick={onAddInput}
              className="text-xs font-semibold text-white bg-slate-500 hover:bg-slate-400 px-2.5 py-1 rounded-lg transition-colors"
            >
              + Legg til
            </button>
          </div>
        </div>

        {/* Kjør AI-knapp */}
        {selectMode && (
          <div className="px-3 py-2 bg-primary-50 border-b border-primary-100 shrink-0">
            {!canRunAI ? (
              <p className="text-xs text-primary-400 text-center">
                {selectedMasterIds.length === 0 && selectedInputIds.length === 0
                  ? 'Kryss av master- og input-dokumenter'
                  : selectedMasterIds.length === 0
                    ? 'Kryss av minst ett MASTER-dokument'
                    : 'Kryss av minst ett INPUT-dokument'}
              </p>
            ) : (
              <button
                onClick={onRunAI}
                disabled={aiLoading}
                className="w-full bg-primary-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors"
              >
                {aiLoading
                  ? '⏳ Kjører AI...'
                  : `🤖 Kjør AI (${selectedInputIds.length} input → ${selectedMasterIds.length} master)`}
              </button>
            )}
          </div>
        )}

        {/* Filter-faner */}
        <div className="flex bg-slate-200 shrink-0 px-3 pt-2 gap-1">
          {INPUT_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setInputFilter(f)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-t-lg capitalize transition-colors ${
                inputFilter === f
                  ? 'bg-white text-primary-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* INPUT-liste */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 bg-slate-50">
          {filteredInputs.length === 0 ? (
            <p className="py-6 text-xs text-slate-400 text-center">
              {inputFilter === 'alle' ? 'Ingen INPUT-dokumenter ennå' : `Ingen ${inputFilter} dokumenter`}
            </p>
          ) : filteredInputs.map(doc => {
            const typeInfo  = TYPE_LABELS[doc.type] ?? { label: doc.type, color: 'bg-gray-100 text-gray-600' }
            const isSelected = selectedInputIds.includes(doc.id)
            const active    = !selectMode && selectedDoc?.id === doc.id && selectedDoc?.type === 'input'
            return (
              <div
                key={doc.id}
                onClick={() => selectMode ? onToggleInput(doc.id) : onSelectDoc({ type: 'input', id: doc.id })}
                className={`group relative px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                  active
                    ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-200'
                    : isSelected
                      ? 'bg-primary-50 border-primary-200'
                      : 'bg-white border-transparent hover:border-slate-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-2.5">
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
                    <p className={`text-sm font-medium truncate ${active ? 'text-primary-700' : 'text-gray-800'}`}>
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        doc.status === 'processed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {doc.status === 'processed' ? 'Behandlet' : 'Ubehandlet'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(doc.created_at).toLocaleDateString('nb-NO')}
                    </p>
                  </div>
                  {!selectMode && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteInput(doc.id) }}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 text-xs transition-opacity shrink-0 mt-0.5 p-1"
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

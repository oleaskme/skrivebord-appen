import { useState } from 'react'

export default function KaiaInstructionsModal({ inputCount, masterCount, onConfirm, onClose }) {
  const [instructions, setInstructions] = useState('')
  const [createVersion, setCreateVersion] = useState(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800">Instrukser til Kaia</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {inputCount} input → {masterCount} master-dokument{masterCount !== 1 ? 'er' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Hva skal Kaia fokusere på?
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={'F.eks.: «Oppdater kun risikoseksjonen»\n«Ignorer administrative detaljer og referat-formaliteter»\n«Vektlegg beslutninger som ble tatt i møtet»\n«Ikke slett eksisterende innhold, kun legg til nytt»'}
              rows={8}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent leading-relaxed"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Valgfritt — la stå tom for å la Kaia bestemme selv ut fra AI-instruksjonen på master-dokumentet.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createVersion}
                onChange={e => setCreateVersion(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-primary-500 shrink-0"
              />
              <div>
                <span className="text-sm font-semibold text-gray-700">Opprett ny versjon av master-dokumentene</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tar et øyeblikksbilde av gjeldende innhold før Kaia gjør endringer.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-50 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={() => onConfirm(instructions.trim(), createVersion)}
            className="flex-[2] bg-primary-600 text-white rounded-lg py-2.5 font-semibold hover:bg-primary-700 transition-colors"
          >
            🤖 Start analyse
          </button>
        </div>
      </div>
    </div>
  )
}

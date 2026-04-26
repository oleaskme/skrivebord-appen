import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatVersion } from '../../lib/hash'

// Parser ⟨+tillegg+⟩ og ⟨-sletting-⟩ markører fra Claude
function parseDiff(content) {
  const parts = []
  const regex = /⟨\+([\s\S]*?)\+⟩|⟨-([\s\S]*?)-⟩/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'normal', text: content.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) parts.push({ type: 'add', text: match[1] })
    else parts.push({ type: 'del', text: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'normal', text: content.slice(lastIndex) })
  }
  return parts
}

function DiffView({ content }) {
  const parts = parseDiff(content)
  return (
    <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans p-4 bg-gray-50 rounded-lg overflow-y-auto h-full">
      {parts.map((p, i) => {
        if (p.type === 'add') return <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5">{p.text}</mark>
        if (p.type === 'del') return <del key={i} className="bg-red-100 text-red-700 rounded px-0.5">{p.text}</del>
        return <span key={i}>{p.text}</span>
      })}
    </pre>
  )
}

export default function AIReviewModal({ result, master, inputDocs, selectedInputIds, folderId, onClose, onApproved }) {
  const [changelogEntry, setChangelogEntry] = useState(result.changelog_entry ?? '')
  const [approvedTasks, setApprovedTasks] = useState([])
  const [approvedRisks, setApprovedRisks] = useState([])
  const [saving, setSaving] = useState(false)

  const tasks   = result.suggested_tasks  ?? []
  const risks   = result.suggested_risks  ?? []
  const conflicts = result.conflicts      ?? []

  function toggleTask(i) {
    setApprovedTasks(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }
  function toggleRisk(i) {
    setApprovedRisks(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  async function handleApprove() {
    setSaving(true)
    try {
      // Fjern diff-markørene og lagre rent innhold
      const cleanContent = result.updated_content
        .replace(/⟨\+([\s\S]*?)\+⟩/g, '$1')
        .replace(/⟨-([\s\S]*?)-⟩/g, '')

      // Bygg endringslogg-appendiks
      const today = new Date().toLocaleDateString('nb-NO')
      const logLine = `\n\n--- Endringslogg ---\n${today}: ${changelogEntry}`
      const finalContent = cleanContent + logLine

      // Lagre oppdatert MASTER-dokument
      await supabase
        .from('master_documents')
        .update({
          content: finalContent,
          version_major: result.versionMajor,
          version_minor: result.versionMinor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', master.id)

      // Merk INPUT-dokumenter som behandlet
      await supabase
        .from('input_documents')
        .update({ status: 'processed' })
        .in('id', selectedInputIds)

      // Lagre godkjente oppgaver
      if (approvedTasks.length > 0) {
        const taskRows = approvedTasks.map(i => ({
          folder_id: folderId,
          title: tasks[i].title,
          due_date: tasks[i].due_date ?? null,
          ai_suggested: true,
        }))
        await supabase.from('tasks').insert(taskRows)
      }

      // Lagre godkjente risikoer
      if (approvedRisks.length > 0) {
        const riskRows = approvedRisks.map(i => ({
          folder_id: folderId,
          title: risks[i].title,
          severity: risks[i].severity ?? 'medium',
          source_type: 'master',
          source_id: master.id,
          status: 'confirmed',
        }))
        await supabase.from('risks').insert(riskRows)
      }

      await supabase
        .from('folders')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', folderId)

      onApproved()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleReject() {
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">AI-gjennomgang — {master.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Versjon etter godkjenning: v{formatVersion(result.versionMajor, result.versionMinor)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Sammendrag */}
          <section>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Sammendrag</h3>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
              {result.summary}
            </div>
          </section>

          {/* Konflikter */}
          {conflicts.length > 0 && (
            <section>
              <h3 className="font-semibold text-orange-600 mb-2 text-sm uppercase tracking-wide">⚠ Konflikter mellom INPUT-dokumenter</h3>
              <div className="space-y-2">
                {conflicts.map((c, i) => (
                  <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                    {c}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Diff-visning */}
          <section>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">
              Foreslåtte endringer
              <span className="ml-2 text-xs font-normal text-gray-400">
                <span className="bg-green-100 text-green-700 px-1 rounded">grønt = tillegg</span>
                {' '}
                <span className="bg-red-100 text-red-700 px-1 rounded line-through">rødt = sletting</span>
              </span>
            </h3>
            <div className="h-72 border border-gray-200 rounded-xl overflow-hidden">
              <DiffView content={result.updated_content} />
            </div>
          </section>

          {/* Foreslåtte oppgaver */}
          {tasks.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">
                Foreslåtte oppgaver ({approvedTasks.length}/{tasks.length} godkjent)
              </h3>
              <div className="space-y-2">
                {tasks.map((t, i) => (
                  <label key={i} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={approvedTasks.includes(i)}
                      onChange={() => toggleTask(i)}
                      className="w-4 h-4 accent-primary-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{t.title}</p>
                      {t.due_date && <p className="text-xs text-gray-400">Frist: {t.due_date}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Foreslåtte risikoer */}
          {risks.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">
                Foreslåtte risikoer ({approvedRisks.length}/{risks.length} godkjent)
              </h3>
              <div className="space-y-2">
                {risks.map((r, i) => {
                  const severityColor = r.severity === 'high' ? 'bg-red-50 text-red-700 border-red-200' : r.severity === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                  return (
                    <label key={i} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${severityColor}`}>
                      <input
                        type="checkbox"
                        checked={approvedRisks.includes(i)}
                        onChange={() => toggleRisk(i)}
                        className="w-4 h-4 accent-primary-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{r.title}</p>
                      </div>
                      <span className="text-xs font-semibold uppercase">{r.severity}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {/* Endringslogg */}
          <section>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Endringslogg-tekst</h3>
            <textarea
              value={changelogEntry}
              onChange={e => setChangelogEntry(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
          </section>
        </div>

        {/* Bunntekst med handlinger */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={handleReject}
            className="px-6 py-2.5 text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Forkast
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            className="bg-primary-500 text-white rounded-lg px-8 py-2.5 font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Lagrer...' : 'Godkjenn og lagre'}
          </button>
        </div>
      </div>
    </div>
  )
}

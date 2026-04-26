import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../_lib/supabase.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Du er en AI-assistent som oppdaterer MASTER-dokumenter basert på ny informasjon fra INPUT-dokumenter.

Regler:
1. Oppdater kun det som er relevant basert på INPUT-dokumentene — bevar resten uendret
2. Marker tillegg i teksten med ⟨+tekst+⟩ og slettinger med ⟨-tekst-⟩
3. Dersom to INPUT-dokumenter inneholder motstridende informasjon om samme punkt, legg konflikten i conflicts-feltet — ikke velg side på egenhånd
4. Foreslå konkrete oppgaver og risikoer som følger av innholdet
5. Returner alltid gyldig JSON, ingen markdown-blokker rundt

JSON-format:
{
  "updated_content": "...",
  "summary": "...",
  "changelog_entry": "...",
  "suggested_tasks": [{ "title": "...", "due_date": null }],
  "suggested_risks": [{ "title": "...", "severity": "high|medium|low" }],
  "conflicts": ["..."]
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode ikke støttet' })

  const { folderId, masterDocId, inputDocIds } = req.body
  if (!folderId || !masterDocId || !inputDocIds?.length) {
    return res.status(400).json({ error: 'folderId, masterDocId og inputDocIds kreves' })
  }

  try {
    // Hent mappe, MASTER-dok og INPUT-dok fra Supabase
    const [folderRes, masterRes, inputsRes] = await Promise.all([
      supabase.from('folders').select('name, purpose').eq('id', folderId).single(),
      supabase.from('master_documents').select('*').eq('id', masterDocId).single(),
      supabase.from('input_documents').select('*').in('id', inputDocIds),
    ])

    const folder = folderRes.data
    const master = masterRes.data
    const inputs = inputsRes.data ?? []

    // Bygg kontekst for AI
    const inputText = inputs.map(d =>
      `--- INPUT: ${d.title} (${d.type}) ---\n${d.content ?? '(tomt)'}\n`
    ).join('\n')

    const userMessage = `
Mappe: ${folder.name}
Formål: ${folder.purpose ?? '(ikke oppgitt)'}

MASTER-dokument: ${master.name}
AI-instruksjon: ${master.ai_instruction ?? '(ingen instruksjon satt)'}

Gjeldende innhold i MASTER-dokumentet:
${master.content || '(tomt dokument — fyll ut basert på INPUT)'}

---

Nye INPUT-dokumenter som skal bearbeides:

${inputText}

Oppdater MASTER-dokumentet basert på INPUT-dokumentene og returner JSON.`

    // Kall Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = response.content[0].text.trim()

    // Parse JSON fra Claude
    let result
    try {
      result = JSON.parse(rawText)
    } catch {
      // Prøv å ekstrahere JSON fra svaret dersom det kom med forklaringstekst
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Claude returnerte ikke gyldig JSON')
      result = JSON.parse(match[0])
    }

    // Logg AI-kjøringen i databasen
    await supabase.from('ai_runs').insert({
      folder_id: folderId,
      master_doc_id: masterDocId,
      input_doc_ids: inputDocIds,
      status: 'completed',
      summary: result.summary,
    })

    // Øk versjonsnummer (uavhengig av om brukeren godkjenner)
    const newMinor = (master.version_minor + 1) % 100
    const newMajor = master.version_minor === 99 ? master.version_major + 1 : master.version_major
    await supabase
      .from('master_documents')
      .update({ version_major: newMajor, version_minor: newMinor })
      .eq('id', masterDocId)

    res.json({
      ...result,
      versionMajor: newMajor,
      versionMinor: newMinor,
    })
  } catch (err) {
    console.error('AI run feil:', err.message)
    res.status(500).json({ error: err.message })
  }
}

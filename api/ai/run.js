import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../_lib/supabase.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Konverterer markdown eller ren tekst til HTML — brukes som fallback hvis AI ignorerer HTML-kravet
function normalizeToHtml(text) {
  if (!text) return ''
  if (text.trimStart().startsWith('<')) return text

  const inline = str => str
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g,    '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,    '<em>$1</em>')
    .replace(/_(.*?)_/g,      '<em>$1</em>')
    .replace(/`(.*?)`/g,      '<code>$1</code>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  const out = []
  const listStack = []
  const closeLists = () => { while (listStack.length) out.push(`</${listStack.pop()}>`) }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('### '))     { closeLists(); out.push(`<h3>${inline(line.slice(4))}</h3>`) }
    else if (line.startsWith('## ')) { closeLists(); out.push(`<h2>${inline(line.slice(3))}</h2>`) }
    else if (line.startsWith('# '))  { closeLists(); out.push(`<h1>${inline(line.slice(2))}</h1>`) }
    else if (/^[-*]\s/.test(line)) {
      if (listStack.at(-1) !== 'ul') { closeLists(); out.push('<ul>'); listStack.push('ul') }
      out.push(`<li>${inline(line.slice(2))}</li>`)
    }
    else if (/^\d+\.\s/.test(line)) {
      if (listStack.at(-1) !== 'ol') { closeLists(); out.push('<ol>'); listStack.push('ol') }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
    }
    else if (/^[-*_]{3,}$/.test(line)) { closeLists(); out.push('<hr>') }
    else if (line === '')               { closeLists() }
    else                                { closeLists(); out.push(`<p>${inline(line)}</p>`) }
  }
  closeLists()
  return out.join('')
}

const SYSTEM_PROMPT = `Du er en AI-assistent som oppdaterer MASTER-dokumenter basert på ny informasjon fra INPUT-dokumenter.

Regler:
1. Oppdater kun det som er relevant basert på INPUT-dokumentene — bevar resten uendret
2. Marker tillegg med ⟨+tekst+⟩ og slettinger med ⟨-tekst-⟩ — KUN inne i HTML-elementer, aldri rundt block-elementer
3. Dersom to INPUT-dokumenter inneholder motstridende informasjon, legg konflikten i conflicts-feltet
4. Foreslå konkrete oppgaver og risikoer som følger av innholdet
5. Returner alltid gyldig JSON uten markdown-blokker rundt

FORMAT-KRAV for updated_content — følg stilguide kravspesifikasjon_v03:
- Skriv gyldig HTML. Font er Arial i Word-eksporten.
- Dokumentstruktur: <h1> for tittel/hoveddokumentnavn, <h2> for seksjoner, <h3> for underseksjoner
- Brødtekst: <p>. Fet: <strong>. Kursiv: <em>. Punktlister: <ul>/<li>. Nummererte: <ol>/<li>.
- Diff-markørene plasseres KUN inne i HTML-elementer:
    Riktig: <p>Status er ⟨+oppdatert til grønn+⟩.</p>
    Galt:   ⟨+<p>Ny seksjon</p>+⟩
- Ikke inkluder endringslogg i updated_content — det går i changelog_entry
- Dersom gjeldende innhold er tomt, bygg hele dokumentstrukturen fra bunnen
- Bruk norsk tegnsetting og typografiske anførselstegn («»)

JSON-format:
{
  "updated_content": "<h1>Tittel</h1><h2>Seksjon</h2><p>Innhold...</p>",
  "summary": "...",
  "changelog_entry": "...",
  "suggested_tasks": [{ "title": "...", "due_date": null }],
  "suggested_risks": [{ "title": "...", "severity": "high|medium|low" }],
  "conflicts": ["..."]
}`

const REVIEW_SYSTEM_PROMPT = `Du er en AI-assistent som gjennomgår MASTER-dokumenter for å identifisere oppgaver og risikoer.

Les dokumentet grundig og returner kun oppgaver og risikoer som IKKE allerede er eksplisitt nevnt i dokumentet som løste eller fullførte.
Fokuser på handlingspunkter, frister, ansvarsforhold og potensielle risikoer som fremgår av innholdet.

Returner alltid gyldig JSON uten markdown-blokker:
{
  "suggested_tasks": [{ "title": "...", "due_date": null }],
  "suggested_risks": [{ "title": "...", "severity": "high|medium|low" }]
}`

const QA_SYSTEM_PROMPT = `Du er en hjelpsom assistent som svarer på spørsmål basert på dokumenter i en prosjektmappe.

Regler:
1. Svar alltid på norsk.
2. Henvis eksplisitt til hvilke dokumenter du bruker ved å avslutte svaret med en «Kilder»-seksjon på dette formatet:
   ---SOURCES---
   [{"id":"<doc-id>","title":"<tittel>","type":"<master|input-type>"}]
3. Inkluder kun kilder du faktisk hentet informasjon fra.
4. Hvis svaret ikke finnes i dokumentene, si det tydelig.
5. Svar konsist og strukturert.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode ikke støttet' })

  const { folderId, masterDocId, inputDocIds, mode, question, history } = req.body

  // ── Q&A-modus ──
  if (mode === 'qa') {
    if (!folderId || !question) return res.status(400).json({ error: 'folderId og question kreves' })
    try {
      const [folderRes, mastersRes, inputsRes] = await Promise.all([
        supabase.from('folders').select('name, purpose').eq('id', folderId).single(),
        supabase.from('master_documents').select('id, name, content').eq('folder_id', folderId),
        supabase.from('input_documents').select('id, title, type, content').eq('folder_id', folderId),
      ])

      const folder   = folderRes.data
      const masters  = mastersRes.data ?? []
      const inputs   = inputsRes.data ?? []

      const docsContext = [
        ...masters.map(d => `[MASTER | id:${d.id} | "${d.name}"]\n${d.content ?? '(tomt)'}`),
        ...inputs.map(d  => `[INPUT:${d.type} | id:${d.id} | "${d.title}"]\n${d.content ?? '(tomt)'}`),
      ].join('\n\n---\n\n')

      const systemWithDocs = `${QA_SYSTEM_PROMPT}\n\nMappe: ${folder.name}\nFormål: ${folder.purpose ?? '(ikke oppgitt)'}\n\nTilgjengelige dokumenter:\n\n${docsContext}`

      const messages = [
        ...(history ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: question },
      ]

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemWithDocs,
        messages,
      })

      const raw = response.content[0].text.trim()
      const sepIdx = raw.lastIndexOf('---SOURCES---')
      let answer  = raw
      let sources = []

      if (sepIdx >= 0) {
        answer = raw.slice(0, sepIdx).trim()
        try { sources = JSON.parse(raw.slice(sepIdx + 13).trim()) } catch {}
      }

      return res.json({ answer, sources })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  const isReview = mode === 'review' || !inputDocIds?.length

  if (!folderId || !masterDocId) {
    return res.status(400).json({ error: 'folderId og masterDocId kreves' })
  }
  if (!isReview && !inputDocIds?.length) {
    return res.status(400).json({ error: 'inputDocIds kreves for full AI-kjøring' })
  }

  try {
    const [folderRes, masterRes] = await Promise.all([
      supabase.from('folders').select('name, purpose').eq('id', folderId).single(),
      supabase.from('master_documents').select('*').eq('id', masterDocId).single(),
    ])

    const folder = folderRes.data
    const master = masterRes.data

    // ── Gjennomgangs-modus: kun identifiser oppgaver og risikoer ──
    if (isReview) {
      const userMessage = `
Mappe: ${folder.name}
Formål: ${folder.purpose ?? '(ikke oppgitt)'}

MASTER-dokument: ${master.name}
AI-instruksjon: ${master.ai_instruction ?? '(ingen)'}

Innhold:
${master.content || '(tomt)'}

Gå gjennom dokumentet og identifiser nye oppgaver og risikoer. Returner JSON.`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      })

      const raw = response.content[0].text.trim()
      let result
      try { result = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : { suggested_tasks: [], suggested_risks: [] } }

      return res.json({
        suggested_tasks:  result.suggested_tasks  ?? [],
        suggested_risks:  result.suggested_risks  ?? [],
      })
    }

    // ── Full modus: oppdater MASTER med INPUT-dokumenter ──
    const inputsRes = await supabase.from('input_documents').select('*').in('id', inputDocIds)
    const inputs = inputsRes.data ?? []

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
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Claude returnerte ikke gyldig JSON')
      result = JSON.parse(match[0])
    }

    // Normaliser til HTML (fallback dersom AI returnerte markdown)
    result.updated_content = normalizeToHtml(result.updated_content)

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

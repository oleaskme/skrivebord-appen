import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseAdmin } from '../_lib/supabase.js'

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

async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isOverloaded = err.status === 529 || err.message?.includes('overloaded')
      if (isOverloaded && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attempt * 2000))
        continue
      }
      throw err
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode ikke støttet' })

  const { folderId, masterDocId, inputDocIds, mode, question, history } = req.body

  // ── Versjonshistorikk ──
  if (mode === 'list_versions') {
    if (!masterDocId) return res.status(400).json({ error: 'masterDocId kreves' })
    const { data, error } = await supabaseAdmin
      .from('master_document_versions')
      .select('id, version_label, version_major, version_minor, created_at, content')
      .eq('master_doc_id', masterDocId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ versions: data ?? [] })
  }

  // ── Versjonssaving ──
  if (mode === 'create_version') {
    const { content, versionLabel, versionMajor, versionMinor, createdBy } = req.body
    if (!masterDocId || !content || !versionLabel) return res.status(400).json({ error: 'masterDocId, content og versionLabel kreves' })
    const { data, error } = await supabaseAdmin.from('master_document_versions').insert({
      master_doc_id: masterDocId,
      content,
      version_label: versionLabel,
      version_major: versionMajor ?? 1,
      version_minor: versionMinor ?? 0,
    }).select('id').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ id: data.id })
  }

  // ── Prioritetsvurdering ──
  if (mode === 'assess_priority') {
    if (!folderId) return res.status(400).json({ error: 'folderId kreves' })
    try {
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('id, title, due_date')
        .eq('folder_id', folderId)
        .neq('status', 'completed')
        .is('priority', null)
        .is('parent_id', null)

      if (!taskRows?.length) return res.json({ certain: 0, uncertain: 0 })

      // Bygg nummerert liste slik at Claude alltid returnerer riktig index
      const indexed = taskRows.map((t, i) => ({ index: i, ...t }))
      const list = indexed.map(t =>
        `${t.index}. "${t.title}"${t.due_date ? ` (frist: ${t.due_date})` : ''}`
      ).join('\n')

      const prompt = `Vurder prioritet for følgende oppgaver.
Bruk "high", "medium" eller "low" når du er sikker.
Bruk "uncertain" hvis du ikke har nok informasjon til å vurdere prioriteten.
Svar med JSON-array der hvert element har "index" (nummeret fra listen) og "priority".
Ingen forklaring, kun JSON:
[{"index":0,"priority":"high|medium|low|uncertain"}]

Oppgaver:
${list}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = response.content[0].text.trim()
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : [] }

      // Oppdater DB direkte fra server-siden
      let certain = 0, uncertain = 0
      for (const { index, priority } of parsed) {
        const task = indexed[index]
        if (!task) continue
        if (priority === 'uncertain') {
          await supabaseAdmin.from('tasks').update({ status: 'needs_review' }).eq('id', task.id)
          uncertain++
        } else if (['high', 'medium', 'low'].includes(priority)) {
          await supabaseAdmin.from('tasks').update({ priority }).eq('id', task.id)
          certain++
        }
      }

      return res.json({ certain, uncertain })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Rydd og grupper-modus ──
  if (mode === 'cleanup') {
    const { itemType } = req.body
    if (!folderId || !itemType) return res.status(400).json({ error: 'folderId og itemType kreves' })
    try {
      let items = []
      if (itemType === 'tasks') {
        const { data } = await supabase.from('tasks').select('id, title, status, due_date').eq('folder_id', folderId).neq('status', 'completed')
        items = data ?? []
      } else {
        const { data } = await supabase.from('risks').select('id, title, severity, status').eq('folder_id', folderId).neq('status', 'dismissed')
        items = data ?? []
      }

      if (items.length < 2) return res.json({ merges: [], groups: [] })

      const itemList = items.map(it =>
        itemType === 'tasks'
          ? `id:${it.id} | "${it.title}"${it.due_date ? ` (frist: ${it.due_date})` : ''}`
          : `id:${it.id} | "${it.title}" [${it.severity}]`
      ).join('\n')

      const prompt = `Analyser følgende ${itemType === 'tasks' ? 'oppgaver' : 'risikoer'} fra en prosjektmappe og:
1. Identifiser dubletter eller nær-like elementer som bør slås sammen
2. Grupper ALLE elementene i logiske kategorier med norske gruppenavn

Liste:
${itemList}

Returner gyldig JSON uten markdown:
{
  "merges": [{ "ids": ["<id1>","<id2>"], "suggestedTitle": "...", "reason": "..." }],
  "groups": [{ "name": "Gruppenavn", "itemIds": ["<id1>","<id2>"] }]
}

Alle elementer skal tilhøre én gruppe. Ingen tomme grupper.`

      const cleanupStream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      })
      const response = await cleanupStream.finalMessage()

      if (response.stop_reason === 'max_tokens') {
        return res.status(500).json({ error: 'For mange elementer — prøv å rydde i mindre bolker.' })
      }

      const raw = response.content[0].text.trim()
      let result
      try { result = JSON.parse(raw) }
      catch {
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
        const cleaned = fenced ? fenced[1].trim() : raw
        const m = cleaned.match(/\{[\s\S]*\}/)
        result = m ? JSON.parse(m[0]) : { merges: [], groups: [] }
      }

      return res.json({ merges: result.merges ?? [], groups: result.groups ?? [] })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

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

  // ── Kaia-chat-modus ──
  if (mode === 'kaia_chat') {
    const { message, history = [] } = req.body
    if (!folderId || !message) return res.status(400).json({ error: 'folderId og message kreves' })

    try {
      // Hent kontekst
      const [{ data: tasks }, { data: risks }, { data: masters }, { data: members }] = await Promise.all([
        supabase.from('tasks').select('id, title, status, priority, due_date, owner_id, description').eq('folder_id', folderId).neq('status', 'completed').is('parent_id', null),
        supabase.from('risks').select('id, title, severity, status, description').eq('folder_id', folderId).neq('status', 'dismissed'),
        supabase.from('master_documents').select('id, name, content').eq('folder_id', folderId),
        supabase.from('folder_members').select('user_id, users(name)').eq('folder_id', folderId),
      ])

      const MAX_DOC_CHARS = 3000
      const context = `Du er Kaia, en AI-assistent som hjelper brukeren med å administrere prosjektmappen.

ÅPNE OPPGAVER:
${(tasks ?? []).map(t => `- [${t.id}] "${t.title}" | prioritet: ${t.priority ?? 'ikke satt'} | frist: ${t.due_date ?? 'ingen'} | status: ${t.status}${t.description ? ` | beskrivelse: ${t.description.slice(0, 100)}` : ''}`).join('\n') || 'Ingen'}

RISIKOER:
${(risks ?? []).map(r => `- [${r.id}] "${r.title}" | alvorlighet: ${r.severity} | status: ${r.status}${r.description ? ` | beskrivelse: ${r.description.slice(0, 100)}` : ''}`).join('\n') || 'Ingen'}

MASTER-DOKUMENTER:
${(masters ?? []).map(m => `- [${m.id}] "${m.name}"\n${(m.content ?? '').slice(0, MAX_DOC_CHARS)}${(m.content ?? '').length > MAX_DOC_CHARS ? '\n[...forkortet...]' : ''}`).join('\n\n') || 'Ingen'}

MAPPEMEDLEMMER (mulige ansvarlige, bruk user_id som owner_id):
${(members ?? []).map(m => `- [${m.user_id}] ${m.users?.name ?? 'Ukjent'}`).join('\n') || 'Ingen'}

Du kan utføre handlinger for brukeren. Etter ditt svar kan du inkludere en handlingsblokk på dette formatet (kun hvis du faktisk skal utføre noe):

ACTIONS:
[
  {"type":"update_task_status","id":"<uuid>","status":"completed|open|needs_review"},
  {"type":"update_task_priority","id":"<uuid>","priority":"high|medium|low"},
  {"type":"update_task_details","id":"<uuid>","title":"...","due_date":"YYYY-MM-DD or null","owner_id":"<uuid> or null","description":"..."},
  {"type":"create_task","title":"...","priority":"high|medium|low","due_date":"YYYY-MM-DD or null","owner_id":"<uuid> or null","description":"..."},
  {"type":"delete_task","id":"<uuid>"},
  {"type":"update_risk_status","id":"<uuid>","status":"confirmed|closed|dismissed"},
  {"type":"update_risk_details","id":"<uuid>","title":"...","severity":"high|medium|low","description":"..."},
  {"type":"create_risk","title":"...","severity":"high|medium|low","description":"..."},
  {"type":"edit_document","id":"<uuid>","content":"<html>..."},
  {"type":"create_document","name":"...","content":"<html>..."}
]
END_ACTIONS

Regler for handlinger:
- Bruk kun handlinger som er eksplisitt bedt om av brukeren.
- For edit_document: returner komplett HTML-innhold for dokumentet.
- Felter som ikke skal endres i update_*-handlinger kan utelates.
- Svar alltid på norsk. Vær konkret og handlingsorientert.`

      const messages = [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ]

      const response = await withRetry(() => anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: context,
        messages,
      }))

      const fullText = response.content[0].text

      // Parse og utfør handlinger
      const actionsMatch = fullText.match(/ACTIONS:\s*\n([\s\S]*?)(?:END_ACTIONS|$)/)
      let actionsExecuted = []
      let displayText = fullText.replace(/ACTIONS:\s*\n[\s\S]*?(?:END_ACTIONS|$)/g, '').trim()

      if (actionsMatch) {
        try {
          // Trekk ut JSON-array fra captured group (håndterer evt. code fences)
          const raw = actionsMatch[1].trim()
          const jsonStr = raw.match(/\[[\s\S]*\]/)
          if (!jsonStr) throw new Error(`Fant ingen JSON-array i ACTIONS-blokk. Raw: ${raw.slice(0, 200)}`)
          const actions = JSON.parse(jsonStr[0])
          console.log('Kaia actions:', JSON.stringify(actions))
          for (const action of actions) {
            if (action.type === 'update_task_status' && action.id && action.status) {
              const { error } = await supabaseAdmin.from('tasks').update({ status: action.status }).eq('id', action.id)
              if (!error) actionsExecuted.push({ type: action.type, id: action.id })
              else console.error('update_task_status error:', error.message)
            } else if (action.type === 'update_task_priority' && action.id && action.priority) {
              const { error } = await supabaseAdmin.from('tasks').update({ priority: action.priority }).eq('id', action.id)
              if (!error) actionsExecuted.push({ type: action.type, id: action.id })
              else console.error('update_task_priority error:', error.message)
            } else if (action.type === 'update_task_details' && action.id) {
              const fields = {}
              if (action.title) fields.title = action.title
              if ('due_date' in action) fields.due_date = action.due_date
              if ('owner_id' in action) fields.owner_id = action.owner_id
              if ('description' in action) fields.description = action.description
              if (Object.keys(fields).length) {
                const { error } = await supabaseAdmin.from('tasks').update(fields).eq('id', action.id)
                if (!error) actionsExecuted.push({ type: action.type, id: action.id })
                else console.error('update_task_details error:', error.message)
              }
            } else if (action.type === 'create_task' && action.title) {
              const { data: newTask, error } = await supabaseAdmin.from('tasks').insert({
                folder_id: folderId,
                title: action.title,
                priority: action.priority ?? null,
                due_date: action.due_date ?? null,
                owner_id: action.owner_id ?? null,
                description: action.description ?? null,
                status: 'open',
              }).select('id').single()
              if (!error) actionsExecuted.push({ type: action.type, id: newTask?.id })
              else console.error('create_task error:', error.message)
            } else if (action.type === 'delete_task' && action.id) {
              const { error } = await supabaseAdmin.from('tasks').delete().eq('id', action.id)
              if (!error) actionsExecuted.push({ type: action.type, id: action.id })
              else console.error('delete_task error:', error.message)
            } else if (action.type === 'update_risk_status' && action.id && action.status) {
              const { error } = await supabaseAdmin.from('risks').update({ status: action.status }).eq('id', action.id)
              if (!error) actionsExecuted.push({ type: action.type, id: action.id })
              else console.error('update_risk_status error:', error.message)
            } else if (action.type === 'update_risk_details' && action.id) {
              const fields = {}
              if (action.title) fields.title = action.title
              if (action.severity) fields.severity = action.severity
              if ('description' in action) fields.description = action.description
              if (Object.keys(fields).length) {
                const { error } = await supabaseAdmin.from('risks').update(fields).eq('id', action.id)
                if (!error) actionsExecuted.push({ type: action.type, id: action.id })
                else console.error('update_risk_details error:', error.message)
              }
            } else if (action.type === 'create_risk' && action.title) {
              const { data: newRisk, error } = await supabaseAdmin.from('risks').insert({
                folder_id: folderId,
                title: action.title,
                severity: action.severity ?? 'medium',
                description: action.description ?? null,
                status: 'proposed',
              }).select('id').single()
              if (!error) actionsExecuted.push({ type: action.type, id: newRisk?.id })
              else console.error('create_risk error:', error.message)
            } else if (action.type === 'edit_document' && action.id && action.content) {
              const { error } = await supabaseAdmin.from('master_documents').update({ content: action.content }).eq('id', action.id)
              if (!error) actionsExecuted.push({ type: action.type, id: action.id })
              else console.error('edit_document error:', error.message)
            } else if (action.type === 'create_document' && action.name) {
              const { data: newDoc, error } = await supabaseAdmin.from('master_documents').insert({
                folder_id: folderId,
                name: action.name,
                content: action.content ?? '',
              }).select('id').single()
              if (!error) actionsExecuted.push({ type: action.type, id: newDoc?.id })
              else console.error('create_document error:', error.message)
            }
          }
        } catch (parseErr) {
          console.error('Kaia actions parse error:', parseErr.message, '| fullText snippet:', fullText.slice(-500))
        }
      }

      return res.json({ text: displayText, actionsExecuted })
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
      const [existingTasksRes, existingRisksRes] = await Promise.all([
        supabase.from('tasks').select('title').eq('folder_id', folderId).neq('status', 'completed'),
        supabase.from('risks').select('title').eq('folder_id', folderId).neq('status', 'dismissed'),
      ])
      const existingTasks = (existingTasksRes.data ?? []).map(t => `- ${t.title}`).join('\n') || '(ingen)'
      const existingRisks = (existingRisksRes.data ?? []).map(r => `- ${r.title}`).join('\n') || '(ingen)'

      const userMessage = `
Mappe: ${folder.name}
Formål: ${folder.purpose ?? '(ikke oppgitt)'}

MASTER-dokument: ${master.name}
AI-instruksjon: ${master.ai_instruction ?? '(ingen)'}

Innhold:
${master.content || '(tomt)'}

---
Allerede registrerte oppgaver (skal IKKE foreslås på nytt):
${existingTasks}

Allerede registrerte risikoer (skal IKKE foreslås på nytt):
${existingRisks}

Gå gjennom dokumentet og identifiser KUN nye oppgaver og risikoer som ikke allerede er registrert. Returner JSON.`

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

    // Begrens innholdslengde for å unngå token-overflyt
    const MAX_MASTER_CHARS = 80_000
    const MAX_INPUT_CHARS  = 20_000
    const masterContent = (master.content || '(tomt dokument — fyll ut basert på INPUT)').slice(0, MAX_MASTER_CHARS)

    const inputText = inputs.map(d => {
      const raw = d.content ?? '(tomt)'
      const truncated = raw.slice(0, MAX_INPUT_CHARS)
      const suffix = raw.length > MAX_INPUT_CHARS ? '\n[...innhold forkortet pga. størrelse...]' : ''
      return `--- INPUT: ${d.title} (${d.type}) ---\n${truncated}${suffix}\n`
    }).join('\n')

    const userMessage = `
Mappe: ${folder.name}
Formål: ${folder.purpose ?? '(ikke oppgitt)'}

MASTER-dokument: ${master.name}
AI-instruksjon: ${master.ai_instruction ?? '(ingen instruksjon satt)'}

Gjeldende innhold i MASTER-dokumentet:
${masterContent}

---

Nye INPUT-dokumenter som skal bearbeides:

${inputText}

Oppdater MASTER-dokumentet basert på INPUT-dokumentene og returner JSON.`

    // Kall Claude API med streaming (påkrevd av SDK for store max_tokens)
    const stream = anthropic.messages.stream(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      { headers: { 'anthropic-beta': 'output-128k-2025-02-19' } },
    )
    const response = await stream.finalMessage()

    if (response.stop_reason === 'max_tokens') {
      console.error('AI run: svar ble trunkert (max_tokens nådd)')
      throw new Error('Dokumentet er for stort — AI-svaret ble avskåret. Prøv med færre eller kortere INPUT-dokumenter.')
    }

    const rawText = response.content[0].text.trim()

    // Parse JSON fra Claude — håndter markdown-fences og greedy extraction
    function extractJson(text) {
      // Strip ```json ... ``` eller ``` ... ```
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenced) return fenced[1].trim()
      return text
    }

    let result
    try {
      result = JSON.parse(extractJson(rawText))
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('AI run: ugyldig JSON. Råtekst (500 tegn):', rawText.slice(0, 500))
        throw new Error('Claude returnerte ikke gyldig JSON')
      }
      result = JSON.parse(match[0])
    }

    // Normaliser til HTML (fallback dersom AI returnerte markdown)
    result.updated_content = normalizeToHtml(result.updated_content)

    // Logg AI-kjøringen i databasen
    await supabaseAdmin.from('ai_runs').insert({
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

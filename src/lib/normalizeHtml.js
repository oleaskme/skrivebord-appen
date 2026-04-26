/**
 * Converts plain text or markdown to HTML for TipTap/Word rendering.
 * If content already looks like HTML, returns it unchanged.
 */
export function normalizeToHtml(text) {
  if (!text) return ''
  if (text.trimStart().startsWith('<')) return text

  const inline = str => str
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g,    '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,    '<em>$1</em>')
    .replace(/_(.*?)_/g,      '<em>$1</em>')
    .replace(/`(.*?)`/g,      '<code>$1</code>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links, keep label

  const out = []
  const listStack = []

  const closeLists = () => {
    while (listStack.length) out.push(`</${listStack.pop()}>`)
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()

    if (line.startsWith('### '))      { closeLists(); out.push(`<h3>${inline(line.slice(4))}</h3>`) }
    else if (line.startsWith('## '))  { closeLists(); out.push(`<h2>${inline(line.slice(3))}</h2>`) }
    else if (line.startsWith('# '))   { closeLists(); out.push(`<h1>${inline(line.slice(2))}</h1>`) }
    else if (/^[-*]\s/.test(line)) {
      if (listStack.at(-1) !== 'ul') { closeLists(); out.push('<ul>'); listStack.push('ul') }
      out.push(`<li>${inline(line.slice(2))}</li>`)
    }
    else if (/^\d+\.\s/.test(line)) {
      if (listStack.at(-1) !== 'ol') { closeLists(); out.push('<ol>'); listStack.push('ol') }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
    }
    else if (/^[-*_]{3,}$/.test(line)) { closeLists(); out.push('<hr>') }
    else if (line === '')              { closeLists() }
    else                               { closeLists(); out.push(`<p>${inline(line)}</p>`) }
  }

  closeLists()
  return out.join('')
}

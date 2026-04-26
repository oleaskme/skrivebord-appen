export async function sha256(text) {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function formatVersion(major, minor) {
  return `${String(major).padStart(2, '0')}.${String(minor).padStart(2, '0')}`
}

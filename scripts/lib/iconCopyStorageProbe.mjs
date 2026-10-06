// Browser-native read-only probe for one explicitly owned fixture. No image
// bytes or lease secrets leave the page. Keep the protocol hash covered against
// shared/iconLocalCopy.ts rather than assuming content_revision is a raw hash.
export async function pageReadFixtureCopy(key) {
  if (!/^(bookmark|category):[1-9]\d*$/.test(key)) throw new Error('Invalid fixture key')
  const name = 'cf-navs-object-icons-v1'
  if (!(await indexedDB.databases()).some(database => database.name === name)) return { available: false }
  const request = indexedDB.open(name)
  const db = await new Promise((resolve, reject) => {
    request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Copy database disappeared')) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    const tx = db.transaction(['control', 'entries', 'bodies'], 'readonly')
    const done = new Promise((resolve, reject) => { tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error); tx.onerror=()=>reject(tx.error) })
    const get = (store, id) => new Promise((resolve, reject) => { const r=tx.objectStore(store).get(id); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
    const [[control, entry, body]] = await Promise.all([Promise.all([get('control','active'),get('entries',key),get('bodies',key)]),done])
    let revision = null
    if (body instanceof Blob && body.size > 0) {
      const prefix = new TextEncoder().encode('cf-navs-icon-v1\n' + body.type + '\n')
      const bytes = new Uint8Array(await body.arrayBuffer())
      const input = new Uint8Array(prefix.length + bytes.length)
      input.set(prefix); input.set(bytes, prefix.length)
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
      revision = 'sha256-' + [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
    }
    return { available:true, enabled:control?.enabled===true, entryPresent:entry!==undefined, bodyPresent:body!==undefined,
      descriptor:entry?.descriptor, bodyBytes:body instanceof Blob?body.size:0, bodyRevision:revision }
  } finally { db.close() }
}

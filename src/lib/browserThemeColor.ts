/** Keep browser/PWA chrome aligned with the root theme without inline script. */
export function installBrowserThemeColor(doc: Document, Observer: typeof MutationObserver | null = typeof MutationObserver === 'undefined' ? null : MutationObserver): () => void {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return () => undefined
  const sync = () => { meta.content = doc.documentElement.getAttribute('data-theme') === 'dark' ? '#08111f' : '#f8fafc' }
  sync()
  if (!Observer) return () => undefined
  const observer = new Observer(sync)
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

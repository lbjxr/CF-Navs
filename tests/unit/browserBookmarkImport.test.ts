import { describe, expect, it } from 'vitest'
import { detectImportSource, prepareBrowserBookmarkHtml } from '../../src/lib/importData'

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
<DT><H3>Work</H3><DL><p>
<DT><A HREF="https://example.com" ADD_DATE="1700000000" ICON="data:image/png;base64,AA">Example</A>
<DD>Example description
<DT><H3>Nested</H3><DL><p><DT><A HREF="https://example.com/two">Two</A></DL><p>
</DL><p>
<DT><A HREF="chrome://settings">Skip</A>
</DL><p>`

describe('browser bookmark import', () => {
  it('detects HTML, folds nested folders and filters protocols', () => {
    expect(detectImportSource(html, 'bookmarks.html')).toBe('browser-html')
    const result = prepareBrowserBookmarkHtml(html)
    expect(result.categories).toBe(1)
    expect(result.bookmarks).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.payload.bookmarks[0].description).toBe('Example description')
    expect(result.payload.bookmarks[0].icon_blob).toMatch(/^data:image\//)
    expect(result.payload.bookmarks[0].created_at).toBe(1700000000000)
  })
})

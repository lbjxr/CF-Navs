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

  it('uses root H3 folders as categories and folds their descendants', () => {
    const exportedHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>
  <DL><p>
    <DT><A HREF="https://alpha.example">Alpha</A>
    <DT><H3>Nested Folder</H3>
    <DL><p><DT><A HREF="https://beta.example">Beta</A></DL><p>
  </DL><p>
  <DT><H3>Other Bookmarks</H3>
  <DL><p><DT><A HREF="https://gamma.example">Gamma</A></DL><p>
</DL><p>`

    const result = prepareBrowserBookmarkHtml(exportedHtml)
    expect(result.payload.categories.map(category => category.title)).toEqual(['Bookmarks Bar', 'Other Bookmarks'])
    expect(result.payload.bookmarks.map(bookmark => bookmark.category_id)).toEqual([1, 1, 2])
  })

  it('uses the fallback category only for links directly in the root list', () => {
    const exportedHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
<DT><A HREF="https://root.example">Root</A>
<DT><H3>Folder</H3><DL><p>
  <DT><A HREF="https://folder.example">Folder link</A>
</DL><p>
</DL><p>`

    const result = prepareBrowserBookmarkHtml(exportedHtml)
    expect(result.payload.categories.map(category => category.title)).toEqual(['浏览器书签', 'Folder'])
    expect(result.payload.bookmarks.map(bookmark => bookmark.category_id)).toEqual([1, 2])
  })
})

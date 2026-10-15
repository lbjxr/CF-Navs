import { describe, expect, it } from 'vitest'
import { truncateUnicodeText } from '../../../src/lib/truncateUnicodeText'

describe('truncateUnicodeText', () => {
  it('keeps empty and exact-length values unchanged', () => {
    expect(truncateUnicodeText('', 12)).toBe('')
    expect(truncateUnicodeText('十二个字符刚刚好', 8)).toBe('十二个字符刚刚好')
  })

  it('counts the ellipsis inside the display budget', () => {
    expect(truncateUnicodeText('这是一个超过十二个字符的中文标题', 12)).toBe('这是一个超过十二个字符…')
    expect(Array.from(truncateUnicodeText('abcdefghijklmnop', 12))).toHaveLength(12)
  })

  it('does not split emoji or combining character sequences', () => {
    expect(truncateUnicodeText('😀😀😀', 2)).toBe('😀…')
    expect(truncateUnicodeText('e\u0301clair', 2)).toBe('e\u0301…')
  })

  it('returns only an ellipsis when the budget is one grapheme', () => {
    expect(truncateUnicodeText('long value', 1)).toBe('…')
    expect(truncateUnicodeText('long value', 0)).toBe('')
  })
})

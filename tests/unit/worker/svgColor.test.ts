import { describe, expect, it } from 'vitest'
import { extractSvgText, svgHasColor } from '../../../worker/lib/svgColor'

describe('worker SVG color helpers', () => {
  it('detects perceptibly colored fills and strokes', () => {
    expect(svgHasColor('<svg><path fill="#ef4444"/></svg>')).toBe(true)
    expect(svgHasColor('<svg><path style="stroke: rgb(20, 140, 90)"/></svg>')).toBe(true)
    expect(svgHasColor('<svg><stop stop-color="orange"/></svg>')).toBe(true)
  })

  it('ignores neutral, inherited, transparent, and url-based paints', () => {
    expect(svgHasColor('<svg><path fill="#111111" stroke="white"/></svg>')).toBe(false)
    expect(svgHasColor('<svg><path fill="currentColor"/></svg>')).toBe(false)
    expect(svgHasColor('<svg><path style="fill: transparent; stroke: url(#g)"/></svg>')).toBe(false)
  })

  it('extracts SVG text only for SVG content types', () => {
    const bytes = new TextEncoder().encode('<svg></svg>')
    expect(extractSvgText(bytes, 'image/svg+xml; charset=utf-8')).toBe('<svg></svg>')
    expect(extractSvgText(bytes, 'image/png')).toBe('')
  })
})

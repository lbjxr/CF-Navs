import { describe, expect, it } from 'vitest'
import { exceedsErrorReportBodyLimit, MAX_ERROR_REPORT_ENTRIES, normalizeErrorReportPayload } from '../../../worker/lib/errorReportValidation'

describe('error report validation', () => {
  it('normalizes and bounds accepted fields', () => {
    const [entry] = normalizeErrorReportPayload({ category: ' Network ', message: ` failure ${'x'.repeat(300)} `, timestamp: 123, url: `https://example.test/${'x'.repeat(300)}`, line: 10, col: -1, stack: 'hidden' })
    expect(entry.category).toBe('network')
    expect(entry.message.length).toBeLessThanOrEqual(200)
    expect(entry.url?.length).toBeLessThanOrEqual(200)
    expect(entry.line).toBe(10)
    expect(entry.col).toBeUndefined()
    expect('stack' in entry).toBe(false)
  })

  it('drops invalid entries and caps batch size', () => {
    const errors = Array.from({ length: MAX_ERROR_REPORT_ENTRIES + 5 }, (_, index) => index === 0 ? { nope: true } : { message: `error-${index}` })
    expect(normalizeErrorReportPayload({ errors })).toHaveLength(MAX_ERROR_REPORT_ENTRIES - 1)
  })

  it('detects declared and actual oversized bodies', () => {
    expect(exceedsErrorReportBodyLimit('20000', '{}')).toBe(true)
    expect(exceedsErrorReportBodyLimit(undefined, 'x'.repeat(20_000))).toBe(true)
    expect(exceedsErrorReportBodyLimit('2', '{}')).toBe(false)
  })

  it('replaces timestamps outside the valid Date range', () => {
    const [entry] = normalizeErrorReportPayload({ message: 'bad timestamp', timestamp: 1e100 })
    expect(entry.timestamp).toBeLessThanOrEqual(Date.now())
    expect(() => new Date(entry.timestamp).toISOString()).not.toThrow()
  })
})

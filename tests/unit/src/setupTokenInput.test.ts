import { describe, expect, it } from 'vitest'
import { SETUP_TOKEN_ASCII_ERROR, isAsciiPrintableToken } from '../../../src/lib/setupTokenInput'

describe('isAsciiPrintableToken', () => {
  it('accepts visible ASCII incl. common symbols', () => {
    expect(isAsciiPrintableToken('123456#$%@ss')).toBe(true)
    expect(isAsciiPrintableToken('aZ0-_.!~*()+=/')).toBe(true)
  })

  it('rejects full-width / non-ISO-8859-1 code points (the header-throwing case)', () => {
    expect(isAsciiPrintableToken('123456#\uFFE5%@ss')).toBe(false) // 全角￥ U+FFE5
    expect(isAsciiPrintableToken('密码token')).toBe(false)
    expect(isAsciiPrintableToken('café')).toBe(false) // é U+00E9 是 ISO-8859-1 但非可见 ASCII
  })

  it('rejects control chars, tab, newline and empty', () => {
    expect(isAsciiPrintableToken('')).toBe(false)
    expect(isAsciiPrintableToken('ab\tcd')).toBe(false)
    expect(isAsciiPrintableToken('ab\ncd')).toBe(false)
    expect(isAsciiPrintableToken('ab\x7fcd')).toBe(false) // DEL
  })

  it('exposes a user-facing message that does not leak the raw TypeError', () => {
    expect(SETUP_TOKEN_ASCII_ERROR).toContain('ASCII')
    expect(SETUP_TOKEN_ASCII_ERROR).not.toContain('ISO-8859-1')
  })
})

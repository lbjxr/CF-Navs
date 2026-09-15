import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_COLOR_MAX_LENGTH,
  BACKGROUND_VALUE_MAX_LENGTH,
  SETTINGS_MAX_LENGTHS,
  countCodePoints,
  findSettingsLengthError,
} from '../../worker/lib/settingsLimits'

describe('code point counting', () => {
  it('counts what the user perceives, not UTF-16 units', () => {
    // '😀'.length === 2；按 length 计数会让含 emoji 的标题被误判为超长
    expect(countCodePoints('😀')).toBe(1)
    expect(countCodePoints('😀'.repeat(5))).toBe(5)
    expect(countCodePoints('中文标题')).toBe(4)
    expect(countCodePoints('')).toBe(0)
  })
})

describe('settings length limits', () => {
  it('accepts a payload exactly at each limit', () => {
    for (const [field, max] of Object.entries(SETTINGS_MAX_LENGTHS)) {
      expect(findSettingsLengthError({ [field]: 'a'.repeat(max) }), field).toBeNull()
    }
  })

  it('rejects one character over each limit and names the field', () => {
    for (const [field, max] of Object.entries(SETTINGS_MAX_LENGTHS)) {
      expect(findSettingsLengthError({ [field]: 'a'.repeat(max + 1) }), field).toEqual({ field, max })
    }
  })

  it('measures emoji by code point', () => {
    const max = SETTINGS_MAX_LENGTHS.site_title
    // 200 个 emoji 的 UTF-16 length 是 400，按 length 判定会被错误拒绝
    expect(findSettingsLengthError({ site_title: '😀'.repeat(max) })).toBeNull()
    expect(findSettingsLengthError({ site_title: '😀'.repeat(max + 1) })).toEqual({
      field: 'site_title',
      max,
    })
  })

  it('caps background values, which ride along in every public data response', () => {
    // 一张几 MB 的 data URI 背景会进入每个访客的 /api/public/data，
    // 直接违反性能契约里「聚合数据约 38 KB」的约定。
    expect(findSettingsLengthError({
      background: { value: 'x'.repeat(BACKGROUND_VALUE_MAX_LENGTH + 1) },
    })).toEqual({ field: 'background.value', max: BACKGROUND_VALUE_MAX_LENGTH })

    expect(findSettingsLengthError({
      backgrounds: { dark: { value: 'x'.repeat(BACKGROUND_VALUE_MAX_LENGTH + 1) } },
    })).toEqual({ field: 'backgrounds.dark.value', max: BACKGROUND_VALUE_MAX_LENGTH })

    expect(findSettingsLengthError({
      backgrounds: { light: { maskColor: 'x'.repeat(BACKGROUND_COLOR_MAX_LENGTH + 1) } },
    })).toEqual({ field: 'backgrounds.light.maskColor', max: BACKGROUND_COLOR_MAX_LENGTH })
  })

  it('ignores absent, null and non-string fields', () => {
    // 类型校验由路由自己做，长度检查不该对非字符串误报
    expect(findSettingsLengthError({})).toBeNull()
    expect(findSettingsLengthError({ site_title: null })).toBeNull()
    expect(findSettingsLengthError({ site_title: 12345 })).toBeNull()
    expect(findSettingsLengthError({ background: undefined })).toBeNull()
    expect(findSettingsLengthError({ backgrounds: { light: undefined, dark: undefined } })).toBeNull()
  })

  it('covers every unbounded string setting that reaches public data', () => {
    // 漏掉一个字段就等于这条防线对它不存在，所以字段清单本身也要锁住
    expect(Object.keys(SETTINGS_MAX_LENGTHS).sort()).toEqual([
      'card_background_color',
      'card_text_color',
      'custom_accent_color',
      'custom_css',
      'custom_dark_accent_color',
      'custom_js',
      'footer_html',
      'image_host_url',
      'site_title',
      'site_title_color',
    ])
  })
})

// 设置项的长度上限。
//
// 之前每个字段只校验类型，长度完全不限。最要命的是 `background.value`：它可以是
// data URI 图片，而且会经 toPublicSettings 进入 /api/public/data——**每个访客每次
// 拉取聚合数据都会带上它**。一张几 MB 的背景图会直接违反性能契约里「聚合数据保持
// 轻量、约 38 KB」的约定，还会撑爆 1.5 MB 的本地快照上限。
//
// 按 Unicode 码位而不是 UTF-16 长度计数：`'😀'.length === 2`、CJK 也常被误判，
// 用码位数才是用户感知的「字数」。

import type { Settings } from '../../shared/types'

export const SETTINGS_MAX_LENGTHS = {
  site_title: 200,
  site_title_color: 64,
  card_background_color: 64,
  card_text_color: 64,
  custom_accent_color: 64,
  custom_dark_accent_color: 64,
  image_host_url: 2048,
  custom_css: 65_536,
  custom_js: 65_536,
  footer_html: 65_536,
} as const satisfies Partial<Record<keyof Settings, number>>

// 背景相关字段单独列：value 可能是 data URI，上限比普通文本高一个量级。
export const BACKGROUND_VALUE_MAX_LENGTH = 262_144
export const BACKGROUND_COLOR_MAX_LENGTH = 64

export function countCodePoints(value: string): number {
  let count = 0
  for (const _ of value) count += 1
  return count
}

export function exceedsLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && countCodePoints(value) > max
}

export type SettingsLengthError = { field: string; max: number }

function checkBackground(
  label: string,
  background: Partial<Settings['background']> | undefined,
): SettingsLengthError | null {
  if (!background) return null

  if (exceedsLength(background.value, BACKGROUND_VALUE_MAX_LENGTH)) {
    return { field: `${label}.value`, max: BACKGROUND_VALUE_MAX_LENGTH }
  }
  if (exceedsLength(background.maskColor, BACKGROUND_COLOR_MAX_LENGTH)) {
    return { field: `${label}.maskColor`, max: BACKGROUND_COLOR_MAX_LENGTH }
  }

  return null
}

export function findSettingsLengthError(body: Record<string, unknown>): SettingsLengthError | null {
  for (const [field, max] of Object.entries(SETTINGS_MAX_LENGTHS)) {
    if (exceedsLength(body[field], max)) return { field, max }
  }

  const background = body.background as Partial<Settings['background']> | undefined
  const rootError = checkBackground('background', background)
  if (rootError) return rootError

  const backgrounds = body.backgrounds as Partial<Settings['backgrounds']> | undefined
  if (backgrounds) {
    for (const theme of ['light', 'dark'] as const) {
      const themeError = checkBackground(`backgrounds.${theme}`, backgrounds[theme])
      if (themeError) return themeError
    }
  }

  return null
}

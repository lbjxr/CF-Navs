// 首页渲染只需要预设的卡片 / 强调 / 文字颜色。完整预设（名称、描述、渐变背景，约 17KB）
// 只在设置面板里用，留在 themePresets.ts 随设置 chunk 懒加载（代码审查二轮第 4 项）。
// 这里的值必须与 themePresets.ts 一致：tests/unit/themePresetRender.test.ts 逐项比对。

import type { GradientPresetId, ThemeGradientPreset } from './themePresets'

export type PresetRenderTokens = Pick<ThemeGradientPreset,
  | 'surface' | 'cardBackgroundColor' | 'darkCardBackgroundColor' | 'accentColor' | 'darkAccentColor'
  | 'accentTextColor' | 'darkAccentTextColor'
  | 'lightCardTitleColor' | 'lightCardDescriptionColor' | 'darkCardTitleColor' | 'darkCardDescriptionColor'>

function glass(accentColor: string, darkAccentColor: string): PresetRenderTokens {
  return {
    surface: 'glass', cardBackgroundColor: '#ffffff', darkCardBackgroundColor: '#0f172a', accentColor, darkAccentColor,
    accentTextColor: accentColor, darkAccentTextColor: darkAccentColor,
    lightCardTitleColor: '#0f172a', lightCardDescriptionColor: '#475569', darkCardTitleColor: '#e5eefb', darkCardDescriptionColor: '#cbd5e1',
  }
}

function flat(
  cardBackgroundColor: string, darkCardBackgroundColor: string, accentColor: string, darkAccentColor: string,
  lightCardTitleColor: string, lightCardDescriptionColor: string, darkCardTitleColor: string, darkCardDescriptionColor: string,
): PresetRenderTokens {
  return {
    surface: 'flat', cardBackgroundColor, darkCardBackgroundColor, accentColor, darkAccentColor,
    accentTextColor: lightCardTitleColor, darkAccentTextColor: darkCardTitleColor,
    lightCardTitleColor, lightCardDescriptionColor, darkCardTitleColor, darkCardDescriptionColor,
  }
}

export const presetRenderTokens: Record<GradientPresetId, PresetRenderTokens> = {
  'paper-sage': flat('#f3f7f0', '#2b332a', '#71836f', '#a9c2a0', '#273126', '#526050', '#edf4e9', '#b9c8b4'),
  'paper-clay': flat('#f8efec', '#372b28', '#b08f89', '#d4b1aa', '#352824', '#6b5550', '#f6ece9', '#ccb9b3'),
  'paper-wheat': flat('#faf3e6', '#373126', '#a98c65', '#d1b894', '#342d22', '#6b5c46', '#f6f0e5', '#c9bea9'),
  'paper-slate': flat('#eff5f7', '#2b3439', '#718a98', '#a8bac4', '#233039', '#526671', '#edf3f5', '#b8c7ce'),
  'paper-pine': flat('#f0f5ed', '#283126', '#5c6857', '#a9b8a3', '#253023', '#52604f', '#edf4ea', '#b7c7b2'),
  'paper-sakura': flat('#faedf1', '#382a2f', '#c88797', '#e4b2be', '#38282e', '#755965', '#f7ecef', '#ceb8c0'),
  'paper-lavender': flat('#f4f1f8', '#312d3c', '#857bb8', '#bdb5df', '#302b3a', '#625b73', '#f2eef7', '#c5bdd2'),
  'paper-indigo': flat('#edf4ff', '#282f39', '#5f769b', '#9eb2d0', '#243247', '#53647d', '#edf3fb', '#bac7d9'),
  'paper-amber': flat('#fbf3e2', '#373024', '#bd8b42', '#e3c188', '#372d1d', '#6f5b3b', '#f7f0e3', '#cbbda3'),
  'clear-teal': glass('#155e75', '#67e8f9'),
  'mist-slate': glass('#0f766e', '#5eead4'),
  'coral-sky': glass('#be123c', '#fda4af'),
  'sage-graphite': glass('#3f6212', '#bef264'),
  'lumen-amber': glass('#92400e', '#fcd34d'),
  'ember-night': glass('#b91c1c', '#fca5a5'),
  'violet-dawn': glass('#6d28d9', '#c4b5fd'),
  'ocean-depths': glass('#0369a1', '#7dd3fc'),
  'aurora-borealis': glass('#047857', '#6ee7b7'),
  'citrus-sunset': glass('#9a3412', '#fdba74'),
  'rose-orbit': glass('#be185d', '#f9a8d4'),
  'indigo-noir': glass('#4338ca', '#a5b4fc'),
  'terracotta-dune': glass('#7c2d12', '#fed7aa'),
}

export function getPresetRenderTokens(id: string | null | undefined): PresetRenderTokens | undefined {
  return id && Object.prototype.hasOwnProperty.call(presetRenderTokens, id) ? presetRenderTokens[id as GradientPresetId] : undefined
}

import type { BackgroundPresetId, BackgroundSetting } from '../../shared/types'

export type GradientPresetId = Exclude<BackgroundPresetId, 'custom'>

export type ThemeGradientPreset = {
  id: GradientPresetId
  label: string
  description: string
  light: BackgroundSetting
  dark: BackgroundSetting
  cardBackgroundColor: string
  cardBackgroundOpacity: number
  cardTextColor: string
  siteTitleColor: string
}

const clearTealLightGradient = [
  'radial-gradient(circle at 18% 12%, rgba(125, 211, 252, 0.42), transparent 32%)',
  'radial-gradient(circle at 82% 22%, rgba(45, 212, 191, 0.34), transparent 34%)',
  'radial-gradient(circle at 50% 92%, rgba(248, 250, 252, 0.9), transparent 42%)',
  'linear-gradient(135deg, #f8fbff 0%, #eef7f5 46%, #f6f7fb 100%)',
].join(', ')

const clearTealDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(34, 211, 238, 0.22), transparent 34%)',
  'radial-gradient(circle at 84% 26%, rgba(20, 184, 166, 0.18), transparent 36%)',
  'radial-gradient(circle at 52% 92%, rgba(59, 130, 246, 0.12), transparent 42%)',
  'linear-gradient(135deg, #07111f 0%, #0d1b24 48%, #111827 100%)',
].join(', ')

const mistSlateLightGradient = [
  'radial-gradient(circle at 20% 16%, rgba(134, 239, 172, 0.28), transparent 30%)',
  'radial-gradient(circle at 76% 18%, rgba(147, 197, 253, 0.34), transparent 34%)',
  'radial-gradient(circle at 62% 86%, rgba(226, 232, 240, 0.78), transparent 40%)',
  'linear-gradient(145deg, #f7faf8 0%, #edf4f7 42%, #f4f1ec 100%)',
].join(', ')

const mistSlateDarkGradient = [
  'radial-gradient(circle at 18% 12%, rgba(34, 197, 94, 0.16), transparent 32%)',
  'radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.18), transparent 34%)',
  'radial-gradient(circle at 58% 88%, rgba(180, 83, 9, 0.1), transparent 42%)',
  'linear-gradient(145deg, #08120f 0%, #10202a 46%, #171717 100%)',
].join(', ')

export const gradientPresets: ThemeGradientPreset[] = [
  {
    id: 'clear-teal',
    label: '清透蓝绿',
    description: '清爽的蓝绿冷调，适合玻璃卡片和高对比文字。',
    light: { type: 'gradient', value: clearTealLightGradient, blur: 0, mask: 0.12, maskColor: '#ffffff' },
    dark: { type: 'gradient', value: clearTealDarkGradient, blur: 0, mask: 0.28, maskColor: '#000000' },
    cardBackgroundColor: '#ffffff',
    cardBackgroundOpacity: 0.4,
    cardTextColor: '',
    siteTitleColor: '',
  },
  {
    id: 'mist-slate',
    label: '晨雾石青',
    description: '更柔和的石青和浅绿组合，页面氛围安静，卡片边界清晰。',
    light: { type: 'gradient', value: mistSlateLightGradient, blur: 0, mask: 0.14, maskColor: '#ffffff' },
    dark: { type: 'gradient', value: mistSlateDarkGradient, blur: 0, mask: 0.3, maskColor: '#000000' },
    cardBackgroundColor: '#ffffff',
    cardBackgroundOpacity: 0.4,
    cardTextColor: '',
    siteTitleColor: '',
  },
]

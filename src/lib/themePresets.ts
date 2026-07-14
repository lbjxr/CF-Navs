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

const coralSkyLightGradient = [
  'radial-gradient(circle at 14% 14%, rgba(251, 113, 133, 0.26), transparent 30%)',
  'radial-gradient(circle at 84% 18%, rgba(56, 189, 248, 0.24), transparent 34%)',
  'radial-gradient(circle at 50% 92%, rgba(204, 251, 241, 0.62), transparent 42%)',
  'linear-gradient(140deg, #fff7fb 0%, #f7fbff 48%, #f4fff8 100%)',
].join(', ')

const coralSkyDarkGradient = [
  'radial-gradient(circle at 16% 16%, rgba(251, 113, 133, 0.17), transparent 32%)',
  'radial-gradient(circle at 82% 22%, rgba(34, 211, 238, 0.16), transparent 34%)',
  'radial-gradient(circle at 48% 90%, rgba(16, 185, 129, 0.1), transparent 42%)',
  'linear-gradient(140deg, #140d14 0%, #111827 52%, #08131f 100%)',
].join(', ')

const sageGraphiteLightGradient = [
  'radial-gradient(circle at 18% 16%, rgba(132, 204, 22, 0.22), transparent 31%)',
  'radial-gradient(circle at 78% 20%, rgba(20, 184, 166, 0.2), transparent 34%)',
  'radial-gradient(circle at 60% 88%, rgba(226, 232, 240, 0.7), transparent 42%)',
  'linear-gradient(145deg, #f7fbf6 0%, #eef6f1 46%, #f6f8fb 100%)',
].join(', ')

const sageGraphiteDarkGradient = [
  'radial-gradient(circle at 18% 16%, rgba(132, 204, 22, 0.14), transparent 32%)',
  'radial-gradient(circle at 78% 22%, rgba(45, 212, 191, 0.13), transparent 36%)',
  'radial-gradient(circle at 58% 88%, rgba(148, 163, 184, 0.1), transparent 42%)',
  'linear-gradient(145deg, #0a120d 0%, #121a18 46%, #151821 100%)',
].join(', ')

const lumenAmberLightGradient = [
  'radial-gradient(circle at 18% 16%, rgba(251, 191, 36, 0.26), transparent 30%)',
  'radial-gradient(circle at 82% 18%, rgba(125, 211, 252, 0.23), transparent 34%)',
  'radial-gradient(circle at 54% 88%, rgba(244, 114, 182, 0.1), transparent 40%)',
  'linear-gradient(145deg, #fffdf7 0%, #f7fbff 48%, #f8fbf4 100%)',
].join(', ')

const lumenAmberDarkGradient = [
  'radial-gradient(circle at 18% 16%, rgba(245, 158, 11, 0.16), transparent 32%)',
  'radial-gradient(circle at 82% 20%, rgba(14, 165, 233, 0.14), transparent 35%)',
  'radial-gradient(circle at 58% 88%, rgba(244, 63, 94, 0.1), transparent 42%)',
  'linear-gradient(145deg, #12110a 0%, #17202a 48%, #171717 100%)',
].join(', ')

const emberNightLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(248, 113, 113, 0.18), transparent 30%)',
  'radial-gradient(circle at 82% 20%, rgba(45, 212, 191, 0.2), transparent 34%)',
  'radial-gradient(circle at 58% 88%, rgba(203, 213, 225, 0.72), transparent 42%)',
  'linear-gradient(145deg, #fbfbfd 0%, #f3f7f7 48%, #fff8f5 100%)',
].join(', ')

const emberNightDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(248, 113, 113, 0.18), transparent 32%)',
  'radial-gradient(circle at 82% 22%, rgba(45, 212, 191, 0.16), transparent 34%)',
  'radial-gradient(circle at 54% 90%, rgba(251, 191, 36, 0.08), transparent 42%)',
  'linear-gradient(145deg, #140b0d 0%, #141a1f 48%, #081214 100%)',
].join(', ')

const violetDawnLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(196, 181, 253, 0.5), transparent 32%)',
  'radial-gradient(circle at 84% 18%, rgba(244, 114, 182, 0.28), transparent 34%)',
  'radial-gradient(circle at 54% 92%, rgba(186, 230, 253, 0.48), transparent 44%)',
  'linear-gradient(145deg, #fbfaff 0%, #f4f0ff 48%, #f8f7ff 100%)',
].join(', ')

const violetDawnDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(167, 139, 250, 0.28), transparent 34%)',
  'radial-gradient(circle at 84% 20%, rgba(236, 72, 153, 0.16), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(56, 189, 248, 0.14), transparent 44%)',
  'linear-gradient(145deg, #120f22 0%, #1a1531 48%, #111827 100%)',
].join(', ')

const oceanDepthsLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(56, 189, 248, 0.38), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.32), transparent 35%)',
  'radial-gradient(circle at 52% 92%, rgba(191, 219, 254, 0.56), transparent 43%)',
  'linear-gradient(145deg, #f4fbff 0%, #edf8ff 46%, #f0fbfa 100%)',
].join(', ')

const oceanDepthsDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(14, 165, 233, 0.3), transparent 34%)',
  'radial-gradient(circle at 84% 20%, rgba(20, 184, 166, 0.2), transparent 36%)',
  'radial-gradient(circle at 52% 92%, rgba(59, 130, 246, 0.16), transparent 44%)',
  'linear-gradient(145deg, #061724 0%, #082b3a 48%, #0b1a2d 100%)',
].join(', ')

const auroraBorealisLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(163, 230, 53, 0.3), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.3), transparent 35%)',
  'radial-gradient(circle at 54% 92%, rgba(216, 180, 254, 0.34), transparent 44%)',
  'linear-gradient(145deg, #f8fff7 0%, #eefbf5 48%, #f7f4ff 100%)',
].join(', ')

const auroraBorealisDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(132, 204, 22, 0.25), transparent 34%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.22), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(168, 85, 247, 0.2), transparent 44%)',
  'linear-gradient(145deg, #071b18 0%, #0b2827 48%, #17142b 100%)',
].join(', ')

const citrusSunsetLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(251, 191, 36, 0.36), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(251, 113, 133, 0.3), transparent 35%)',
  'radial-gradient(circle at 54% 92%, rgba(253, 230, 138, 0.44), transparent 44%)',
  'linear-gradient(145deg, #fffdf4 0%, #fff4e8 48%, #fff7f1 100%)',
].join(', ')

const citrusSunsetDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(245, 158, 11, 0.24), transparent 34%)',
  'radial-gradient(circle at 84% 18%, rgba(244, 63, 94, 0.2), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(249, 115, 22, 0.14), transparent 44%)',
  'linear-gradient(145deg, #211305 0%, #2a1710 48%, #21100f 100%)',
].join(', ')

const roseOrbitLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(244, 114, 182, 0.34), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(192, 132, 252, 0.3), transparent 35%)',
  'radial-gradient(circle at 54% 92%, rgba(253, 186, 116, 0.28), transparent 44%)',
  'linear-gradient(145deg, #fff8fc 0%, #fdf2ff 48%, #fff8f2 100%)',
].join(', ')

const roseOrbitDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(236, 72, 153, 0.25), transparent 34%)',
  'radial-gradient(circle at 84% 18%, rgba(168, 85, 247, 0.22), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(249, 115, 22, 0.13), transparent 44%)',
  'linear-gradient(145deg, #21101f 0%, #2a1230 48%, #251612 100%)',
].join(', ')

const indigoNoirLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(129, 140, 248, 0.38), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(96, 165, 250, 0.3), transparent 35%)',
  'radial-gradient(circle at 54% 92%, rgba(165, 180, 252, 0.36), transparent 44%)',
  'linear-gradient(145deg, #f8f9ff 0%, #f0f3ff 48%, #f6f7ff 100%)',
].join(', ')

const indigoNoirDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(99, 102, 241, 0.3), transparent 34%)',
  'radial-gradient(circle at 84% 18%, rgba(59, 130, 246, 0.2), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(139, 92, 246, 0.16), transparent 44%)',
  'linear-gradient(145deg, #0c1024 0%, #11183a 48%, #15142b 100%)',
].join(', ')

const terracottaDuneLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(251, 146, 60, 0.3), transparent 31%)',
  'radial-gradient(circle at 84% 18%, rgba(180, 83, 9, 0.22), transparent 35%)',
  'radial-gradient(circle at 54% 92%, rgba(190, 242, 100, 0.22), transparent 44%)',
  'linear-gradient(145deg, #fffaf4 0%, #fff3e6 48%, #f8f7ed 100%)',
].join(', ')

const terracottaDuneDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(234, 88, 12, 0.24), transparent 34%)',
  'radial-gradient(circle at 84% 18%, rgba(202, 138, 4, 0.18), transparent 36%)',
  'radial-gradient(circle at 54% 92%, rgba(132, 204, 22, 0.12), transparent 44%)',
  'linear-gradient(145deg, #24130a 0%, #2a1b10 48%, #192019 100%)',
].join(', ')

type GradientPresetStyle = {
  lightMask: number
  darkMask: number
  cardBackgroundOpacity: number
}

function createGradientPreset(
  id: GradientPresetId,
  label: string,
  description: string,
  lightValue: string,
  darkValue: string,
  style: GradientPresetStyle,
): ThemeGradientPreset {
  return {
    id,
    label,
    description,
    light: { type: 'gradient', value: lightValue, blur: 0, mask: style.lightMask, maskColor: '#ffffff' },
    dark: { type: 'gradient', value: darkValue, blur: 0, mask: style.darkMask, maskColor: '#000000' },
    cardBackgroundColor: '#ffffff',
    cardBackgroundOpacity: style.cardBackgroundOpacity,
    cardTextColor: '',
    siteTitleColor: '',
  }
}

export const gradientPresets: ThemeGradientPreset[] = [
  createGradientPreset('clear-teal', '清透蓝绿', '清爽的蓝绿冷调，适合玻璃卡片和高对比文字。', clearTealLightGradient, clearTealDarkGradient, { lightMask: 0.12, darkMask: 0.28, cardBackgroundOpacity: 0.4 }),
  createGradientPreset('mist-slate', '晨雾石青', '更柔和的石青和浅绿组合，页面氛围安静，卡片边界清晰。', mistSlateLightGradient, mistSlateDarkGradient, { lightMask: 0.14, darkMask: 0.3, cardBackgroundOpacity: 0.4 }),
  createGradientPreset('coral-sky', '珊瑚晴空', '珊瑚、天空蓝和薄荷绿的轻快组合，适合亮色首页。', coralSkyLightGradient, coralSkyDarkGradient, { lightMask: 0.12, darkMask: 0.28, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('sage-graphite', '鼠尾草石墨', '低饱和绿与石墨灰，安静耐看，适合长期使用。', sageGraphiteLightGradient, sageGraphiteDarkGradient, { lightMask: 0.13, darkMask: 0.3, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('lumen-amber', '琥珀晨光', '少量琥珀暖光配冷色高光，明亮但不刺眼。', lumenAmberLightGradient, lumenAmberDarkGradient, { lightMask: 0.13, darkMask: 0.3, cardBackgroundOpacity: 0.46 }),
  createGradientPreset('ember-night', '余烬夜航', '深色模式更有层次，亮色模式保持干净清透。', emberNightLightGradient, emberNightDarkGradient, { lightMask: 0.14, darkMask: 0.28, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('violet-dawn', '紫晶破晓', '薰衣草紫与玫瑰高光，冷暖分明且保持克制。', violetDawnLightGradient, violetDawnDarkGradient, { lightMask: 0.12, darkMask: 0.28, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('ocean-depths', '深海蔚蓝', '高辨识度的湛蓝与海松绿，营造清澈水面感。', oceanDepthsLightGradient, oceanDepthsDarkGradient, { lightMask: 0.12, darkMask: 0.3, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('aurora-borealis', '极光苔原', '酸橙、青绿与淡紫的极光层次，适合强调玻璃折射。', auroraBorealisLightGradient, auroraBorealisDarkGradient, { lightMask: 0.14, darkMask: 0.3, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('citrus-sunset', '柑橘日落', '琥珀、珊瑚与奶油底色，给暖色系一个清晰选项。', citrusSunsetLightGradient, citrusSunsetDarkGradient, { lightMask: 0.14, darkMask: 0.3, cardBackgroundOpacity: 0.46 }),
  createGradientPreset('rose-orbit', '玫瑰星轨', '洋红、紫罗兰和杏色点光，柔和而不与旧方案雷同。', roseOrbitLightGradient, roseOrbitDarkGradient, { lightMask: 0.13, darkMask: 0.3, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('indigo-noir', '靛蓝秘境', '靛蓝与电光蓝建立更冷静、有纵深的夜间氛围。', indigoNoirLightGradient, indigoNoirDarkGradient, { lightMask: 0.12, darkMask: 0.3, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('terracotta-dune', '陶土沙丘', '陶土、赭金与苔绿，借自然土色提供低刺激的暖调选择。', terracottaDuneLightGradient, terracottaDuneDarkGradient, { lightMask: 0.14, darkMask: 0.3, cardBackgroundOpacity: 0.44 }),
]

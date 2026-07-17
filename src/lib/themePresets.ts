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
  surface: 'glass' | 'flat'
  accentColor: string
  darkAccentColor: string
  darkCardBackgroundColor: string
}

const clearTealLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(56, 189, 248, 0.5), transparent 42%)',
  'radial-gradient(circle at 84% 20%, rgba(45, 212, 191, 0.44), transparent 44%)',
  'radial-gradient(circle at 50% 96%, rgba(125, 211, 252, 0.34), transparent 48%)',
  'linear-gradient(135deg, #f0fafe 0%, #e6f6f4 48%, #edf3fb 100%)',
].join(', ')

const clearTealDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(34, 211, 238, 0.4), transparent 46%)',
  'radial-gradient(circle at 84% 22%, rgba(20, 184, 166, 0.32), transparent 48%)',
  'radial-gradient(circle at 50% 96%, rgba(59, 130, 246, 0.28), transparent 52%)',
  'linear-gradient(135deg, #04141f 0%, #082431 50%, #0b1c30 100%)',
].join(', ')

const mistSlateLightGradient = [
  'radial-gradient(circle at 18% 14%, rgba(134, 239, 172, 0.4), transparent 42%)',
  'radial-gradient(circle at 78% 18%, rgba(147, 197, 253, 0.45), transparent 44%)',
  'radial-gradient(circle at 60% 94%, rgba(203, 213, 225, 0.5), transparent 48%)',
  'linear-gradient(145deg, #f2f9f4 0%, #e9f2f6 46%, #f2efe9 100%)',
].join(', ')

const mistSlateDarkGradient = [
  'radial-gradient(circle at 18% 12%, rgba(74, 222, 128, 0.28), transparent 44%)',
  'radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.3), transparent 46%)',
  'radial-gradient(circle at 58% 94%, rgba(148, 163, 184, 0.22), transparent 50%)',
  'linear-gradient(145deg, #0a1712 0%, #12242e 48%, #1a1f27 100%)',
].join(', ')

const coralSkyLightGradient = [
  'radial-gradient(circle at 14% 14%, rgba(251, 113, 133, 0.4), transparent 42%)',
  'radial-gradient(circle at 84% 18%, rgba(56, 189, 248, 0.4), transparent 44%)',
  'radial-gradient(circle at 50% 96%, rgba(153, 246, 228, 0.44), transparent 48%)',
  'linear-gradient(140deg, #fef4f9 0%, #f0f9ff 50%, #effcf5 100%)',
].join(', ')

const coralSkyDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(251, 113, 133, 0.34), transparent 46%)',
  'radial-gradient(circle at 82% 22%, rgba(34, 211, 238, 0.3), transparent 48%)',
  'radial-gradient(circle at 48% 94%, rgba(16, 185, 129, 0.24), transparent 52%)',
  'linear-gradient(140deg, #1d0f1a 0%, #131b2e 52%, #071a22 100%)',
].join(', ')

const sageGraphiteLightGradient = [
  'radial-gradient(circle at 18% 14%, rgba(163, 230, 53, 0.32), transparent 42%)',
  'radial-gradient(circle at 78% 20%, rgba(45, 212, 191, 0.32), transparent 44%)',
  'radial-gradient(circle at 60% 94%, rgba(203, 213, 225, 0.52), transparent 50%)',
  'linear-gradient(145deg, #f3faf1 0%, #eaf4ee 46%, #f0f3f8 100%)',
].join(', ')

const sageGraphiteDarkGradient = [
  'radial-gradient(circle at 18% 14%, rgba(132, 204, 22, 0.26), transparent 44%)',
  'radial-gradient(circle at 78% 22%, rgba(45, 212, 191, 0.26), transparent 48%)',
  'radial-gradient(circle at 58% 94%, rgba(148, 163, 184, 0.2), transparent 52%)',
  'linear-gradient(145deg, #0c150e 0%, #16211d 48%, #191d2a 100%)',
].join(', ')

const lumenAmberLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(252, 211, 77, 0.46), transparent 42%)',
  'radial-gradient(circle at 84% 18%, rgba(125, 211, 252, 0.38), transparent 44%)',
  'radial-gradient(circle at 54% 94%, rgba(249, 168, 212, 0.26), transparent 48%)',
  'linear-gradient(145deg, #fffaf0 0%, #f2f9ff 50%, #f7fbef 100%)',
].join(', ')

const lumenAmberDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(245, 158, 11, 0.32), transparent 46%)',
  'radial-gradient(circle at 84% 20%, rgba(14, 165, 233, 0.28), transparent 48%)',
  'radial-gradient(circle at 56% 94%, rgba(244, 63, 94, 0.2), transparent 52%)',
  'linear-gradient(145deg, #1c1408 0%, #17222e 50%, #1d1a14 100%)',
].join(', ')

const emberNightLightGradient = [
  'radial-gradient(circle at 16% 14%, rgba(248, 113, 113, 0.34), transparent 42%)',
  'radial-gradient(circle at 82% 20%, rgba(45, 212, 191, 0.34), transparent 44%)',
  'radial-gradient(circle at 56% 94%, rgba(253, 186, 116, 0.3), transparent 48%)',
  'linear-gradient(145deg, #fdf6f4 0%, #eff8f7 48%, #fdf3ec 100%)',
].join(', ')

const emberNightDarkGradient = [
  'radial-gradient(circle at 16% 14%, rgba(248, 113, 113, 0.36), transparent 46%)',
  'radial-gradient(circle at 82% 22%, rgba(45, 212, 191, 0.3), transparent 48%)',
  'radial-gradient(circle at 54% 94%, rgba(251, 191, 36, 0.2), transparent 52%)',
  'linear-gradient(145deg, #1e0d10 0%, #14202a 50%, #081619 100%)',
].join(', ')

const violetDawnLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(196, 181, 253, 0.55), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(244, 114, 182, 0.36), transparent 44%)',
  'radial-gradient(circle at 54% 96%, rgba(165, 213, 252, 0.44), transparent 50%)',
  'linear-gradient(145deg, #faf8ff 0%, #f2edfe 48%, #f6f4ff 100%)',
].join(', ')

const violetDawnDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(167, 139, 250, 0.42), transparent 46%)',
  'radial-gradient(circle at 84% 20%, rgba(236, 72, 153, 0.28), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(56, 189, 248, 0.24), transparent 52%)',
  'linear-gradient(145deg, #150f2b 0%, #201640 50%, #131a33 100%)',
].join(', ')

const oceanDepthsLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(56, 189, 248, 0.5), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.42), transparent 46%)',
  'radial-gradient(circle at 52% 96%, rgba(147, 197, 253, 0.46), transparent 50%)',
  'linear-gradient(145deg, #eff9ff 0%, #e7f5fe 46%, #e9f9f8 100%)',
].join(', ')

const oceanDepthsDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(14, 165, 233, 0.44), transparent 48%)',
  'radial-gradient(circle at 84% 20%, rgba(20, 184, 166, 0.32), transparent 48%)',
  'radial-gradient(circle at 52% 96%, rgba(59, 130, 246, 0.3), transparent 54%)',
  'linear-gradient(145deg, #041828 0%, #06304a 50%, #0a2038 100%)',
].join(', ')

const auroraBorealisLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(163, 230, 53, 0.4), transparent 42%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.42), transparent 44%)',
  'radial-gradient(circle at 54% 96%, rgba(216, 180, 254, 0.44), transparent 50%)',
  'linear-gradient(145deg, #f5fdf2 0%, #eafaf3 48%, #f4f0ff 100%)',
].join(', ')

const auroraBorealisDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(132, 204, 22, 0.34), transparent 46%)',
  'radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.34), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(168, 85, 247, 0.3), transparent 52%)',
  'linear-gradient(145deg, #06201b 0%, #093231 50%, #1b1638 100%)',
].join(', ')

const citrusSunsetLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(252, 211, 77, 0.5), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(251, 113, 133, 0.4), transparent 44%)',
  'radial-gradient(circle at 54% 96%, rgba(254, 215, 170, 0.5), transparent 50%)',
  'linear-gradient(145deg, #fffcef 0%, #fff1e0 50%, #fff5ec 100%)',
].join(', ')

const citrusSunsetDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(245, 158, 11, 0.38), transparent 46%)',
  'radial-gradient(circle at 84% 18%, rgba(244, 63, 94, 0.32), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(249, 115, 22, 0.26), transparent 52%)',
  'linear-gradient(145deg, #241404 0%, #2e1a0e 50%, #250f0e 100%)',
].join(', ')

const roseOrbitLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(244, 114, 182, 0.44), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(192, 132, 252, 0.4), transparent 44%)',
  'radial-gradient(circle at 54% 96%, rgba(253, 186, 116, 0.36), transparent 50%)',
  'linear-gradient(145deg, #fef5fb 0%, #fbeffe 48%, #fff4ec 100%)',
].join(', ')

const roseOrbitDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(236, 72, 153, 0.38), transparent 46%)',
  'radial-gradient(circle at 84% 18%, rgba(168, 85, 247, 0.34), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(249, 115, 22, 0.22), transparent 52%)',
  'linear-gradient(145deg, #250f22 0%, #301339 50%, #291612 100%)',
].join(', ')

const indigoNoirLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(129, 140, 248, 0.48), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(96, 165, 250, 0.42), transparent 46%)',
  'radial-gradient(circle at 54% 96%, rgba(165, 180, 252, 0.44), transparent 50%)',
  'linear-gradient(145deg, #f5f7ff 0%, #ecf0ff 48%, #f3f4ff 100%)',
].join(', ')

const indigoNoirDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(99, 102, 241, 0.46), transparent 48%)',
  'radial-gradient(circle at 84% 18%, rgba(59, 130, 246, 0.34), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(139, 92, 246, 0.3), transparent 54%)',
  'linear-gradient(145deg, #0d1130 0%, #141c4d 50%, #191638 100%)',
].join(', ')

const terracottaDuneLightGradient = [
  'radial-gradient(circle at 16% 12%, rgba(251, 146, 60, 0.42), transparent 44%)',
  'radial-gradient(circle at 84% 18%, rgba(217, 119, 6, 0.3), transparent 46%)',
  'radial-gradient(circle at 54% 96%, rgba(190, 242, 100, 0.32), transparent 50%)',
  'linear-gradient(145deg, #fff8f0 0%, #fdf0e0 50%, #f5f5e6 100%)',
].join(', ')

const terracottaDuneDarkGradient = [
  'radial-gradient(circle at 16% 12%, rgba(234, 88, 12, 0.36), transparent 46%)',
  'radial-gradient(circle at 84% 18%, rgba(202, 138, 4, 0.3), transparent 48%)',
  'radial-gradient(circle at 54% 96%, rgba(132, 204, 22, 0.2), transparent 52%)',
  'linear-gradient(145deg, #281608 0%, #2e2010 50%, #1c2418 100%)',
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
    surface: 'glass',
    accentColor: '#2563eb',
    darkAccentColor: '#7dd3fc',
    darkCardBackgroundColor: '#0f172a',
  }
}

function createFlatPreset(id: GradientPresetId, label: string, description: string, colors: { page: string; darkPage: string; card: string; darkCard: string; accent: string; darkAccent: string }): ThemeGradientPreset {
  return {
    id, label, description,
    light: { type: 'color', value: colors.page, blur: 0, mask: 0, maskColor: '#ffffff' },
    dark: { type: 'color', value: colors.darkPage, blur: 0, mask: 0, maskColor: '#000000' },
    cardBackgroundColor: colors.card, cardBackgroundOpacity: 1, cardTextColor: '', siteTitleColor: '', surface: 'flat',
    accentColor: colors.accent, darkAccentColor: colors.darkAccent, darkCardBackgroundColor: colors.darkCard,
  }
}

export const gradientPresets: ThemeGradientPreset[] = [
  createFlatPreset('paper-sage', '纸页鼠尾草', '暖白纸张与鼠尾草绿，安静自然。', { page: '#e8f0e3', darkPage: '#20261f', card: '#ffffff', darkCard: '#2b332a', accent: '#71836f', darkAccent: '#a9c2a0' }),
  createFlatPreset('paper-clay', '温暖陶土', '淡陶土与暖灰，柔和而有人情味。', { page: '#f1e2de', darkPage: '#2a211f', card: '#ffffff', darkCard: '#372b28', accent: '#b08f89', darkAccent: '#d4b1aa' }),
  createFlatPreset('paper-wheat', '澄澈秋麦', '奶油纸色与麦穗金，温暖但不过亮。', { page: '#f2e8d6', darkPage: '#29251d', card: '#ffffff', darkCard: '#373126', accent: '#a98c65', darkAccent: '#d1b894' }),
  createFlatPreset('paper-slate', '静谧海岩', '清浅海岩蓝灰，适合长时间浏览。', { page: '#e0ebf0', darkPage: '#20272b', card: '#ffffff', darkCard: '#2b3439', accent: '#718a98', darkAccent: '#a8bac4' }),
  createFlatPreset('paper-pine', '森林深处', '低饱和松林绿，沉稳专注。', { page: '#e3ecdf', darkPage: '#1d241c', card: '#ffffff', darkCard: '#283126', accent: '#5c6857', darkAccent: '#a9b8a3' }),
  createFlatPreset('paper-sakura', '樱落粉黛', '克制的樱粉与暖灰，轻柔不甜腻。', { page: '#f3e1e7', darkPage: '#2b2024', card: '#ffffff', darkCard: '#382a2f', accent: '#c88797', darkAccent: '#e4b2be' }),
  createFlatPreset('paper-lavender', '静谧薰衣', '灰紫与雾白构成的低刺激色系。', { page: '#e9e5f3', darkPage: '#25222e', card: '#ffffff', darkCard: '#312d3c', accent: '#857bb8', darkAccent: '#bdb5df' }),
  createFlatPreset('paper-indigo', '深海墨蓝', '偏灰的墨蓝背景，清晰理性。', { page: '#dbeaff', darkPage: '#1d222a', card: '#ffffff', darkCard: '#282f39', accent: '#5f769b', darkAccent: '#9eb2d0' }),
  createFlatPreset('paper-amber', '晨光琥珀', '暖白与柔和琥珀，明亮且舒适。', { page: '#f4e6c8', darkPage: '#29241b', card: '#ffffff', darkCard: '#373024', accent: '#bd8b42', darkAccent: '#e3c188' }),
  createGradientPreset('clear-teal', '清透蓝绿', '清爽的蓝绿冷调，玻璃卡片映出水色高光。', clearTealLightGradient, clearTealDarkGradient, { lightMask: 0.06, darkMask: 0.12, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('mist-slate', '晨雾石青', '石青与浅绿的柔和薄雾，安静而不寡淡。', mistSlateLightGradient, mistSlateDarkGradient, { lightMask: 0.08, darkMask: 0.14, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('coral-sky', '珊瑚晴空', '珊瑚、天空蓝和薄荷绿的轻快组合，明亮有活力。', coralSkyLightGradient, coralSkyDarkGradient, { lightMask: 0.06, darkMask: 0.14, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('sage-graphite', '鼠尾草石墨', '低饱和绿与石墨灰，耐看的日常工作配色。', sageGraphiteLightGradient, sageGraphiteDarkGradient, { lightMask: 0.08, darkMask: 0.14, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('lumen-amber', '琥珀晨光', '琥珀暖光配天空蓝高光，明亮但不刺眼。', lumenAmberLightGradient, lumenAmberDarkGradient, { lightMask: 0.07, darkMask: 0.14, cardBackgroundOpacity: 0.46 }),
  createGradientPreset('ember-night', '余烬夜航', '余烬红与海松绿对撞，深色模式层次分明。', emberNightLightGradient, emberNightDarkGradient, { lightMask: 0.08, darkMask: 0.13, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('violet-dawn', '紫晶破晓', '薰衣草紫与玫瑰高光，冷暖分明且克制。', violetDawnLightGradient, violetDawnDarkGradient, { lightMask: 0.06, darkMask: 0.12, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('ocean-depths', '深海蔚蓝', '高辨识度的湛蓝与海松绿，像清澈的深海水面。', oceanDepthsLightGradient, oceanDepthsDarkGradient, { lightMask: 0.06, darkMask: 0.12, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('aurora-borealis', '极光苔原', '酸橙、青绿与淡紫的极光层次，玻璃折射感最强。', auroraBorealisLightGradient, auroraBorealisDarkGradient, { lightMask: 0.08, darkMask: 0.13, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('citrus-sunset', '柑橘日落', '琥珀、珊瑚与奶油底色，日落般的暖色选择。', citrusSunsetLightGradient, citrusSunsetDarkGradient, { lightMask: 0.08, darkMask: 0.14, cardBackgroundOpacity: 0.46 }),
  createGradientPreset('rose-orbit', '玫瑰星轨', '洋红、紫罗兰和杏色点光，柔和浪漫。', roseOrbitLightGradient, roseOrbitDarkGradient, { lightMask: 0.07, darkMask: 0.13, cardBackgroundOpacity: 0.44 }),
  createGradientPreset('indigo-noir', '靛蓝秘境', '靛蓝与电光蓝构建冷静有纵深的夜间氛围。', indigoNoirLightGradient, indigoNoirDarkGradient, { lightMask: 0.06, darkMask: 0.12, cardBackgroundOpacity: 0.42 }),
  createGradientPreset('terracotta-dune', '陶土沙丘', '陶土、赭金与苔绿的自然土色，低刺激暖调。', terracottaDuneLightGradient, terracottaDuneDarkGradient, { lightMask: 0.08, darkMask: 0.14, cardBackgroundOpacity: 0.44 }),
]

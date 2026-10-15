import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// 组件风格策略（2026-10-15 起）：
// - 新组件强制使用 Svelte 5 runes 写法（$props/$derived/$effect + callback props），
//   不再使用 export let / createEventDispatcher / $: / <slot> 等 legacy 写法；
// - 存量 60+ 组件按"叶子→容器"分批渐进迁移（已迁：ui/Switch、ui/Slider、ui/InputGroup、
//   ColorAlphaInput、GradientBackgroundInput、settings/ThemeBackgroundCard、
//   settings/GradientPresetSelector）。
export default {
  preprocess: vitePreprocess(),
}

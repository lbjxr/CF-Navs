import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 行为部分（折叠/切换/保存等交互）已迁到 tests/unit/adminSettingsBehavior.test.ts；此处保留的是无法挂载验证的
// 三类源码契约：① CSS grid 规则——`.settings-panel-wrap`/`.settings-form`/`.settings-submenu`/`.settings-workspace`
// 的 `grid-template-columns/rows`、`grid-column: 1 / -1`、`clamp(0px, calc(100dvh - 180px), 960px)` 高度与
// `@media (max-width: 1320px/720px)` 折叠；② 分区归属——各 `form.*` 绑定落在哪个 `settings/*Section.svelte`、
// 预览 iframe 的 `sandbox=""`/`script-src 'none'` 安全属性；③ 模板与菜单渲染顺序（组件标签、`indexOf` 先后）。
// jsdom 不做 grid 布局、不评估媒体查询，挂载既拿不到这些计算值，跨文件归属/顺序也非单组件可观测。（PROB-18）

describe('admin settings layout', () => {
  it('aligns the settings panel with category and bookmark content', () => {
    const source = readFileSync('src/components/admin/AdminTabContent.svelte', 'utf8')
    const settingsRule = source.match(/\.settings-panel-wrap\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(settingsRule).toContain('width: 100%')
    expect(settingsRule).toContain('margin: 0 0 24px')
    expect(settingsRule).not.toContain('margin: 0 auto')
  })

  it('places the secondary settings menu above the workspace', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    const sectionOrder = [
      '<BasicSettingsSection',
      '<HeroSettingsSection',
      '<BackgroundSettingsSection',
      '<CardSettingsSection',
      '<AdvancedSettingsSection',
      '<NavigationSettingsSection',
      '<SearchEngineSettingsSection',
      '<FooterSettingsSection',
      '<PasswordChangePanel',
    ]
    const positions = sectionOrder.map((marker) => panel.indexOf(marker))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(new Set(positions).size).toBe(sectionOrder.length)

    const labels = ['站点设置', '外观与卡片', '布局与导航', '搜索设置', '自定义样式/脚本', '账号安全']
    const labelPositions = labels.map((label) => panel.indexOf(`label: '${label}'`))
    expect(labelPositions.every((position) => position >= 0)).toBe(true)
    expect(labelPositions).toEqual([...labelPositions].sort((a, b) => a - b))
    expect(panel).toContain("{ id: 'appearance', label: '外观与卡片'")
    expect(panel).toContain('class="settings-submenu"')

    const formRule = panel.match(/\.settings-form\s*\{([^}]+)\}/)?.[1] ?? ''
    const submenuRule = panel.match(/\.settings-submenu\s*\{([^}]+)\}/)?.[1] ?? ''
    const workspaceRule = panel.match(/\.settings-workspace\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(formRule).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(formRule).toContain('grid-template-rows: auto minmax(0, 1fr)')
    expect(submenuRule).toContain('grid-column: 1 / -1')
    expect(submenuRule).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))')
    expect(submenuRule).toContain('position: static')
    expect(workspaceRule).toContain('grid-column: 1 / -1')
    expect(panel).not.toContain('grid-column: span 1')
    expect(panel).not.toContain('grid-column: span 11')
    expect(panel).not.toContain('group::before')
  })

  it('bounds the desktop settings card height to the available shell', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const adminContent = readFileSync('src/components/admin/AdminTabContent.svelte', 'utf8')
    const panelRule = panel.match(/\.settings-panel\s*\{([^}]+)\}/)?.[1] ?? ''
    const sectionContentRule = panel.match(/\.settings-section-content\s*\{([^}]+)\}/)?.[1] ?? ''
    const adminContentRule = adminContent.match(/\.admin-content\s*\{([^}]+)\}/)?.[1] ?? ''
    const desktopCollapseStart = panel.indexOf('@media (max-width: 1320px)')
    const desktopCollapseEnd = panel.indexOf('@media (max-width: 960px)')
    const desktopCollapseRule = panel.slice(desktopCollapseStart, desktopCollapseEnd)

    expect(panelRule).toContain('height: clamp(0px, calc(100dvh - 180px), 960px)')
    expect(panelRule).toContain('min-height: min(560px, calc(100dvh - 180px))')
    expect(sectionContentRule).toContain('height: 100%')
    expect(sectionContentRule).toContain('overflow-y: auto')
    expect(adminContentRule).toContain('height: 100%')
    expect(adminContentRule).toContain('overflow: auto')
    expect(panelRule).not.toContain('100dvh - 156px')
    expect(adminContent).toContain('margin: 0 0 24px')
    expect(desktopCollapseRule).toContain('height: auto;')
    expect(desktopCollapseRule).toContain('min-height: 0;')
    expect(desktopCollapseRule).toContain('overflow: visible;')
    expect(desktopCollapseRule).toContain('grid-template-columns: minmax(0, 1fr)')
  })

  it('places theme, search, image-host, and layout controls in their current sections', () => {
    const basic = readFileSync('src/components/settings/BasicSettingsSection.svelte', 'utf8')
    const layout = readFileSync('src/components/settings/NavigationSettingsSection.svelte', 'utf8')
    const hero = readFileSync('src/components/settings/HeroSettingsSection.svelte', 'utf8')
    const card = readFileSync('src/components/settings/CardSettingsSection.svelte', 'utf8')
    const search = readFileSync('src/components/settings/SearchEngineSettingsSection.svelte', 'utf8')
    const appearance = readFileSync('src/components/settings/BackgroundSettingsSection.svelte', 'utf8')
    const advanced = readFileSync('src/components/settings/AdvancedSettingsSection.svelte', 'utf8')

    expect(layout).toContain('bind:value={form.content_layout.max_width}')
    expect(card).not.toContain('form.content_layout')
    expect(hero).toContain('checked={form.search_box_show}')
    expect(hero).toContain('checked={form.search_engine_selector_show}')
    expect(search).not.toContain('form.search_box_show')
    expect(basic).toContain('bind:group={form.theme}')
    expect(basic).toContain('bind:value={form.site_title_color}')
    expect(basic).toContain('bind:value={form.site_title_font_size}')
    expect(basic).toContain('bind:value={form.image_host_url}')
    expect(basic).toContain('<h3>外部资源</h3>')
    expect(basic).toContain('用于背景图、分类与书签图标的上传接口')
    expect(advanced).not.toContain('bind:value={form.image_host_url}')
    expect(advanced).not.toContain('bind:value={form.site_title_color}')
    expect(advanced).not.toContain('bind:value={form.site_title_font_size}')
    expect(advanced).toContain('<h3>背景设置</h3>')
    expect(advanced).not.toContain('<h3>背景与图床</h3>')
    expect(advanced).not.toContain('<h3>标题与背景</h3>')
    expect(appearance).not.toContain('bind:group={form.theme}')
    expect(card).not.toContain('旧版')
    expect(hero).not.toContain('标题与搜索')
  })

  it('places homepage display and custom content controls in their requested sections', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const basic = readFileSync('src/components/settings/BasicSettingsSection.svelte', 'utf8')
    const hero = readFileSync('src/components/settings/HeroSettingsSection.svelte', 'utf8')
    const footer = readFileSync('src/components/settings/FooterSettingsSection.svelte', 'utf8')

    const basicBranch = panel.slice(
      panel.indexOf("{#if activeSectionId === 'basic'}"),
      panel.indexOf("{:else if activeSectionId === 'appearance'}"),
    )
    const searchBranch = panel.slice(
      panel.indexOf("{:else if activeSectionId === 'search'}"),
      panel.indexOf("{:else if activeSectionId === 'footer'}"),
    )

    expect(basicBranch).toContain('<BasicSettingsSection')
    expect(basicBranch).toContain('<HeroSettingsSection')
    expect(searchBranch).toContain('<SearchEngineSettingsSection')
    expect(searchBranch).not.toContain('<HeroSettingsSection')
    expect(hero).toContain('bind:value={form.most_visited_count}')
    expect(hero).toContain('checked={form.site_title_show}')
    expect(hero).toContain('.field-range {\n    grid-column: 1 / -1;')
    expect(basic).not.toContain('form.custom_css')
    expect(basic).not.toContain('form.custom_js')
    expect(footer).toContain('bind:value={form.footer_html}')
    expect(footer).toContain('bind:value={form.custom_css}')
    expect(footer).toContain('bind:value={form.custom_js}')
    expect(footer).toContain('.field.full-width {\n    grid-column: 1 / -1;')
  })

  it('connects a read-only live preview driven by the normalized form', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const preview = readFileSync('src/components/settings/SettingsHomePreview.svelte', 'utf8')

    expect(panel).toContain('<SettingsHomePreview settings={normalizedForm} bind:theme={previewTheme} />')
    expect(preview).toContain("import { buildHomeBackground } from '../../lib/appData'")
    expect(preview).toContain("import BookmarkCard from '../BookmarkCard.svelte'")
    expect(preview).toContain("import HomeHeroSearch from '../HomeHeroSearch.svelte'")
    expect(preview).toContain("import { getMostVisitedBookmarks } from '../../lib/homeData'")
    expect(preview).toContain('data-theme={theme}')
    expect(preview).toContain('data-background-preset={previewSettings.background_preset_id}')
    expect(preview).toContain('inert')
    expect(preview).toContain('style={previewSettings.card_style}')
    expect(preview).toContain('siteTitleFontSize={previewSettings.site_title_font_size}')
    expect(preview).toContain('showIconTitle={previewSettings.card_icon_show_title}')
    expect(preview).toContain('width={previewSettings.card_size.width}')
    expect(preview).toContain('height={previewSettings.card_size.height}')
    expect(preview).toContain("previewSettings.navigation.position === 'top'")
    expect(preview).toContain('sandbox=""')
    expect(preview).toContain('srcdoc={customContentPreview}')
    expect(preview).toContain("script-src 'none'")
    expect(preview).toContain('custom-js-preview-notice')
    expect(preview).not.toContain('allow-scripts')
    expect(preview).not.toContain('allow-same-origin')
    expect(preview).not.toContain('eval(')
    expect(preview).not.toContain('new Function')
    expect(preview).not.toContain('fetch(')
    expect(preview).not.toContain('/api/')
  })

  it('paginates zero-visit analytics inside the bookmark-list height contract', () => {
    const analytics = readFileSync('src/components/admin/AnalyticsPanel.svelte', 'utf8')

    expect(analytics).toContain('createAdminListPage')
    expect(analytics).toContain('getAdminListTotalPages')
    expect(analytics).toContain('clampAdminListPage')
    expect(analytics).toContain('{#each zeroVisitListPage.items as bookmark}')
    expect(analytics).toContain('class="admin-panel-footer"')
    expect(analytics).toContain('class="admin-pagination"')
    expect(analytics).toContain('上一页')
    expect(analytics).toContain('下一页')
    expect(analytics).toContain('height: min(760px, calc(100vh - 220px))')
    expect(analytics).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
  })

  it('keeps common appearance controls visible and gates advanced controls', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const appearance = readFileSync('src/components/settings/BackgroundSettingsSection.svelte', 'utf8')
    const card = readFileSync('src/components/settings/CardSettingsSection.svelte', 'utf8')
    const advanced = readFileSync('src/components/settings/AdvancedSettingsSection.svelte', 'utf8')
    const backgroundCard = readFileSync('src/components/settings/ThemeBackgroundCard.svelte', 'utf8')

    expect(advanced).toContain('class="advanced-settings-section"')
    expect(advanced).toContain('aria-label="高级设置"')
    expect(advanced).not.toContain('class="group group-wide')
    expect(advanced).not.toContain('<legend>高级设置</legend>')
    expect(advanced).toContain('<h3>尺寸与密度</h3>')
    expect(advanced).toContain('<h3>卡片表面</h3>')
    expect(advanced).toContain("import CategoryDisplaySettingsSection from './CategoryDisplaySettingsSection.svelte'")
    expect(advanced).toContain('<CategoryDisplaySettingsSection bind:form {saving} />')
    expect(appearance).not.toContain('{#if advancedOpen}')
    expect(card).not.toContain('{#if advancedOpen}')
    expect(card).not.toContain('<h3>尺寸与密度</h3>')
    expect(card).not.toContain('<h3>卡片表面</h3>')
    const appearanceBranch = panel.slice(
      panel.indexOf("{:else if activeSectionId === 'appearance'}"),
      panel.indexOf("{:else if activeSectionId === 'layout'}"),
    )
    expect(appearanceBranch.indexOf('<BackgroundSettingsSection')).toBeLessThan(appearanceBranch.indexOf('<CardSettingsSection'))
    expect(appearanceBranch.indexOf('<CardSettingsSection')).toBeLessThan(appearanceBranch.indexOf('<AdvancedSettingsSection'))
    expect(backgroundCard.indexOf('<span>背景值</span>')).toBeLessThan(backgroundCard.indexOf('startLabel="起始颜色"'))
    expect(backgroundCard.indexOf('startLabel="起始颜色"')).toBeLessThan(backgroundCard.indexOf('endLabel="结束颜色"'))
    expect(backgroundCard.indexOf('endLabel="结束颜色"')).toBeLessThan(backgroundCard.indexOf('<div class="background-range-grid">'))
    expect(backgroundCard.indexOf('<div class="background-range-grid">')).toBeLessThan(backgroundCard.indexOf('遮罩颜色'))
  })
  it('exposes category-level visual controls in the advanced section', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const categoryDisplay = readFileSync('src/components/settings/CategoryDisplaySettingsSection.svelte', 'utf8')
    const advanced = readFileSync('src/components/settings/AdvancedSettingsSection.svelte', 'utf8')
    const home = readFileSync('src/views/Home.svelte', 'utf8')

    expect(panel).not.toContain('<CategoryDisplaySettingsSection bind:form {saving} />')
    expect(advanced).toContain("import CategoryDisplaySettingsSection from './CategoryDisplaySettingsSection.svelte'")
    expect(advanced).toContain('<CategoryDisplaySettingsSection bind:form {saving} />')
    expect(categoryDisplay).toContain('一级分类标题字号')
    expect(categoryDisplay).toContain('二级分类标题字号')
    expect(categoryDisplay).toContain('min={12}')
    expect(categoryDisplay).toContain('min={11}')
    expect(home).toContain('--category-root-font-size-base')
    expect(home).toContain('* 0.88')
  })

  it('collapses built-in presets, removes manual gradient values, and binds card controls to style', () => {
    const presets = readFileSync('src/components/settings/GradientPresetSelector.svelte', 'utf8')
    const backgroundCard = readFileSync('src/components/settings/ThemeBackgroundCard.svelte', 'utf8')
    const gradientInput = readFileSync('src/components/GradientBackgroundInput.svelte', 'utf8')
    const card = readFileSync('src/components/settings/CardSettingsSection.svelte', 'utf8')
    const advanced = readFileSync('src/components/settings/AdvancedSettingsSection.svelte', 'utf8')
    const preview = readFileSync('src/components/settings/SettingsHomePreview.svelte', 'utf8')

    expect(presets).toContain('data-testid="gradient-preset-toggle"')
    expect(presets).toContain('class:collapsed={!presetsExpanded}')
    expect(presets).toContain('title={`${preset.label}：${preset.description}`}')
    expect(backgroundCard).toContain('role="radiogroup"')
    expect(backgroundCard).not.toContain('<select')
    expect(backgroundCard).not.toContain('完整渐变值')
    expect(gradientInput).not.toContain('gradient-manual-field')
    const firstColorInput = gradientInput.indexOf('<ColorAlphaInput')
    const startLabel = gradientInput.indexOf('<span class="gradient-color-label">{startLabel}</span>')
    const secondColorInput = gradientInput.indexOf('<ColorAlphaInput', firstColorInput + 1)
    const endLabel = gradientInput.indexOf('<span class="gradient-color-label">{endLabel}</span>')
    expect(firstColorInput).toBeLessThan(startLabel)
    expect(startLabel).toBeLessThan(secondColorInput)
    expect(secondColorInput).toBeLessThan(endLabel)
    expect(card).toContain('{#if form.card_style === \'info\'}')
    expect(advanced).toContain('disabled={form.card_style !== \'info\'}')
    expect(advanced).toContain('disabled={form.card_style !== \'icon\'}')
    expect(preview).toContain('data-card-description-mode=')
    expect(preview).toContain('showDescription={previewSettings.card_style === \'info\' && showDescription}')
  })

  it('stacks the admin shell and settings preview on narrow screens', () => {
    const admin = readFileSync('src/views/Admin.svelte', 'utf8')
    const sidebar = readFileSync('src/components/AdminSidebar.svelte', 'utf8')
    const content = readFileSync('src/components/admin/AdminTabContent.svelte', 'utf8')
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    expect(admin).toContain('@media (max-width: 720px)')
    expect(admin).toContain('flex-direction: column')
    expect(sidebar).toContain('position: fixed')
    expect(sidebar).toContain('height: 60px')
    expect(content).toContain('height: auto')
    expect(panel).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(panel).toContain('position: static')
  })

  it('uses the default light-blue treatment for the settings save button', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const saveButtonRule = panel.match(/\.floating-save-btn\s*\{([^}]+)\}/)?.[1] ?? ''
    const saveButtonHoverRule = panel.match(/\.floating-save-btn:hover:not\(:disabled\)\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(saveButtonRule).toContain('background: #dbeafe')
    expect(saveButtonRule).toContain('color: #1d4ed8')
    expect(saveButtonHoverRule).toContain('background: #bfdbfe')
    expect(panel).not.toContain('#667a63')
    expect(panel).not.toContain('#52634f')
  })

  it('reuses favicon.im for search engine icons', () => {
    const search = readFileSync('src/components/settings/SearchEngineSettingsSection.svelte', 'utf8')

    expect(search).toContain("import { faviconImIcon } from '../../lib/icons'")
    expect(search).toContain('engine.icon = icon')
    expect(search).toContain('Favicon.im')
    expect(search).toContain('搜索引擎图标预览')
    expect(search).toContain('class="favicon-suffix-button"')
  })
})

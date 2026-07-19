import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin settings layout', () => {
  it('aligns the settings panel with category and bookmark content', () => {
    const source = readFileSync('src/components/admin/AdminTabContent.svelte', 'utf8')
    const settingsRule = source.match(/\.settings-panel-wrap\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(settingsRule).toContain('width: 100%')
    expect(settingsRule).toContain('margin: 0 0 24px')
    expect(settingsRule).not.toContain('margin: 0 auto')
  })

  it('associates the public mode label with its checkbox', () => {
    const source = readFileSync('src/components/settings/BasicSettingsSection.svelte', 'utf8')

    expect(source).toContain('<label class="toggle-copy" for="settings-public-mode">')
    expect(source).toContain('id="settings-public-mode"')
    expect(source).toContain('on:change={() => void syncForm()}')
  })

  it('provides navigation position and persistent-left controls', () => {
    const source = readFileSync('src/components/settings/NavigationSettingsSection.svelte', 'utf8')
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    expect(panel).toContain('<NavigationSettingsSection bind:form {saving} />')
    expect(source).toContain('bind:group={form.navigation.position}')
    expect(source).toContain('bind:checked={form.navigation.always_expanded}')
    expect(source).toContain("disabled={saving || form.navigation.position !== 'left'}")
  })

  it('groups settings sections behind a secondary settings menu', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    const sectionOrder = [
      '<BasicSettingsSection',
      '<BackgroundSettingsSection',
      '<CardSettingsSection',
      '<AdvancedSettingsSection',
      '<NavigationSettingsSection',
      '<HeroSettingsSection',
      '<SearchEngineSettingsSection',
      '<FooterSettingsSection',
      '<PasswordChangePanel',
    ]
    const positions = sectionOrder.map((marker) => panel.indexOf(marker))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(new Set(positions).size).toBe(sectionOrder.length)

    const labels = ['站点信息', '外观与卡片', '布局与导航', '搜索设置', '页脚内容', '账号安全']
    const labelPositions = labels.map((label) => panel.indexOf(`label: '${label}'`))
    expect(labelPositions.every((position) => position >= 0)).toBe(true)
    expect(labelPositions).toEqual([...labelPositions].sort((a, b) => a - b))
    expect(panel).toContain("{ id: 'appearance', label: '外观与卡片'")
    expect(panel).toContain('class="settings-submenu"')
    expect(panel).toContain('grid-column: span 1')
    expect(panel).toContain('grid-column: span 11')
    expect(panel).not.toContain('group::before')
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
    expect(hero).toContain('bind:checked={form.search_box_show}')
    expect(hero).toContain('bind:checked={form.search_engine_selector_show}')
    expect(search).not.toContain('form.search_box_show')
    expect(basic).toContain('bind:group={form.theme}')
    expect(basic).not.toContain('form.image_host_url')
    expect(advanced).toContain('bind:value={form.image_host_url}')
    expect(appearance).not.toContain('bind:group={form.theme}')
    expect(card).not.toContain('旧版')
    expect(hero).not.toContain('标题与搜索')
  })

  it('connects a read-only live preview driven by the normalized form', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const preview = readFileSync('src/components/settings/SettingsHomePreview.svelte', 'utf8')

    expect(panel).toContain('<SettingsHomePreview settings={normalizedForm} bind:theme={previewTheme} />')
    expect(preview).toContain("import { buildHomeBackground } from '../../lib/appData'")
    expect(preview).toContain("import BookmarkCard from '../BookmarkCard.svelte'")
    expect(preview).toContain("import HomeHeroSearch from '../HomeHeroSearch.svelte'")
    expect(preview).toContain('data-theme={theme}')
    expect(preview).toContain('data-background-preset={previewSettings.background_preset_id}')
    expect(preview).toContain('inert')
    expect(preview).toContain('style={previewSettings.card_style}')
    expect(preview).toContain('siteTitleFontSize={previewSettings.site_title_font_size}')
    expect(preview).toContain('showIconTitle={previewSettings.card_icon_show_title}')
    expect(preview).toContain('width={previewSettings.card_size.width}')
    expect(preview).toContain('height={previewSettings.card_size.height}')
    expect(preview).toContain("previewSettings.navigation.position === 'top'")
    expect(preview).not.toContain('fetch(')
    expect(preview).not.toContain('/api/')
  })

  it('keeps common appearance controls visible and gates advanced controls', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const appearance = readFileSync('src/components/settings/BackgroundSettingsSection.svelte', 'utf8')
    const card = readFileSync('src/components/settings/CardSettingsSection.svelte', 'utf8')
    const advanced = readFileSync('src/components/settings/AdvancedSettingsSection.svelte', 'utf8')
    const backgroundCard = readFileSync('src/components/settings/ThemeBackgroundCard.svelte', 'utf8')

    expect(panel).toContain('appearanceAdvancedOpen = shouldAutoExpandAppearanceAdvanced(initialForm)')
    expect(advanced).toContain('data-testid="appearance-advanced-toggle"')
    expect(advanced).toContain('{#if advancedOpen}')
    expect(advanced).toContain('class="advanced-settings-section"')
    expect(advanced).toContain('aria-label="高级设置"')
    expect(advanced).not.toContain('class="group group-wide')
    expect(advanced).not.toContain('<legend>高级设置</legend>')
    expect(advanced).toContain('<h3>尺寸与密度</h3>')
    expect(advanced).toContain('<h3>卡片表面</h3>')
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
    expect(backgroundCard.indexOf('endLabel="结束颜色"')).toBeLessThan(backgroundCard.indexOf('<span>遮罩颜色</span>'))
    expect(backgroundCard.indexOf('<span>遮罩颜色</span>')).toBeLessThan(backgroundCard.indexOf('<div class="background-range-grid">'))
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
    expect(sidebar).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(content).toContain('height: auto')
    expect(panel).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(panel).toContain('position: static')
  })

  it('reuses favicon.im for search engine icons', () => {
    const search = readFileSync('src/components/settings/SearchEngineSettingsSection.svelte', 'utf8')

    expect(search).toContain("import { faviconImIcon } from '../../lib/icons'")
    expect(search).toContain('engine.icon = icon')
    expect(search).toContain('Favicon.im')
    expect(search).toContain('搜索引擎图标预览')
    expect(search).toContain('.favicon-button {\n    grid-column: 3;')
  })
})

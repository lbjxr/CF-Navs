import { describe, expect, it } from 'vitest'
import type { AdminData, Bookmark, Category, Settings } from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import {
  adminDataToPublicData,
  buildHomeBackground,
  getDataVersion,
  mergeAdminData,
  mergePublicData,
  stripAdminDataVersion,
  stripPublicDataVersion,
  toAdminBookmarks,
  toAdminCategories,
  toPublicBookmark,
  toSettingsForm,
} from '../../src/lib/appData'

const categoryA: Category = {
  id: 1,
  title: 'Tools',
  icon: 'tool',
  sort: 0,
  created_at: 100,
}

const categoryB: Category = {
  id: 2,
  title: 'Docs',
  icon: null,
  sort: 1,
  created_at: 101,
}

const bookmarkA: Bookmark = {
  id: 10,
  category_id: 1,
  title: 'GitHub',
  url: 'https://github.com',
  icon: null,
  icon_source: 'direct',
  icon_background_color: null,
  icon_blob: null,
  icon_cached: 1,
  description: null,
  open_method: 1,
  sort: 0,
  created_at: 200,
}

const bookmarkB: Bookmark = {
  id: 11,
  category_id: 1,
  title: 'Docs',
  url: 'https://docs.example.com',
  icon: 'book',
  icon_source: 'iconify',
  icon_background_color: '#ffffff',
  icon_blob: 'data:image/svg+xml;base64,abc',
  icon_cached: true,
  description: 'Documentation',
  open_method: 3,
  sort: 1,
  created_at: 201,
}

const settings: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'image', value: 'https://example.com/bg.png', blur: 8, mask: 0.25, maskColor: '#ffffff' },
    dark: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  },
  custom_css: 'body{}',
  custom_js: 'alert(1)',
  image_host_url: '',
  search_engine: {
    current: 'Google',
    engines: [{ name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' }],
  },
  card_size: { width: 80, height: 60 },
  card_style: 'info',
  card_icon_size: 60,
  card_show_description: true,
  card_background_color: '#123456',
  card_background_opacity: 0.75,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'top', always_expanded: true },
  footer_html: '<p>Footer</p>',
}

describe('app data adapters', () => {
  it('maps admin categories and bookmark display values', () => {
    expect(toAdminCategories([categoryA, categoryB], [bookmarkA, bookmarkB])).toEqual([
      { id: 1, title: 'Tools', icon: 'tool', bookmarkCount: 2 },
      { id: 2, title: 'Docs', icon: '', bookmarkCount: 0 },
    ])

    expect(toAdminBookmarks([bookmarkA, bookmarkB])).toMatchObject([
      { id: 10, title: 'GitHub', icon: '', description: '', open_method: 'new_tab' },
      { id: 11, title: 'Docs', icon: 'book', description: 'Documentation', open_method: 'modal' },
    ])
  })

  it('converts admin data into public data without private settings fields', () => {
    const publicData = adminDataToPublicData(
      { categories: [categoryA], bookmarks: [bookmarkA], settings },
      settings,
    )

    expect(publicData.categories).toBeDefined()
    expect(publicData.bookmarks).toEqual([toPublicBookmark(bookmarkA)])
    expect(publicData.settings).toEqual(toPublicSettings(settings))
    expect('public_mode' in publicData.settings).toBe(false)
    expect('custom_js' in publicData.settings).toBe(false)
  })

  it('keeps stable object references when merged data is unchanged', () => {
    const publicData = {
      categories: [categoryA],
      bookmarks: [toPublicBookmark(bookmarkA)],
      settings: toPublicSettings(settings),
    }
    const equivalentPublicData = {
      categories: [{ ...categoryA }],
      bookmarks: [{ ...toPublicBookmark(bookmarkA) }],
      settings: { ...toPublicSettings(settings) },
    }

    expect(mergePublicData(publicData, equivalentPublicData)).toBe(publicData)

    const adminData: AdminData = { categories: [categoryA], bookmarks: [bookmarkA], settings }
    const equivalentAdminData: AdminData = {
      categories: [{ ...categoryA }],
      bookmarks: [{ ...bookmarkA }],
      settings: { ...settings },
    }

    expect(mergeAdminData(adminData, equivalentAdminData)).toBe(adminData)
  })

  it('extracts and strips transport versions', () => {
    const publicData = {
      categories: [categoryA],
      bookmarks: [toPublicBookmark(bookmarkA)],
      settings: toPublicSettings(settings),
      version: 'v1',
    }
    const adminData: AdminData = { categories: [categoryA], bookmarks: [bookmarkA], settings, version: 'v2' }

    expect(getDataVersion(publicData)).toBe('v1')
    expect(stripPublicDataVersion(publicData)).not.toHaveProperty('version')
    expect(stripAdminDataVersion(adminData)).not.toHaveProperty('version')
  })

  it('builds home background CSS variables from themed settings', () => {
    const cssVars = buildHomeBackground(toPublicSettings(settings), 'light')

    expect(cssVars).toContain('--home-background: url("https://example.com/bg.png") center / cover no-repeat;')
    expect(cssVars).toContain('--home-background-blur: 8px;')
    expect(cssVars).toContain('--home-background-mask: 0.25;')
    expect(cssVars).toContain('--card-bg-rgb: 18 52 86;')
    expect(cssVars).toContain('--card-bg-opacity: 0.75;')
  })

  it('returns the editable settings form subset', () => {
    expect(toSettingsForm(settings)).toEqual({
      site_title: settings.site_title,
      site_title_color: settings.site_title_color,
      site_title_font_size: settings.site_title_font_size,
      public_mode: settings.public_mode,
      theme: settings.theme,
      background_preset_id: settings.background_preset_id,
      custom_css: settings.custom_css,
      custom_js: settings.custom_js,
      image_host_url: settings.image_host_url,
      background: settings.background,
      backgrounds: settings.backgrounds,
      search_engine: settings.search_engine,
      card_size: settings.card_size,
      card_style: settings.card_style,
      card_icon_size: settings.card_icon_size,
      card_show_description: settings.card_show_description,
      card_background_color: settings.card_background_color,
      card_background_opacity: settings.card_background_opacity,
      card_icon_show_title: settings.card_icon_show_title,
      card_text_color: settings.card_text_color,
      search_box_show: settings.search_box_show,
      search_engine_selector_show: settings.search_engine_selector_show,
      content_layout: settings.content_layout,
      navigation: settings.navigation,
      footer_html: settings.footer_html,
    })
  })
})

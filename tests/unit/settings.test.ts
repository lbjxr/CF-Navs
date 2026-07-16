import { describe, expect, it } from 'vitest'
import type { Settings } from '../../shared/types'
import { PUBLIC_DATA_SETTINGS_KEYS, PUBLIC_SETTINGS_KEYS, SETTINGS_KEYS, toPublicSettings } from '../../shared/settings'

const settings: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'color', value: '#ffffff', blur: 0, mask: 0.1, maskColor: '#ffffff' },
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
  card_description_mode: 'always',
  card_background_color: '#ffffff',
  card_background_opacity: 0.9,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'left', always_expanded: false },
  footer_html: '<p>Footer</p>',
}

describe('shared settings metadata', () => {
  it('keeps the settings key registry aligned with Settings shape', () => {
    expect(SETTINGS_KEYS).toEqual(Object.keys(settings))
  })

  it('publishes only the intended public settings subset', () => {
    const publicSettings = toPublicSettings(settings)

    expect(Object.keys(publicSettings)).toEqual([...PUBLIC_SETTINGS_KEYS])
    expect(publicSettings.site_title).toBe('CF-Navs')
    expect('public_mode' in publicSettings).toBe(false)
    expect('custom_css' in publicSettings).toBe(false)
    expect('custom_js' in publicSettings).toBe(false)
  })

  it('uses the public data key registry to fetch public mode plus public fields', () => {
    expect(PUBLIC_DATA_SETTINGS_KEYS).toEqual(['public_mode', ...PUBLIC_SETTINGS_KEYS])
  })
})

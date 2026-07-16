// 共享 SQL 常量与查询片段：列清单在多个数据模块间复用，集中维护避免漂移

import { PUBLIC_DATA_SETTINGS_KEYS } from '../../../shared/settings'

const PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_KEYS = PUBLIC_DATA_SETTINGS_KEYS.filter(
  (key) => key !== 'site_title' && key !== 'public_mode',
)

export const CATEGORY_LIST_SQL =
  'SELECT id, title, icon, sort, created_at FROM categories ORDER BY sort ASC, id ASC'
export const BOOKMARK_LIST_SQL =
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, sort, created_at FROM bookmarks ORDER BY sort ASC, id ASC'
export const BOOKMARK_AGGREGATE_LIST_SQL =
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, NULL AS icon_blob, CASE WHEN icon_blob IS NULL OR icon_blob = \'\' THEN 0 ELSE 1 END AS icon_cached, description, description_mode, open_method, sort, created_at FROM bookmarks ORDER BY sort ASC, id ASC'
export const PUBLIC_CATEGORY_LIST_SQL =
  'SELECT id, title, icon, sort FROM categories ORDER BY sort ASC, id ASC'
export const PUBLIC_BOOKMARK_LIST_SQL =
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, NULL AS icon_blob, CASE WHEN icon_blob IS NULL OR icon_blob = \'\' THEN 0 ELSE 1 END AS icon_cached, description, description_mode, open_method, sort FROM bookmarks ORDER BY sort ASC, id ASC'
export const SETTINGS_LIST_SQL = 'SELECT key, value FROM settings'
export const PUBLIC_DATA_SETTINGS_LIST_SQL = `SELECT key, value FROM settings WHERE key IN (${PUBLIC_DATA_SETTINGS_KEYS
  .map((key) => `'${key}'`)
  .join(',')})`
export const PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL = `SELECT key, value FROM settings WHERE key IN (${PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_KEYS
  .map((key) => `'${key}'`)
  .join(',')})`

export const DATA_VERSION_KEY = 'data_version'

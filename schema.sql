-- CF-Navs D1 schema（单用户，无 user_id）

-- 分类（栏目）
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  icon        TEXT,                       -- 图标 URL（可填 cftc 直链）
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- 书签
CREATE TABLE IF NOT EXISTS bookmarks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,             -- 站点地址
  icon         TEXT,                      -- 图标 URL（cftc 直链 / 自动获取结果）
  icon_source  TEXT,                      -- 图标获取方式：direct/favicon_im/logo_surf/google/iconify/custom
  icon_background_color TEXT,             -- 单个图标背景色
  icon_blob    TEXT,                      -- 图标 base64 缓存（本地回退方案）
  description  TEXT,
  open_method  INTEGER NOT NULL DEFAULT 1,-- 1=新窗口 2=当前页 3=当前页弹层
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS error_report_rate_limits (
  client_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sort ON bookmarks(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sort_global ON bookmarks(sort, id);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort);
CREATE INDEX IF NOT EXISTS idx_categories_sort_id ON categories(sort, id);

-- 全局设置（key-value，避免频繁改表结构）
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT                             -- JSON 字符串
);

-- 默认设置（仅当不存在时插入）
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_title', '"CF-Navs"'),
  ('site_title_color', '""'),
  ('site_title_font_size', '32'),
  ('public_mode', 'true'),
  ('theme', '"light"'),
  ('background_preset_id', '"ocean-depths"'),
  ('background', '{"type":"gradient","value":"radial-gradient(circle at 16% 12%, rgba(56, 189, 248, 0.5), transparent 44%), radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.42), transparent 46%), radial-gradient(circle at 52% 96%, rgba(147, 197, 253, 0.46), transparent 50%), linear-gradient(145deg, #eff9ff 0%, #e7f5fe 46%, #e9f9f8 100%)","blur":0,"mask":0.06,"maskColor":"#ffffff"}'),
  ('backgrounds', '{"light":{"type":"gradient","value":"radial-gradient(circle at 16% 12%, rgba(56, 189, 248, 0.5), transparent 44%), radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.42), transparent 46%), radial-gradient(circle at 52% 96%, rgba(147, 197, 253, 0.46), transparent 50%), linear-gradient(145deg, #eff9ff 0%, #e7f5fe 46%, #e9f9f8 100%)","blur":0,"mask":0.06,"maskColor":"#ffffff"},"dark":{"type":"gradient","value":"radial-gradient(circle at 16% 12%, rgba(14, 165, 233, 0.44), transparent 48%), radial-gradient(circle at 84% 20%, rgba(20, 184, 166, 0.32), transparent 48%), radial-gradient(circle at 52% 96%, rgba(59, 130, 246, 0.3), transparent 54%), linear-gradient(145deg, #041828 0%, #06304a 50%, #0a2038 100%)","blur":0,"mask":0.12,"maskColor":"#000000"}}'),
  ('custom_css', '""'),
  ('custom_js', '""'),
  ('image_host_url', '""'),
  ('search_engine', '{"current":"Google","engines":[{"name":"Google","icon":"","url_template":"https://www.google.com/search?q={q}"},{"name":"Bing","icon":"","url_template":"https://www.bing.com/search?q={q}"}]}'),
  ('card_size', '{"width":80,"height":60}'),
  ('card_style', '"info"'),
  ('card_icon_size', '60'),
  ('card_show_description', 'true'),
  ('card_background_color', '"#ffffff"'),
  ('card_background_opacity', '0.42'),
  ('card_icon_show_title', 'true'),
  ('card_text_color', '""'),
  ('search_box_show', 'true'),
  ('search_engine_selector_show', 'true'),
  ('content_layout', '{"max_width":1200,"max_width_unit":"px","margin_x":0,"margin_top":0,"margin_bottom":0}'),
  ('navigation', '{"position":"left","always_expanded":false}'),
  ('footer_html', '""');

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
  icon_source  TEXT,                      -- 图标获取方式：direct/favicon_im/logo_surf/google/custom
  icon_background_color TEXT,             -- 单个图标背景色
  icon_blob    TEXT,                      -- 图标 base64 缓存（本地回退方案）
  description  TEXT,
  open_method  INTEGER NOT NULL DEFAULT 1,-- 1=新窗口 2=当前页 3=当前页弹层
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sort ON bookmarks(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort);

-- 全局设置（key-value，避免频繁改表结构）
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT                             -- JSON 字符串
);

-- 默认设置（仅当不存在时插入）
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_title', '"CF-Navs"'),
  ('site_title_color', '"#ffffff"'),
  ('site_title_font_size', '32'),
  ('public_mode', 'true'),
  ('theme', '"auto"'),
  ('background', '{"type":"color","value":"#0f172a","blur":0,"mask":0.3}'),
  ('custom_css', '""'),
  ('custom_js', '""'),
  ('image_host_url', '""'),
  ('search_engine', '{"current":"Google","engines":[{"name":"Google","icon":"","url_template":"https://www.google.com/search?q={q}"},{"name":"Bing","icon":"","url_template":"https://www.bing.com/search?q={q}"}]}'),
  ('card_size', '{"width":200,"height":0}'),
  ('card_style', '"info"'),
  ('card_icon_size', '70'),
  ('card_show_description', 'true'),
  ('card_background_color', '"#ffffff"'),
  ('card_background_opacity', '0.9'),
  ('card_icon_show_title', 'true'),
  ('card_text_color', '""'),
  ('search_box_show', 'true'),
  ('search_engine_selector_show', 'true'),
  ('content_layout', '{"max_width":1200,"max_width_unit":"px","margin_x":0,"margin_top":0,"margin_bottom":0}'),
  ('footer_html', '""');

// D1 查询封装的统一入口：按数据职责拆分到 ./db/*，此处集中重导出，
// 保持路由层 `../lib/db` 导入路径不变。

export { settingsFromPatchDefaults } from './settingsData'

export { ensureSchema } from './db/schema'

export {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  batchDeleteCategories,
  sortCategories,
} from './db/categories'

export {
  listBookmarks,
  getBookmarkIconData,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  batchDeleteBookmarks,
  sortBookmarks,
  setIconBlob,
  type BookmarkIconData,
} from './db/bookmarks'

export { getPublicDataSource, getAdminData } from './db/aggregates'

export {
  getSettings,
  getSiteConfig,
  getSettingValues,
  setSettingValue,
  getDataVersion,
  touchDataVersion,
  updateSettings,
  writeSettingsPatch,
} from './db/settings'

export { importData } from './db/import'

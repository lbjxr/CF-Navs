import type {
  BookmarkEditData,
  BookmarkUpsertReq,
  Category,
  CategoryUpsertReq,
  IconSource,
} from '../../shared/types'
import { normalizeBookmarkUrl } from '../../shared/urlPolicy'
import type { BookmarkFormValue, CategoryFormValue } from './adminTypes'
import { iconifyIcon } from './icons'

export function toCategoryPayload(form: CategoryFormValue): CategoryUpsertReq {
  const icon = form.icon.trim()
  const normalizedIcon = iconifyIcon(icon) || icon

  return {
    title: form.title.trim(),
    icon: normalizedIcon || null,
    parent_id: form.parent_id == null || form.parent_id === '' ? null : Number(form.parent_id),
    ...(form.is_private === undefined ? {} : { is_private: form.is_private === true }),
  }
}

export function toBookmarkPayload(form: BookmarkFormValue): BookmarkUpsertReq {
  return {
    category_id: Number(form.category_id),
    title: form.title.trim(),
    // 直接敲 `example.com` 是常见输入习惯，这里补成 https 再提交，
    // 免得撞上服务端的协议校验。补不了的原样送出，由服务端给出权威错误。
    url: normalizeBookmarkUrl(form.url) ?? form.url.trim(),
    icon: form.icon.trim() || null,
    icon_source: (form.icon_source as IconSource) || null,
    icon_background_color: form.icon_background_color.trim() || null,
    description: form.description.trim() || null,
    description_mode: form.description_mode === 'inherit' ? null : form.description_mode,
    open_method: form.open_method === 'same_tab' ? 2 : form.open_method === 'modal' ? 3 : 1,
    is_private: form.is_private,
  }
}

export function toCategoryForm(category: Category): CategoryFormValue {
  return {
    id: category.id,
    parent_id: category.parent_id,
    title: category.title,
    icon: category.icon ?? '',
    is_private: category.is_private === true || category.is_private === 1,
  }
}

export function toBookmarkForm(bookmark: BookmarkEditData): BookmarkFormValue {
  return {
    id: bookmark.id,
    category_id: bookmark.category_id,
    title: bookmark.title,
    url: bookmark.url,
    icon: bookmark.icon ?? '',
    icon_source: bookmark.icon_source ?? '',
    icon_background_color: bookmark.icon_background_color ?? '',
    description: bookmark.description ?? '',
    description_mode: bookmark.description_mode ?? 'inherit',
    open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
    is_private: bookmark.is_private === true || bookmark.is_private === 1,
  }
}

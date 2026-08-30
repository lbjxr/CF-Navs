export type AdminTab = 'categories' | 'bookmarks' | 'analytics' | 'settings' | 'backup'

export type CategorySortHandler = (
  parentId: number | null,
  orderedIds: Array<string | number>,
) => void | Promise<void>

export type CategoryFormValue = {
  id?: string | number
  parent_id: string | number | null
  title: string
  icon: string
  is_private?: boolean
}

export type BookmarkFormValue = {
  id?: string | number
  category_id?: string | number
  title: string
  url: string
  internal_url?: string
  icon: string
  icon_source: string
  icon_background_color: string
  description: string
  description_mode: 'inherit' | 'always' | 'hover' | 'hidden'
  open_method: 'same_tab' | 'new_tab' | 'modal'
  is_private: boolean
}

export type AdminTab = 'categories' | 'bookmarks' | 'settings' | 'backup'

export type CategoryFormValue = {
  id?: string | number
  title: string
  icon: string
}

export type BookmarkFormValue = {
  id?: string | number
  category_id?: string | number
  title: string
  url: string
  icon: string
  icon_source: string
  icon_background_color: string
  description: string
  open_method: 'same_tab' | 'new_tab' | 'modal'
}

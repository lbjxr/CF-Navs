export type ConfirmDialogVariant = 'default' | 'danger'

export type ConfirmDialogState = {
  title: string
  message: string
  itemTitle: string
  confirmLabel: string
  cancelLabel: string
  variant: ConfirmDialogVariant
}

export type ConfirmDialogInput = {
  title: string
  message: string
  itemTitle?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
}

export function createConfirmDialogState(input: ConfirmDialogInput): ConfirmDialogState {
  return {
    title: input.title,
    message: input.message,
    itemTitle: input.itemTitle ?? '',
    confirmLabel: input.confirmLabel ?? '确认',
    cancelLabel: input.cancelLabel ?? '取消',
    variant: input.variant ?? 'default',
  }
}

export function createDeleteCategoryConfirmation(categoryTitle: string): ConfirmDialogInput {
  return {
    title: '删除分类',
    message: '删除后该分类及其下所有书签都会从首页和后台列表中移除，此操作不可撤销。',
    itemTitle: categoryTitle,
    confirmLabel: '确认删除',
    variant: 'danger',
  }
}

export function createDeleteBookmarkConfirmation(bookmarkTitle: string): ConfirmDialogInput {
  return {
    title: '删除书签',
    message: '删除后该书签会从首页和后台列表中移除，此操作不可撤销。',
    itemTitle: bookmarkTitle,
    confirmLabel: '确认删除',
    variant: 'danger',
  }
}

export function createBatchDeleteConfirmation(kind: 'category' | 'bookmark', count: number, bookmarkCount = 0): ConfirmDialogInput {
  return {
    title: `批量删除${kind === 'category' ? '分类' : '书签'}`,
    message: kind === 'category'
      ? `将删除 ${count} 个分类及其下 ${bookmarkCount} 个书签，此操作不可撤销。`
      : `将删除 ${count} 个书签，此操作不可撤销。`,
    confirmLabel: '确认删除',
    variant: 'danger',
  }
}

export function createImportOverwriteConfirmation(input: {
  sourceLabel: string
  categories: number
  bookmarks: number
}): ConfirmDialogInput {
  return {
    title: '导入并覆盖数据',
    message: `导入 ${input.sourceLabel} 将覆盖现有的全部分类与书签（${input.categories} 个分类，${input.bookmarks} 个书签），此操作不可撤销。`,
    confirmLabel: '确认导入',
    variant: 'danger',
  }
}

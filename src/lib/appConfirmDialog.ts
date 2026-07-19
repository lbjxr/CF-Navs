export type ConfirmDialogVariant = 'default' | 'danger'

export type ConfirmDialogState = {
  title: string
  message: string
  itemTitle: string
  confirmLabel: string
  cancelLabel: string
  variant: ConfirmDialogVariant
  confirmDisabled: boolean
}

export type ConfirmDialogInput = {
  title: string
  message: string
  itemTitle?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
  confirmDisabled?: boolean
}

export function createConfirmDialogState(input: ConfirmDialogInput): ConfirmDialogState {
  return {
    title: input.title,
    message: input.message,
    itemTitle: input.itemTitle ?? '',
    confirmLabel: input.confirmLabel ?? '确认',
    cancelLabel: input.cancelLabel ?? '取消',
    variant: input.variant ?? 'default',
    confirmDisabled: input.confirmDisabled ?? false,
  }
}

export function createDeleteCategoryConfirmation(
  categoryTitle: string,
  directBookmarkCount = 0,
  childCategoryCount = 0,
): ConfirmDialogInput {
  const blocked = childCategoryCount > 0
  return {
    title: '删除分类',
    message: blocked
      ? `该分类有 ${directBookmarkCount} 个直属书签和 ${childCategoryCount} 个子分类。请先移动或删除子分类，当前不能删除。`
      : `删除后该分类及其 ${directBookmarkCount} 个直属书签都会从首页和后台列表中移除，此操作不可撤销。`,
    itemTitle: categoryTitle,
    confirmLabel: blocked ? '存在子分类' : '确认删除',
    confirmDisabled: blocked,
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

export function createBatchDeleteConfirmation(
  kind: 'category' | 'bookmark',
  count: number,
  bookmarkCount = 0,
  childCategoryCount = 0,
): ConfirmDialogInput {
  const blocked = kind === 'category' && childCategoryCount > 0
  return {
    title: `批量删除${kind === 'category' ? '分类' : '书签'}`,
    message: kind === 'category'
      ? blocked
        ? `已选分类包含 ${bookmarkCount} 个直属书签和 ${childCategoryCount} 个子分类。请先移动或删除这些子分类，当前不能批量删除。`
        : `将删除 ${count} 个分类及其 ${bookmarkCount} 个直属书签，此操作不可撤销。`
      : `将删除 ${count} 个书签，此操作不可撤销。`,
    confirmLabel: blocked ? '存在子分类' : '确认删除',
    confirmDisabled: blocked,
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

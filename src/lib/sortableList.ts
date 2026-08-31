import type { ActionReturn } from 'svelte/action'

// SortableJS 的最小类型定义（项目未安装其类型声明）
type SortableInstance = {
  destroy: () => void
  option: (name: string, value?: unknown) => unknown
}

type SortableLibrary = {
  create: (element: HTMLElement, options: { [key: string]: unknown }) => SortableInstance
}

type SortableModule = {
  default: SortableLibrary
}

type SortableDomEvent = {
  oldIndex?: number
  newIndex?: number
  from: HTMLElement
  to: HTMLElement
  item: HTMLElement
}

export type SortHandler = (orderedIds: Array<string | number>) => void | Promise<void>

export type SortTransfer = {
  itemId: string | number
  fromCategoryId: number | null
  toCategoryId: number | null
  sourceIds: Array<string | number>
  targetIds: Array<string | number>
}

export type SortTransferHandler = (transfer: SortTransfer) => void | Promise<void>

export type SortableListOptions = {
  /** 是否启用拖拽（关闭时会销毁实例） */
  enabled: boolean
  /** 拖拽结束后回调，参数为按 DOM 顺序排列的 data-sort-id 列表 */
  onSort?: SortHandler
  /** 仅允许通过带该属性的元素发起拖拽，例如 "[data-drag-handle]"；不传则整项可拖 */
  handle?: string
  /** 过滤不应启动拖拽的交互区域，例如菜单、输入控件 */
  filter?: string
  /** 过滤区域是否阻止浏览器默认行为；关闭以保留原生触摸滚动 */
  preventOnFilter?: boolean
  /** 同一组的多个列表可以相互放置，适合跨分类移动书签 */
  group?: string
  /** 跨列表移动完成后的回调 */
  onTransfer?: SortTransferHandler
}

let sortableModulePromise: Promise<SortableModule> | null = null

const loadSortable = async (): Promise<SortableModule> => {
  if (!sortableModulePromise) {
    // @ts-ignore sortablejs 在本项目未提供类型声明
    sortableModulePromise = import('sortablejs/modular/sortable.core.esm.js') as Promise<SortableModule>
  }

  return sortableModulePromise
}

const readDomOrder = (container: HTMLElement): Array<string | number> =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-sort-id]'))
    .map((element) => {
      const raw = element.dataset.sortId ?? ''
      const numeric = Number(raw)
      return Number.isFinite(numeric) && raw !== '' ? numeric : raw
    })
    .filter((value) => value !== '')

const readCategoryId = (container: HTMLElement): number | null => {
  const value = container.dataset.sortCategoryId
  if (!value) return null
  const id = Number(value)
  return Number.isInteger(id) ? id : null
}

/**
 * 通用拖拽排序 action。
 *
 * - 拖拽项需带 `data-sortable-item` 与 `data-sort-id`。
 * - 不使用 fallbackOnBody，避免把 <tr> 拖到 body 外导致表格塌陷。
 * - 通过 ghost/chosen/drag class 抑制抖动，配合 CSS 提供稳定占位。
 */
export const sortableList = (
  target: HTMLElement,
  initialOptions: SortableListOptions,
): ActionReturn<SortableListOptions> => {
  let sortable: SortableInstance | null = null
  let options = initialOptions

  const destroySortable = () => {
    sortable?.destroy()
    sortable = null
  }

  const initSortable = async () => {
    if (!options.enabled || !options.onSort) {
      destroySortable()
      return
    }

    const { default: SortableCtor } = await loadSortable()

    // await 期间选项可能已变化，重新校验。
    if (!options.enabled || !options.onSort) {
      destroySortable()
      return
    }

    destroySortable()

    sortable = SortableCtor.create(target, {
      animation: 160,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      draggable: '[data-sortable-item]',
      handle: options.handle,
      filter: options.filter,
      preventOnFilter: options.preventOnFilter ?? true,
      group: options.group ? { name: options.group, pull: true, put: true } : undefined,
      // 关键：不启用 fallbackOnBody，保持拖拽项留在原容器内。
      forceFallback: true,
      fallbackOnBody: false,
      fallbackTolerance: 4,
      swapThreshold: 0.65,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: async (event: SortableDomEvent) => {
        const { oldIndex, newIndex, from } = event

        if (oldIndex == null || newIndex == null) {
          return
        }

        if (from !== event.to) {
          if (!options.onTransfer) return
          await options.onTransfer({
            itemId: readDomOrder(event.to).find((id) => String(id) === event.item.dataset.sortId) ?? event.item.dataset.sortId ?? '',
            fromCategoryId: readCategoryId(from),
            toCategoryId: readCategoryId(event.to),
            sourceIds: readDomOrder(from),
            targetIds: readDomOrder(event.to),
          })
          return
        }

        if (oldIndex === newIndex || !options.onSort) {
          return
        }

        const orderedIds = readDomOrder(from)
        if (orderedIds.length > 0) {
          await options.onSort(orderedIds)
        }
      },
    })
  }

  void initSortable()

  return {
    update(nextOptions: SortableListOptions) {
      const shouldRebuild =
        nextOptions.enabled !== options.enabled ||
        nextOptions.onSort !== options.onSort ||
        nextOptions.handle !== options.handle ||
        nextOptions.filter !== options.filter ||
        nextOptions.preventOnFilter !== options.preventOnFilter ||
        nextOptions.group !== options.group ||
        nextOptions.onTransfer !== options.onTransfer
      options = nextOptions
      if (shouldRebuild) {
        void initSortable()
      }
    },
    destroy() {
      destroySortable()
    },
  }
}

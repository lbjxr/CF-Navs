// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionReturn } from 'svelte/action'
import type { sortableList, SortableListOptions } from '../../src/lib/sortableList'

type SortableResource = { destroy: () => void }
type SortableModule = {
  default: {
    create: (element: HTMLElement, options: Record<string, unknown>) => SortableResource
    get: (element: HTMLElement) => SortableResource | null | undefined
  }
}

type ImportGate = { promise: Promise<void>; resolve: () => void }

function deferred(): ImportGate {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

let importGate: ImportGate
let library: SortableModule['default']
let createAction: typeof sortableList
const mounted: Array<{ element: HTMLElement; action: ActionReturn<SortableListOptions> }> = []

beforeEach(async () => {
  vi.resetModules()
  importGate = deferred()
  // 只延迟模块到达，实例、事件注册与销毁仍由真实 SortableJS 执行。
  const actual = await vi.importActual<SortableModule>('sortablejs/modular/sortable.core.esm.js')
  library = actual.default
  vi.doMock('sortablejs/modular/sortable.core.esm.js', async () => {
    await importGate.promise
    return actual
  })
  // 每例重置 action 的模块缓存；静态导入无法覆盖这里要验证的模块加载边界。
  createAction = (await import('../../src/lib/sortableList')).sortableList
})

async function finishImport() {
  importGate.resolve()
  await vi.dynamicImportSettled()
}

function mount(options: SortableListOptions) {
  const element = document.createElement('div')
  element.innerHTML = '<div data-sortable-item data-sort-id="1">One</div><div data-sortable-item data-sort-id="2">Two</div>'
  document.body.append(element)
  const action = createAction(element, options)
  mounted.push({ element, action })
  return { element, action }
}

afterEach(async () => {
  // 即使用例中途失败，也先排空导入，再销毁资源，避免异步工作逃出 jsdom 生命周期。
  await finishImport()
  for (const { element, action } of mounted.splice(0)) {
    action.destroy?.()
    library.get(element)?.destroy()
    element.remove()
  }
  vi.doUnmock('sortablejs/modular/sortable.core.esm.js')
  vi.restoreAllMocks()
})

describe('sortable action lifecycle', () => {
  it('does not register dragging after destruction while the import is pending', async () => {
    const { element, action } = mount({ enabled: true, onSort: vi.fn() })
    action.destroy?.()
    element.remove()

    await finishImport()

    expect(library.get(element)).toBeFalsy()
  })

  it('registers one real instance for the latest pending configuration', async () => {
    // 每个过期 continuation 都 create/destroy 一次会重复注册全局拖拽监听；这里只观察真实库的资源创建。
    const create = vi.spyOn(library, 'create')
    const options = { enabled: true, onSort: vi.fn() }
    const { element, action } = mount(options)
    action.update?.({ ...options, handle: '.first-handle' })
    action.update?.({ ...options, handle: '.latest-handle' })

    await finishImport()

    expect(create).toHaveBeenCalledTimes(1)
    expect(library.get(element)).toBeTruthy()
  })

  it('stays disabled when loading finishes and can later enable and destroy', async () => {
    const options = { enabled: true, onSort: vi.fn() }
    const { element, action } = mount(options)
    action.update?.({ ...options, enabled: false })

    await finishImport()
    expect(library.get(element)).toBeFalsy()

    action.update?.(options)
    await vi.dynamicImportSettled()
    expect(library.get(element)).toBeTruthy()

    // 缓存命中仍经过 await：重建尚未完成时销毁，也不能在下一个微任务中复活。
    action.update?.({ ...options, handle: '.drag-handle' })
    action.destroy?.()
    await vi.dynamicImportSettled()
    expect(library.get(element)).toBeFalsy()
  })

  it('keeps a pending initialization valid when an update changes no options', async () => {
    const options = { enabled: true, onSort: vi.fn() }
    const { element, action } = mount(options)
    action.update?.({ ...options })

    await finishImport()

    expect(library.get(element)).toBeTruthy()
    action.destroy?.()
    expect(library.get(element)).toBeFalsy()
  })
})

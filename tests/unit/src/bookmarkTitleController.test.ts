import { describe, expect, it } from 'vitest'
import {
  BOOKMARK_TITLE_FILL_MAX_LENGTH,
  createBookmarkTitleState,
  normalizeTitleLookupUrl,
  resolveBookmarkTitleError,
  resolveBookmarkTitleSuccess,
  scheduleBookmarkTitleLookup,
} from '../../../src/lib/bookmarkTitleController'

const CREATE = { mode: 'create' as const }

describe('bookmark title lookup url normalization', () => {
  it('accepts http(s) urls with a dotted hostname', () => {
    expect(normalizeTitleLookupUrl('https://example.com')).toBe('https://example.com/')
    expect(normalizeTitleLookupUrl('  http://example.com/a  ')).toBe('http://example.com/a')
  })

  it('rejects values that are not worth fetching', () => {
    expect(normalizeTitleLookupUrl('')).toBe('')
    expect(normalizeTitleLookupUrl('example.com')).toBe('')
    expect(normalizeTitleLookupUrl('ftp://example.com')).toBe('')
    expect(normalizeTitleLookupUrl('javascript:alert(1)')).toBe('')
    expect(normalizeTitleLookupUrl('http://localhost:5173')).toBe('')
  })

  it('strips embedded credentials', () => {
    expect(normalizeTitleLookupUrl('https://user:secret@example.com/a')).toBe('https://example.com/a')
  })
})

describe('bookmark title controller scheduling', () => {
  it('does not look up while editing an existing bookmark', () => {
    const result = scheduleBookmarkTitleLookup(createBookmarkTitleState(), {
      mode: 'edit',
      url: 'https://example.com',
      title: '',
    })

    expect(result.changed).toBe(false)
    expect(result.task).toBeNull()
  })

  it('does not look up when the title already has content', () => {
    const result = scheduleBookmarkTitleLookup(createBookmarkTitleState(), {
      ...CREATE,
      url: 'https://example.com',
      title: '我的书签',
    })

    expect(result.changed).toBe(false)
    expect(result.task).toBeNull()
  })

  it('does not look up for unusable urls', () => {
    for (const url of ['', 'abc', 'ftp://example.com', 'http://localhost']) {
      const result = scheduleBookmarkTitleLookup(createBookmarkTitleState(), {
        ...CREATE,
        url,
        title: '',
      })

      expect(result.task).toBeNull()
    }
  })

  it('schedules a lookup for a valid url and empty title', () => {
    const initial = createBookmarkTitleState()
    const result = scheduleBookmarkTitleLookup(initial, {
      ...CREATE,
      url: 'https://example.com',
      title: '',
    })

    expect(result.changed).toBe(true)
    expect(result.state.loading).toBe(true)
    expect(result.task?.url).toBe('https://example.com/')
    expect(result.task?.requestId).toBe(initial.requestId + 1)
  })

  it('does not repeat a lookup for the same normalized url', () => {
    const first = scheduleBookmarkTitleLookup(createBookmarkTitleState(), {
      ...CREATE,
      url: 'https://Example.com',
      title: '',
    })
    const second = scheduleBookmarkTitleLookup(first.state, {
      ...CREATE,
      url: 'https://example.com/',
      title: '',
    })

    expect(second.changed).toBe(false)
    expect(second.task).toBeNull()
  })

  it('does not retry the same url after a failure', () => {
    const scheduled = scheduleBookmarkTitleLookup(createBookmarkTitleState(), {
      ...CREATE,
      url: 'https://dead.example.com',
      title: '',
    })
    const failed = resolveBookmarkTitleError(scheduled.state, {
      requestId: scheduled.task!.requestId,
      error: 'network failed',
    })
    const retry = scheduleBookmarkTitleLookup(failed, {
      ...CREATE,
      url: 'https://dead.example.com',
      title: '',
    })

    expect(retry.task).toBeNull()
  })

  it('increments requestId across changing urls', () => {
    const initial = createBookmarkTitleState()
    const first = scheduleBookmarkTitleLookup(initial, {
      ...CREATE,
      url: 'https://a.example.com',
      title: '',
    })
    const second = scheduleBookmarkTitleLookup(first.state, {
      ...CREATE,
      url: 'https://b.example.com',
      title: '',
    })
    const third = scheduleBookmarkTitleLookup(second.state, {
      ...CREATE,
      url: 'https://a.example.com',
      title: '',
    })

    expect([first.task?.requestId, second.task?.requestId, third.task?.requestId]).toEqual([
      initial.requestId + 1,
      initial.requestId + 2,
      initial.requestId + 3,
    ])
  })
})

describe('bookmark title controller resolution', () => {
  function scheduled(url = 'https://example.com') {
    return scheduleBookmarkTitleLookup(createBookmarkTitleState(), { ...CREATE, url, title: '' })
  }

  it('returns the fetched title when the field is still empty', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '百度一下',
      currentTitle: '',
    })

    expect(resolved.title).toBe('百度一下')
    expect(resolved.state.loading).toBe(false)
    expect(resolved.state.error).toBe('')
  })

  it('refuses to overwrite a title the user typed while in flight', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '来自站点的标题',
      currentTitle: '我自己写的',
    })

    expect(resolved.title).toBeNull()
    expect(resolved.state.loading).toBe(false)
    expect(resolved.state.error).toBe('')
  })

  it('never writes a blank title', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '   ',
      currentTitle: '',
    })

    expect(resolved.title).toBeNull()
  })

  it('shortens a long title so it fits the input box', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '这是一个非常非常长的站点名称用来测试自动截断行为是否正确',
      currentTitle: '',
    })

    expect(Array.from(resolved.title ?? '')).toHaveLength(BOOKMARK_TITLE_FILL_MAX_LENGTH)
    expect(resolved.title?.endsWith('…')).toBe(true)
    expect(resolved.title?.startsWith('这是一个非常非常长的站点名称')).toBe(true)
  })

  it('leaves a short title untouched', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '百度一下，你就知道',
      currentTitle: '',
    })

    expect(resolved.title).toBe('百度一下，你就知道')
  })

  it('does not split an emoji when shortening', () => {
    const start = scheduled()
    const resolved = resolveBookmarkTitleSuccess(start.state, {
      requestId: start.task!.requestId,
      title: '😀'.repeat(30),
      currentTitle: '',
    })

    expect(resolved.title).toBe(`${'😀'.repeat(BOOKMARK_TITLE_FILL_MAX_LENGTH - 1)}…`)
  })

  it('ignores a stale success response', () => {
    const first = scheduled('https://a.example.com')
    const second = scheduleBookmarkTitleLookup(first.state, {
      ...CREATE,
      url: 'https://b.example.com',
      title: '',
    })

    const stale = resolveBookmarkTitleSuccess(second.state, {
      requestId: first.task!.requestId,
      title: '旧站点',
      currentTitle: '',
    })

    expect(stale.title).toBeNull()
    expect(stale.state).toEqual(second.state)
    expect(stale.state.loading).toBe(true)
  })

  it('ignores a stale error response', () => {
    const first = scheduled('https://a.example.com')
    const second = scheduleBookmarkTitleLookup(first.state, {
      ...CREATE,
      url: 'https://b.example.com',
      title: '',
    })

    const stale = resolveBookmarkTitleError(second.state, {
      requestId: first.task!.requestId,
      error: 'network failed',
    })

    expect(stale).toEqual(second.state)
    expect(stale.error).toBe('')
  })

  it('records the error for the current request', () => {
    const start = scheduled()
    const failed = resolveBookmarkTitleError(start.state, {
      requestId: start.task!.requestId,
      error: 'network failed',
    })

    expect(failed.loading).toBe(false)
    expect(failed.error).toBe('network failed')
  })

  it('drops an in-flight response from a previous modal session', () => {
    // 弹窗是单例：重置必须越过上一轮在途请求的 requestId，
    // 否则那个响应回来时会匹配上并把旧标题写进新表单。
    const start = scheduled()
    const reopened = createBookmarkTitleState(start.state.requestId)

    // 关键场景：重开后还没发起新请求，上一轮的响应就回来了
    const straggler = resolveBookmarkTitleSuccess(reopened, {
      requestId: start.task!.requestId,
      title: '上一轮的标题',
      currentTitle: '',
    })
    expect(straggler.title).toBeNull()

    const next = scheduleBookmarkTitleLookup(reopened, {
      ...CREATE,
      url: 'https://other.example.com',
      title: '',
    })
    expect(next.task!.requestId).toBeGreaterThan(start.task!.requestId)

    const stale = resolveBookmarkTitleSuccess(next.state, {
      requestId: start.task!.requestId,
      title: '上一轮的标题',
      currentTitle: '',
    })
    expect(stale.title).toBeNull()
  })
})

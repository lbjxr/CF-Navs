import { describe, expect, it, vi } from 'vitest'
import { getErrorMessage } from '../../src/lib/api'
import { runAdminMutation } from '../../src/lib/appAdminMutation'
import { toastStore } from '../../src/lib/toast'

describe('runAdminMutation', () => {
  it.each(['request', 'completion', 'failure'])('does not update a new session after obsolete %s work', async boundary => {
    let current = true
    const onSuccess = vi.fn(async () => { if (boundary === 'completion') current = false })
    const onError = vi.fn(), onSettled = vi.fn(), successMessage = vi.fn(() => 'Saved')
    const result = await runAdminMutation({
      isCurrent: () => current,
      run: async () => {
        if (boundary !== 'completion') current = false
        if (boundary === 'failure') throw new Error('Old request failed')
        return 'saved'
      },
      onSuccess, onError, onSettled, successMessage,
    })
    expect(result).toBeUndefined()
    expect(onSuccess).toHaveBeenCalledTimes(boundary === 'completion' ? 1 : 0)
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
    expect(successMessage).not.toHaveBeenCalled()
  })

  it('runs onSuccess with the result then emits the success toast in order', async () => {
    const events: string[] = []
    const addToast = vi.spyOn(toastStore, 'addToast').mockImplementation((message, type) => {
      events.push(`toast:${type}:${message}`)
      return 'id'
    })

    try {
      const result = await runAdminMutation({
        run: async () => {
          events.push('run')
          return { title: '示例' }
        },
        onSuccess: async (value) => {
          events.push(`success:${value.title}`)
        },
        successMessage: (value) => `已保存「${value.title}」`,
        onError: () => events.push('error'),
        onSettled: () => events.push('settled'),
      })

      expect(result).toEqual({ title: '示例' })
      expect(events).toEqual(['run', 'success:示例', 'toast:success:已保存「示例」', 'settled'])
    } finally {
      addToast.mockRestore()
    }
  })

  it('skips the toast when successMessage is absent or returns empty', async () => {
    const addToast = vi.spyOn(toastStore, 'addToast')

    try {
      await runAdminMutation({ run: async () => undefined, onError: () => undefined })
      await runAdminMutation({
        run: async () => undefined,
        successMessage: () => '',
        onError: () => undefined,
      })

      expect(addToast).not.toHaveBeenCalled()
    } finally {
      addToast.mockRestore()
    }
  })

  it('routes run failures to onError, skips success work, and still settles', async () => {
    const events: string[] = []
    const addToast = vi.spyOn(toastStore, 'addToast')
    const failure = new Error('boom')

    try {
      const result = await runAdminMutation({
        run: async () => {
          throw failure
        },
        onSuccess: () => events.push('success'),
        successMessage: () => 'unused',
        onError: (message) => events.push(`error:${message}`),
        onSettled: () => events.push('settled'),
      })

      expect(result).toBeUndefined()
      expect(addToast).not.toHaveBeenCalled()
      expect(events).toEqual([`error:${getErrorMessage(failure)}`, 'settled'])
    } finally {
      addToast.mockRestore()
    }
  })

  it('treats onSuccess failures like mutation failures', async () => {
    const events: string[] = []
    const addToast = vi.spyOn(toastStore, 'addToast')
    const failure = new Error('apply failed')

    try {
      await runAdminMutation({
        run: async () => 'ok',
        onSuccess: async () => {
          throw failure
        },
        successMessage: () => 'should not toast',
        onError: (message) => events.push(`error:${message}`),
        onSettled: () => events.push('settled'),
      })

      expect(addToast).not.toHaveBeenCalled()
      expect(events).toEqual([`error:${getErrorMessage(failure)}`, 'settled'])
    } finally {
      addToast.mockRestore()
    }
  })

  it('rethrows after onError when rethrow is set, still settling first', async () => {
    const events: string[] = []
    const failure = new Error('move failed')

    await expect(
      runAdminMutation({
        run: async () => {
          throw failure
        },
        onError: (message) => events.push(`error:${message}`),
        onSettled: () => events.push('settled'),
        rethrow: true,
      }),
    ).rejects.toBe(failure)

    expect(events).toEqual([`error:${getErrorMessage(failure)}`, 'settled'])
  })
})

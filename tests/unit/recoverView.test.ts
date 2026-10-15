// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import Recover from '../../src/views/Recover.svelte'
import { ApiError } from '../../src/lib/api'

const recover = vi.fn()

vi.mock('../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, auth: { ...actual.api.auth, recover: (...args: unknown[]) => recover(...args) } },
  }
})

afterEach(() => {
  cleanup()
  recover.mockReset()
})

function renderRecover() {
  const onRecovered = vi.fn()
  const onGoInstall = vi.fn()
  const onCancel = vi.fn()
  render(Recover, { props: { onRecovered, onGoInstall, onCancel } })
  return { onRecovered, onGoInstall, onCancel }
}

async function fill(token: string, pw: string, confirm = pw) {
  await fireEvent.input(screen.getByLabelText('部署密钥'), { target: { value: token } })
  await fireEvent.input(screen.getByLabelText('新密码'), { target: { value: pw } })
  await fireEvent.input(screen.getByLabelText('再次输入新密码'), { target: { value: confirm } })
}

async function submit() {
  await fireEvent.click(screen.getByRole('button', { name: '重置并登录' }))
}

describe('Recover.svelte', () => {
  it('rejects out-of-policy password client-side without calling the API', async () => {
    renderRecover()
    await fill('token-abc', '123456789012') // single char class, 12 chars
    await submit()
    expect(recover).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('至少两类字符')
  })

  it('rejects a non-ASCII (full-width) token client-side without calling the API', async () => {
    renderRecover()
    await fill('123456#\uFFE5%@ss', 'abcd1234') // 全角￥ 会让 Headers 构造抛错
    await submit()
    expect(recover).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('ASCII')
  })

  it('rejects too-short password without calling the API', async () => {
    renderRecover()
    await fill('token-abc', 'ab1') // too short
    await submit()
    expect(recover).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('12–256 位')
  })

  it('rejects mismatched confirmation', async () => {
    renderRecover()
    await fill('token-abc', 'abcd1234efgh', 'abcd1234efg9')
    await submit()
    expect(recover).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('不一致')
  })

  it('submits valid payload and calls onRecovered with the session', async () => {
    const session = { token: 't', expires_at: 1, username: 'admin' }
    recover.mockResolvedValue(session)
    const { onRecovered } = renderRecover()
    await fill('token-abc', 'abcd1234efgh')
    await submit()
    expect(recover).toHaveBeenCalledWith({ password: 'abcd1234efgh' }, 'token-abc')
    expect(onRecovered).toHaveBeenCalledWith(session)
  })

  it('shows token guidance on 401 and does not call onRecovered', async () => {
    recover.mockRejectedValue(new ApiError('unauthorized', { status: 401, code: 1001 }))
    const { onRecovered } = renderRecover()
    await fill('wrong-token', 'abcd1234efgh')
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('令牌无效或未配置')
    expect(alert.textContent).toContain('Cloudflare 后台')
    expect(onRecovered).not.toHaveBeenCalled()
  })

  it('maps rate-limit error to its message', async () => {
    recover.mockRejectedValue(new ApiError('too many', { status: 200, code: 1004 }))
    renderRecover()
    await fill('token-abc', 'abcd1234efgh')
    await submit()
    expect((await screen.findByRole('alert')).textContent).toContain('尝试过于频繁')
  })
})

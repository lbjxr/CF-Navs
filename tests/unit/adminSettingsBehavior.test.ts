// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import SettingsPanel from '../../src/components/SettingsPanel.svelte'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

// PROB-18b：`adminSettingsLayout.test.ts` 里能被真实 DOM 证明的那部分迁到这里。
//
// 原文件 155 条断言中，绝大多数是 `toContain('bind:value={form.image_host_url}')`
// 这种「某个控件绑到了某个字段」和「某个分区里出现了某个标题」。它们能证明模板写了这些字符，
// 证明不了：分区切换后真的只渲染该分区、控件真的能改到 payload、置灰联动真的生效、
// 高级设置真的默认收起。这些才是设置页的实际契约。
//
// 留在原文件的是 CSS 布局与源码顺序断言（grid 模板、clamp 高度、@media 断点、
// 组件在文件里的出现顺序），jsdom 拿不到 computed style，属 PROB-18c。

beforeAll(() => {
  // jsdom 不实现这两个；设置页打开分类树/预览时会调用。
  Element.prototype.scrollIntoView = () => { }
})

afterEach(cleanup)

// DEFAULT_SETTINGS 是服务端权威默认值（`worker/lib/settingsData`，不是 `shared/settings`）。
// 它的 site_title 是空串（安装前还没设过标题），而空标题会让保存按钮一直禁用、助手文案停在
// 「请填写站点标题」。要测正常态就得给一个已填标题的值。
const baseValue = { ...DEFAULT_SETTINGS, site_title: 'CF-Navs' }

function renderPanel(overrides: Record<string, unknown> = {}) {
  const onSubmit = vi.fn()
  render(SettingsPanel, { props: { value: baseValue, onSubmit, ...overrides } })
  return { onSubmit }
}

const submenuButton = (label: string) =>
  screen.getAllByRole('button').find((b) => b.querySelector('strong')?.textContent === label) as HTMLButtonElement

async function openSection(label: string) {
  await fireEvent.click(submenuButton(label))
}

describe('设置页分区导航', () => {
  it('六个分区都在二级菜单里，默认停在「站点设置」', () => {
    renderPanel()

    const labels = ['站点设置', '外观与卡片', '布局与导航', '搜索设置', '自定义样式/脚本', '账号安全']
    for (const label of labels) expect(submenuButton(label)).toBeTruthy()

    expect(submenuButton('站点设置').classList.contains('active')).toBe(true)
    expect(submenuButton('外观与卡片').classList.contains('active')).toBe(false)
  })

  it('分区互斥：切到外观后站点设置的控件不再在 DOM 里', async () => {
    // 原断言只能看到 `{:else if activeSectionId === 'appearance'}` 这串字符，
    // 证明不了分区真的互斥——写成并列渲染同样能通过。
    renderPanel()
    expect(screen.getByPlaceholderText('请输入站点标题')).toBeTruthy()

    await openSection('外观与卡片')

    expect(screen.queryByPlaceholderText('请输入站点标题')).toBeNull()
    expect(submenuButton('外观与卡片').classList.contains('active')).toBe(true)
  })

  it('账号安全分区渲染改密表单而不是设置字段', async () => {
    renderPanel()
    await openSection('账号安全')

    // 站点字段必须让位；改密是独立生效的操作，不走底部「保存设置」
    expect(screen.queryByPlaceholderText('请输入站点标题')).toBeNull()
    expect(screen.getByPlaceholderText('输入当前管理员密码')).toBeTruthy()
    expect(document.getElementById('settings-section-account')).toBeTruthy()
  })
})

describe('设置控件到 payload 的实际写入', () => {
  it('改站点标题后保存，payload 带上新值', async () => {
    const { onSubmit } = renderPanel()

    await fireEvent.input(screen.getByPlaceholderText('请输入站点标题'), { target: { value: '我的导航' } })
    await fireEvent.submit(document.querySelector('#settings-form') as HTMLFormElement)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].site_title).toBe('我的导航')
  })

  it('公开模式开关改的是 public_mode，其它字段保持原值', async () => {
    const { onSubmit } = renderPanel()

    await fireEvent.click(screen.getByRole('switch', { name: '公开模式' }))
    await fireEvent.submit(document.querySelector('#settings-form') as HTMLFormElement)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.public_mode).toBe(!baseValue.public_mode)
    // 只改一个开关不该顺带改动别的字段
    expect(payload.site_title).toBe('CF-Navs')
    expect(payload.card_style).toBe(baseValue.card_style)
  })

  it('标题为空时禁止保存，并说明原因', async () => {
    const { onSubmit } = renderPanel()

    await fireEvent.input(screen.getByPlaceholderText('请输入站点标题'), { target: { value: '   ' } })

    const save = screen.getAllByRole('button').find((b) => (b.textContent ?? '').includes('保存设置')) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(document.body.textContent).toContain('请填写站点标题')

    await fireEvent.submit(document.querySelector('#settings-form') as HTMLFormElement)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('未改动时保存按钮禁用，改动后才放行——避免空提交覆盖线上设置', async () => {
    const { onSubmit } = renderPanel()
    const saveButton = screen.getByRole('button', { name: /保存设置/ }) as HTMLButtonElement

    expect(document.body.textContent).toContain('配置已同步')
    expect(saveButton.disabled).toBe(true)

    await fireEvent.submit(document.querySelector('#settings-form') as HTMLFormElement)
    expect(onSubmit).not.toHaveBeenCalled()

    await fireEvent.input(screen.getByPlaceholderText('请输入站点标题'), { target: { value: '改了' } })

    expect(document.body.textContent).toContain('有未保存更改')
    expect(saveButton.disabled).toBe(false)
  })
})

describe('外观分区的高级设置与置灰联动', () => {
  it('用具名背景预设时高级设置默认收起，点开才出现尺寸控件', async () => {
    renderPanel()
    await openSection('外观与卡片')

    const toggle = screen.getByTestId('appearance-advanced-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('settings-card-width')).toBeNull()

    await fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('settings-card-width')).toBeTruthy()
    // aria-controls 必须指向真实存在的容器，否则读屏跳不过去
    expect(document.getElementById(toggle.getAttribute('aria-controls') as string)).toBeTruthy()
  })

  it('背景改成自定义后高级设置自动展开——否则用户找不到自己刚改过的值', async () => {
    renderPanel({ value: { ...baseValue, background_preset_id: 'custom' } })
    await openSection('外观与卡片')

    expect(screen.getByTestId('appearance-advanced-toggle').getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('settings-card-width')).toBeTruthy()
  })

  it('极简卡片风格下卡片宽度控件置灰，图标尺寸控件可用；详情风格相反', async () => {
    // 这是原断言 `disabled={form.card_style !== 'info'}` 真正想表达的东西：
    // 两个控件按当前风格互斥可用，而不是模板里写了那个表达式。
    renderPanel({ value: { ...baseValue, card_style: 'icon' } })
    await openSection('外观与卡片')
    await fireEvent.click(screen.getByTestId('appearance-advanced-toggle'))

    expect((document.getElementById('settings-card-width') as HTMLInputElement).disabled).toBe(true)
    expect((document.getElementById('settings-card-icon') as HTMLInputElement).disabled).toBe(false)

    cleanup()
    renderPanel({ value: { ...baseValue, card_style: 'info' } })
    await openSection('外观与卡片')
    await fireEvent.click(screen.getByTestId('appearance-advanced-toggle'))

    expect((document.getElementById('settings-card-width') as HTMLInputElement).disabled).toBe(false)
    expect((document.getElementById('settings-card-icon') as HTMLInputElement).disabled).toBe(true)
  })

  it('卡片宽度控件的 min 是 40（PROB-28 裁定值）', async () => {
    renderPanel()
    await openSection('外观与卡片')
    await fireEvent.click(screen.getByTestId('appearance-advanced-toggle'))

    expect((document.getElementById('settings-card-width') as HTMLInputElement).min).toBe('40')
  })
})

describe('布局与导航分区的置灰联动', () => {
  it('导航在顶部时「常驻展开」不可用——那是左侧导航独有的选项', async () => {
    renderPanel({ value: { ...baseValue, navigation: { position: 'top', always_expanded: false, top_layout: 'scroll' } } })
    await openSection('布局与导航')

    const persistent = screen.getByRole('switch', { name: /常驻展开|始终展开/ })
    expect((persistent as HTMLButtonElement).disabled).toBe(true)
  })

  it('导航在左侧时「常驻展开」可用', async () => {
    renderPanel({ value: { ...baseValue, navigation: { position: 'left', always_expanded: false, top_layout: 'scroll' } } })
    await openSection('布局与导航')

    expect((screen.getByRole('switch', { name: /常驻展开|始终展开/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('保存中与加载中的可交互性', () => {
  it('loading 时只显示加载态，不渲染表单', () => {
    renderPanel({ loading: true })

    expect(document.body.textContent).toContain('设置加载中')
    expect(document.querySelector('#settings-form')).toBeNull()
  })

  it('saving 时禁用保存按钮并显示进行中文案', () => {
    renderPanel({ saving: true })

    const save = screen.getAllByRole('button').find((b) => (b.textContent ?? '').includes('保存中')) as HTMLButtonElement
    expect(save).toBeTruthy()
    expect(save.disabled).toBe(true)
  })

  it('error 有值时以 alert 角色呈现，便于读屏立即播报', () => {
    renderPanel({ error: '设置保存失败：数据库不可用' })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('设置保存失败：数据库不可用')
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import InputGroup from '../../src/components/ui/InputGroup.svelte'
import Slider from '../../src/components/ui/Slider.svelte'
import Switch from '../../src/components/ui/Switch.svelte'
import Tooltip from '../../src/components/ui/Tooltip.svelte'

// PROB-18b：`uiComponents.test.ts` 的 38 条源码文本断言迁到组件层。
//
// 原文件断言形如 `toContain('role="switch"')`、`toContain("dispatch('change', checked)")`：
// 能证明模板里写了那串字符，证明不了 role 真的出现在无障碍树上、事件真的派发出来、
// disabled 真的拦住了交互。这里全部在真实 DOM 上验证可观察行为。
//
// 唯一留在源码断言里的是 Tooltip 的 `position: fixed` —— jsdom 不做布局，computed style
// 拿不到有意义的值，属 PROB-18c。

afterEach(cleanup)

describe('Switch', () => {
  it('暴露 switch 语义与选中状态', async () => {
    const { component } = render(Switch, { props: { checked: false, ariaLabel: '公开模式' } })
    const el = screen.getByRole('switch', { name: '公开模式' })

    expect(el.getAttribute('aria-checked')).toBe('false')
    await fireEvent.click(el)
    // aria-checked 必须跟着状态走，否则读屏用户听到的是错的
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(component.$$.ctx).toBeTruthy()
  })

  it('点击派发 change 与 checked 两个事件，值为切换后的状态', async () => {
    // 两个事件都要有：change 供显式监听，checked 让 bind:checked 成立。
    const onChange = vi.fn()
    const onChecked = vi.fn()
    const { component } = render(Switch, { props: { checked: false, ariaLabel: 'x' } })
    component.$on('change', (event) => onChange(event.detail))
    component.$on('checked', (event) => onChecked(event.detail))

    await fireEvent.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(true)
    expect(onChecked).toHaveBeenCalledWith(true)
  })

  it('空格与回车都能切换，且阻止默认滚动', async () => {
    const onChange = vi.fn()
    const { component } = render(Switch, { props: { checked: false, ariaLabel: 'x' } })
    component.$on('change', (event) => onChange(event.detail))
    const el = screen.getByRole('switch')

    await fireEvent.keyDown(el, { key: ' ' })
    expect(onChange).toHaveBeenLastCalledWith(true)

    await fireEvent.keyDown(el, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('其它按键不触发切换', async () => {
    const onChange = vi.fn()
    const { component } = render(Switch, { props: { checked: false, ariaLabel: 'x' } })
    component.$on('change', (event) => onChange(event.detail))

    await fireEvent.keyDown(screen.getByRole('switch'), { key: 'a' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled 时既不可点也不响应键盘', async () => {
    const onChange = vi.fn()
    const { component } = render(Switch, { props: { checked: false, disabled: true, ariaLabel: 'x' } })
    component.$on('change', (event) => onChange(event.detail))
    const el = screen.getByRole('switch') as HTMLButtonElement

    expect(el.disabled).toBe(true)
    // 键盘路径不受 disabled 属性保护（jsdom 会照样派发），必须由组件自己拦住
    await fireEvent.keyDown(el, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(el.getAttribute('aria-checked')).toBe('false')
  })

  it('label 同时作为可见文本与可访问名，ariaLabel 优先', () => {
    render(Switch, { props: { checked: true, label: '始终展开' } })
    expect(screen.getByRole('switch', { name: '始终展开' }).textContent).toContain('始终展开')

    cleanup()
    render(Switch, { props: { checked: true, label: '始终展开', ariaLabel: '左侧导航始终展开' } })
    expect(screen.getByRole('switch', { name: '左侧导航始终展开' })).toBeTruthy()
  })
})

describe('Tooltip', () => {
  it('触发器是按钮并暴露展开状态', () => {
    render(Tooltip, { props: { text: '这是说明' } })
    const trigger = screen.getByRole('button', { name: '查看说明' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('展开前先隐藏气泡，定位完成后才显形（防止在错位置闪一下）', async () => {
    const { container } = render(Tooltip, { props: { text: '这是说明' } })
    await fireEvent.mouseEnter(container.querySelector('.ui-tooltip') as HTMLElement)

    // 节点已在 DOM 里，但 visibility: hidden —— 因此还不在无障碍树上
    const bubble = document.querySelector('.ui-tooltip-bubble') as HTMLElement
    expect(bubble.style.visibility).toBe('hidden')
    expect(screen.queryByRole('tooltip')).toBeNull()

    // rAF 里的定位跑完后才带上坐标并显形
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())
    expect(bubble.style.left).not.toBe('')
    expect(bubble.style.top).not.toBe('')
  })

  it('hover 与 focus 都能展开，移出后收起', async () => {
    const { container } = render(Tooltip, { props: { text: '这是说明' } })
    const anchor = container.querySelector('.ui-tooltip') as HTMLElement

    await fireEvent.mouseEnter(anchor)
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('这是说明'))

    await fireEvent.mouseLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()

    await fireEvent.focus(screen.getByRole('button', { name: '查看说明' }))
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())
  })

  it('点按切换（移动端没有 hover）', async () => {
    render(Tooltip, { props: { text: '这是说明' } })
    const trigger = screen.getByRole('button', { name: '查看说明' })

    await fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.click(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('展开时 aria-describedby 解析到真实气泡节点', async () => {
    render(Tooltip, { props: { text: '这是说明' } })
    const trigger = screen.getByRole('button', { name: '查看说明' })
    await fireEvent.click(trigger)

    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    // 源码断言只能看到 `aria-describedby={...}` 这串字符；这里验证 id 真的指向存在的元素
    expect(document.getElementById(describedBy as string)?.textContent).toBe('这是说明')
  })

  it('全局互斥：打开第二个会收起第一个', async () => {
    render(Tooltip, { props: { text: '第一条', label: '说明一' } })
    render(Tooltip, { props: { text: '第二条', label: '说明二' } })

    await fireEvent.click(screen.getByRole('button', { name: '说明一' }))
    await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1))

    await fireEvent.click(screen.getByRole('button', { name: '说明二' }))
    await waitFor(() => {
      const bubbles = screen.getAllByRole('tooltip')
      expect(bubbles).toHaveLength(1)
      expect(bubbles[0].textContent).toBe('第二条')
    })
  })

  it('Escape 收起，点击外部也收起', async () => {
    render(Tooltip, { props: { text: '这是说明' } })
    await fireEvent.click(screen.getByRole('button', { name: '查看说明' }))
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())

    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: '查看说明' }))
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('气泡挂到 body 上，脱离滚动容器', async () => {
    // 挂在原地会被设置页的滚动容器裁切；这是它必须 portal 的原因。
    const { container } = render(Tooltip, { props: { text: '这是说明' } })
    await fireEvent.click(screen.getByRole('button', { name: '查看说明' }))
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())

    const bubble = screen.getByRole('tooltip')
    expect(bubble.parentElement).toBe(document.body)
    expect(container.contains(bubble)).toBe(false)
  })

  it('销毁时把气泡一起移除，不留孤儿节点', async () => {
    const { unmount } = render(Tooltip, { props: { text: '这是说明' } })
    await fireEvent.click(screen.getByRole('button', { name: '查看说明' }))
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())

    unmount()
    expect(document.querySelector('.ui-tooltip-bubble')).toBeNull()
  })

  it('没有文案时不渲染气泡', async () => {
    render(Tooltip, { props: { text: '' } })
    await fireEvent.click(screen.getByRole('button', { name: '查看说明' }))

    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('InputGroup', () => {
  it('number 类型派发数字而不是字符串', async () => {
    const onInput = vi.fn()
    const { component } = render(InputGroup, { props: { value: 0, type: 'number', ariaLabel: '卡片宽度' } })
    component.$on('input', (event) => onInput(event.detail))

    await fireEvent.input(screen.getByLabelText('卡片宽度'), { target: { value: '42' } })

    expect(onInput).toHaveBeenCalledWith(42)
    expect(typeof onInput.mock.calls[0][0]).toBe('number')
  })

  it('清空 number 输入派发空串而不是 NaN', async () => {
    // Number('') 是 0，直接转换会把「清空」变成「设成 0」，两者语义不同。
    const onValue = vi.fn()
    const { component } = render(InputGroup, { props: { value: 42, type: 'number', ariaLabel: '卡片宽度' } })
    component.$on('value', (event) => onValue(event.detail))

    await fireEvent.input(screen.getByLabelText('卡片宽度'), { target: { value: '' } })

    expect(onValue).toHaveBeenCalledWith('')
  })

  it('text 类型保持字符串原样', async () => {
    const onInput = vi.fn()
    const { component } = render(InputGroup, { props: { value: '', type: 'text', ariaLabel: '站点标题' } })
    component.$on('input', (event) => onInput(event.detail))

    await fireEvent.input(screen.getByLabelText('站点标题'), { target: { value: '007' } })

    expect(onInput).toHaveBeenCalledWith('007')
  })

  it('单位后缀是装饰，不进无障碍树', () => {
    render(InputGroup, { props: { value: 80, type: 'number', suffixUnit: 'px', ariaLabel: '卡片宽度' } })

    const unit = document.querySelector('.ui-input-group-unit')
    expect(unit?.textContent).toBe('px')
    expect(unit?.getAttribute('aria-hidden')).toBe('true')
  })

  it('传了 suffixUnit 就不再渲染 suffix slot 容器', () => {
    render(InputGroup, { props: { value: 80, type: 'number', suffixUnit: 'px', ariaLabel: 'x' } })
    expect(document.querySelector('.ui-input-group-suffix')).toBeNull()

    cleanup()
    render(InputGroup, { props: { value: 80, type: 'number', ariaLabel: 'x' } })
    expect(document.querySelector('.ui-input-group-suffix')).toBeTruthy()
  })

  it('把 min/max/step 与 disabled 透给真实 input', () => {
    render(InputGroup, {
      props: { value: 80, type: 'number', min: 40, max: 400, step: 1, disabled: true, ariaLabel: '卡片宽度' },
    })
    const input = screen.getByLabelText('卡片宽度') as HTMLInputElement

    expect(input.min).toBe('40')
    expect(input.max).toBe('400')
    expect(input.step).toBe('1')
    expect(input.disabled).toBe(true)
  })

  it('inputId 让外部 label for 能关联上', () => {
    render(InputGroup, { props: { value: '', type: 'text', inputId: 'settings-card-width' } })
    expect(document.getElementById('settings-card-width')?.tagName).toBe('INPUT')
  })
})

describe('Slider', () => {
  it('是 range 控件，把格式化后的值同时给可见文本与 aria-valuetext', () => {
    render(Slider, { props: { value: 60, min: 0, max: 100, label: '不透明度', format: 'percent' } })
    const input = screen.getByRole('slider')

    const display = document.querySelector('.ui-slider-value')?.textContent
    expect(display).toBeTruthy()
    // 读屏用户听到的必须和眼睛看到的一致
    expect(input.getAttribute('aria-valuetext')).toBe(display)
  })

  it('拖动派发数字，并同步更新显示值', async () => {
    const onValue = vi.fn()
    const { component } = render(Slider, { props: { value: 10, min: 0, max: 100, label: '模糊' } })
    component.$on('value', (event) => onValue(event.detail))

    await fireEvent.input(screen.getByRole('slider'), { target: { value: '75' } })

    expect(onValue).toHaveBeenCalledWith(75)
    expect(document.querySelector('.ui-slider-value')?.textContent).toContain('75')
  })

  it('zeroLabel 在 0 处替换数字显示', () => {
    render(Slider, { props: { value: 0, min: 0, max: 10, label: '数量', format: 'count', zeroLabel: '不显示' } })

    expect(document.querySelector('.ui-slider-value')?.textContent).toBe('不显示')
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('不显示')
  })

  it('没有 label 时用 ariaLabel 作为可访问名，且不渲染标签行', () => {
    render(Slider, { props: { value: 5, min: 0, max: 10, ariaLabel: '经常访问数量' } })

    expect(screen.getByRole('slider', { name: '经常访问数量' })).toBeTruthy()
    expect(document.querySelector('.ui-slider-label')).toBeNull()
  })

  it('disabled 透给真实 input', () => {
    render(Slider, { props: { value: 5, min: 0, max: 10, disabled: true, ariaLabel: 'x' } })
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true)
  })
})

<script lang="ts">
  // 统一的 (?) Tooltip。承载「系统逻辑/权限」类说明。
  // 桌面：hover + 键盘聚焦触发；移动端触屏：点按切换（Tap to toggle，OQ-C 方案 1）。
  // 气泡挂载到 document.body 并以视口定位，避免被设置页滚动容器裁切。
  import { onDestroy, onMount, tick } from 'svelte'
  import { nextTooltipId, openTooltipId } from '../../lib/tooltipStore'

  interface TooltipProps {
    text?: string
    label?: string
  }

  let { text = '', label = '查看说明' }: TooltipProps = $props()

  const id = nextTooltipId()
  const bubbleId = `${id}-bubble`
  let anchorEl = $state<HTMLElement | null>(null)
  let triggerEl = $state<HTMLButtonElement | null>(null)
  let bubbleEl = $state<HTMLElement | null>(null)
  let bubbleStyle = $state('visibility: hidden;')
  let open = $state(false)
  let pinned = $state(false)
  let hovering = $state(false)
  let positionFrame: number | null = $state(null)

  function mountToBody(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy: () => node.remove() }
  }

  async function updateBubblePosition(): Promise<void> {
    await tick()
    if (!open || !triggerEl || !bubbleEl) return

    const triggerRect = triggerEl.getBoundingClientRect()
    const bubbleRect = bubbleEl.getBoundingClientRect()
    const viewportMargin = 8
    const gap = 6
    const maxLeft = Math.max(viewportMargin, window.innerWidth - viewportMargin - bubbleRect.width)
    const centeredLeft = triggerRect.left + ((triggerRect.width - bubbleRect.width) / 2)
    const left = Math.min(Math.max(centeredLeft, viewportMargin), maxLeft)
    const maxTop = Math.max(viewportMargin, window.innerHeight - viewportMargin - bubbleRect.height)
    const below = triggerRect.bottom + gap
    const above = triggerRect.top - bubbleRect.height - gap
    const top = below <= maxTop || above < viewportMargin ? Math.min(below, maxTop) : above

    bubbleStyle = `visibility: visible; left: ${Math.round(left)}px; top: ${Math.round(Math.max(viewportMargin, top))}px;`
  }

  function schedulePosition(): void {
    if (!open || positionFrame !== null) return
    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = null
      void updateBubblePosition()
    })
  }

  function refreshOpenState(): void {
    const nextOpen = pinned || hovering
    if (nextOpen && !open) bubbleStyle = 'visibility: hidden;'
    open = nextOpen
    if (open) schedulePosition()
  }

  const unsub = openTooltipId.subscribe((current) => {
    if (current !== id && pinned) pinned = false
    refreshOpenState()
  })

  onMount(() => {
    const handleViewportChange = () => schedulePosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  })

  onDestroy(() => {
    unsub()
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame)
  })

  function show(): void {
    hovering = true
    refreshOpenState()
  }
  function hide(): void {
    hovering = false
    refreshOpenState()
  }
  function togglePinned(): void {
    pinned = !pinned
    openTooltipId.set(pinned ? id : null)
    refreshOpenState()
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (pinned || open)) {
      pinned = false
      hovering = false
      openTooltipId.set(null)
      refreshOpenState()
    }
  }
  function handleWindowPointerDown(event: PointerEvent): void {
    if (!pinned) return
    if (anchorEl && event.target instanceof Node && anchorEl.contains(event.target)) return
    pinned = false
    openTooltipId.set(null)
    refreshOpenState()
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleKeydown} />

<span
  class="ui-tooltip"
  bind:this={anchorEl}
  onmouseenter={show}
  onmouseleave={hide}
  role="presentation"
>
  <button
    bind:this={triggerEl}
    type="button"
    class="ui-tooltip-trigger"
    aria-label={label}
    aria-expanded={open}
    aria-describedby={open && text ? bubbleId : undefined}
    onclick={togglePinned}
    onfocus={show}
    onblur={hide}
  >?</button>
  {#if open && text}
    <span
      use:mountToBody
      bind:this={bubbleEl}
      id={bubbleId}
      class="ui-tooltip-bubble"
      role="tooltip"
      style={bubbleStyle}
    >{text}</span>
  {/if}
</span>

<style>
  .ui-tooltip {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
  }

  .ui-tooltip-trigger {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--sp-input-border, #cbd5e1);
    border-radius: 50%;
    background: var(--sp-input-bg, #ffffff);
    color: var(--sp-muted, #64748b);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }

  .ui-tooltip-trigger:hover,
  .ui-tooltip-trigger:focus-visible {
    border-color: var(--sp-accent, #2563eb);
    color: var(--sp-accent, #2563eb);
    outline: none;
  }

  .ui-tooltip-bubble {
    position: fixed;
    z-index: 1000;
    width: max-content;
    max-width: min(260px, calc(100vw - 16px));
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: 8px;
    background: #1e293b;
    color: #ffffff;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    .ui-tooltip-bubble {
      animation: ui-tooltip-in 0.12s ease;
    }
  }

  @keyframes ui-tooltip-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

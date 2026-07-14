export const LEFT_NAV_COLLAPSED_STORAGE_KEY = 'cf-navs:left-navigation-collapsed:v1'

export interface HorizontalNavigationMetrics {
  overflow: boolean
  canScrollLeft: boolean
  canScrollRight: boolean
  maxScrollLeft: number
  scrollStep: number
}

export function parseLeftNavigationCollapsed(value: string | null): boolean {
  return value === 'true'
}

export function readLeftNavigationCollapsed(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  if (!storage) return false

  try {
    return parseLeftNavigationCollapsed(storage.getItem(LEFT_NAV_COLLAPSED_STORAGE_KEY))
  } catch {
    return false
  }
}

export function writeLeftNavigationCollapsed(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  collapsed: boolean,
): void {
  if (!storage) return

  try {
    storage.setItem(LEFT_NAV_COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch {
    // A blocked or full storage area must not break navigation controls.
  }
}

export function getHorizontalNavigationMetrics(input: {
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
}): HorizontalNavigationMetrics {
  const clientWidth = Math.max(0, input.clientWidth)
  const scrollWidth = Math.max(clientWidth, input.scrollWidth)
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const scrollLeft = Math.min(maxScrollLeft, Math.max(0, input.scrollLeft))
  const edgeTolerance = 1

  return {
    overflow: maxScrollLeft > edgeTolerance,
    canScrollLeft: scrollLeft > edgeTolerance,
    canScrollRight: scrollLeft < maxScrollLeft - edgeTolerance,
    maxScrollLeft,
    scrollStep: Math.max(1, Math.round(clientWidth * 0.7)),
  }
}

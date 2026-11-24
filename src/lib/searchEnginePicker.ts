/** Navigation moves focus only; the option's native click commits the selection. */
export function getSearchEngineNavigationIndex(key: string, currentIndex: number, count: number): number | null {
  if (count === 0) return null

  switch (key) {
    case 'Home': return 0
    case 'End': return count - 1
    case 'ArrowDown': return currentIndex < 0 ? 0 : (currentIndex + 1) % count
    case 'ArrowUp': return currentIndex < 0 ? count - 1 : (currentIndex - 1 + count) % count
    default: return null
  }
}

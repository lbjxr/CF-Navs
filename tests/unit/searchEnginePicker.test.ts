import { describe, expect, it } from 'vitest'
import { getSearchEngineNavigationIndex } from '../../src/lib/searchEnginePicker'

describe('search engine focus navigation', () => {
  it.each([
    ['ArrowDown', 0, 3, 1],
    ['ArrowDown', 2, 3, 0],
    ['ArrowUp', 1, 3, 0],
    ['ArrowUp', 0, 3, 2],
    ['Home', 2, 3, 0],
    ['End', 0, 3, 2],
    ['ArrowDown', -1, 3, 0],
    ['ArrowUp', -1, 3, 2],
    ['ArrowDown', 0, 1, 0],
    ['ArrowUp', 0, 1, 0],
    ['ArrowDown', 0, 0, null],
    ['Home', 0, 0, null],
    ['Enter', 1, 3, null],
    [' ', 1, 3, null],
    ['Escape', 1, 3, null],
    ['Tab', 1, 3, null],
  ] as const)('%s from %s in %s options gives %s', (key, current, count, expected) => {
    expect(getSearchEngineNavigationIndex(key, current, count)).toBe(expected)
  })
})

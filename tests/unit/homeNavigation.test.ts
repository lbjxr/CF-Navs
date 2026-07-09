import { describe, expect, it } from 'vitest'
import type { HomeSection } from '../../src/lib/homeData'
import {
  getHomeScrollTarget,
  getHomeSectionsKey,
  getNearestIntersectingSectionId,
  isHomeScrollAligned,
  resolveHomeActiveSectionId,
} from '../../src/lib/homeData'

const sections: HomeSection[] = [
  { id: 'category-1', title: 'Tools', count: 3 },
  { id: 'category-2', title: 'Docs', count: 2 },
]

describe('home navigation helpers', () => {
  it('builds a stable section key', () => {
    expect(getHomeSectionsKey(sections)).toBe('category-1|category-2')
    expect(getHomeSectionsKey([])).toBe('')
  })

  it('keeps the active section only while it remains visible', () => {
    expect(resolveHomeActiveSectionId(sections, 'category-2')).toBe('category-2')
    expect(resolveHomeActiveSectionId(sections, 'missing')).toBe('category-1')
    expect(resolveHomeActiveSectionId([], 'category-1')).toBe('')
  })

  it('selects the nearest intersecting section', () => {
    expect(getNearestIntersectingSectionId(new Map([
      ['category-1', 80],
      ['category-2', 24],
    ]))).toBe('category-2')

    expect(getNearestIntersectingSectionId(new Map())).toBe('')
  })

  it('clamps smooth-scroll targets to document bounds', () => {
    expect(getHomeScrollTarget({
      currentScroll: 200,
      targetTop: 300,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(420)

    expect(getHomeScrollTarget({
      currentScroll: 1100,
      targetTop: 500,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(1200)

    expect(getHomeScrollTarget({
      currentScroll: 20,
      targetTop: 30,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(0)

    expect(getHomeScrollTarget({
      currentScroll: 500,
      targetTop: 320,
      windowHeight: 700,
      documentHeight: 2200,
      desiredTopDistance: 96,
    })).toBe(724)
  })

  it('detects when a navigated section needs scroll correction', () => {
    expect(isHomeScrollAligned({ targetTop: 80 })).toBe(true)
    expect(isHomeScrollAligned({ targetTop: 83.5 })).toBe(true)
    expect(isHomeScrollAligned({ targetTop: 86 })).toBe(false)
    expect(isHomeScrollAligned({
      targetTop: 64,
      desiredTopDistance: 60,
      tolerance: 5,
    })).toBe(true)
  })
})

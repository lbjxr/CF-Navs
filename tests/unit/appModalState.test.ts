import { describe, expect, it } from 'vitest'
import { createCategoryDraft } from '../../src/lib/appModalState'

describe('category creation drafts', () => {
  it('defaults to a root category', () => {
    expect(createCategoryDraft()).toMatchObject({ parent_id: null, title: '', icon: '' })
  })

  it('prefills the selected root as the new child parent', () => {
    expect(createCategoryDraft(42)).toMatchObject({ parent_id: 42, title: '', icon: '' })
  })
})

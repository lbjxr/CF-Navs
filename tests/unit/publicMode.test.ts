import { describe, expect, it } from 'vitest'
import { ErrCode } from '../../shared/types'
import { ApiError } from '../../src/lib/api'
import { isPublicModeForbidden, siteConfigFromForbiddenError } from '../../src/lib/publicMode'

describe('publicMode helpers', () => {
  it('identifies API forbidden errors as public-mode forbidden responses', () => {
    expect(isPublicModeForbidden(new ApiError('forbidden', { code: ErrCode.FORBIDDEN }))).toBe(true)
    expect(isPublicModeForbidden(new ApiError('unauthorized', { code: ErrCode.UNAUTHORIZED }))).toBe(false)
    expect(isPublicModeForbidden(new Error('forbidden'))).toBe(false)
  })

  it('extracts site config only from forbidden API errors carrying private-mode config', () => {
    expect(siteConfigFromForbiddenError(new ApiError('forbidden', {
      code: ErrCode.FORBIDDEN,
      data: { site_title: 'Private Navs', public_mode: false },
    }))).toEqual({ site_title: 'Private Navs', public_mode: false })

    expect(siteConfigFromForbiddenError(new ApiError('forbidden', {
      code: ErrCode.FORBIDDEN,
      data: { site_title: 'Public Navs', public_mode: true },
    }))).toBeNull()

    expect(siteConfigFromForbiddenError(new ApiError('forbidden', {
      code: ErrCode.FORBIDDEN,
      data: { public_mode: false },
    }))).toBeNull()
  })

  it('returns null for non-API errors or malformed error data', () => {
    expect(siteConfigFromForbiddenError(new Error('plain'))).toBeNull()
    expect(siteConfigFromForbiddenError(new ApiError('forbidden', { code: ErrCode.FORBIDDEN, data: null }))).toBeNull()
    expect(siteConfigFromForbiddenError(new ApiError('forbidden', { code: ErrCode.FORBIDDEN, data: [] }))).toBeNull()
  })
})

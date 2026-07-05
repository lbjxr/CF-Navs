import { describe, expect, it } from 'vitest'
import {
  dataUriToResponse,
  iconBytesToDataUri,
  isIconifyIconUrl,
  shouldPersistIconBlob,
} from '../../worker/lib/iconData'

describe('worker icon data helpers', () => {
  it('round-trips fetched icon bytes through a data URI response', async () => {
    const dataUri = iconBytesToDataUri({
      bytes: new Uint8Array([137, 80, 78, 71]),
      contentType: 'image/png',
    })

    expect(dataUri).toBe('data:image/png;base64,iVBORw==')

    const response = dataUriToResponse(dataUri, 'public, max-age=60')
    expect(response).not.toBeNull()
    expect(response?.headers.get('Content-Type')).toBe('image/png')
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('recognizes Iconify URLs and avoids persisting Iconify blobs', () => {
    expect(isIconifyIconUrl('https://api.iconify.design/logos/github-icon.svg')).toBe(true)
    expect(isIconifyIconUrl('https://icon-sets.iconify.design/logos/github-icon/')).toBe(true)
    expect(isIconifyIconUrl('https://example.com/logos/github-icon.svg')).toBe(false)

    expect(shouldPersistIconBlob('https://example.com/favicon.ico', null)).toBe(true)
    expect(shouldPersistIconBlob('https://api.iconify.design/logos/github-icon.svg', null)).toBe(false)
    expect(shouldPersistIconBlob('https://example.com/icon.svg', 'iconify')).toBe(false)
    expect(shouldPersistIconBlob('data:image/png;base64,abc', null)).toBe(false)
  })
})

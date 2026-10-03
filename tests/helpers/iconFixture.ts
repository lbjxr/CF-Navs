import { iconBytesToDataUri } from '../../worker/lib/iconData'

export function iconFixture(color = 'red') {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="' + color + '"/></svg>')
  return { bytes, contentType: 'image/svg+xml', dataUri: iconBytesToDataUri({ bytes, contentType: 'image/svg+xml' }) }
}

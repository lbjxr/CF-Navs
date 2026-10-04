import { isIconRevision, type IconDescriptor } from '../../shared/iconLocalCopy'
import { iconDevice, type IconDeviceSnapshot } from './iconDeviceState'
import { objectIconLoader, type ObjectIconHandle } from './objectIconLoader'
import { createIconRetry } from './iconRetry'

export interface IconViewInput { id: number; icon?: string | null; icon_blob?: string | null; icon_revision?: string | null; icon_write_epoch?: number; icon_display?: 'image' | 'text' | 'empty'; visible: boolean; preview?: boolean }
export interface TrustedIconState { active: boolean; url: string; pending: boolean }
export const emptyTrustedIcon: TrustedIconState = { active: false, url: '', pending: false }
export function bookmarkDescriptor(input: IconViewInput, dataset: string): IconDescriptor {
  if (input.icon_display === 'empty') return { object_type: 'bookmark', object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0, state: 'empty', content_revision: null }
  if (input.icon_display === 'text') return { object_type: 'bookmark', object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0, state: 'text', content_revision: null }
  const image = input.icon_display === 'image' || Boolean(input.icon_blob || /^data:image\//i.test(input.icon ?? '') || /^https?:/i.test(input.icon ?? ''))
  return { object_type: 'bookmark', object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0,
    state: image ? isIconRevision(input.icon_revision) ? 'ready' : 'unknown' : input.icon ? 'text' : 'empty', content_revision: image && isIconRevision(input.icon_revision) ? input.icon_revision! : null }
}
/** Per-view lifetime only. Permission, persistence and networking remain outside the component. */
export function createTrustedIconView(onChange: (value: TrustedIconState) => void) {
  let input: IconViewInput | null = null
  let deviceState = iconDevice.snapshot()
  let handle: ObjectIconHandle | null = null
  let signature = ''
  let sequence = 0
  let disposed = false
  const retry = createIconRetry(() => update(true))
  function reset() { sequence++; handle?.release(); handle = null }
  function update(force = false) {
    if (disposed || !input) return
    const active = deviceState.trusted && !input.preview && Number.isSafeInteger(input.id) && input.id > 0 && !['unsupported', 'unavailable'].includes(deviceState.phase)
    const descriptor = deviceState.dataset ? bookmarkDescriptor(input, deviceState.dataset) : null
    const next = JSON.stringify([active, input.id, input.icon, input.icon_blob, input.icon_revision, input.icon_write_epoch, input.icon_display, input.visible, deviceState.epoch, deviceState.phase, deviceState.dataset])
    if (!force && next === signature) return
    signature = next; reset()
    if (!force) retry.reset()
    if (!active) { onChange(emptyTrustedIcon); return }
    if (descriptor?.state === 'text') {
      onChange(emptyTrustedIcon)
      if (deviceState.phase === 'ready' && input.visible && descriptor) {
        const cleanup = objectIconLoader.acquire(descriptor)
        void cleanup.result.then(cleanup.release, cleanup.release)
      }
      return
    }
    if (descriptor?.state === 'empty') onChange({ active: true, url: '', pending: false })
    else onChange({ active: true, url: '', pending: Boolean(input.visible) })
    if (deviceState.phase !== 'ready' || !input.visible || !descriptor) return
    const own = sequence
    handle = objectIconLoader.acquire(descriptor, input.icon_blob || (/^data:image\//i.test(input.icon ?? '') ? input.icon! : undefined), force)
    handle.result.then(result => {
      if (own !== sequence || disposed) return
      if (result.status === 'unavailable') { onChange(emptyTrustedIcon); return }
      onChange({ active: true, url: result.url ?? '', pending: false })
      if (result.status === 'retryable') retry.failed(); else if (result.status === 'ready') retry.reset()
    }).catch(() => { if (own === sequence && !disposed) { onChange({ active: true, url: '', pending: false }); retry.failed() } })
  }
  const stop = iconDevice.subscribe((next: IconDeviceSnapshot) => { deviceState = next; update() })
  return { set: (value: IconViewInput) => { input = { ...value }; update() }, failed: () => retry.failed(),
    destroy: () => { disposed = true; reset(); retry.dispose(); stop() } }
}

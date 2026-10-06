import { isIconRevision, type IconDescriptor } from '../../shared/iconLocalCopy'
import { iconDevice, type IconDeviceSnapshot } from './iconDeviceState'
import { objectIconLoader, type ObjectIconHandle } from './objectIconLoader'
import { createIconRetry } from './iconRetry'

export interface IconViewInput { online_url?: string; icon_cached?: boolean | number | null; id: number; object_type?: IconDescriptor['object_type']; icon?: string | null; icon_blob?: string | null; icon_revision?: string | null; icon_write_epoch?: number; icon_display?: 'image' | 'text' | 'empty'; visible: boolean; preview?: boolean }
export interface TrustedIconState { active: boolean; url: string; pending: boolean }
export const emptyTrustedIcon: TrustedIconState = { active: false, url: '', pending: false }
export function bookmarkDescriptor(input: IconViewInput, dataset: string): IconDescriptor {
  const object_type = input.object_type ?? 'bookmark'
  if (input.icon_display === 'empty') return { object_type, object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0, state: 'empty', content_revision: null }
  if (input.icon_display === 'text') return { object_type, object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0, state: 'text', content_revision: null }
  const image = input.icon_display === 'image' || Boolean(input.icon_cached || input.icon_blob || /^data:image\//i.test(input.icon ?? '') || /^https?:/i.test(input.icon ?? '') || object_type === 'category' && /^[a-z0-9-]+:[a-z0-9-]+$/i.test(input.icon ?? ''))
  return { object_type, object_id: input.id, dataset_epoch: dataset, write_epoch: input.icon_write_epoch ?? 0,
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
  let presentation = emptyTrustedIcon
  let displayedDescriptor: IconDescriptor | null = null
  let displayedEpoch = -1
  function publish(value: TrustedIconState) { presentation = value; onChange(value) }
  const retry = createIconRetry(() => update(true))
  function reset() { sequence++; handle?.release(); handle = null; displayedDescriptor = null }
  function update(force = false) {
    if (disposed || !input) return
    const active = deviceState.enabledForPage && deviceState.trusted && !input.preview && Number.isSafeInteger(input.id) && input.id > 0 && !['unsupported', 'unavailable'].includes(deviceState.phase)
    const descriptor = deviceState.dataset ? bookmarkDescriptor(input, deviceState.dataset) : null
    const next = JSON.stringify([active, input.object_type, input.id, input.icon, input.icon_blob, input.icon_revision, input.icon_write_epoch, input.icon_cached, input.icon_display, input.visible, input.online_url, deviceState.epoch, deviceState.phase, deviceState.dataset])
    if (!force && next === signature) return
    // Snapshot hydration and refreshed online grants can change raw fields while
    // the same verified image is still owned by this view. They are not a new
    // image identity. write_epoch fences writes, not content-addressed reads; a
    // refresh may advance it without changing bytes. Permission/dataset
    // transitions must still release the image.
    if (!force && active && input.visible && handle && presentation.url && presentation.active &&
      deviceState.phase === 'ready' && deviceState.epoch === displayedEpoch && descriptor?.state === 'ready' && displayedDescriptor &&
      (['object_type', 'object_id', 'dataset_epoch', 'state', 'content_revision'] as const).every(key => descriptor[key] === displayedDescriptor![key])) {
      signature = next
      return
    }
    signature = next; reset()
    if (!force) retry.reset()
    if (!active) { publish(emptyTrustedIcon); return }
    if (descriptor?.state === 'text') {
      publish(emptyTrustedIcon)
      if (deviceState.phase === 'ready' && input.visible && descriptor) {
        const cleanup = objectIconLoader.acquire(descriptor)
        void cleanup.result.then(cleanup.release, cleanup.release)
      }
      return
    }
    if (!force && (deviceState.phase === 'checking' || deviceState.phase === 'disabled') && descriptor?.state !== 'empty') {
      // Give normal startup its existing bounded retry interval to restore the
      // local lease. Do not race every warm disk hit with an online request.
      publish({ active: true, url: '', pending: Boolean(input.visible) })
      if (input.visible) retry.failed()
      return
    }
    if (deviceState.phase !== 'ready' && descriptor?.state !== 'empty') {
      // A local-copy lease gates disk reuse, not a fresh online request. Never
      // expose an old inline/local body while checking or after lease expiry.
      const route = `/api/${input.object_type === 'category' ? 'category-icon' : 'icon'}/${input.id}`
      const url = input.online_url
      const onlineUrl = url === route || url?.startsWith(route + '?')
        ? url : `${route}?v=${encodeURIComponent(input.icon_revision ?? input.icon_write_epoch ?? 0)}`
      publish({ active: true, url: input.visible ? onlineUrl : '', pending: false })
      return
    }
    if (descriptor?.state === 'empty') publish({ active: true, url: '', pending: false })
    else if (!force || presentation.active) publish({ active: true, url: '', pending: Boolean(input.visible) })
    // A background retry must not hide an online fallback that is already in use.
    if (deviceState.phase !== 'ready' || !input.visible || !descriptor) return
    const own = sequence
    handle = objectIconLoader.acquire(descriptor, input.icon_blob || (/^data:image\//i.test(input.icon ?? '') ? input.icon! : undefined), force)
    handle.result.then(result => {
      if (own !== sequence || disposed) return
      if (result.status === 'unavailable' || result.status === 'retryable' && !result.url) {
        // Failure to obtain a persistable copy is not failure of the online icon.
        // Keep the existing online renderer as the single fallback implementation.
        publish(emptyTrustedIcon)
        if (result.status === 'retryable') retry.failed()
        return
      }
      if (result.status === 'ready' && result.url) { displayedDescriptor = result.descriptor; displayedEpoch = deviceState.epoch }
      publish({ active: true, url: result.url ?? '', pending: false })
      if (result.status === 'retryable') retry.failed(); else if (result.status === 'ready') retry.reset()
    }).catch(() => { if (own === sequence && !disposed) { publish(emptyTrustedIcon); retry.failed() } })
  }
  const stop = iconDevice.subscribe((next: IconDeviceSnapshot) => { deviceState = next; update() })
  return { set: (value: IconViewInput) => { input = { ...value }; update() }, failed: () => {
      reset()
      if (deviceState.phase === 'ready') { publish(emptyTrustedIcon); retry.failed() }
      else publish({ active: true, url: '', pending: false })
    },
    destroy: () => { disposed = true; reset(); retry.dispose(); stop() } }
}

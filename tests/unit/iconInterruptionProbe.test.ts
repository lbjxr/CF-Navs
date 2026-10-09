import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { Blob } from 'node:buffer'
import { pageInstallIconInterruption } from '../../scripts/lib/iconInterruptionProbe.mjs'

// This checks the probe's ownership/concurrency only. Native decoder and IDB
// behavior are verified by the real-browser interruption scenarios.
describe('native interruption probe does not create its own deadlock', () => {
  it('holds only one concurrent matching decoder and leaves connected pixel observers alone', async () => {
    const body = '<svg><!-- interruption-fixture-test --></svg>'
    class ImageModel {
      src = ''
      isConnected = false
      naturalWidth = 32
      naturalHeight = 32
      async decode() {}
    }
    class StoreModel { put() {} }
    let sequence = 0
    const urls = { createObjectURL: () => 'blob:test-' + ++sequence, revokeObjectURL() {} }
    const create = urls.createObjectURL, decode = ImageModel.prototype.decode, put = StoreModel.prototype.put
    const scope: any = { window: {}, URL: urls, HTMLImageElement: ImageModel, IDBObjectStore: StoreModel, Blob,
      document: { addEventListener() {}, removeEventListener() {}, querySelector: () => null },
      localStorage: { getItem: () => null }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
      config: { mode: 'decode', key: 'bookmark:12', body } }
    vm.runInNewContext(`(${pageInstallIconInterruption.toString()})(config)`, scope)
    const observer = new ImageModel(); observer.isConnected = true
    observer.src = scope.URL.createObjectURL(new Blob([body]))
    await observer.decode()
    expect(scope.window.__iconInterruption.state.holds).toBe(0)
    const first = new ImageModel(), second = new ImageModel()
    first.src = scope.URL.createObjectURL(new Blob([body])); second.src = first.src
    let completed = 0
    const promises = [first.decode(), second.decode()].map(promise => promise.then(() => { completed++ }))
    try {
      for (let i = 0; i < 20 && !completed; i++) await new Promise(resolve => setTimeout(resolve, 1))
      expect(scope.window.__iconInterruption.state.holds).toBe(1)
      expect(completed).toBe(1)
    } finally { scope.window.__iconInterruption.restore() }
    await Promise.all(promises)
    expect(completed).toBe(2)
    expect(scope.window.__iconInterruption.restore().restored).toBe(true)
    expect(urls.createObjectURL).toBe(create)
    expect(ImageModel.prototype.decode).toBe(decode)
    expect(StoreModel.prototype.put).toBe(put)
  })
})

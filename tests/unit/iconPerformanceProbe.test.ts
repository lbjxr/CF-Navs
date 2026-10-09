import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { Blob } from 'node:buffer'
import { assessIconStorageAudit, summarizeIconPerformanceRequests, pageInstallCapacityCommitProbe } from '../../scripts/lib/iconPerformanceProbe.mjs'

describe('native storage audit acceptance', () => {
  const valid = { available:true, enabled:true, entries:2, bodies:2, bodyBytes:512, indexBytes:4900,
    declaredEntries:2, declaredBodyBytes:512, declaredIndexBytes:4900, orphanBodies:0, invalidBodies:0, invalidEntries:0, duplicateSourceCount:0 }
  it('requires measured native data and consistent independent totals', () => {
    expect(assessIconStorageAudit(valid).passed).toBe(true)
    for(const patch of [{available:false},{enabled:false},{bodyBytes:NaN},{declaredEntries:3},{bodies:1},{declaredBodyBytes:0},{declaredIndexBytes:0},{orphanBodies:1},{invalidEntries:1},{invalidBodies:1},{duplicateSourceCount:1},{indexBytes:0,declaredIndexBytes:0}])expect(assessIconStorageAudit({...valid,...patch}).passed).toBe(false)
  })
  it('does not accept internally consistent over-budget values', () => {
    for(const patch of [{bodyBytes:10485761,declaredBodyBytes:10485761},{entries:1001,bodies:1001,declaredEntries:1001},{indexBytes:524289,declaredIndexBytes:524289}])expect(assessIconStorageAudit({...valid,...patch})).toMatchObject({passed:false,errors:['budget-exceeded']})
  })
  it('separates metadata/background traffic and does not turn unmeasured transfers into zero-byte successes', () => {
    const result=summarizeIconPerformanceRequests([
      {kind:'api',path:'/api/data/version',finishedTime:2,encodedDataLength:100},
      {kind:'icon-copy',path:'/api/icon-local-copy'},
      {kind:'icon-copy',path:'/api/icon-local-copy',error:'net::ERR_ABORTED'},
      {kind:'resource',path:'/app.js',finishedTime:2,encodedDataLength:0,disk:true},
      {kind:'external-image',path:'[external]',resourceRole:'site-background',finishedTime:2,encodedDataLength:500},
      {kind:'external-image',path:'[external]',terminalKind:'redirect',encodedDataLength:25},
    ])
    expect(result.version).toMatchObject({requests:1,knownEncodedBytes:100})
    expect(result['icon-copy']).toMatchObject({requests:2,pending:1,failed:1,completed:0,unknownTransferRequests:2})
    expect(result.resource).toMatchObject({cached:1,knownEncodedBytes:0,unknownTransferRequests:0})
    expect(result.background).toMatchObject({knownEncodedBytes:500})
    expect(result['external-image']).toMatchObject({redirects:1,completed:1,pending:0,knownEncodedBytes:25})
  })
  it('counts capacity materialization only after a native transaction completes with both body and index', () => {
    class Store {
      constructor(public name:string,public transaction:EventTarget & {db:{name:string}}) {}
      put(..._args:unknown[]) { return {} }
    }
    const original=Store.prototype.put,scope:any={window:{},IDBObjectStore:Store,Blob}
    vm.runInNewContext(`(${pageInstallCapacityCommitProbe.toString()})(['bookmark:12'])`,scope)
    const write=(event:string,withBody=true)=>{
      const tx=Object.assign(new EventTarget(),{db:{name:'cf-navs-object-icons-v1'}})
      if(withBody)new Store('bodies',tx).put(new Blob(['abc']),'bookmark:12')
      new Store('entries',tx).put({key:'bookmark:12',byte_length:3,descriptor:{content_revision:'sha256-test'}})
      tx.dispatchEvent(new Event(event))
    }
    write('abort');write('complete',false)
    expect(scope.window.__capacityCommitProbe.read()).toEqual([])
    write('complete')
    expect(scope.window.__capacityCommitProbe.read()).toEqual([{key:'bookmark:12',bytes:3,revision:'sha256-test'}])
    scope.window.__capacityCommitProbe.restore()
    expect(Store.prototype.put).toBe(original)
  })
})

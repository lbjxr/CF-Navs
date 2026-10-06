import { describe, expect, it } from 'vitest'
import { classifyIssueRequest, assessStableIcons, assessIconTrace, validatedIconConflicts, isCanceledNetworkResponse } from '../../scripts/lib/issueBrowserEvidence.mjs'
const origin = 'https://nav.example.test'
describe('per-operation browser network evidence', () => {
  it.each([
    ['/api/icon/12?key=secret', 'bookmark:12'],
    ['/api/category-icon/12?v=123&key=secret', 'category:12'],
  ])('counts ordinary body route %s and strips credentials', (url, object) => {
    const result = classifyIssueRequest(origin + url, undefined, origin)
    expect(result).toMatchObject({ kind: 'icon-body', object })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(result.path).not.toContain('?')
  })
  it.each(['bookmark', 'category'])('counts %s local copies', type => {
    expect(classifyIssueRequest(origin + '/api/icon-local-copy', JSON.stringify({ object_type: type, object_id: 12 }), origin)).toMatchObject({ kind: 'icon-copy', object: type + ':12' })
  })
  it('does not silently discard malformed copy descriptors', () => {
    const row = classifyIssueRequest(origin + '/api/icon-local-copy', 'invalid', origin)
    expect(assessStableIcons([row]).passed).toBe(false)
  })
  it('does not whitelist unrelated categories when editing a bookmark', () => {
    const rows = ['icon', 'category-icon'].map(route => classifyIssueRequest(origin + '/api/' + route + '/12', undefined, origin))
    expect(assessStableIcons(rows, ['bookmark:12'])).toMatchObject({ passed: false, unexpected: [{ object: 'category:12' }] })
  })
  it('separates metadata from body traffic', () => {
    const row = classifyIssueRequest(origin + '/api/data/version', undefined, origin)
    expect(row.kind).toBe('api')
    expect(assessStableIcons([row]).passed).toBe(true)
  })
  it('counts successful and canceled redundant requests, not only errors', () => {
    const row = classifyIssueRequest(origin + '/api/icon/1', undefined, origin)
    expect(assessStableIcons([{ ...row, status: 200 }, { ...row, canceled: true }]).unexpected).toHaveLength(2)
  })
  it('redacts external origins, paths and query strings', () => {
    expect(classifyIssueRequest('https://private.example.test/customer?token=secret', undefined, origin)).toEqual({ kind: 'external', path: '[external]', object: null })
  })
})

describe('operation image timeline gate', () => {
  it.each(['missing','text','unloaded','src-changed'])('rejects a transient %s even if the final image recovered', state => {
    expect(assessIconTrace({frames:120,changes:[{key:'category:1',state}]}).passed).toBe(false)
  })
  it('does not silently pass absent instrumentation', () => {
    expect(assessIconTrace(null).passed).toBe(false)
    expect(assessIconTrace({frames:0,changes:[]}).passed).toBe(false)
  })
  it('permits only the explicitly edited object', () => {
    expect(assessIconTrace({frames:120,changes:[{key:'bookmark:1',state:'src-changed'}]},['bookmark:1']).passed).toBe(true)
    expect(assessIconTrace({frames:120,changes:[{key:'category:1',state:'src-changed'}]},['bookmark:1']).passed).toBe(false)
  })
  it('includes iconify and external-image traffic', () => {
    expect(assessStableIcons([classifyIssueRequest(origin+'/api/iconify/test/name.svg',undefined,origin)]).passed).toBe(false)
    expect(assessStableIcons([{kind:'external-image',object:null,path:'[external]'}]).passed).toBe(false)
  })
})

describe('resource loads are not necessarily network traffic', () => {
  it.each(['data:image/svg+xml,svg','blob:https://nav.example.test/fixture'])('does not call a %s resource an external network request',url=>{
    const row=classifyIssueRequest(url,undefined,origin)
    expect(row.kind).toBe('local-image')
    expect(assessStableIcons([row]).passed).toBe(true)
  })
  it('exempts only a positively attributed preview of the selected object',()=>{
    const row={kind:'external-image',object:null,path:'[external]',surface:'editor-preview',previewFor:'bookmark:1'}
    expect(assessStableIcons([row],[],['bookmark:1']).passed).toBe(true)
    expect(assessStableIcons([row],[],['bookmark:2']).passed).toBe(false)
    expect(assessStableIcons([{...row,surface:undefined}],[],['bookmark:1']).passed).toBe(false)
  })
})

describe('descriptor conflicts require a verified successful retry',()=>{
  const descriptor={object_type:'category',object_id:2,dataset_epoch:'c'.repeat(32),write_epoch:3,content_revision:'sha256-'+'a'.repeat(64),state:'ready'}
  const conflict={requestId:'old',status:409,time:1,object:'category:2',copyRequest:{dataset_epoch:descriptor.dataset_epoch},copyResult:{protocol:1,reason:'conflict',hasImage:false,descriptor}}
  const success={requestId:'new',status:200,time:2,object:'category:2',copyRequest:{dataset_epoch:descriptor.dataset_epoch,expected_write_epoch:3,expected_content_revision:descriptor.content_revision},copyResult:{protocol:1,persistence:'session-scoped',imageBytes:20,descriptor}}
  it('accepts only the exact conflict request id',()=>expect(validatedIconConflicts([conflict,success])).toEqual(['old']))
  it('rejects absent, unrelated or body-free retries',()=>{
    expect(validatedIconConflicts([conflict])).toEqual([])
    expect(validatedIconConflicts([conflict,{...success,object:'bookmark:2'}])).toEqual([])
    expect(validatedIconConflicts([conflict,{...success,copyResult:{...success.copyResult,imageBytes:0}}])).toEqual([])
  })
  it('rejects malformed conflicts, stale or differing descriptors',()=>{
    expect(validatedIconConflicts([{...conflict,copyResult:{...conflict.copyResult,reason:'other'}},success])).toEqual([])
    expect(validatedIconConflicts([conflict,{...success,time:0}])).toEqual([])
    expect(validatedIconConflicts([conflict,{...success,copyRequest:{...success.copyRequest,expected_write_epoch:2}}])).toEqual([])
  })
})

it('does not mistake a new editor image for reloading an existing image',()=>{
  const newPreview={kind:'external-image',object:null,path:'[external]',wasDisplayed:false}
  expect(assessStableIcons([newPreview],[],[],true).passed).toBe(true)
  expect(assessStableIcons([{...newPreview,wasDisplayed:true}],[],[],true).passed).toBe(false)
  expect(assessStableIcons([{...newPreview,kind:'icon-body',object:'category:1'}],[],[],true).passed).toBe(false)
})
it('rejects revocation of an existing offscreen handle, not just visible flashes',()=>{
  const trace={frames:10,changes:[],protectedRevocations:[{key:'category:1',id:4}]}
  expect(assessIconTrace(trace,['bookmark:1']).passed).toBe(false)
  expect(assessIconTrace(trace,['category:1']).passed).toBe(true)
})

it('excludes only positively identified site backgrounds from icon traffic',()=>{
  const background={kind:'external-image',path:'[external]',object:null,resourceRole:'site-background'}
  expect(assessStableIcons([background]).passed).toBe(true)
  expect(assessStableIcons([{...background,kind:'icon-body',object:'bookmark:1'}]).passed).toBe(false)
  expect(assessStableIcons([{...background,resourceRole:undefined}]).passed).toBe(false)
})

it('separates cancelled responses without waiving operation-level reload budgets',()=>{
  const canceled={requestId:'a',status:409,canceled:true,error:'net::ERR_ABORTED',kind:'icon-copy',object:'bookmark:1'}
  expect(isCanceledNetworkResponse(canceled)).toBe(true)
  expect(isCanceledNetworkResponse({...canceled,canceled:false})).toBe(false)
  expect(isCanceledNetworkResponse({...canceled,error:'net::ERR_FAILED'})).toBe(false)
  expect(assessStableIcons([canceled]).passed).toBe(false)
})

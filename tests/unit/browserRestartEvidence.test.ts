import { describe, expect, it } from 'vitest'
import { assessBrowserRestartEvidence } from '../../scripts/lib/browserRestartEvidence.mjs'

function fixture(mode = 'online') {
  const keys=['bookmark:1','category:2']
  const copies=keys.map(key=>{const [object_type,id]=key.split(':');return {key,record:{available:true,enabled:true,entryPresent:true,bodyPresent:true,bodyBytes:128,bodyRevision:'sha256-'+'a'.repeat(64),descriptor:{object_type,object_id:Number(id),dataset_epoch:'b'.repeat(32),write_epoch:1,content_revision:'sha256-'+'a'.repeat(64),state:'ready'}}}})
  const state={authenticated:true,trusted:true,enabledForPage:true,phase:'ready',hasLease:true,privateVisible:true,blobImages:true,imagesPassed:true,copies}
  return {mode,fixtureKeys:keys,restart:{previous:{pid:12,targetId:'old-target',profile:'/tmp/cf-navs-chrome-profile-fixture',remainingProcesses:3},closed:{startedByTest:true,targetClosed:true,browserClosed:true,remainingProcesses:0,profilePreserved:true,profileRemoved:false,errors:[],warnings:[]},current:{pid:13,targetId:'new-target',profile:'/tmp/cf-navs-chrome-profile-fixture'},sameProfile:true},before:structuredClone(state),after:{...structuredClone(state),markerPreserved:true,sameSession:true,newDocument:true,offlineDuringNavigation:mode==='offline'},requests:mode==='online'?[{path:'/api/data/version',status:200,authSession:1}]:[{path:'/api/data/version',kind:'api',error:'net::ERR_INTERNET_DISCONNECTED'}]}
}
describe('real browser restart evidence', () => {
  it.each(['online','offline'])('accepts complete %s restart without re-login or body fetch', mode => { expect(assessBrowserRestartEvidence(fixture(mode))).toMatchObject({passed:true,errors:[],mode,loginRequests:0,fixtureBodyRequests:0}) })
  it.each([
    ['previous.pid',13],['previous.pid',undefined],['previous.remainingProcesses',0],['previous.remainingProcesses',undefined],
    ['current.targetId','old-target'],['current.profile','/tmp/different-profile'],['sameProfile',false],
    ['closed.startedByTest',false],['closed.targetClosed',false],['closed.browserClosed',false],['closed.remainingProcesses',1],['closed.remainingProcesses',undefined],['closed.remainingProcesses','0'],
    ['closed.profilePreserved',false],['closed.profileRemoved',true],['closed.errors',['failure']],['closed.warnings',['residue']],
  ])('rejects missing process/ownership proof: %s', (field, value) => {
    const data=fixture(); const parts=field.split('.');let object:any=data.restart;for(const part of parts.slice(0,-1))object=object[part];object[parts.at(-1)!]=value
    expect(assessBrowserRestartEvidence(data).passed).toBe(false)
  })
  it.each(['authenticated','trusted','enabledForPage','hasLease','privateVisible','blobImages','imagesPassed'])('rejects absent UI/lease proof: %s', field => {
    for(const side of ['before','after']) {const data=fixture();(data as any)[side][field]=false;expect(assessBrowserRestartEvidence(data).passed).toBe(false)}
  })
  it.each(['markerPreserved','sameSession','newDocument'])('rejects a refresh or another profile/session: %s', field => {const data=fixture();(data.after as any)[field]=false;expect(assessBrowserRestartEvidence(data).passed).toBe(false)})
  it.each([{entryPresent:false},{bodyPresent:false},{available:false},{enabled:false},{bodyBytes:0},{bodyRevision:'bad'},{descriptor:{state:'empty'}}])('rejects missing/corrupt or newly lost persisted data: %j', patch => {
    for(const side of ['before','after']) {const data=fixture();Object.assign((data as any)[side].copies[0].record,patch);expect(assessBrowserRestartEvidence(data).passed).toBe(false)}
  })
  it('rejects changed bytes or dataset metadata across restart',()=>{
    const data=fixture();data.after.copies[0].record.descriptor.dataset_epoch='c'.repeat(32)
    expect(assessBrowserRestartEvidence(data).errors).toContain('copy-not-retained:bookmark:1')
  })
  it('does not let a relogin or network fill fake persisted recovery',()=>{
    for(const row of [{path:'/api/login',status:200},{object:'bookmark:1',kind:'icon-copy',status:200},{object:'category:2',kind:'icon-body',status:200}]){const data=fixture();(data.requests as any).push(row);expect(assessBrowserRestartEvidence(data).passed).toBe(false)}
  })
  it('requires a real authenticated online metadata request',()=>{const data=fixture();data.requests=[];expect(assessBrowserRestartEvidence(data).passed).toBe(false)})
  it('requires real offline injection and no successful API refresh',()=>{
    const data=fixture('offline');data.after.offlineDuringNavigation=false;expect(assessBrowserRestartEvidence(data).passed).toBe(false)
    const network=fixture('offline');(network.requests as any).push({path:'/api/admin/data',status:200,authSession:1});expect(assessBrowserRestartEvidence(network).passed).toBe(false)
    const missed=fixture('offline');missed.requests=[];expect(assessBrowserRestartEvidence(missed).passed).toBe(false)
  })
  it('does not hide other objects or mutate the supplied journal',()=>{
    const data=fixture();(data.requests as any).push({object:'bookmark:99',kind:'icon-body',status:200});const before=structuredClone(data)
    expect(assessBrowserRestartEvidence(data).passed).toBe(true);expect(data).toEqual(before)
  })
})

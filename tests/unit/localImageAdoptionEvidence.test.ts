import { describe, expect, it } from 'vitest'
import { verifiedLocalImageAdoptions, verifiedLogoutCopyCancellations } from '../../scripts/lib/imageRequestLifecycleEvidence.mjs'

const row={requestId:'image',stage:'case',kind:'icon-body',type:'Image',method:'GET',documentLoaderId:'doc',object:'category:7',time:1,wallTime:1,failureTime:1.1,error:'net::ERR_ABORTED',canceled:true,imageLifecycle:{timeOrigin:1000,sourceId:1}}
const snapshot={loaderId:'doc',timeOrigin:1000,dropped:0,events:[
  {kind:'observed',time:0,nodeId:1,sourceId:1,object:'category:7'},
  {kind:'src-changed',time:90,nodeId:1,sourceId:2,object:'category:7',previousObject:'category:7',previousSourceId:1,changedQueryKeys:['key']},
  {kind:'removed',time:110,nodeId:1,sourceId:2,object:'category:7'},
],adoptions:[{object:'category:7',previousSourceId:2,previousNodeId:1,nodeId:2,loadedAt:130,naturalWidth:16,naturalHeight:16,byteLength:123,revision:'sha256-'+'a'.repeat(64),persisted:true}]}

describe('native to persisted Blob adoption',()=>{
  it('requires the same departing owner, a real Blob load and native storage verification',()=>{
    expect(verifiedLocalImageAdoptions([row],[snapshot])).toHaveLength(1)
    for(const patch of [{persisted:false},{object:'bookmark:7'},{previousNodeId:9},{previousSourceId:9},{naturalWidth:0},{revision:'unknown'},{loadedAt:22000},{error:'blob-read-failed'}]){
      expect(verifiedLocalImageAdoptions([row],[{...snapshot,adoptions:[{...snapshot.adoptions[0],...patch}]}])).toEqual([])
    }
    for(const patch of [{method:'POST'},{error:'net::ERR_CONNECTION_RESET'},{canceled:false},{status:503},{documentLoaderId:'other'}])expect(verifiedLocalImageAdoptions([{...row,...patch}],[snapshot])).toEqual([])
    expect(verifiedLocalImageAdoptions([row],[{...snapshot,dropped:1}])).toEqual([])
    expect(verifiedLocalImageAdoptions([row],[{...snapshot,events:[snapshot.events[0],{...snapshot.events[0],nodeId:3},...snapshot.events.slice(1)]}])).toEqual([])
    expect(verifiedLocalImageAdoptions([row],[{...snapshot,events:snapshot.events.map(e=>e.kind==='src-changed'?{...e,changedQueryKeys:['v']}:e)}])).toEqual([])
  })
})

describe('logout cancels old-session copy reads',()=>{
  const copy={requestId:'copy',kind:'icon-copy',path:'/api/icon-local-copy',method:'POST',error:'net::ERR_ABORTED',canceled:true,authSession:1,time:1,wallTime:1,failureTime:2.05}
  const logout={requestId:'logout',path:'/api/logout',method:'POST',status:200,logoutRevoked:true,authSession:1,time:2,wallTime:2,finishedTime:2.3}
  it('requires a confirmed same-session logout and an in-flight read canceled during it',()=>{
    expect(verifiedLogoutCopyCancellations([copy,logout])).toEqual(['copy'])
    for(const patch of [{authSession:2},{method:'GET'},{status:503},{error:'net::ERR_CONNECTION_RESET'},{failureTime:4},{wallTime:3},{canceled:false}])expect(verifiedLogoutCopyCancellations([{...copy,...patch},logout])).toEqual([])
    expect(verifiedLogoutCopyCancellations([copy,{...logout,logoutRevoked:false}])).toEqual([])
    expect(verifiedLogoutCopyCancellations([copy,logout,{...logout,requestId:'ambiguous'}])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { verifiedUiImageCancellations } from '../../scripts/lib/imageRequestLifecycleEvidence.mjs'

describe('UI navigation image cancellation evidence', () => {
  const row={requestId:'image',stage:'earlier',documentLoaderId:'doc',object:'category:7',kind:'icon-body',type:'Image',method:'GET',time:5,wallTime:1,failureTime:5.1,error:'net::ERR_ABORTED',canceled:true,imageLifecycle:{timeOrigin:1000,sourceId:1}}
  const snapshot={loaderId:'doc',timeOrigin:1000,dropped:0,events:[{kind:'observed',nodeId:1,sourceId:1,object:'category:7',time:0},{kind:'removed',nodeId:1,sourceId:1,object:'category:7',time:100}]}
  const transition={id:1,kind:'admin',completed:true,beforeLoaderId:'doc',afterLoaderId:'doc',startedAt:1090,completedAt:1110}
  it('requires a completed real UI transition and every old consumer to be retired', () => {
    expect(verifiedUiImageCancellations([row],[snapshot],[transition])).toHaveLength(1)
    for(const patch of [{method:'POST'},{kind:'icon-copy'},{status:401},{error:'net::ERR_CONNECTION_RESET'},{canceled:false},{documentLoaderId:'other'}])expect(verifiedUiImageCancellations([{...row,...patch}],[snapshot],[transition])).toEqual([])
    for(const patch of [{completed:false},{afterLoaderId:'other'},{startedAt:1200},{completedAt:1000}])expect(verifiedUiImageCancellations([row],[snapshot],[{...transition,...patch}])).toEqual([])
    expect(verifiedUiImageCancellations([row],[{...snapshot,dropped:1}],[transition])).toEqual([])
    expect(verifiedUiImageCancellations([row],[{...snapshot,events:[snapshot.events[0]]}],[transition])).toEqual([])
    const shared={...snapshot,events:[snapshot.events[0],{kind:'observed',nodeId:2,sourceId:1,object:'category:7',time:50},snapshot.events[1]]}
    expect(verifiedUiImageCancellations([row],[shared],[transition])).toEqual([])
    const changed={...snapshot,events:[snapshot.events[0],{kind:'src-changed',nodeId:1,sourceId:2,previousSourceId:1,object:'category:7',previousObject:'category:7',changedQueryKeys:['key'],time:20},{...snapshot.events[1],sourceId:2}]}
    expect(verifiedUiImageCancellations([row],[changed],[transition])).toHaveLength(1)
  })
})

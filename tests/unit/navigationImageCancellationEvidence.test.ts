import {describe,it,expect} from 'vitest'
import {verifiedNavigationImageCancellations as verify} from '../../scripts/lib/imageRequestLifecycleEvidence.mjs'
function fixture(){return {row:{requestId:'image',documentLoaderId:'old',type:'Image',kind:'icon-body',method:'GET',error:'net::ERR_ABORTED',canceled:true,time:5,wallTime:100,failureTime:6},nav:{id:1,beforeLoaderId:'old',afterLoaderId:'new',startedAt:100800,committedAt:101000,completed:true}}}
describe('explicit navigation image cancellation',()=>{
 it('requires a completed new document and retains request-specific proof',()=>{const f=fixture();expect(verify([f.row],[f.nav])).toEqual([{requestId:'image',navigationId:1,oldLoaderId:'old',newLoaderId:'new',reason:'explicit-document-replacement'}])})
 it.each([{completed:false},{afterLoaderId:'old'},{afterLoaderId:undefined},{beforeLoaderId:'other'},{startedAt:102000},{committedAt:99900},{committedAt:undefined},{startedAt:undefined}])('rejects missing/wrong navigation proof: %j',patch=>{const f=fixture();expect(verify([f.row],[{...f.nav,...patch}])).toEqual([])})
 it.each([{type:'Fetch'},{kind:'api'},{method:'POST'},{status:404},{status:503},{error:'net::ERR_CONNECTION_CLOSED'},{canceled:false},{documentLoaderId:'other'},{failureTime:7},{failureTime:5},{failureTime:undefined},{wallTime:undefined}])('does not waive unrelated failures: %j',patch=>{const f=fixture();expect(verify([{...f.row,...patch}],[f.nav])).toEqual([])})
 it('rejects ambiguous navigation matches and does not mutate inputs',()=>{const f=fixture(),copy=structuredClone(f);expect(verify([f.row],[f.nav,{...f.nav,id:2}])).toEqual([]);expect(f).toEqual(copy)})
})

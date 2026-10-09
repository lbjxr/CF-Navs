import { describe, expect, it } from 'vitest'
import { verifiedFallbackTransportFailures } from '../../scripts/lib/fallbackFailureEvidence.mjs'
const evidence={fault:'RESET',imagesPassed:true,releasedAt:2000,objects:['bookmark:1','bookmark:2'],injections:[{object:'bookmark:1',kind:'copy'},{object:'bookmark:2',kind:'copy'},{object:'bookmark:1',kind:'proxy',requestId:'fault'}],recovered:[1,2].map(id=>({object:'bookmark:'+id,revision:'sha256-'+'a'.repeat(64)}))}
const scenario={id:'28-FALLBACK-RESET',status:'passed',fallbackFailure:evidence}
const row={requestId:'fault',stage:scenario.id,kind:'icon-body',object:'bookmark:1',method:'GET',error:'net::ERR_CONNECTION_RESET',canceled:false}
describe('double-failure expected transport evidence',()=>{
  it('requires exact injected requests and verified recovery for both objects',()=>{
    expect(verifiedFallbackTransportFailures([row],[scenario])).toEqual(['fault'])
    for(const patch of [{status:'failed'},{fallbackFailure:{...evidence,imagesPassed:false}},{fallbackFailure:{...evidence,recovered:evidence.recovered.slice(0,1)}},{fallbackFailure:{...evidence,injections:evidence.injections.slice(1)}}])expect(verifiedFallbackTransportFailures([row],[{...scenario,...patch}])).toEqual([])
    for(const patch of [{requestId:'other'},{object:'bookmark:3'},{stage:'other'},{method:'POST'},{error:'net::ERR_ABORTED'}])expect(verifiedFallbackTransportFailures([{...row,...patch}],[scenario])).toEqual([])
  })
  it('accepts timeout only inside the product deadline window',()=>{
    const timed={...scenario,fallbackFailure:{...evidence,fault:'TIMEOUT'}}
    for(const durationMs of [10,8999,15001])expect(verifiedFallbackTransportFailures([{...row,error:'net::ERR_ABORTED',canceled:true,durationMs}],[timed])).toEqual([])
    expect(verifiedFallbackTransportFailures([{...row,error:'net::ERR_ABORTED',canceled:true,durationMs:10010}],[timed])).toEqual(['fault'])
  })
})

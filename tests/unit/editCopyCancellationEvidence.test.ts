import { describe, expect, it } from 'vitest'
import { verifiedEditCopyCancellations } from '../../scripts/lib/editCopyCancellationEvidence.mjs'
function fixture(){
 const record=(n:number)=>({available:true,enabled:true,entryPresent:true,bodyPresent:true,bodyBytes:128,bodyRevision:'sha256-'+String(n).repeat(64),descriptor:{object_type:'bookmark',object_id:8,dataset_epoch:'a'.repeat(32),write_epoch:n,content_revision:'sha256-'+String(n).repeat(64),state:'ready'}})
 const before=record(1),after=record(2),stage='28-EDIT-ICON-SAVE'
 return {rows:[{requestId:'save',stage,method:'PUT',path:'/api/bookmarks/8',status:200,time:100,finishedTime:100.5,authSession:1},{requestId:'copy',stage,method:'POST',object:'bookmark:8',kind:'icon-copy',authSession:1,time:100.3,failureTime:100.55,error:'net::ERR_ABORTED',canceled:true,copyRequest:{dataset_epoch:'a'.repeat(32),expected_write_epoch:2,expected_content_revision:after.bodyRevision}}] as any[],cases:[{id:stage,status:'passed',editCopyRecovery:{object:'bookmark:8',before,after,pixelsPassed:true}}]}
}
describe('verified icon-save copy cancellation',()=>{
 it('accepts only a verified save with changed pixels and native persisted bytes',()=>{const f=fixture();expect(verifiedEditCopyCancellations(f.rows,f.cases)).toEqual([{requestId:'copy',putRequestId:'save',object:'bookmark:8',reason:'verified-icon-edit-replacement',persistedRevision:'sha256-'+'2'.repeat(64)}])})
 it.each([{stage:'other'},{object:'bookmark:9'},{kind:'icon-body'},{method:'GET'},{authSession:2},{error:'net::ERR_FAILED'},{canceled:false},{status:409},{time:98},{failureTime:99},{failureTime:102},{failureTime:undefined},{copyRequest:{}}])('rejects unrelated or unproven cancellation: %j',patch=>{const f=fixture();Object.assign(f.rows[1],patch);expect(verifiedEditCopyCancellations(f.rows,f.cases)).toEqual([])})
 it.each([{method:'GET'},{status:500},{finishedTime:undefined},{error:'net::ERR_FAILED'},{authSession:undefined},{path:'/api/bookmarks/9'}])('requires a complete matching save: %j',patch=>{const f=fixture();Object.assign(f.rows[0],patch);expect(verifiedEditCopyCancellations(f.rows,f.cases)).toEqual([])})
 it.each([{bodyPresent:false},{entryPresent:false},{enabled:false},{available:false},{bodyBytes:0},{bodyRevision:'bad'}])('rejects missing real persistence: %j',patch=>{const f=fixture();Object.assign(f.cases[0].editCopyRecovery.after,patch);expect(verifiedEditCopyCancellations(f.rows,f.cases)).toEqual([])})
 it('rejects failed cases, missing images, unchanged bytes and ambiguous writes',()=>{
  const a=fixture();a.cases[0].status='failed';expect(verifiedEditCopyCancellations(a.rows,a.cases)).toEqual([])
  const b=fixture();b.cases[0].editCopyRecovery.pixelsPassed=false;expect(verifiedEditCopyCancellations(b.rows,b.cases)).toEqual([])
  const c=fixture();c.cases[0].editCopyRecovery.after=c.cases[0].editCopyRecovery.before;expect(verifiedEditCopyCancellations(c.rows,c.cases)).toEqual([])
  const d=fixture();d.rows.push({...d.rows[0],requestId:'another-save'});expect(verifiedEditCopyCancellations(d.rows,d.cases)).toEqual([])
 })
 it('does not classify another abort or mutate original evidence',()=>{const f=fixture();f.rows.push({...f.rows[1],requestId:'other',object:'bookmark:9'});const saved=structuredClone(f);expect(verifiedEditCopyCancellations(f.rows,f.cases).map(r=>r.requestId)).toEqual(['copy']);expect(f).toEqual(saved)})
})

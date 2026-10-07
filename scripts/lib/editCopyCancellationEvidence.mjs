const valid = (record, object) => record?.available===true&&record.enabled===true&&record.entryPresent===true&&record.bodyPresent===true&&
  Number.isSafeInteger(record.bodyBytes)&&record.bodyBytes>0&&record.descriptor?.state==='ready'&&
  object===record.descriptor.object_type+':'+record.descriptor.object_id&&/^[a-f0-9]{32}$/.test(record.descriptor.dataset_epoch??'')&&
  Number.isSafeInteger(record.descriptor.write_epoch)&&record.descriptor.write_epoch>=0&&/^sha256-[a-f0-9]{64}$/.test(record.bodyRevision??'')&&record.bodyRevision===record.descriptor.content_revision

// A user icon save may replace an in-flight network copy with the verified inline
// body from the authoritative save response. Require UI + native persisted bytes,
// not just a cancellation in an edit-named stage. No other abort is waived.
export function verifiedEditCopyCancellations(rows, cases) {
  const verified=[]
  for(const scenario of cases) {
    const proof=scenario.editCopyRecovery
    if(scenario.id!=='28-EDIT-ICON-SAVE'||scenario.status!=='passed'||proof?.pixelsPassed!==true||!/^bookmark:[1-9]\d*$/.test(proof.object??''))continue
    const {object,before,after}=proof
    if(!valid(before,object)||!valid(after,object)||before.descriptor.dataset_epoch!==after.descriptor.dataset_epoch||before.bodyRevision===after.bodyRevision||after.descriptor.write_epoch<=before.descriptor.write_epoch)continue
    const puts=rows.filter(row=>row.stage===scenario.id&&row.method==='PUT'&&row.path==='/api/bookmarks/'+object.split(':')[1]&&row.status===200&&!row.error&&!row.canceled&&Number.isFinite(row.time)&&Number.isFinite(row.finishedTime)&&row.finishedTime>=row.time&&Number.isSafeInteger(row.authSession)&&row.authSession>0)
    if(puts.length!==1)continue
    const put=puts[0]
    for(const row of rows) {
      if(row.stage!==scenario.id||row.object!==object||row.kind!=='icon-copy'||row.method!=='POST'||row.authSession!==put.authSession||row.error!=='net::ERR_ABORTED'||row.canceled!==true||row.status!=null&&row.status!==200||!Number.isFinite(row.time)||!Number.isFinite(row.failureTime)||row.failureTime<row.time||row.time<put.time-.1||row.failureTime<put.finishedTime-.1||row.failureTime>put.finishedTime+1)continue
      const request=row.copyRequest
      if(!request||request.dataset_epoch!==after.descriptor.dataset_epoch||![before.descriptor,after.descriptor].some(d=>request.expected_write_epoch===d.write_epoch&&request.expected_content_revision===d.content_revision))continue
      verified.push({requestId:row.requestId,putRequestId:put.requestId,object,reason:'verified-icon-edit-replacement',persistedRevision:after.bodyRevision})
    }
  }
  return verified
}

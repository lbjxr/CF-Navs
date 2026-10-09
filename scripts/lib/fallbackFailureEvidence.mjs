// Injected transport failures are expected only after both layers were exercised
// for every owned object and the real page restored verified persistent images.
export function verifiedFallbackTransportFailures(rows, cases) {
  const result=[]
  for(const scenario of cases){
    const evidence=scenario.fallbackFailure
    if(scenario.status!=='passed'||!['RESET','TIMEOUT'].includes(evidence?.fault)||evidence.imagesPassed!==true||!Number.isFinite(evidence.releasedAt)||evidence.objects?.length!==2)continue
    if(!evidence.objects.every(object=>evidence.injections.some(x=>x.object===object&&x.kind==='copy')&&evidence.recovered?.some(x=>x.object===object&&/^sha256-[a-f0-9]{64}$/.test(x.revision))))continue
    for(const injection of evidence.injections.filter(x=>x.kind==='proxy')){
      const matches=rows.filter(row=>row.requestId===injection.requestId&&row.stage===scenario.id&&row.kind==='icon-body'&&row.object===injection.object&&row.method==='GET')
      if(matches.length!==1)continue
      const row=matches[0]
      if(evidence.fault==='RESET'&&row.error==='net::ERR_CONNECTION_RESET'&&row.canceled!==true)result.push(row.requestId)
      if(evidence.fault==='TIMEOUT'&&row.error==='net::ERR_ABORTED'&&row.canceled===true&&row.durationMs>=9000&&row.durationMs<=15000)result.push(row.requestId)
    }
  }
  return result
}

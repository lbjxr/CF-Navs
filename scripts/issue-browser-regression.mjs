// Headed, test-site-only regression. Explicit opt-in authorizes creation and
// removal of this run's synthetic records, never editing existing site data.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomUUID, createHash } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { verifiedLogoutFailures } from './lib/logoutEvidence.mjs'
import { pageLegacySnapshots } from './lib/legacySnapshotProbe.mjs'
import { pageReadFixtureCopy } from './lib/iconCopyStorageProbe.mjs'
import { assessBrowserRestartEvidence } from './lib/browserRestartEvidence.mjs'
import { verifiedEditCopyCancellations } from './lib/editCopyCancellationEvidence.mjs'
import { pageInstallImageLifecycleProbe } from './lib/imageRequestLifecycleProbe.mjs'
import { verifiedSignedImageReplacements, verifiedNativeCategoryRetries, verifiedNavigationImageCancellations } from './lib/imageRequestLifecycleEvidence.mjs'
import { createVerificationCleanup } from './lib/verificationCleanup.mjs'
import { resolveBaseUrl, resolveSetting } from './lib/verifyTarget.mjs'
import { requireAdminCredentials, redactCredentials } from './lib/verifyCredentials.mjs'
import { createIconAcceptanceFixtures } from './lib/iconAcceptanceFixtures.mjs'
import { collectIconFixtures, evaluateIconFixtures } from './lib/iconAcceptance.mjs'
import { classifyIssueRequest, assessStableIcons, assessIconTrace, validatedIconConflicts, isCanceledNetworkResponse, isExpectedOfflineFailure, assessCopyTimeoutFallback, assessCopyTimeoutRecovery, numericNetworkTiming, isExpectedInjectedCancellation } from './lib/issueBrowserEvidence.mjs'
if (process.env.ISSUE_BROWSER_WRITE_FIXTURES !== '1') throw new Error('Explicit ISSUE_BROWSER_WRITE_FIXTURES=1 required for temporary test-site records')
const base = resolveBaseUrl(), credentials = requireAdminCredentials()
const selectedCases=new Set((process.env.ISSUE_CASES??'').split(',').filter(Boolean))
const cacheMode=process.env.ISSUE_CACHE_MODE??'on'
assert(['on','off'].includes(cacheMode),'Invalid ISSUE_CACHE_MODE')
if(cacheMode==='off') assert(selectedCases.size>0&&[...selectedCases].every(id=>['28-EDIT-TITLE-DATA','28-EDIT-CANCEL','28-IDLE-CONTROL','28-RIGHT-CLICK-OFF'].includes(id)),'Off mode requires explicit compatible cases')
const requiredCases=new Set(['LOGIN-UI','28-BASELINE','28-ENABLE-DEFERRED'])
const cleanupFault=process.env.ISSUE_CLEANUP_FAULT??''
assert(['','detached-page'].includes(cleanupFault),'Invalid cleanup fault')
const optionalCases = new Set(['28-CATEGORY-PERMISSIONS','28-LEASE-EXPIRED-OFFLINE','28-CLOCK-ROLLBACK-OFFLINE','28-SIGNATURE-RENEWAL','28-COPY-TIMEOUT','28-BROWSER-RESTART-ONLINE','28-BROWSER-RESTART-OFFLINE','29-LOGOUT-NAVIGATION-RACE','28-NATIVE-CATEGORY-TIMEOUT'])
const run = randomUUID().slice(0, 8), fixtures = createIconAcceptanceFixtures()
const serverCleanup = createVerificationCleanup({baseUrl:base,run,credentials})
const sessionCaptureErrors = []
const loginCaptures = new Set()
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-navs-issue-browser-'))
const profile = path.join(os.tmpdir(), 'cf-navs-chrome-profile-issue-' + run)
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r))
const port = probe.address().port; await new Promise(r => probe.close(r))
const disableQuic=process.env.ISSUE_DISABLE_QUIC==='1'
const b = new CdpSession({ chromeExe: resolveSetting('CHROME_EXE', 'chromeExe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), debugPort: port, userDataDir: profile, headless: false, disableQuic })
const report = { run, cacheMode, browserLog: [], cases: [], requests: [], cleanup: {}, excluded: [], limitations: [] }
let stage = 'setup', token = '', category, child, bookmarks = [], ownedCategories = [], ownedBookmarks = [], secondary = null
const requests = new Map()
const imageRequestUrls = new Map()
report.imageLifecycles = []
report.imageLifecycleErrors = []
report.navigations=[]
const documentCommits=new Map()
b.on('Page.frameNavigated',({frame})=>{if(frame&&!frame.parentId&&frame.loaderId)documentCommits.set(frame.loaderId,{frameId:frame.id,at:Date.now()})})
const responseReads = new Set()
const observedCopyResponses = []
let fetchHandler = null
let editorObject = null
let operationImageUrls = null
const injectedRequests = new Set()
const expectedOfflineRequests = new Set()
const expectedTimeoutRequests = new Set()
const expectedReacquireRequests = new Set()
let offlineActive = false
function safe(value) { return serverCleanup.redact(redactCredentials(String(value), credentials)).replaceAll(base, '[test-origin]').replaceAll(token || '\u0000', '[token]').replace(/([?&](?:key|token)=)[^\s&"']+/g, '$1[redacted]') }
async function persist() { await fs.writeFile(path.join(output, 'report.json'), safe(JSON.stringify(report, null, 2))) }
function assert(value, message) { if (!value) throw new Error(message) }
async function collectImageLifecycle(reason) {
  try {
    const loaderId = (await b.send('Page.getFrameTree')).frameTree.frame.loaderId
    const rows = report.requests.filter(row => row.documentLoaderId === loaderId && imageRequestUrls.has(row.requestId))
    if (!rows.length) return
    const captured = await b.call(urls => {
      const probe=window.__issueImageLifecycle
      if(!probe)return null
      return {snapshot:probe.read(),sourceIds:urls.map(url=>probe.sourceId(url)),baseSourceIds:urls.map(url=>{const base=new URL(url);base.searchParams.delete('retry');return probe.sourceId(base.href)})}
    }, rows.map(row=>imageRequestUrls.get(row.requestId)))
    if (!captured) throw new Error('Image lifecycle probe missing in active document')
    rows.forEach((row,index)=>{row.imageLifecycle={timeOrigin:captured.snapshot.timeOrigin,sourceId:captured.sourceIds[index],baseSourceId:captured.baseSourceIds[index]}})
    report.imageLifecycles.push({stage,reason,loaderId,...captured.snapshot})
  } catch (error) { report.imageLifecycleErrors.push({stage,reason,error:safe(error.message)}) }
}
const navigate = b.navigate.bind(b)
b.navigate = async (...args) => {
  await collectImageLifecycle('before-navigation')
  const before=(await b.send('Page.getFrameTree')).frameTree.frame
  const event={id:report.navigations.length+1,stage,beforeLoaderId:before.loaderId,startedAt:Date.now(),completed:false}
  report.navigations.push(event)
  try {
    const result=await navigate(...args)
    const after=(await b.send('Page.getFrameTree')).frameTree.frame,commit=documentCommits.get(after.loaderId)
    Object.assign(event,{afterLoaderId:after.loaderId,committedAt:commit?.at,completed:before.loaderId!==after.loaderId&&commit?.frameId===after.id})
    return result
  } catch(error) {event.error=safe(error.message);throw error}
}
async function wait(fn, args = [], timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const result = await b.call(fn, ...args); if (result) return result; await sleep(120) }
  throw new Error('UI condition timed out: ' + fn.toString().slice(0, 140)+' args='+JSON.stringify(args))
}
async function click(selector, button = 'left') {
  await b.send('Page.bringToFront')
  const hover=await b.call(sel=>{const e=document.querySelector(sel);if(!e)return null;let r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!(r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&(hit===e||e.contains(hit))))e.scrollIntoView({block:e.closest('.bookmark-context-menu')?'nearest':'center',inline:'nearest'});r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null},selector)
  if(hover) { await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hover,button:'none'}); await sleep(250) }
  const point = await wait(sel => {
    const e = document.querySelector(sel); if (!e || e.disabled) return null
    let before=e.getBoundingClientRect();const beforeHit=document.elementFromPoint(before.x+before.width/2,before.y+before.height/2)
    if(!(before.top>=0&&before.bottom<=innerHeight&&before.left>=0&&before.right<=innerWidth&&(beforeHit===e||e.contains(beforeHit))))e.scrollIntoView({block:e.closest('.bookmark-context-menu')?'nearest':'center',inline:'nearest',behavior:'instant'})
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    return r.width && r.height && (hit === e || e.contains(hit)) ? { x, y } : null
  }, [selector]).catch(async error => {
    const diagnostic = await b.call(sel => [...document.querySelectorAll(sel)].map(e => { const r=e.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {tag:e.tagName,disabled:e.disabled,rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:hit?.tagName,hitClass:hit?.className} }), selector)
    throw new Error('Click failed '+selector+' '+JSON.stringify(diagnostic))
  })
  await b.mouse(point.x, point.y, { button })
}
async function key(key, code = key, modifiers = 0) {
  const windowsVirtualKeyCode=({Escape:27,Tab:9,Enter:13,ArrowDown:40,ArrowUp:38})[key]??0
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode })
}
async function fill(selector, value) {
  await click(selector)
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17})
  await b.send('Input.insertText',{text:value})
  assert(await b.call((sel,expected)=>document.querySelector(sel)?.value===expected,selector,value),'Field replacement verification failed: '+selector)
}
async function homeAction(name) {
  const selector = name==='theme' ? '[data-testid="home-theme-toggle"]' : `[data-testid="home-${name}-button"]`
  let failedClicks=0
  for(let attempt=0;attempt<120;attempt++) {
    if(name==='login'&&await b.call(()=>Boolean(document.querySelector('[aria-labelledby="login-modal-title"]'))))return
    if(name==='admin'&&await b.call(()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]'))))return
    const state=await b.call(sel=>{const e=document.querySelector(sel),r=e?.getBoundingClientRect(),trigger=document.querySelector('[data-testid="home-actions-menu-trigger"]'),t=trigger?.getBoundingClientRect();return {exists:!!e,visible:!!r&&r.width>0&&r.height>0,trigger:!!t&&t.width>0&&t.height>0,expanded:trigger?.getAttribute('aria-expanded')==='true'}},selector)
    if(state.visible){try{await click(selector);return}catch(error){if(!error.message.startsWith('Click failed '+selector)||++failedClicks>=2)throw error}}
    else if(state.exists&&state.trigger&&!state.expanded)await click('[data-testid="home-actions-menu-trigger"]')
    await sleep(150)
  }
  throw new Error('Floating action did not become available: '+name)
}

async function login() {
  await b.send('Page.bringToFront')
  await b.navigate(base + '/admin')
  await wait(() => document.querySelector('input[autocomplete="username"]') || document.querySelector('[data-testid="admin-tab-settings"]') || document.querySelector('[data-testid="home-login-button"]'), [], 30000)
  if (!await b.call(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')))) {
    if (!await b.call(() => Boolean(document.querySelector('input[autocomplete="username"]')))) await homeAction('login')
    await fill('input[autocomplete="username"]', credentials.username)
    await fill('input[autocomplete="current-password"]', credentials.password)
    await click('[aria-labelledby="login-modal-title"] form button[type="submit"]')
    await wait(() => !document.querySelector('input[autocomplete="current-password"]'), [], 30000)
    await b.navigate(base + '/admin')
  }
  await wait(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), [], 30000)
  token = await b.call(() => JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')?.token || '')
  assert(token, 'UI login did not establish a session')
  serverCleanup.rememberSession(token)
}
async function api(route, body, method = 'POST') {
  // Fixture setup/readback is not the UI under test. Keep it independent of a
  // stalled renderer, as cleanup already is; UI requests remain CDP-observed.
  const entry={stage,route,method,transport:'host-fetch',startedAt:Date.now()}
  ;(report.fixtureRequests??=[]).push(entry)
  try {
    const response=await fetch(base+'/api'+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'content-type':'application/json',authorization:'Bearer '+token,'cache-control':'no-cache',pragma:'no-cache'},
      ...(body==null?{}:{body:JSON.stringify(body)})})
    entry.status=response.status
    const envelope=await response.json();entry.code=envelope.code
    assert(response.status<400&&envelope.code===0,`Fixture API failed ${method} ${route} status=${response.status} code=${envelope.code}`)
    return envelope.data
  } finally {entry.durationMs=Date.now()-entry.startedAt}
}
async function setFixtureIcon(index,icon) {
  const item=bookmarks[index]
  return api('/bookmarks/'+item.id,{category_id:category.id,title:item.title,url:item.url||`https://example.com/regression/${index}`,icon,icon_source:'custom',is_private:index===2},'PUT')
}
const scope = () => `[data-home-category-scope="${category.id}"]`
const card = index => `[data-sort-category-id="${category.id}"] [data-sort-id="${bookmarks[index].id}"] .bookmark-card-shell`
function manifest() {
  return [{ key: `category:${child.id}`, selector: `#home-category-tab-${child.id} [data-category-icon]`, kind:'image', pixels: fixtures.bookmark.pixels }, { key: `category:${category.id}`, selector: `${scope()} > .scope-heading > [data-category-icon]`, kind: 'image', pixels: fixtures.category.pixels },
    ...bookmarks.map((item, i) => ({ key: `bookmark:${item.id}`, selector: card(i), kind: 'image', pixels: item.pixels }))]
}
async function home({ waitForImages = true, anonymous = false } = {}) {
  await b.send('Page.bringToFront')
  await wait(() => document.visibilityState === 'visible', [], 10000)
  await b.navigate(base)
  await wait(sel => Boolean(document.querySelector(sel)), [scope()], 30000)
  await click(scope() + ' .scope-root-trigger')
  await wait((id, count) => document.querySelectorAll(`[data-sort-category-id="${id}"] .bookmark-card-shell`).length >= count, [category.id, anonymous ? 2 : 3], 30000)
  const imageWaitStart = Date.now()
  if (waitForImages) for (const item of manifest().filter(row => !anonymous || row.key !== `bookmark:${bookmarks[2].id}`)) {
    await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),item.selector)
    await wait(sel=>{const e=document.querySelector(sel),img=e?.matches('img')?e:e?.querySelector('img');return img?.complete&&img.naturalWidth>0},[item.selector],60000).catch(async error=>{
      report.cases.at(-1).imageReadiness = await b.call(sel=>{const e=document.querySelector(sel),img=e?.querySelector('img'),r=e?.getBoundingClientRect();return {selector:sel,exists:!!e,visibility:document.visibilityState,focused:document.hasFocus(),rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,display:e?getComputedStyle(e).display:null,image:img?{complete:img.complete,width:img.naturalWidth,loading:img.loading,source:img.src.startsWith('blob:')?'blob':img.src.startsWith('data:')?'data':new URL(img.src,location.href).pathname}:null,anonymous:!localStorage.getItem('cf-navs.auth')}},item.selector)
      await shot('image-readiness-before-recovery').catch(()=>{})
      report.cases.at(-1).imageReadiness.networkProbe = await b.call(async sel => {
        const img = document.querySelector(sel)?.querySelector('img')
        if (!img || !img.src.startsWith(location.origin)) return { applicable: false }
        try { const response = await fetch(img.src, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); const body = await response.arrayBuffer(); return { status: response.status, bytes: body.byteLength, type: response.headers.get('content-type'), imageStillPending: !img.complete } }
        catch (error) { return { error: error.name, imageStillPending: !img.complete } }
      }, item.selector)
      throw error
    })
  }
  if (report.cases.at(-1)) (report.cases.at(-1).imageWaits ??= []).push({ anonymous, elapsedMs: Date.now() - imageWaitStart })
  await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),card(0))
  await b.waitForNetworkIdle(900, 15000)
}
async function verifyImages(items = manifest()) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const observed = await b.call(collectIconFixtures, items)
    const result = evaluateIconFixtures(items, observed)
    if (result.passed) return result
    if (attempt === 59) { report.cases.at(-1).imageEvidence={result,observed}; throw new Error('Fixture images: ' + result.errors.join(',')) }
    await sleep(250)
  }
}
async function shot(name) {
  const clip = await b.call(sel => { const menu=document.querySelector('.bookmark-context-menu');if(menu){const m=menu.getBoundingClientRect();return {x:m.x+scrollX,y:m.y+scrollY,width:m.width,height:m.height,scale:1}} const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const grid=document.querySelector(`[data-sort-category-id="${e.dataset.homeCategoryScope}"]`)?.getBoundingClientRect(); const bottom=Math.max(r.bottom,grid?.bottom??r.bottom); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: bottom-r.top, scale: 1 } }, scope())
  if (clip?.width && clip?.height) { const image = await b.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true }); await fs.writeFile(path.join(output, name + '.png'), Buffer.from(image.data, 'base64')) }
}
async function traceStart() {
  operationImageUrls=new Set(await b.call(()=>[...document.images].filter(img=>img.complete&&img.naturalWidth>0).map(img=>img.currentSrc||img.src)))
  await b.call(manifest => {
    window.__issueTrace?.stop?.()
    if(window.__issueUrls){window.__issueUrls.events=[];window.__issueUrls.active=true}
    const entries=manifest.map(row=>({key:row.key,node:document.querySelector(row.selector)}))
    const nodes=new Set(entries.map(row=>row.node)),protectedIds=new Map()
    function owner(node,index) {
      const bookmark=node.closest('[data-sort-id]')?.getAttribute('data-sort-id')
      if(bookmark) return 'bookmark:'+bookmark
      const tab=node.closest('[id^="home-category-tab-"]')?.id.match(/-(\d+)$/)?.[1]
      const category=tab||node.closest('[data-navigation-id^="category-"]')?.getAttribute('data-navigation-id')?.slice(9)||node.closest('[data-home-category-scope]')?.getAttribute('data-home-category-scope')
      return category?'category:'+category:'display:'+index
    }
    for(const [index,node] of [...document.querySelectorAll('.bookmark-card-shell,[data-category-icon]')].entries()) {
      const image=node.querySelector('img')
      if(!nodes.has(node)&&image?.complete&&image.naturalWidth>0) entries.push({key:owner(node,index),node})
    }
    for(const row of entries) {
      const image=row.node?.matches('img')?row.node:row.node?.querySelector('img')
      row.src=image?.src||''
      const id=window.__issueUrls?.ids?.get(row.src)
      if(id!==undefined) protectedIds.set(id,row.key)
    }
    const changes=[],samples={frames:0};let running=true
    function scan() {
      if(!running)return;samples.frames++
      for(const row of entries) {
        const e=row.node,img=e?.matches('img')?e:e?.querySelector('img'),r=e?.getBoundingClientRect()
        const visible=Boolean(r&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth)
        const state=!e?.isConnected?'missing':!img?'text':!img.complete||!img.naturalWidth?'unloaded':img.src!==row.src?'src-changed':'stable'
        if(state!=='stable'&&changes.length<2000)changes.push({key:row.key,state,visible,at:Math.round(performance.now())})
      }
      requestAnimationFrame(scan)
    }
    requestAnimationFrame(scan)
    window.__issueTrace={changes,samples,protectedIds,stop:()=>{running=false}}
  },manifest())
}
async function traceEnd() {
  operationImageUrls=null
  return b.call(()=>{const t=window.__issueTrace;t?.stop();if(window.__issueUrls)window.__issueUrls.active=false;const events=window.__issueUrls?.events??[];return t?{objectUrls:events,protectedRevocations:events.filter(e=>e.kind==='revoke'&&t.protectedIds.has(e.id)).map(e=>({key:t.protectedIds.get(e.id),id:e.id,at:e.at})),changes:t.changes,frames:t.samples.frames,timeOrigin:performance.timeOrigin}:null})
}
async function scenario(id, action) {
  if(optionalCases.has(id)&&!selectedCases.has(id)){const skipped={id,status:'not-run',reason:'Explicit ISSUE_CASES opt-in required'};report.cases.push(skipped);return skipped}
  if(id==='28-ENABLE-DEFERRED'&&cacheMode==='off'){const skipped={id,status:'not-run',reason:'Explicit cache-off matrix'};report.cases.push(skipped);return skipped}
  if(selectedCases.size&&!selectedCases.has(id)&&!requiredCases.has(id)){const skipped={id,status:'not-run'};report.cases.push(skipped);return skipped}
  stage = id; editorObject=null; const start = report.requests.length, consoles = b.consoleErrors.length, exceptions = b.pageExceptions.length
  const entry = { id, expectedFault: ['28-COPY-503', '28-COPY-TIMEOUT', '28-NATIVE-CATEGORY-TIMEOUT', '29-OLD-401', '29-OFFLINE-FOCUS'].includes(id), started: new Date().toISOString(), status: 'running' }; report.cases.push(entry)
  try {
    // Each scenario starts independently; the 300px menu viewport must not leak
    // into later login/storage flows. Menu cases set their own viewport afterward.
    await b.setViewport({ width: 1366, height: 900, scale: 1 })
    if((id.startsWith('29-')||id.startsWith('30-')||id.startsWith('28-STORAGE'))&&!await b.call(()=>Boolean(JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token))) await login(); entry.detail = await action(); entry.status = 'passed' } catch (error) { entry.status = 'failed'; entry.error = safe(error.message);
    entry.visibleUi=await b.call(()=>({heading:document.querySelector('h1')?.textContent?.slice(0,120),splash:document.querySelector('.app-splash-card')?.textContent?.trim().slice(0,250),dialogs:document.querySelectorAll('[role="dialog"]').length,inputs:[...document.querySelectorAll('input')].map(e=>({type:e.type,autocomplete:e.autocomplete})),ready:document.readyState})).catch(()=>null);
    entry.iconState=await b.call(async ids=>{
      const script=[...document.scripts].find(e=>e.type==='module'&&e.src.includes('/assets/index-'))
      if(!script)return null
      const values=Object.values(await import(script.src))
      const device=values.find(v=>v&&typeof v==='object'&&typeof v.snapshot==='function'&&typeof v.acceptMetadata==='function')
      const store=values.find(v=>v&&typeof v==='object'&&typeof v.setDataProgressively==='function'&&typeof v.subscribe==='function')
      const state=device?.snapshot();let data;const stop=store?.subscribe(value=>{data=value.data});stop?.()
      return {deviceFound:!!device,storeFound:!!store,phase:state?.phase,epoch:state?.epoch,trusted:state?.trusted,enabled:state?.enabledForPage,hasLease:!!state?.lease,categories:data?.categories?.filter(e=>ids.includes(e.id)).map(e=>({id:e.id,sourcePresent:!!e.icon,display:e.icon_display,revision:e.icon_revision,write:e.icon_write_epoch}))}
    },ownedCategories).catch(()=>null);
    if(category && !await b.call(()=>Boolean(document.querySelector('input[type="password"]'))).catch(()=>true)) await shot(id+'-failed').catch(()=>{}) }
  await collectImageLifecycle('scenario-end')
  entry.requests = report.requests.slice(start).map(r => r.requestId)
  entry.console = b.consoleErrors.slice(consoles).map(e => safe(JSON.stringify(e)))
  entry.exceptions = b.pageExceptions.slice(exceptions).map(e => safe(JSON.stringify(e)))
  if (entry.exceptions.length || entry.console.length) entry.status = 'failed'
  console.log(JSON.stringify({ id, status: entry.status, error: entry.error, detail: entry.status==='passed' ? entry.detail : undefined }))
  await persist(); return entry
}
async function stableOperation(action, allowed = []) {
  await home({waitForImages:false}); await home(); await verifyImages(); await traceStart(); const start = report.requests.length
  report.cases.at(-1).actionRequestOffset=start
  await action(); await b.waitForNetworkIdle(1000, 15000); await sleep(1500)
  const trace = await traceEnd(), network = assessStableIcons(report.requests.slice(start), allowed, editorObject ? [editorObject] : [], true)
  const traceResult = assessIconTrace(trace, allowed), regressions = traceResult.regressions
  report.cases.at(-1).detail={network,trace}
  report.cases.at(-1).trace=trace
  assert(network.passed && traceResult.passed, JSON.stringify({ network, regressions: regressions.slice(0, 15),revocations:traceResult.revocations }))
  for(const item of manifest()) await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),item.selector)
  await verifyImages(); return { network, traceFrames: trace?.frames, regressions }
}
async function localWait(fn, label, timeout = 20000) {
  const end=Date.now()+timeout; while(Date.now()<end) { if(fn()) return; await sleep(100) } throw new Error(label+' was not exercised')
}
async function focusCycle() {
  secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
  await b.send('Target.activateTarget',{targetId:secondary}); await sleep(800)
  await b.send('Target.activateTarget',{targetId:b.targetId}); await sleep(800)
  await b.send('Target.closeTarget',{targetId:secondary}); secondary=null
}
async function intercept(patterns, handler, action) {
  fetchHandler=handler
  try { await b.send('Fetch.enable',{patterns}); return await action() } finally { fetchHandler=null; await b.send('Fetch.disable') }
}
async function signInPlace() {
  await homeAction('login'); await fill('input[autocomplete="username"]',credentials.username)
  await fill('input[autocomplete="current-password"]',credentials.password)
  await click('[aria-labelledby="login-modal-title"] form button[type="submit"]')
  await wait(()=>!document.querySelector('input[autocomplete="current-password"]'))
  token=await b.call(()=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token||'')
  if(token)serverCleanup.rememberSession(token)
  assert(token,'In-page login did not establish a session')
}
async function clearCopies() {
  await home(); await settings()
  await click('.device-actions button:nth-child(2)')
  await wait(()=>document.querySelector('.device-status')?.textContent.startsWith('已启用'),[],30000)
  const deadline=Date.now()+30000
  let copies=[]
  do {
    copies=await Promise.all(manifest().map(async item=>({key:item.key,record:await readFixtureCopy(item.key)})))
    if(copies.every(copy=>copy.record.available&&copy.record.enabled&&!copy.record.entryPresent&&!copy.record.bodyPresent)) {
      ;(report.cases.at(-1).clearCopyProofs??=[]).push(copies.map(copy=>({key:copy.key,entryPresent:false,bodyPresent:false})))
      return
    }
    await sleep(120)
  } while(Date.now()<deadline)
  throw new Error('Clear copies did not reach native entry/body absence')
}
async function readFixtureCopy(object) { return b.call(pageReadFixtureCopy, object) }
async function waitForAnonymousBaseline(expected) {
  const ids=bookmarks.slice(0,2).map(row=>row.id)
  const documentBefore=await b.call(()=>performance.timeOrigin), started=Date.now()
  await wait(id=>!document.querySelector('[data-sort-id="'+id+'"]'),[bookmarks[2].id],30000)
  for(const item of expected) {
    await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),item.selector)
    await wait(sel=>{const element=document.querySelector(sel),image=element?.querySelector('img');if(element&&(!image?.complete||!image.naturalWidth))element.scrollIntoView({block:'center',behavior:'instant'});return image?.complete&&image.naturalWidth>0},[item.selector],60000)
  }
  const images=await verifyImages(expected)
  await wait((ids,privateId)=>Object.keys(localStorage).some(key=>{
    if(!key.startsWith('cf-navs.public-data.'))return false
    try {const rows=JSON.parse(localStorage.getItem(key)).data?.bookmarks;return Array.isArray(rows)&&ids.every(id=>rows.some(row=>row.id===id))&&!rows.some(row=>row.id===privateId)}catch{return false}
  }),[ids,bookmarks[2].id])
  const sameDocument=await b.call(()=>performance.timeOrigin)===documentBefore
  assert(sameDocument,'Anonymous completion unexpectedly replaced the document')
  return {images,privateRemoved:true,snapshotReady:true,sameDocument,elapsedMs:Date.now()-started}
}
async function readRestartState() {
  const items=manifest()
  const state=await b.call(async (items, privateId) => {
    const script=[...document.scripts].find(e=>e.type==='module'&&e.src.includes('/assets/index-'))
    if(!script)throw new Error('Application entry missing')
    const values=Object.values(await import(script.src))
    const device=values.find(v=>v&&typeof v==='object'&&typeof v.snapshot==='function'&&typeof v.acceptMetadata==='function')
    const snapshot=device?.snapshot(), saved=JSON.parse(localStorage.getItem('cf-navs.icon-device-v1')||'null'), session=JSON.parse(localStorage.getItem('cf-navs.auth')||'null')
    return {authenticated:!!session?.token&&session.expires_at>Date.now(),trusted:saved?.trusted===true&&snapshot?.trusted===true,
      enabledForPage:snapshot?.enabledForPage===true,phase:snapshot?.phase,hasLease:!!snapshot?.lease,
      privateVisible:!!document.querySelector('[data-sort-id="'+privateId+'"] .bookmark-card-shell'),
      blobImages:items.every(item=>{const image=document.querySelector(item.selector)?.querySelector('img');return image?.complete&&image.naturalWidth>0&&image.src.startsWith('blob:')}),
      documentTimeOrigin:performance.timeOrigin,applicationScript:new URL(script.src).pathname}
  },items,bookmarks[2].id)
  state.imagesPassed=(await verifyImages(items)).passed
  state.copies=[]
  for(const item of items)state.copies.push({key:item.key,record:await readFixtureCopy(item.key)})
  return state
}
async function enterSort() {
  const desktop = `#category-${category.id} button[aria-label="排序"]`
  const visible=await b.call(sel=>{const e=document.querySelector(sel);const r=e?.getBoundingClientRect();return r?.width>0},desktop)
  if(visible) await click(desktop)
  else {
    await click(scope()+' .scope-more-trigger')
    const selector=await b.call(sel=>{const buttons=[...document.querySelectorAll(sel+' .scope-more-menu button')];return sel+' .scope-more-menu button:nth-child('+(buttons.findIndex(e=>e.textContent.trim()==='排序')+1)+')'},scope())
    await click(selector)
  }
  await wait(()=>document.querySelector('.home-sort-bar'))
}
function sessionSend(sessionId,method,params={}) {
  return new Promise((resolve,reject)=>{const id=b.nextId++;const timer=setTimeout(()=>{b.pending.delete(id);reject(new Error('Secondary CDP timeout'))},30000);b.pending.set(id,{resolve,reject,timer});b.ws.send(JSON.stringify({id,method,params,sessionId}))})
}
async function sessionCall(sessionId,fn,...args) {
  const response=await sessionSend(sessionId,'Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`,awaitPromise:true,returnByValue:true})
  if(response.exceptionDetails) throw new Error('Secondary page evaluation failed')
  return response.result?.value
}
async function installPageInstrumentation() {
  await b.send('Page.addScriptToEvaluateOnNewDocument', {source:`(${pageInstallImageLifecycleProbe.toString()})()`})
  await b.send('Runtime.addBinding',{name:'__issueCopyObserved'})
  // Observe the same response without substituting bytes or changing the request.
  // Chrome may drop Network.getResponseBody after an owner aborts an already-read
  // response. Retain only protocol metadata, never image bytes or auth headers.
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);
    window.fetch=async function(...args){
      const start=performance.timeOrigin+performance.now();
      const response=await original(...args);
      try {
        const [input,init]=args,url=new URL(typeof input==='string'?input:input.url,location.href);
        if(url.origin===location.origin&&url.pathname==='/api/icon-local-copy'){
          const request=JSON.parse(init?.body??'null');
          void response.clone().text().then(text=>{
            if(text.length>1048576)return;const data=JSON.parse(text).data;
            window.__issueCopyObserved(JSON.stringify({start,status:response.status,object:request?.object_type+':'+request?.object_id,
              request:{dataset_epoch:request?.dataset_epoch,expected_write_epoch:request?.expected_write_epoch,expected_content_revision:request?.expected_content_revision},
              result:{protocol:data?.protocol,reason:data?.reason,persistence:data?.persistence,descriptor:data?.descriptor,hasImage:Boolean(data?.image),imageBytes:data?.image?.byte_length??0}}));
          }).catch(()=>{});
        }
      }catch{}
      return response;
    };
  })()`})
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),ids=new Map();let sequence=0;
    const state=window.__issueUrls={active:false,events:[],ids};
    URL.createObjectURL=function(blob){const url=create(blob);ids.set(url,++sequence);if(state.active&&state.events.length<2000)state.events.push({kind:'create',id:sequence,size:blob.size,mime:blob.type,at:performance.now(),stack:new Error().stack});return url};
    URL.revokeObjectURL=function(url){if(state.active&&state.events.length<2000)state.events.push({kind:'revoke',id:ids.get(url),at:performance.now(),stack:new Error().stack});ids.delete(url);return revoke(url)};
  })()`})
  await b.send('Log.enable')
}
async function recordBrowserOwnership(reason) {
  const ownership={profile,pid:b.chromeProcess.pid,port,targetId:b.targetId,headed:true,nativeWindowOcclusionDisabled:true,disableQuic,reason}
  report.ownership=ownership
  ;(report.browserLifetimes ??= []).push(ownership)
  await fs.writeFile(path.join(output, 'ownership.json'), JSON.stringify(ownership))
}
async function settings() { await homeAction('admin'); await wait(() => document.querySelector('[data-testid="admin-tab-settings"]')); await click('[data-testid="admin-tab-settings"]'); await wait(() => [...document.querySelectorAll('.settings-submenu button')].some(e => e.textContent.includes('设备缓存'))); const selector = await b.call(() => { const buttons = [...document.querySelectorAll('.settings-submenu button')]; return '.settings-submenu button:nth-child(' + (buttons.findIndex(e => e.textContent.includes('设备缓存')) + 1) + ')' }); await click(selector); await wait(() => document.querySelector('.device-cache input')) }
async function edit(index) { editorObject=`bookmark:${bookmarks[index].id}`; await click(card(index), 'right'); await click('[data-testid="bookmark-context-edit"]'); await wait(() => document.querySelector('[data-testid="bookmark-modal"]')) }
try {
  // smoke-local owns the empty D1 and its one-time bootstrap credentials. Match
  // the existing icon smoke setup, then still exercise the real login form.
  if (new URL(base).hostname === '127.0.0.1' && process.env.SETUP_TOKEN) {
    const response = await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:credentials.username,password:credentials.password})})
    const bootstrap = await response.json()
    assert(bootstrap.code===0&&bootstrap.data?.token,'Disposable local bootstrap failed')
    serverCleanup.rememberSession(bootstrap.data.token)
    await fetch(base+'/api/logout',{method:'POST',headers:{authorization:'Bearer '+bootstrap.data.token}})
  }
  await b.start(); await b.attach()
  await installPageInstrumentation()
  b.on('Runtime.bindingCalled',event=>{if(event.name==='__issueCopyObserved'){try{observedCopyResponses.push(JSON.parse(event.payload))}catch{}}})
  b.on('Log.entryAdded',({entry})=>{if(['warning','error'].includes(entry.level)) report.browserLog.push({stage,level:entry.level,source:entry.source,requestId:entry.networkRequestId,text:safe(entry.text)})})
  await recordBrowserOwnership('initial')
  b.on('Fetch.requestPaused', event => {
    Promise.resolve(fetchHandler ? fetchHandler(event) : false).then(handled => {
      if (!handled) return b.send('Fetch.continueRequest', { requestId:event.requestId })
    }).catch(error => { report.interceptionError=safe(error.message) })
  })
  const authSessions = new Map() // Raw headers stay in memory, never in reports.
  b.on('Network.requestWillBeSent', e => {
    const row = { requestId: e.requestId, stage, time: e.timestamp, wallTime: e.wallTime, method: e.request.method, type: e.type, initiator: e.initiator?.type, initiatorFrames:e.initiator?.stack?.callFrames?.slice(0,4).map(f=>({function:f.functionName,url:safe(f.url),line:f.lineNumber,column:f.columnNumber})), ...classifyIssueRequest(e.request.url, e.request.postData, base) }
    const authorization = Object.entries(e.request.headers ?? {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1]
    if (new URL(e.request.url).origin === new URL(base).origin && typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      serverCleanup.rememberSession(authorization.slice(7))
      if (!authSessions.has(authorization)) authSessions.set(authorization, authSessions.size + 1)
      row.authSession = authSessions.get(authorization)
    }
    if(operationImageUrls) row.wasDisplayed=operationImageUrls.has(e.request.url)
    if (row.kind === 'external' && row.type === 'Image') row.kind = 'external-image'
    if(row.kind==='external-image') {
      if(requests.get(e.requestId)?.resourceRole==='site-background')row.resourceRole='site-background'
      void b.call(url=>{
        const style=getComputedStyle(document.documentElement),css=style.getPropertyValue('--home-background')+' '+style.backgroundImage
        return [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].some(match=>new URL(match[1],location.href).href===url)
      },e.request.url).then(matches=>{if(matches){for(const request of report.requests)if(request.requestId===row.requestId)request.resourceRole='site-background';row.resourceRole='site-background'}}).catch(()=>{})
    }
    if(row.kind==='icon-copy') {try{const body=JSON.parse(e.request.postData);row.copyRequest={dataset_epoch:body.dataset_epoch,expected_write_epoch:body.expected_write_epoch,expected_content_revision:body.expected_content_revision}}catch{}}
    row.documentLoaderId=e.loaderId
    if(row.kind==='icon-body')row.signed=new URL(e.request.url).searchParams.has('key')
    if(row.kind==='icon-body'&&row.type==='Image'){imageRequestUrls.set(e.requestId,e.request.url);const retry=new URL(e.request.url).searchParams.get('retry'),parsed=retry?.match(/^([1-9]\d*)(?:-([a-z0-9]+))?$/);row.nativeRetryAttempt=retry==null?0:parsed?Number(parsed[1]):null;row.nativeRetryScope=parsed?.[2]??null}
    requests.set(e.requestId, row); report.requests.push(row)
    if(editorObject && ['icon-body','icon-copy','iconify-body','external-image'].includes(row.kind)) {
      const previewFor=editorObject
      void b.call(url=>[...document.querySelectorAll('[data-testid="bookmark-modal"] img')].some(img=>img.src===url||img.currentSrc===url),e.request.url).then(matches=>{if(matches){row.surface='editor-preview';row.previewFor=previewFor}}).catch(()=>{})
    }
  })
  b.on('Network.responseReceived', e => { const row = requests.get(e.requestId); if (row) Object.assign(row, { status:e.response.status,responseTime:e.timestamp,protocol:e.response.protocol,timing:numericNetworkTiming(e.response.timing),disk:e.response.fromDiskCache,sw:e.response.fromServiceWorker,headers:Object.fromEntries(Object.entries(e.response.headers??{}).filter(([name])=>['content-type','cache-control','x-icon-fallback','content-security-policy'].includes(name.toLowerCase()))) }) })
  function inspectCopyResponse(requestId) {
    const row=requests.get(requestId)
    if(row?.path==='/api/login' && row.status===200 && row.terminalKind==='finished' && !loginCaptures.has(requestId)) {
      loginCaptures.add(requestId)
      const read=b.send('Network.getResponseBody',{requestId}).then(response=>{
        const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
        if(body.code===0) {
          row.issuedSession=serverCleanup.rememberSession(body.data?.token)
          row.sessionCaptured=true
        }
      }).catch(()=>sessionCaptureErrors.push({requestId,error:'Issued session response could not be captured'}))
      responseReads.add(read);void read.finally(()=>responseReads.delete(read))
      return
    }
    if(row?.path === '/api/logout' && row.status === 200) {
      const read=b.send('Network.getResponseBody',{requestId}).then(response=>{
        const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
        row.logoutRevoked=body.code===0 && body.data?.revoked===true
      }).catch(()=>{row.logoutRevoked=false})
      responseReads.add(read);void read.finally(()=>responseReads.delete(read))
      return
    }
    if(row?.kind!=='icon-copy'||![200,409].includes(row.status)) return
    const read=b.send('Network.getResponseBody',{requestId}).then(response=>{
      const envelope=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body),data=envelope.data
      row.copyResult={protocol:data?.protocol,reason:data?.reason,persistence:data?.persistence,descriptor:data?.descriptor,hasImage:Boolean(data?.image),imageBytes:data?.image?.byte_length??0}
    }).catch(()=>{row.copyResult={unreadable:true}})
    responseReads.add(read);void read.finally(()=>responseReads.delete(read))
  }
  b.on('Network.dataReceived', e => { const row=requests.get(e.requestId); if(row)Object.assign(row,{firstDataTime:row.firstDataTime??e.timestamp,lastDataTime:e.timestamp,dataEvents:(row.dataEvents??0)+1,receivedDataLength:(row.receivedDataLength??0)+e.dataLength,receivedEncodedDataLength:(row.receivedEncodedDataLength??0)+e.encodedDataLength}) })
  b.on('Network.loadingFinished', e => { const row=requests.get(e.requestId); if(row)Object.assign(row,{finishedTime:e.timestamp,terminalTime:e.timestamp,terminalKind:'finished',durationMs:(e.timestamp-row.time)*1000,encodedDataLength:e.encodedDataLength}); inspectCopyResponse(e.requestId) })
  b.on('Network.loadingFailed', e => { if(isExpectedOfflineFailure(e.errorText,offlineActive))expectedOfflineRequests.add(e.requestId); const row = requests.get(e.requestId); if (row) Object.assign(row, { error: e.errorText, canceled: Boolean(e.canceled), failureTime: e.timestamp, terminalTime:e.timestamp, terminalKind:'failed', durationMs:(e.timestamp-row.time)*1000, blockedReason:e.blockedReason }); inspectCopyResponse(e.requestId) })
  await b.setViewport({ width: 1366, height: 900, scale: 1 })
  await scenario('LOGIN-UI', async () => { await login(); return { authenticated: true } })
  assert(token, 'Login prerequisite failed')
  if(process.env.ISSUE_TEST_TOP_NAV==='1'){assert(new URL(base).hostname==='127.0.0.1'&&process.env.SETUP_TOKEN,'Top-navigation setup is allowed only in the disposable local instance');await api('/settings',{navigation:{position:'top',always_expanded:false,top_layout:'scroll'}},'PUT')}
  report.applicationScripts=await b.call(()=>[...document.scripts].map(e=>e.src?new URL(e.src).pathname:null).filter(Boolean))
  category = await api('/categories', { title: 'Browser regression ' + run, icon: fixtures.category.base64Uri, sort: 999999 }); ownedCategories.push(category.id)
  child = await api('/categories', { parent_id: category.id, title: 'Browser child ' + run, icon: fixtures.bookmark.base64Uri }); ownedCategories.push(child.id)
  for (let i = 0; i < 3; i++) {
    const item = await api('/bookmarks', { category_id: category.id, title: `Browser ${run} ${i}`, url: `https://example.com/regression/${i}`, icon: fixtures.bookmark.base64Uri, icon_source: 'custom', is_private: i === 2 })
    ownedBookmarks.push(item.id); bookmarks.push({ ...item, title: `Browser ${run} ${i}`, pixels: fixtures.bookmark.pixels, imageKey:'bookmark' })
  }
  report.fixtures = { categories: ownedCategories, bookmarks: ownedBookmarks }; await persist()
  const baseline = await scenario('28-BASELINE', async () => { await home(); const images = await verifyImages(); await shot('28-baseline'); return images }); assert(baseline.status === 'passed', 'Baseline prerequisite failed; dependent cases not run')
  await scenario('28-IDLE-CONTROL',async()=>stableOperation(async()=>{await sleep(2500)}))
  await scenario('28-RIGHT-CLICK-OFF', async () => stableOperation(async () => { await click(card(0), 'right'); await key('Escape'); }))
  await scenario('28-SIGNATURE-RENEWAL', async () => {
    // Before enabling local copies: exercise the real private proxy image path.
    // Advance only this document's clock; retain unmodified server signatures.
    let expiresAt = 0, held = null, renewals = 0, recovering = false
    const entry = report.cases.at(-1)
    return intercept([{urlPattern:'*/api/icon-access',requestStage:'Response'}], async event => {
      if (!expiresAt) {
        const response = await b.send('Fetch.getResponseBody',{requestId:event.requestId})
        const data = JSON.parse(response.base64Encoded ? Buffer.from(response.body,'base64').toString() : response.body).data
        expiresAt = data?.expires_at
        assert(Number.isSafeInteger(expiresAt), 'Missing real signature expiry')
        return false
      }
      renewals++
      if (!recovering) { held=event; return true }
      return false
    }, async () => {
      try {
        const initialStart=report.requests.length
        await home(); await verifyImages()
        assert(expiresAt > Date.now()+120000,'Initial signature is not outside its renewal window')
        assert(report.requests.slice(initialStart).some(row=>row.object===`bookmark:${bookmarks[2].id}`&&row.kind==='icon-body'&&row.signed&&row.status===200),'Private image did not exercise the signed proxy')
        const documentBefore=await b.call(()=>performance.timeOrigin)
        await traceStart()
        const start=report.requests.length
        await b.call(expiry=>{window.__issueRealNow=Date.now;const offset=expiry-90000-Date.now();Date.now=()=>window.__issueRealNow()+offset},expiresAt)
        await focusCycle()
        await localWait(()=>held,'Real signature renewal')
        assert(renewals===1,'Concurrent focus signals did not share renewal')
        entry.renewal={heldRequestId:held.networkId,remainingMs:await b.call(expiry=>expiry-Date.now(),expiresAt)}
        await sleep(1200); await verifyImages()
        injectedRequests.add(held.networkId)
        await b.send('Fetch.fulfillRequest',{requestId:held.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({success:false,error:'controlled renewal outage'})).toString('base64')})
        held=null
        await sleep(1200); await verifyImages()
        const trace=await traceEnd(), assessment=assessIconTrace(trace)
        const network=assessStableIcons(report.requests.slice(start))
        entry.trace=trace
        Object.assign(entry.renewal,{traceFrames:trace?.frames,network,assessment})
        assert(assessment.passed&&network.passed,'Valid signature was discarded during renewal: '+JSON.stringify({assessment,network}))
        recovering=true
        await focusCycle()
        await localWait(()=>renewals===2,'Natural renewal retry after recovery')
        await b.waitForNetworkIdle(900,15000); await verifyImages()
        const recovery=report.requests.slice(start).filter(row=>row.path==='/api/icon-access'&&row.status===200)
        assert(recovery.length===1,'Recovery must complete one real renewal')
        assert(await b.call(()=>performance.timeOrigin)===documentBefore,'Renewal replaced the document')
        return {...entry.renewal,renewals,recoveryRequestId:recovery[0].requestId,imagesPassed:true,clockOnly:true}
      } finally {
        const trace=await traceEnd().catch(()=>null)
        if(!entry.trace&&trace)entry.trace=trace
        await b.call(()=>{if(window.__issueRealNow){Date.now=window.__issueRealNow;delete window.__issueRealNow}}).catch(()=>{})
        if(held)await b.send('Fetch.continueRequest',{requestId:held.requestId}).catch(()=>{})
      }
    })
  })
  await scenario('28-ENABLE-DEFERRED', async () => {
    await home(); const documentStart = await b.call(()=>performance.timeOrigin); await settings(); const start = report.requests.length
    await click('.device-cache input'); await wait(() => document.querySelector('.device-status')?.textContent.includes('下次刷新'))
    await click('[aria-label="返回首页"]')
    await wait(sel => document.querySelector(sel), [scope()]); await click(scope() + ' .scope-root-trigger'); await verifyImages()
    const copies = report.requests.slice(start).filter(r => r.kind === 'icon-copy')
    assert(!copies.length, 'Enabling issued local-copy requests before complete reload'); assert(await b.call(()=>performance.timeOrigin)===documentStart,'Return unexpectedly replaced the document'); return { copyRequests: copies.length, sameDocument: true }
  })
  await scenario('28-COLD-RELOAD', async () => { await home(); const images = await verifyImages(); await shot('28-cold'); return images })
  await scenario('28-WARM-RELOAD', async () => {
    await home();await verifyImages()
    const keys=manifest().map(row=>row.key)
    const persisted=await b.call(async keys=>{
      const request=indexedDB.open('cf-navs-object-icons-v1'),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      try {const tx=db.transaction(['entries','bodies'],'readonly');return (await Promise.all(keys.map(async key=>{
        const read=store=>new Promise((resolve,reject)=>{const r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
        const [entry,body]=await Promise.all([read('entries'),read('bodies')]);return entry?.descriptor?.state==='ready'&&body?.size>0
      }))).every(Boolean)}finally{db.close()}
    },keys)
    assert(persisted,'Warm test requires persisted fixture bodies')
    const start=report.requests.length;await home();await verifyImages()
    assert(await b.call(manifest=>manifest.every(row=>document.querySelector(row.selector)?.querySelector('img')?.src.startsWith('blob:')),manifest()),'Warm fixture did not use object URLs')
    const rows=report.requests.slice(start),network=assessStableIcons(rows.filter(row=>['icon-body','icon-copy'].includes(row.kind)))
    assert(network.passed,JSON.stringify(network));return {persisted,network,otherImageRequests:rows.filter(row=>['external-image','iconify-body'].includes(row.kind)).length}
  })
  for (const mode of ['expired','rollback']) await scenario(mode==='expired'?'28-LEASE-EXPIRED-OFFLINE':'28-CLOCK-ROLLBACK-OFFLINE', async () => {
    const evidence=report.cases.at(-1).leaseBoundary={mode,clockOnly:true}
    let clockScript=null
    try {
      await home(); await verifyImages()
      const before=await readRestartState()
      assert(before.phase==='ready'&&before.blobImages&&before.copies.every(copy=>copy.record.entryPresent&&copy.record.bodyPresent),'Lease boundary requires real warm persistent copies')
      await wait(()=>Boolean(navigator.serviceWorker?.controller))
      evidence.before=await b.call(()=>{
        const record=JSON.parse(localStorage.getItem('cf-navs.icon-device-v1'))
        const session=JSON.parse(localStorage.getItem('cf-navs.auth'))
        return {checkedAt:record.receipt.checked_at,expiresAt:record.receipt.expires_at,observedAt:record.observedAt,sessionExpiresAt:session.expires_at}
      })
      const target=mode==='expired'?evidence.before.checkedAt+86400000+1000:evidence.before.observedAt-60000
      assert(target<evidence.before.sessionExpiresAt,'Lease test would also expire the login session')
      const source=`(()=>{const realNow=Date.now.bind(Date),offset=${target}-realNow();Date.now=()=>realNow()+offset})()`
      clockScript=(await b.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier
      const start=report.requests.length
      await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});offlineActive=true
      await home({waitForImages:false})
      evidence.denied=await b.call(async items=>{
        const script=[...document.scripts].find(e=>e.type==='module'&&e.src.includes('/assets/index-'))
        const device=Object.values(await import(script.src)).find(v=>v&&typeof v.snapshot==='function'&&typeof v.acceptMetadata==='function')
        const state=device.snapshot(),record=JSON.parse(localStorage.getItem('cf-navs.icon-device-v1'))
        return {phase:state.phase,hasLease:!!state.lease,authenticated:!!localStorage.getItem('cf-navs.auth'),
          checkedAt:record.receipt?.checked_at,expiresAt:record.receipt?.expires_at,
          images:items.map(item=>{const e=document.querySelector(item.selector),img=e?.querySelector('img');return {key:item.key,present:!!e,blob:img?.src.startsWith('blob:')??false}})}
      },manifest())
      assert(evidence.denied.phase===(mode==='expired'?'expired':'checking')&&!evidence.denied.hasLease,'Unusable local lease remained enabled')
      assert(evidence.denied.authenticated&&evidence.denied.images.every(image=>image.present&&!image.blob),'Boundary must stop local images without inventing logout or removing fixture data')
      assert(evidence.denied.checkedAt===evidence.before.checkedAt&&evidence.denied.expiresAt===evidence.before.expiresAt,'Offline read renewed the receipt')
      const during=report.requests.slice(start)
      evidence.offlineMetadataFailures=during.filter(row=>row.kind==='api'&&row.error==='net::ERR_INTERNET_DISCONNECTED').length
      assert(evidence.offlineMetadataFailures>0&&!during.some(row=>row.authSession&&row.kind==='api'&&row.status===200),'Offline boundary did not deny actual metadata requests')
      await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clockScript});clockScript=null
      await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});offlineActive=false
      await home(); const recovered=await readRestartState()
      evidence.recovery={phase:recovered.phase,hasLease:recovered.hasLease,imagesPassed:recovered.imagesPassed,blobImages:recovered.blobImages}
      assert(recovered.phase==='ready'&&recovered.hasLease&&recovered.imagesPassed&&recovered.blobImages,'Online revalidation did not restore the valid copies')
      return evidence
    } finally {
      if(clockScript)await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clockScript})
      if(offlineActive){await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});offlineActive=false}
      // Every injected clock belongs to a document; replace it even after failure.
      await b.navigate(base)
    }
  })
  for (const mode of ['online','offline']) await scenario('28-BROWSER-RESTART-'+mode.toUpperCase(), async () => {
    const entry=report.cases.at(-1), evidence=entry.restart={mode,fixtureKeys:manifest().map(item=>item.key)}
    const markerKey='cf-navs.restart-proof.'+run+'.'+mode, marker=randomUUID()
    let afterRestartStart=0
    try {
      await home();await verifyImages()
      evidence.before=await readRestartState()
      assert(evidence.before.authenticated&&evidence.before.trusted&&evidence.before.enabledForPage&&evidence.before.phase==='ready'&&evidence.before.privateVisible&&evidence.before.blobImages,'Restart requires a trusted authenticated visible baseline')
      assert(evidence.before.copies.every(copy=>copy.record.enabled&&copy.record.entryPresent&&copy.record.bodyPresent&&copy.record.bodyBytes>0&&copy.record.bodyRevision===copy.record.descriptor?.content_revision),'Restart requires native persisted fixture bodies before closure')
      if(mode==='offline') {
        await wait(()=>Boolean(navigator.serviceWorker?.controller),[],20000)
        evidence.serviceWorkerControlledBeforeClose=true
      }
      const previousToken=await b.call(()=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token)
      assert(previousToken,'Restart requires a persisted session')
      await b.call((key,value)=>localStorage.setItem(key,value),markerKey,marker)
      await collectImageLifecycle('before-browser-restart')
      await Promise.allSettled([...responseReads]);await persist()
      try { evidence.process=await b.restart() }
      catch(error) { evidence.process=error.restartEvidence;throw error }
      await recordBrowserOwnership('restart-'+mode)
      afterRestartStart=report.requests.length
      await installPageInstrumentation()
      await b.setViewport({width:1366,height:900,scale:1})
      if(mode==='offline') {
        await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
        offlineActive=true
      }
      await home();evidence.after=await readRestartState()
      const retained=await b.call((key,value,previous)=>({markerPreserved:localStorage.getItem(key)===value,sameSession:JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===previous}),markerKey,marker,previousToken)
      Object.assign(evidence.after,retained,{newDocument:evidence.after.documentTimeOrigin!==evidence.before.documentTimeOrigin,offlineDuringNavigation:mode==='offline'&&offlineActive})
      evidence.assessment=assessBrowserRestartEvidence({mode,restart:evidence.process,before:evidence.before,after:evidence.after,fixtureKeys:evidence.fixtureKeys,requests:report.requests.slice(afterRestartStart)})
      assert(evidence.assessment.passed,'Browser restart: '+JSON.stringify(evidence.assessment))
      await shot('28-restart-'+mode)
      if(mode==='offline') {
        await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});offlineActive=false
        await home();evidence.onlineRecovery=(await verifyImages()).passed
        assert(evidence.onlineRecovery,'Restart did not recover online')
      }
      await b.call(key=>localStorage.removeItem(key),markerKey)
      return {mode,sameProfile:evidence.process.sameProfile,previousPid:evidence.process.previous.pid,currentPid:evidence.process.current.pid,
        previousProcesses:evidence.process.previous.remainingProcesses,closedProcesses:evidence.process.closed.remainingProcesses,
        sameSession:evidence.after.sameSession,privateVisible:evidence.after.privateVisible,fixtureBodyRequests:evidence.assessment.fixtureBodyRequests,
        authenticatedMetadataRequests:evidence.assessment.authenticatedMetadataRequests,onlineRecovery:evidence.onlineRecovery??null,imagesPassed:evidence.after.imagesPassed}
    } catch(error) { evidence.failure=safe(error.message);await persist();throw error }
    finally {
      if(offlineActive) {
        try {await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});offlineActive=false;evidence.offlineRestored=true}
        catch(error){evidence.offlineRestoreError=safe(error.message);throw error}
      }
    }
  })
  await scenario('29-LOGOUT-NAVIGATION-RACE', async () => {
    const entry=report.cases.at(-1), evidence=entry.rapidNavigation={}
    const expected=manifest().filter(row=>row.key!=='bookmark:'+bookmarks[2].id)
    try {
      await home();await verifyImages()
      const oldDocument=await b.call(()=>performance.timeOrigin)
      await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
      evidence.beforeNavigation=await b.call((items,privateId)=>({authenticated:!!localStorage.getItem('cf-navs.auth'),privatePresent:!!document.querySelector('[data-sort-id="'+privateId+'"]'),imagesReady:items.every(item=>{const img=document.querySelector(item.selector)?.querySelector('img');return img?.complete&&img.naturalWidth>0})}),expected,bookmarks[2].id)
      assert(!evidence.beforeNavigation.authenticated,'Logout did not clear local session')
      assert(evidence.beforeNavigation.privatePresent||!evidence.beforeNavigation.imagesReady,'Rapid-navigation overlap was not exercised')
      const started=Date.now(), requestStart=report.requests.length
      // Deliberately NO anonymous-ready wait: preserve the original fast path,
      // including its first-visible-category image wait after navigation.
      await home({anonymous:true})
      evidence.newDocument=await b.call(()=>performance.timeOrigin)!==oldDocument
      assert(evidence.newDocument,'Rapid navigation did not replace the document')
      await wait(items=>items.every(item=>{const img=document.querySelector(item.selector)?.querySelector('img');return img?.complete&&img.naturalWidth>0}),[expected],25000)
      evidence.images=await verifyImages(expected)
      evidence.elapsedMs=Date.now()-started
      // Four visible load windows (initial + 3 retries), existing backoffs,
      // and 10s for the navigation/data baseline. Do not invent a 30s limit
      // that contradicts the product's already-tested retry budget.
      evidence.recoveryBudgetMs=4*10000+1200+4000+10000+10000
      assert(evidence.elapsedMs<evidence.recoveryBudgetMs,'Rapid-navigation images exceeded the retry budget')
      assert(report.requests.slice(requestStart).filter(row=>expected.some(item=>item.key===row.object)).every(row=>!row.nativeRetryAttempt||row.nativeRetryAttempt<=3),'Rapid navigation exceeded three automatic retries')
      assert(await b.call(id=>!document.querySelector('[data-sort-id="'+id+'"]'),bookmarks[2].id),'Private fixture survived anonymous navigation')
      evidence.retryRequests=report.requests.slice(requestStart).filter(row=>row.kind==='icon-body'&&row.nativeRetryAttempt>0).map(row=>({requestId:row.requestId,object:row.object,attempt:row.nativeRetryAttempt,documentScope:row.nativeRetryScope,status:row.status}))
      await shot('29-rapid-navigation-recovered')
      return {newDocument:true,anonymous:true,privateRemoved:true,images:evidence.images,elapsedMs:evidence.elapsedMs,recoveryBudgetMs:evidence.recoveryBudgetMs,retryRequests:evidence.retryRequests}
    } catch(error) {
      evidence.failure=safe(error.message)
      evidence.failureImages=await b.call(items=>items.map(item=>{const img=document.querySelector(item.selector)?.querySelector('img');return {key:item.key,exists:!!img,complete:img?.complete,width:img?.naturalWidth}}),expected).catch(()=>null)
      await persist();throw error
    } finally {await login();await home()}
  })
  await scenario('28-NATIVE-CATEGORY-TIMEOUT', async () => {
    const entry=report.cases.at(-1), evidence=entry.nativeTimeout={held:[]}
    const expected=manifest().filter(row=>row.key!=='bookmark:'+bookmarks[2].id),target=expected.find(row=>row.key==='category:'+child.id)
    // Same pixels, fresh fixture-only revision: do not inherit a hung URL from
    // the rapid-navigation case. All owned records are deleted in global cleanup.
    const diagnosticSvg=Buffer.from(fixtures.bookmark.base64Uri.split(',')[1],'base64').toString('utf8').replace('</svg>','<!-- native-timeout-'+run+' --></svg>')
    try {
      await api('/categories/'+child.id,{parent_id:category.id,title:'Browser child '+run,icon:'data:image/svg+xml;base64,'+Buffer.from(diagnosticSvg).toString('base64')},'PUT')
      await home()
      const expectedRevision='sha256-'+createHash('sha256').update('cf-navs-icon-v1\nimage/svg+xml\n').update(diagnosticSvg).digest('hex')
      const materializationDeadline=Date.now()+60000
      let materialized=null
      do {
        await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center',behavior:'instant'}),target.selector)
        materialized=await readFixtureCopy(target.key)
        if(materialized.entryPresent&&materialized.bodyPresent&&materialized.bodyRevision===expectedRevision&&materialized.descriptor?.content_revision===expectedRevision)break
        await sleep(150)
      } while(Date.now()<materializationDeadline)
      assert(materialized?.bodyRevision===expectedRevision&&materialized.descriptor?.content_revision===expectedRevision,'Native timeout setup did not materialize the edited fixture before logout')
      evidence.materializedBeforeLogout={bodyRevision:materialized.bodyRevision,descriptorRevision:materialized.descriptor.content_revision,bodyBytes:materialized.bodyBytes}
      await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
      await waitForAnonymousBaseline(expected)
      // Materialization may publish a newer icon revision after the first image
      // succeeds. Confirm that version through the app before suspending a URL.
      await home({anonymous:true});await waitForAnonymousBaseline(expected)
      await wait((id,revision)=>Object.keys(localStorage).some(key=>{if(!key.startsWith('cf-navs.public-data.'))return false;try{return JSON.parse(localStorage.getItem(key)).data?.categories?.some(row=>row.id===id&&row.icon_revision===revision)}catch{return false}}),[child.id,expectedRevision],20000)
      const suspendedUrl=await b.call(sel=>{const image=document.querySelector(sel)?.querySelector('img');if(!image)return null;const url=new URL(image.src);url.searchParams.delete('retry');return url.href},target.selector)
      assert(suspendedUrl&&new URL(suspendedUrl).pathname==='/api/category-icon/'+child.id,'Native fixture URL is not ready')
      evidence.materializedRevisionConfirmed=true
      await b.send('Network.setCacheDisabled',{cacheDisabled:true})
      await intercept([{urlPattern:'*/api/category-icon/'+child.id+'*',requestStage:'Response'}],async event=>{
        const url=new URL(event.request.url)
        if(event.request.url!==suspendedUrl||url.origin!==base||url.pathname!=='/api/category-icon/'+child.id||url.searchParams.has('retry')||event.resourceType!=='Image')return false
        assert(event.responseStatusCode===200&&event.networkId,'Native timeout requires a real successful upstream image')
        evidence.held.push({requestId:event.networkId,responseStatus:event.responseStatusCode});await persist();return true
      },async()=>{
        const start=report.requests.length
        await home({anonymous:true,waitForImages:false})
        await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),target.selector)
        await localWait(()=>evidence.held.length>0,'Native image suspension',10000)
        await wait(sel=>{const img=document.querySelector(sel)?.querySelector('img');return img?.complete&&img.naturalWidth>0&&parseInt(new URL(img.src,location.href).searchParams.get('retry')??'0',10)>0},[target.selector],25000)
        evidence.images=await verifyImages(expected)
        const held=requests.get(evidence.held[0].requestId), retry=report.requests.slice(start).find(row=>row.object===target.key&&row.type==='Image'&&row.nativeRetryAttempt===1&&row.status===200)
        assert(evidence.held.length===1&&retry,'Timeout must recover through the first real retry, not another initial request')
        assert(retry.nativeRetryScope===await b.call(()=>Math.trunc(performance.timeOrigin).toString(36)),'Retry URL is not owned by the current document')
        await localWait(()=>Number.isFinite(retry.finishedTime),'Native retry body completion',1500)
        evidence.elapsedMs=(retry.finishedTime-held.time)*1000
        assert(evidence.elapsedMs>=10000&&evidence.elapsedMs<22000,'Native timeout did not use the bounded product deadline')
        evidence.retryRequestId=retry.requestId
        await shot('28-native-timeout-recovered')
      })
      return {heldRequests:evidence.held,elapsedMs:evidence.elapsedMs,retryRequestId:evidence.retryRequestId,images:evidence.images}
    } catch(error) {evidence.failure=safe(error.message);await persist();throw error}
    finally {await b.send('Fetch.disable').catch(()=>{});await b.send('Network.setCacheDisabled',{cacheDisabled:false});await login();await home()}
  })
  for (const access of ['admin', 'public']) await scenario('28-LEGACY-SNAPSHOT-' + access.toUpperCase(), async () => {
    const anonymous = access === 'public'
    const ids = bookmarks.filter((_, i) => !anonymous || i < 2).map(row => row.id)
    const expected = manifest().filter(row => !anonymous || row.key !== 'bookmark:' + bookmarks[2].id)
    try {
      if (anonymous) {
        await home(); await homeAction('logout'); await wait(() => !localStorage.getItem('cf-navs.auth'))
        // This is a snapshot-recovery case, not the separate immediate-navigation
        // logout race. Observe completion in the CURRENT document before reloading.
        report.cases.at(-1).progress='wait for current anonymous logout completion'
        report.cases.at(-1).anonymousBaseline=await waitForAnonymousBaseline(expected)
      }
      report.cases.at(-1).progress = 'anonymous/login baseline'
      await home({ anonymous })
      await verifyImages(expected)
      await wait(async (ids, access) => {
        const prefix = 'cf-navs.' + access + '-data.'
        return Object.keys(localStorage).some(key => key.startsWith(prefix) && ids.every(id => JSON.parse(localStorage.getItem(key)).data?.bookmarks?.some(row => row.id === id)))
      }, [ids, access])
      report.cases.at(-1).progress = 'seed old snapshot'
      const seeded = await b.call(pageLegacySnapshots, ids, access, 'seed')
      assert(seeded.length > 0 && seeded.every(row => row.version === null && row.empty === ids.length), 'Legacy empty snapshot was not seeded for all owned records')
      const start = report.requests.length, beforeDocument = await b.call(() => performance.timeOrigin)
      await home({ anonymous })
      const images = await verifyImages(expected)
      const refreshed = await b.call(pageLegacySnapshots, ids, access)
      assert(refreshed.length > 0 && refreshed.every(row => row.version === 1 && row.images === ids.length && row.empty === 0), 'Snapshot was not rewritten with correct image metadata')
      const metadata = report.requests.slice(start).filter(row => row.path === (anonymous ? '/api/public/data' : '/api/admin/data') && row.status === 200)
      assert(metadata.length > 0, 'Old data version skipped authoritative metadata refresh')
      assert(await b.call(() => performance.timeOrigin) !== beforeDocument, 'Upgrade simulation did not replace the document')
      if (anonymous) assert(await b.call(id => !document.querySelector('[data-sort-id="' + id + '"]'), bookmarks[2].id), 'Anonymous recovery exposed the private fixture')
      return { scope: access, seeded, refreshed, metadataResponses: metadata.map(row => row.requestId), images, sameProfile: true, distinctBuildUpgrade: false }
    } finally {
      if (anonymous) { await login(); await home() }
    }
  })
  await scenario('28-RIGHT-CLICK-ON', async () => stableOperation(async () => { await click(card(0), 'right'); await key('Escape'); }))
  await scenario('29-TAB-FOCUS', async () => stableOperation(async () => {
    secondary = (await b.send('Target.createTarget', { url: 'about:blank' })).targetId
    await b.send('Target.activateTarget', { targetId: secondary }); await sleep(1200)
    await b.send('Target.activateTarget', { targetId: b.targetId }); await sleep(1500)
    await b.send('Target.closeTarget', { targetId: secondary }); secondary = null
  }))
  await scenario('28-EDIT-CANCEL', async () => stableOperation(async () => { await edit(0); await click('[data-testid="bookmark-modal"] .modal-actions .ghost-button') }, [`bookmark:${bookmarks[0].id}`]))
  await scenario('28-EDIT-ICON-SAVE', async () => {
    const object='bookmark:'+bookmarks[0].id, evidence=report.cases.at(-1).editCopyRecovery={object}
    const result=await stableOperation(async () => {
      evidence.before=await readFixtureCopy(object)
      await edit(0); await fill('[data-testid="bookmark-modal"] .icon-row input', fixtures.category.base64Uri)
      await click('[data-testid="bookmark-modal"] button[type="submit"]'); await wait(() => !document.querySelector('[data-testid="bookmark-modal"]'), [], 30000)
      bookmarks[0].pixels=fixtures.category.pixels;bookmarks[0].imageKey='category'
    },[object])
    // stableOperation already checked independent pixels after the real UI save.
    evidence.pixelsPassed=true
    evidence.after=await readFixtureCopy(object)
    assert(evidence.after.enabled&&evidence.after.entryPresent&&evidence.after.bodyPresent&&evidence.after.bodyBytes>0&&evidence.after.bodyRevision===evidence.after.descriptor?.content_revision,'Saved icon has no verified native persisted body')
    return result
  })
  await scenario('28-EDIT-TITLE-DATA', async () => {
    for (const index of [0, 2]) {
      await home({waitForImages:false})
      await wait(async id => {
        const cache=await caches.open('cf-navs-admin-data-v1')
        for(const request of await cache.keys()) {
          const payload=await (await cache.match(request)).json()
          const item=payload?.data?.bookmarks?.find(row=>row.id===id)
          if(item?.icon_display==='image'&&!item.icon) return true
        }
        return Object.keys(localStorage).filter(key=>key.startsWith('cf-navs.admin-data.')).some(key=>{try{const item=JSON.parse(localStorage.getItem(key)).data.bookmarks.find(row=>row.id===id);return item?.icon_display==='image'&&!item.icon}catch{return false}})
      },[bookmarks[index].id])
      await home({waitForImages:false})
      await edit(index)
      const expected=fixtures[bookmarks[index].imageKey].base64Uri
      assert(await b.call(value=>document.querySelector('[data-testid="bookmark-modal"] .icon-row input')?.value===value,expected),'Projected snapshot leaked an empty icon into the editor')
      const title=`Edited ${run} ${index}`
      await fill('[data-testid="bookmark-modal"] input[placeholder="例如：Svelte 官方网站"]',title)
      await click('[data-testid="bookmark-modal"] button[type="submit"]')
      await wait(()=>!document.querySelector('[data-testid="bookmark-modal"]'))
      bookmarks[index].title=title
      const saved=(await api('/admin/data',undefined,'GET')).bookmarks.find(item=>item.id===bookmarks[index].id)
      assert(saved?.title===title&&saved.icon===expected&&saved.icon_source==='custom','Metadata edit lost authoritative image fields')
      report.cases.at(-1).recordAfter={index,titleMatched:true,iconRetained:true,sourceRetained:true}
    }
    return {publicAndPrivate:true,projectedSnapshotConfirmed:true,originalSourceVerifiedBeforeSubmit:true,serverImageRetained:true}
  })
  const titleCase=await scenario('28-EDIT-TITLE-SAVE', async () => stableOperation(async () => {
    await edit(0); const title='Browser edited '+run
    await fill('[data-testid="bookmark-modal"] input[placeholder="例如：Svelte 官方网站"]',title)
    await click('[data-testid="bookmark-modal"] button[type="submit"]'); await wait(()=>!document.querySelector('[data-testid="bookmark-modal"]'))
    bookmarks[0].title=title
    const data=await api('/admin/data',undefined,'GET'),saved=data.bookmarks.find(row=>row.id===bookmarks[0].id)
    const retained=saved?.icon===fixtures[bookmarks[0].imageKey].base64Uri
    report.cases.at(-1).recordAfter={titleMatched:saved?.title===title,iconRetained:retained,source:saved?.icon_source??null}
    assert(retained,'Title-only save cleared or changed the stored icon')
  }))
  // Preserve the failure above, then restore only our record so an unrelated
  // auth/menu test is not invalidated by the known title-save regression.
  if(titleCase.status!=='not-run') await setFixtureIcon(0,fixtures[bookmarks[0].imageKey].base64Uri)
  await scenario('29-OFFLINE-FOCUS', async () => {
    await home(); await verifyImages()
    offlineActive=true
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    try { await click(card(1), 'right'); await key('Escape'); await focusCycle(); await sleep(1500); return await verifyImages() }
    finally { await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });offlineActive=false }
  })
  for (const [width, height] of [[1366, 768], [390, 844], [1000, 300]]) await scenario(`30-MENU-${width}x${height}`, async () => {
    await b.setViewport({ width, height, scale: 1 }); await home(); await click(card(2), 'right')
    const geometry = await b.call(() => {
      const menu = document.querySelector('.bookmark-context-menu'), button = menu?.querySelector('[data-testid="bookmark-context-edit"]')
      if (!menu || !button) return null
      const r = menu.getBoundingClientRect(), t = button.getBoundingClientRect(), hit = document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2)
      return { top: r.top, bottom: r.bottom, viewport: innerHeight, hit: hit === button || button.contains(hit), fits: r.top >= 0 && r.bottom <= innerHeight }
    })
    assert(geometry?.fits && geometry.hit, 'Menu inaccessible: ' + JSON.stringify(geometry)); await shot(`30-menu-${width}`)
    await click('[data-testid="bookmark-context-edit"]');await wait(()=>document.querySelector('[data-testid="bookmark-modal"]'));await click('[data-testid="bookmark-modal"] .modal-actions .ghost-button')
    await key('Escape'); await enterSort(); await click(card(2),'right')
    await click('[data-testid="bookmark-context-move"]'); await click('[data-testid="bookmark-context-move-select"]')
    const nested = await b.call(() => { const e = document.querySelector('.bookmark-context-menu .category-tree-menu'); if (!e) return null; const r = e.getBoundingClientRect(); const item=e.querySelector('[role="treeitem"]');return { top:r.top,bottom:r.bottom,height:r.height,rowHeight:item?.getBoundingClientRect().height??32,fits:r.top>=0&&r.bottom<=innerHeight } })
    assert(nested?.fits && nested.height>=nested.rowHeight, 'Nested category menu cannot expose a complete row: '+JSON.stringify(nested)); await key('Escape')
    assert(await b.call(()=>document.activeElement?.getAttribute('data-testid')==='bookmark-context-move-select'),'Inner Escape did not restore selector focus')
    await click('[data-testid="bookmark-context-move-select"]')
    const childChoice=`#category-tree-children-${category.id} .tree-child-option`
    if(!await b.call(sel=>Boolean(document.querySelector(sel)),childChoice)) await click(`.bookmark-context-menu [aria-controls="category-tree-children-${category.id}"]`)
    await click(childChoice)
    await wait((categoryId,bookmarkId)=>!document.querySelector(`[data-sort-category-id="${categoryId}"] [data-sort-id="${bookmarkId}"]`),[category.id,bookmarks[2].id])
    const server=await api('/admin/data',undefined,'GET');assert(server.bookmarks.find(row=>row.id===bookmarks[2].id)?.category_id===category.id,'Sorting draft unexpectedly wrote server data')
    await click('.home-sort-bar .home-sort-cancel')
    await wait((categoryId,bookmarkId)=>Boolean(document.querySelector(`[data-sort-category-id="${categoryId}"] [data-sort-id="${bookmarkId}"]`)),[category.id,bookmarks[2].id])
    return { geometry,nested,editOpened:true,draftMoved:true,cancelRestored:true,serverUnchanged:true }
  })
  await scenario('28-CANCEL-REACQUIRE', async () => {
    await clearCopies()
    let grant=null,firstCopy=null,copies=0,grantReleased=false
    return intercept([{urlPattern:'*/api/icon-access',requestStage:'Response'},{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}],async event=>{
      if(new URL(event.request.url).pathname==='/api/icon-access'&&!grant){grant=event;return true}
      let payload;try{payload=JSON.parse(event.request.postData)}catch{return false}
      if(payload.object_type==='bookmark'&&payload.object_id===bookmarks[2].id){
        copies++
        if(!firstCopy){firstCopy=event;return true}
      }
      return false
    },async()=>{
      try {
        await home({waitForImages:false});await localWait(()=>grant&&firstCopy,'Pending image plus held grant')
        await b.send('Fetch.continueRequest',{requestId:grant.requestId});grantReleased=true
        // The real grant changes the online URL while the copy is pending. Its
        // cancelled owner must not poison the new acquisition.
        await localWait(()=>copies>=2,'Fresh acquisition after pending URL change',10000)
        await verifyImages();
        if(firstCopy.networkId)expectedReacquireRequests.add(firstCopy.networkId)
        return {copyAttempts:copies,grantReleased:true,imageRecovered:true,injectedCanceledRequestId:firstCopy.networkId??null}
      } finally {
        if(grant&&!grantReleased)await b.send('Fetch.continueRequest',{requestId:grant.requestId}).catch(()=>{})
        if(firstCopy)await b.send('Fetch.continueRequest',{requestId:firstCopy.requestId}).catch(()=>{})
      }
    })
  })
  await scenario('28-COPY-503', async () => {
    const variants=[]
    for(const targetIndex of [0,2]) {
      await b.setViewport({width:1366,height:900,scale:1})
      await setFixtureIcon(targetIndex,fixtures[bookmarks[targetIndex].imageKey].uri);await clearCopies()
      let injected=0
      try {variants.push(await intercept([{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}],async event=>{
        let payload;try{payload=JSON.parse(event.request.postData)}catch{return false}
        if(payload.object_type!=='bookmark'||payload.object_id!==bookmarks[targetIndex].id)return false
        injected++;report.cases.at(-1).injection={kind:'target-copy-503',targetIndex,count:injected};if(event.networkId)injectedRequests.add(event.networkId)
        await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'private, no-store'}],body:Buffer.from(JSON.stringify({code:0,msg:'ok',data:{protocol:1,reason:'unavailable'}})).toString('base64')})
        return true
      },async()=>{await home();await verifyImages();assert(injected>0,'Copy fault not exercised');await shot('28-copy-fallback-'+targetIndex);return {private:targetIndex===2,injected,images:'correct'}}))}
      finally {await setFixtureIcon(targetIndex,fixtures[bookmarks[targetIndex].imageKey].base64Uri)}
    }
    return {variants}
  })
  await scenario('28-COPY-TIMEOUT', async () => {
    // Use one public fixture: startup private-grant URL replacement is covered
    // by CANCEL-REACQUIRE and must not masquerade as this transport deadline.
    const target = manifest().find(row => row.key === 'bookmark:' + bookmarks[0].id)
    const entry = report.cases.at(-1)
    const evidence = entry.timeout = { object:target.key, expectedDeadlineMs:10000, deadlineWindowMs:[9000,15000], held:[], recovery:{} }
    await clearCopies() // real settings UI, then the target view is unmounted
    evidence.cold = await readFixtureCopy(target.key)
    assert(evidence.cold.available && evidence.cold.enabled && !evidence.cold.entryPresent && !evidence.cold.bodyPresent, 'Timeout requires native cold entry AND body absence')
    const beforeDocument = await b.call(() => performance.timeOrigin)
    // Bypass both HTTP cache and SW, not the app loader or its authorization.
    // Otherwise a previously displayed normal image could fake network recovery.
    const start = report.requests.length
    let faultSucceeded = false, urlTraceScript = null
    try {
      await b.send('Network.setCacheDisabled', { cacheDisabled:true })
      await b.send('Network.setBypassServiceWorker', { bypass:true })
      urlTraceScript=(await b.send('Page.addScriptToEvaluateOnNewDocument',{source:'if(window.__issueUrls)window.__issueUrls.active=true'})).identifier
      await intercept([{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}], async event => {
        let payload; try { payload=JSON.parse(event.request.postData) } catch { return false }
        if (new URL(event.request.url).origin !== base || payload.object_type !== 'bookmark' || payload.object_id !== bookmarks[0].id) return false
        assert(event.networkId, 'Held copy has no Network requestId')
        evidence.held.push({requestId:event.networkId,fetchRequestId:event.requestId,heldAt:Date.now()})
        // No fulfill/fail/continue call: ONLY the actual frontend may time out.
        await persist()
        return true
      }, async () => {
        try {
          await home({waitForImages:false})
          evidence.newDocument = await b.call(() => performance.timeOrigin) !== beforeDocument
          assert(evidence.newDocument, 'Cold timeout cannot reuse in-memory loader handles')
          await localWait(() => evidence.held.length > 0, 'Fixture copy suspension', 10000)
          const held = evidence.held[0]
          assert(await b.call(()=>window.__issueUrls?.active===true),'Copy timeout tracing was not active at document start')
          await localWait(() => requests.get(held.requestId)?.error, 'Frontend timeout cancellation', 16000)
          const row = requests.get(held.requestId)
          evidence.abortElapsedMs = (row.failureTime-row.time)*1000
          assert(row.canceled && row.error === 'net::ERR_ABORTED' && row.status == null && evidence.abortElapsedMs >= 9000 && evidence.abortElapsedMs <= 15000, 'Held transport was not cancelled by the 10s deadline')
          // The actual normal renderer fetches the proxy and creates a Blob.
          // Require a newly created displayed URL, not a hot copy or diagnostic fetch.
          evidence.displayed = await wait(selector => {
            const image = document.querySelector(selector)?.querySelector('img')
            if (!image?.complete || !image.naturalWidth || !image.src.startsWith('blob:')) return null
            const state = window.__issueUrls, id = state.ids.get(image.src)
            const created = state.events.find(event => event.kind === 'create' && event.id === id)
            return created ? {kind:'blob',id,createdWallTime:performance.timeOrigin+created.at,observedWallTime:performance.timeOrigin+performance.now(),bytes:created.size,mime:created.mime} : null
          }, [target.selector], 5000)
          const observed = await b.call(collectIconFixtures, [target])
          evidence.pixels = evaluateIconFixtures([target], observed)
          evidence.afterTimeout = await readFixtureCopy(target.key)
          const proxy = report.requests.slice(start).find(row => row.kind === 'icon-body' && row.object === target.key && row.type === 'Fetch' && row.time >= requests.get(held.requestId).failureTime-0.1 && row.status === 200)
          if (proxy) await localWait(() => Number.isFinite(proxy.finishedTime), 'Ordinary proxy body completion', 1500)
          evidence.fallback = assessCopyTimeoutFallback(report.requests.slice(start), {
            object:target.key, requestId:held.requestId, proxyRequestId:proxy?.requestId, cold:evidence.cold, afterTimeout:evidence.afterTimeout,
            displayed:evidence.displayed, pixelsPassed:evidence.pixels.passed,
          })
          evidence.proxyRequestId = proxy?.requestId
          assert(evidence.held.length === 1, 'Repeated copy attempts before fallback verification; inspect held request journal')
          assert(evidence.fallback.passed, 'Timeout fallback: '+JSON.stringify(evidence.fallback))
          for (const id of evidence.fallback.expectedCanceledRequests) expectedTimeoutRequests.add(id)
          faultSucceeded = true
        } catch (error) {
          // Persist the failed state BEFORE disabling Fetch can release a held
          // request and make the page look healed. scenario() preserves failure.
          evidence.failure = safe(error.message)
          evidence.failureStorage = await readFixtureCopy(target.key).catch(error => ({error:safe(error.message)}))
          await shot('28-copy-timeout-before-restore').catch(error => { evidence.screenshotError=safe(error.message) })
          await persist()
          throw error
        }
      }) // existing finally disables Fetch even when the timed assertions fail
      evidence.recovery.restoredWallTime = Date.now()
      evidence.recovery.interceptionDisabled = true
      await persist()
      // Let the mounted icon's real bounded retry reacquire; do not call the
      // loader, fetch the copy manually, edit the icon, or clear IDB a second time.
      await localWait(() => report.requests.slice(start).some(row => row.kind === 'icon-copy' && row.object === target.key && row.wallTime*1000 >= evidence.recovery.restoredWallTime && row.status === 200 && row.copyResult?.hasImage), 'Fresh real frontend copy after restoring interception', 20000)
      const recovered = report.requests.slice(start).find(row => row.kind === 'icon-copy' && row.object === target.key && row.wallTime*1000 >= evidence.recovery.restoredWallTime && row.status === 200 && row.copyResult?.hasImage)
      await wait((selector, previousId) => {
        const image=document.querySelector(selector)?.querySelector('img')
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:') && window.__issueUrls.ids.get(image.src) !== previousId
      }, [target.selector, evidence.displayed.id], 10000)
      evidence.recovery.pixels = await verifyImages([target])
      evidence.recovery.persisted = await readFixtureCopy(target.key)
      evidence.recovery.result = assessCopyTimeoutRecovery(report.requests.slice(start), {
        object:target.key, requestId:recovered.requestId, restoredWallTime:evidence.recovery.restoredWallTime,
        persisted:evidence.recovery.persisted, blobDisplayed:true, pixelsPassed:evidence.recovery.pixels.passed,
      })
      assert(evidence.recovery.result.passed, 'Timeout recovery: '+JSON.stringify(evidence.recovery.result))
      const unexpected = report.requests.slice(start).filter(row => row.error && !expectedTimeoutRequests.has(row.requestId))
      assert(!unexpected.length, 'Unrelated network failures: '+JSON.stringify(unexpected.map(row=>({requestId:row.requestId,error:row.error}))))
      await shot('28-copy-timeout-recovered')
      return {object:target.key, expectedCanceledRequests:evidence.fallback.expectedCanceledRequests, proxyRequestId:evidence.proxyRequestId,
        abortElapsedMs:evidence.fallback.abortElapsedMs, imageElapsedMs:evidence.fallback.imageElapsedMs, freshCopyRequestId:recovered.requestId, nativeStorageVerified:true}
    } finally {
      // Always attempt all three restorations; a cleanup error remains a failure.
      const restored = await Promise.allSettled([
        b.send('Fetch.disable'), b.send('Network.setCacheDisabled',{cacheDisabled:false}), b.send('Network.setBypassServiceWorker',{bypass:false}),
        urlTraceScript?b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:urlTraceScript}):Promise.resolve(),
        b.call(()=>{if(window.__issueUrls)window.__issueUrls.active=false}),
      ])
      evidence.restoration = {faultSucceeded, fetchDisabled:restored[0].status==='fulfilled', httpCacheRestored:restored[1].status==='fulfilled', serviceWorkerRestored:restored[2].status==='fulfilled',
        errors:restored.filter(row=>row.status==='rejected').map(row=>safe(row.reason.message))}
      await persist()
      assert(!evidence.restoration.errors.length, 'Timeout probe restoration failed: '+JSON.stringify(evidence.restoration))
    }
  })
  await scenario('29-OLD-ADMIN-RESPONSE', async () => {
    await home({waitForImages:false}); let held=null, forced=false
    return intercept([{urlPattern:'*/api/data/version*',requestStage:'Response'},{urlPattern:'*/api/admin/data',requestStage:'Response'}],async event=>{
      const pathname=new URL(event.request.url).pathname
      if(pathname==='/api/data/version'&&!forced){
        const response=await b.send('Fetch.getResponseBody',{requestId:event.requestId})
        const envelope=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
        assert(envelope.code===0&&envelope.data,'Version response not usable for controlled stale-version test')
        envelope.data.version='browser-test-'+run;forced=true
        await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'no-store'}],body:Buffer.from(JSON.stringify(envelope)).toString('base64')});return true
      }
      if(pathname==='/api/admin/data'&&!held){held=event;return true}return false
    },async()=>{
      await focusCycle();await localWait(()=>held,'Old admin aggregate response')
      await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
      await b.send('Fetch.continueRequest',{requestId:held.requestId});await sleep(1500)
      assert(await b.call(id=>!document.querySelector(`[data-sort-id="${id}"]`)&&!localStorage.getItem('cf-navs.auth'),bookmarks[2].id),'Old admin response restored private state')
      return {oldResponseReleased:true,privateStayedRemoved:true}
    })
  })
  await scenario('29-OLD-ANONYMOUS-RESPONSE', async () => {
    await home({waitForImages:false});await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'));await b.waitForNetworkIdle(1000,15000)
    let held=null,forced=false
    return intercept([{urlPattern:'*/api/data/version*',requestStage:'Response'},{urlPattern:'*/api/public/data',requestStage:'Response'}],async event=>{
      const pathname=new URL(event.request.url).pathname
      if(pathname==='/api/data/version'&&!forced){
        const response=await b.send('Fetch.getResponseBody',{requestId:event.requestId})
        const envelope=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
        assert(envelope.code===0&&envelope.data,'Anonymous version response unavailable');envelope.data.version='anonymous-test-'+run;forced=true
        await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'no-store'}],body:Buffer.from(JSON.stringify(envelope)).toString('base64')});return true
      }
      if(pathname==='/api/public/data'&&!held){held=event;return true}return false
    },async()=>{
      await focusCycle();await localWait(()=>held,'Old anonymous aggregate response');await signInPlace()
      const current=token;await wait(id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),[bookmarks[2].id])
      await b.send('Fetch.continueRequest',{requestId:held.requestId});await sleep(1500)
      assert(await b.call((id,expected)=>Boolean(document.querySelector(`[data-sort-id="${id}"]`))&&JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,bookmarks[2].id,current),'Old anonymous data hid the authenticated private object')
      return {oldResponseReleased:true,privateObjectRetained:true}
    })
  })
  await scenario('29-LOGOUT-LOGIN-INTENT', async () => {
    await home()
    let held = null
    return intercept([{ urlPattern: '*/api/public/data*', requestStage: 'Response' }, { urlPattern: '*/api/data/version*', requestStage: 'Response' }], async event => {
      const authenticated = Object.entries(event.request.headers ?? {}).some(([key, value]) => key.toLowerCase() === 'authorization' && String(value).startsWith('Bearer '))
      if (held || authenticated) return false
      held = event
      return true
    }, async () => {
      await homeAction('logout')
      await wait(() => !localStorage.getItem('cf-navs.auth'))
      await localWait(() => held, 'Logout public refresh')
      await homeAction('login')
      await fill('input[autocomplete="username"]', 'Synthetic pending login')
      report.cases.at(-1).preconditions = { logoutRefreshHeld: true, newLoginOpened: true, heldPath: new URL(held.request.url).pathname }
      await b.send('Fetch.continueRequest', { requestId: held.requestId })
      await sleep(1500)
      const retained = await b.call(() => ({ open: Boolean(document.querySelector('[aria-labelledby="login-modal-title"]')), value: document.querySelector('input[autocomplete="username"]')?.value === 'Synthetic pending login' }))
      assert(retained.open && retained.value, 'Late logout completion dismissed the newer login intent')
      return { pendingLoginRetained: true, typedValueRetained: true }
    })
  })
  await scenario('29-OLD-401', async () => {
    await home({waitForImages:false}); const previousToken=token; let held=null
    return intercept([{urlPattern:'*/api/data/version*',requestStage:'Response'}],async event=>{
      if(held) return false; held=event; return true
    },async()=>{
      await focusCycle(); await localWait(()=>held,'Old version response')
      const heldDocument=await b.call(()=>performance.timeOrigin)
      await homeAction('logout'); await wait(()=>!localStorage.getItem('cf-navs.auth'))
      await signInPlace(); const currentToken=token
      assert(currentToken&&currentToken!==previousToken,'Fresh-session prerequisite failed')
      await wait(id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),[bookmarks[2].id])
      await click(scope()+' .scope-root-trigger')
      for(const item of manifest()) {
        await wait(sel=>{const element=document.querySelector(sel),img=element?.querySelector('img');if(element&&(!img?.complete||!img.naturalWidth))element.scrollIntoView({block:'center',behavior:'instant'});return img?.complete&&img.naturalWidth>0},[item.selector],60000)
      }
      const beforeImages=await verifyImages()
      assert(await b.call(()=>performance.timeOrigin)===heldDocument,'Old-401 setup navigated away from its held response')
      report.cases.at(-1).preconditions={freshSession:true,privateVisibleBeforeRelease:true,imagesReadyBeforeRelease:beforeImages.passed,sameDocument:true}
      if(held.networkId) injectedRequests.add(held.networkId)
      await b.send('Fetch.fulfillRequest',{requestId:held.requestId,responseCode:401,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'no-store'}],body:Buffer.from(JSON.stringify({code:1001,msg:'Injected old session failure',data:null})).toString('base64')})
      await sleep(1500)
      const retained=await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,currentToken)
      report.cases.at(-1).afterRelease={sessionRetained:retained}
      assert(retained,'Old 401 cleared new session')
      for(const item of manifest())await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center',behavior:'instant'}),item.selector)
      await verifyImages(); return {oldResponseDelivered:true,newSessionRetained:true,imagesReadyBeforeRelease:true}
    })
  })
  await scenario('29-CROSS-TAB-LOGOUT', async () => {
    await home({waitForImages:false}); secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
    const {sessionId}=await b.send('Target.attachToTarget',{targetId:secondary,flatten:true})
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable']) await sessionSend(sessionId,method)
    try {
      await sessionSend(sessionId,'Page.navigate',{url:base})
      let ready=false
      for(let i=0;i<100;i++){ready=await sessionCall(sessionId,id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),bookmarks[2].id);if(ready)break;await sleep(150)}
      assert(ready,'Private fixture missing in the second authenticated tab')
      await b.send('Target.activateTarget',{targetId:b.targetId});await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
      let removed=false
      for(let i=0;i<100;i++){removed=await sessionCall(sessionId,id=>!document.querySelector(`[data-sort-id="${id}"]`)&&!localStorage.getItem('cf-navs.auth'),bookmarks[2].id);if(removed)break;await sleep(100)}
      assert(removed,'Other tab retained private data after logout')
      const clearedAt = await b.call(() => (performance.timeOrigin + performance.now()) / 1000)
      for (const row of report.requests) if (row.stage === stage && row.path === '/api/logout') row.clientClearedAt = clearedAt
      await signInPlace()
      return {privatePresentBefore:true,privateRemovedInOtherTab:true}
    } finally {await b.send('Target.closeTarget',{targetId:secondary});secondary=null;await b.send('Target.activateTarget',{targetId:b.targetId})}
  })
  for (const failure of ['quota','unavailable']) await scenario('28-STORAGE-'+failure.toUpperCase(), async () => {
    await clearCopies()
    const source=failure==='quota'
      ? `(()=>{const put=IDBObjectStore.prototype.put;window.__storageFaultHits=0;IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='cf-navs-object-icons-v1'&&this.name==='bodies'){window.__storageFaultHits++;throw new DOMException('Injected quota fault','QuotaExceededError')}return put.apply(this,args)}})()`
      : `(()=>{const open=IDBFactory.prototype.open;window.__storageFaultHits=0;IDBFactory.prototype.open=function(name,...args){if(name==='cf-navs-object-icons-v1'){window.__storageFaultHits++;throw new DOMException('Injected unavailable storage','SecurityError')}return open.call(this,name,...args)}})()`
    const {identifier}=await b.send('Page.addScriptToEvaluateOnNewDocument',{source})
    try {await home(); const hits=await b.call(()=>window.__storageFaultHits);report.cases.at(-1).injection={kind:failure,count:hits};assert(hits>0,'Storage fault not exercised');return await verifyImages()}
    finally {await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});await b.navigate(base)}
  })
  await scenario('28-CLOCK-BEHIND-600MS', async () => {
    const {identifier}=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const now=Date.now.bind(Date);Date.now=()=>now()-600})()`})
    try {await home();return await verifyImages()}finally{await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});await b.navigate(base)}
  })
  await scenario('28-CATEGORY-PERMISSIONS', async()=>{
    await home(); await verifyImages()
    const evidence=report.cases.at(-1).categoryPermissions={responses:[]}
    const hashes={root:createHash('sha256').update(Buffer.from(fixtures.category.base64Uri.split(',')[1],'base64')).digest('hex'),
      child:createHash('sha256').update(Buffer.from(fixtures.bookmark.base64Uri.split(',')[1],'base64')).digest('hex')}
    async function probe(label, route, {body,authorization,status=200}={}) {
      // Server permission/header probes are distinct from the UI image evidence.
      // Host fetch has no browser cookie jar; tokens and response bodies stay in memory.
      const response=await fetch(base+'/api'+route,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{'content-type':'application/json',...(authorization?{authorization:'Bearer '+authorization}:{})},
        ...(body?{body:JSON.stringify(body)}:{})})
      const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type')??''
      const payload=type.includes('application/json')?JSON.parse(bytes.toString()):null
      const row={label,status:response.status,type,cache:response.headers.get('cache-control'),cdn:response.headers.get('cdn-cache-control'),
        cloudflare:response.headers.get('cloudflare-cdn-cache-control'),fallback:response.headers.get('x-icon-fallback'),
        hash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,code:payload?.code,reason:payload?.data?.reason,
        protocol:payload?.data?.protocol,persistence:payload?.data?.persistence,
        imageHash:payload?.data?.image?createHash('sha256').update(Buffer.from(payload.data.image.base64,'base64')).digest('hex'):null}
      evidence.responses.push(row)
      assert(row.status===status,label+' status='+row.status)
      assert(row.cache?.includes('no-store'),label+' lacks client no-store')
      if(body)assert(row.cache.includes('private')&&row.cdn==='no-store'&&row.cloudflare==='no-store',label+' lacks private copy cache headers')
      return row
    }
    async function copyPayload(id) {
      const data=await api('/admin/data',undefined,'GET'),item=data.categories.find(row=>row.id===id)
      return {protocol:1,object_type:'category',object_id:id,dataset_epoch:data.dataset_epoch,
        expected_write_epoch:item?.icon_write_epoch??0,expected_content_revision:item?.icon_revision??null}
    }
    const rootUrl='/category-icon/'+category.id,childUrl='/category-icon/'+child.id
    const missingId=2147483647
    assert(!(await api('/admin/data',undefined,'GET')).categories.some(row=>row.id===missingId),'Missing-ID control exists')
    let changed=false
    try {
      assert((await probe('anonymous-public-root',rootUrl)).hash===hashes.root,'Public root bytes differ')
      assert((await probe('anonymous-public-child',childUrl)).hash===hashes.child,'Public child bytes differ')
      const payload=await copyPayload(child.id)
      const anonymousCopy=await probe('anonymous-copy-denied','/icon-local-copy',{body:payload,status:401})
      assert(anonymousCopy.code===1001,'Anonymous copy was not an auth denial')
      assert((await probe('anonymous-missing-copy','/icon-local-copy',{body:{...payload,object_id:missingId},status:401})).hash===anonymousCopy.hash,'Anonymous copy revealed object existence')
      const grant=await api('/icon-access',undefined,'GET')
      assert((await probe('signature-is-not-session','/icon-local-copy',{body:payload,authorization:grant.key,status:401})).code===1001,'Image signature authenticated a copy')
      const missing=await probe('authenticated-missing-copy','/icon-local-copy',{body:{...payload,object_id:missingId},authorization:token,status:404})
      assert(missing.reason==='not-found','Unknown copy leaked another result')
      changed=true
      await api('/categories/'+category.id,{title:category.title,icon:fixtures.category.base64Uri,is_private:true},'PUT')
      const unknown=await probe('anonymous-missing-icon','/category-icon/'+missingId)
      for(const [label,url] of [['private-root',rootUrl],['private-ancestor-child',childUrl]]) {
        const denied=await probe(label,url)
        assert(denied.fallback==='1'&&denied.hash===unknown.hash,label+' leaked private image identity')
      }
      assert((await probe('invalid-signature-child',childUrl+'?key=invalid-fixture-key')).hash===unknown.hash,'Invalid signature bypassed the private ancestor')
      const signed=await probe('signed-private-child',childUrl+'?key='+encodeURIComponent(grant.key))
      assert(signed.hash===hashes.child&&signed.cache.includes('private'),'Valid signature did not preserve private preview semantics')
      const authorized=await probe('admin-private-descendant-copy','/icon-local-copy',{body:await copyPayload(child.id),authorization:token})
      assert(authorized.protocol===1&&authorized.persistence==='session-scoped'&&authorized.imageHash===hashes.child,'Administrator lost authorized child copy')
      await home(); await verifyImages();evidence.adminImages=true
      await api('/categories/'+category.id,{title:category.title,icon:fixtures.category.base64Uri,is_private:false},'PUT');changed=false
      assert((await probe('anonymous-restored-child',childUrl)).hash===hashes.child,'Public restoration retained a denied response')
      await home();await verifyImages();evidence.restoredImages=true
      return evidence
    } finally {
      if(changed)await api('/categories/'+category.id,{title:category.title,icon:fixtures.category.base64Uri,is_private:false},'PUT')
    }
  })
  await scenario('CSP-THEME-COLOR', async()=>{
    await b.setViewport({width:1366,height:900,scale:1});await home()
    const samples=[]
    for(let i=0;i<3;i++) {
      await wait(()=>document.querySelector('meta[name="theme-color"]')?.content===(document.documentElement.dataset.theme==='dark'?'#08111f':'#f8fafc'))
      samples.push(await b.call(()=>({theme:document.documentElement.dataset.theme,color:document.querySelector('meta[name="theme-color"]').content})))
      if(i<2){await homeAction('theme');await b.call(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(true))))}
    }
    assert(new Set(samples.map(s=>s.theme)).size===2,'Both theme modes were not exercised')
    const documents=report.requests.filter(row=>row.type==='Document'&&row.status===200)
    const headers=documents.at(-1)?.headers??{}
    const policy=Object.entries(headers).find(([name])=>name.toLowerCase()==='content-security-policy')?.[1]??''
    const cache=Object.entries(headers).find(([name])=>name.toLowerCase()==='cache-control')?.[1]??''
    assert(policy.includes("script-src 'self' blob:")&&!policy.match(/script-src[^;]*unsafe-inline/),'HTML did not retain the strict script policy')
    assert(cache.includes('no-transform'),'HTML can still be modified by the delivery proxy')
    return {samples,strictPolicy:true,noTransform:true}
  })
  await scenario('28-RELOGIN-ICONS',async()=>{
    await home({waitForImages:false});await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
    await login();await home();return await verifyImages()
  })
  await scenario('29-LOGOUT', async () => {
    await b.setViewport({ width: 1366, height: 900, scale: 1 }); await home()
    await homeAction('logout'); await wait(() => !localStorage.getItem('cf-navs.auth'))
    await wait(title => ![...document.querySelectorAll('.bookmark-card-shell')].some(e => e.getAttribute('aria-label') === title), [bookmarks[2].title])
    return { privateRemoved: true }
  })
  report.limitations.push('Real elapsed-time expiry, mixed-build upgrade/rollback and physical mobile keyboard remain unexecuted; not implied by clock-controlled or desktop results.')
  if(disableQuic)report.limitations.push('QUIC was disabled only for this diagnostic browser; passing does not establish default HTTP/3 acceptance.')
} catch (error) { report.fatal = safe(error.message); console.log('FATAL ' + report.fatal) }
finally {
  stage = 'cleanup'
  try {
    await b.send('Fetch.disable',{},5000)
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },5000)
  } catch { report.cleanup.pagePreparationFailed=true }
  await Promise.allSettled([...responseReads])
  await collectImageLifecycle('before-server-cleanup')
  if (secondary) await b.send('Target.closeTarget', { targetId: secondary }).catch(() => {})
  try {
    await b.send('Page.setWebLifecycleState',{state:'frozen'},5000)
    if(cleanupFault==='detached-page') {
      await b.send('Target.detachFromTarget',{sessionId:b.sessionId},5000)
      let rejected=false
      try { await b.send('Runtime.evaluate',{expression:'1',returnByValue:true},1000) } catch { rejected=true }
      assert(rejected,'Detached cleanup fault did not disable page evaluation')
      report.cleanup.injectedFault={kind:cleanupFault,pageEvaluationUnavailable:true}
    }
  } catch (error) { report.cleanup.preparationError=safe(error.message) }
  // No page evaluation here: preserve cleanup even when renderer/CDP has failed.
  Object.assign(report.cleanup,await serverCleanup.cleanup({categories:ownedCategories,bookmarks:ownedBookmarks}))
  report.cleanup.sessionCaptureErrors=sessionCaptureErrors
  imageRequestUrls.clear()
  report.cleanup.browser = await b.cleanup()
  for(const packet of observedCopyResponses){
    const candidates=report.requests.filter(row=>row.kind==='icon-copy'&&row.object===packet.object&&row.status===packet.status&&
      ['dataset_epoch','expected_write_epoch','expected_content_revision'].every(key=>row.copyRequest?.[key]===packet.request?.[key])&&Math.abs(row.wallTime*1000-packet.start)<1000)
    candidates.sort((a,b)=>Math.abs(a.wallTime*1000-packet.start)-Math.abs(b.wallTime*1000-packet.start))
    if(candidates[0]){candidates[0].copyResult=packet.result;candidates[0].responseEvidence='observed-clone'}
  }
  const protocolConflicts=new Set(validatedIconConflicts(report.requests))
  report.validatedConflicts=[...protocolConflicts]
  const expectedInjectedCancellations = new Set([...expectedTimeoutRequests,...expectedReacquireRequests])
  const canceledHttp=new Set(report.requests.filter(row=>isExpectedInjectedCancellation(row,expectedInjectedCancellations)&&isCanceledNetworkResponse(row)).map(row=>row.requestId))
  report.canceledResponses=[...canceledHttp]
  const revokedRequests = new Set(verifiedLogoutFailures(report.requests))
  report.verifiedLogoutFailures = [...revokedRequests]
  report.unexpectedHttp = report.requests.filter(e => e.status >= 400 && !injectedRequests.has(e.requestId) && !protocolConflicts.has(e.requestId) && !canceledHttp.has(e.requestId) && !revokedRequests.has(e.requestId))
  report.verifiedSignedImageReplacements = verifiedSignedImageReplacements(report.requests, report.imageLifecycles)
  const signedImageCancellations = new Set(report.verifiedSignedImageReplacements.map(row=>row.requestId))
  report.verifiedEditCopyCancellations=verifiedEditCopyCancellations(report.requests,report.cases)
  const editedCopyCancellations=new Set(report.verifiedEditCopyCancellations.map(row=>row.requestId))
  report.verifiedNativeCategoryRetries=verifiedNativeCategoryRetries(report.requests,report.imageLifecycles)
  const nativeCategoryRetries=new Set(report.verifiedNativeCategoryRetries.map(row=>row.requestId))
  report.verifiedNavigationImageCancellations=verifiedNavigationImageCancellations(report.requests,report.navigations)
  const navigationImageCancellations=new Set(report.verifiedNavigationImageCancellations.map(row=>row.requestId))
  report.failedRequests = report.requests.filter(e => e.error)
  report.expectedOfflineRequests=[...expectedOfflineRequests]
  report.expectedTimeoutRequests=[...expectedTimeoutRequests]
  report.expectedReacquireRequests=[...expectedReacquireRequests]
  report.validatedInjectedCancellations=report.failedRequests.filter(row=>isExpectedInjectedCancellation(row,expectedInjectedCancellations)).map(row=>row.requestId)
  report.unexpectedFailures=report.failedRequests.filter(e=>!expectedOfflineRequests.has(e.requestId)&&!isExpectedInjectedCancellation(e,expectedInjectedCancellations)&&!signedImageCancellations.has(e.requestId)&&!editedCopyCancellations.has(e.requestId)&&!nativeCategoryRetries.has(e.requestId)&&!navigationImageCancellations.has(e.requestId))
  report.consoleFindings=report.browserLog.filter(e=>e.level==='error'&&!injectedRequests.has(e.requestId)&&!protocolConflicts.has(e.requestId)&&!(e.source==='network'&&(canceledHttp.has(e.requestId)||expectedOfflineRequests.has(e.requestId)||report.validatedInjectedCancellations.includes(e.requestId)||signedImageCancellations.has(e.requestId)||editedCopyCancellations.has(e.requestId)||nativeCategoryRetries.has(e.requestId)||navigationImageCancellations.has(e.requestId)||revokedRequests.has(e.requestId))))
  report.injectedRequests=[...injectedRequests]
  await persist()
  console.log(JSON.stringify({ output, cases: report.cases.map(({id,status})=>({id,status})), cleanup: report.cleanup, fatal: report.fatal }))
  if (report.fatal || report.interceptionError || report.imageLifecycleErrors.length || report.unexpectedHttp.length || report.unexpectedFailures.length || report.consoleFindings.length || report.cases.some(c => c.status === 'failed') || !report.cleanup.serverFixturesRemoved || !report.cleanup.sessionRevoked || report.cleanup.preparationError || report.cleanup.pagePreparationFailed || sessionCaptureErrors.length || report.cleanup.errors?.length || !report.cleanup.browser.profileRemoved || report.cleanup.browser.errors.length || report.cleanup.browser.warnings.length) process.exitCode = 1
}

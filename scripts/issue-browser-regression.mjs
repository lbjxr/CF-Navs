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
import { verifiedSignedImageReplacements, verifiedNativeCategoryRetries, verifiedNavigationImageCancellations, verifiedUiImageCancellations, verifiedLocalImageAdoptions, verifiedLogoutCopyCancellations } from './lib/imageRequestLifecycleEvidence.mjs'
import { createVerificationCleanup } from './lib/verificationCleanup.mjs'
import { resolveBaseUrl, resolveSetting } from './lib/verifyTarget.mjs'
import { requireAdminCredentials, redactCredentials } from './lib/verifyCredentials.mjs'
import { createIconAcceptanceFixtures } from './lib/iconAcceptanceFixtures.mjs'
import { collectIconFixtures, evaluateIconFixtures } from './lib/iconAcceptance.mjs'
import { verifiedInjectedCopyResets, unexecutedRequestedCases, verifiedCategoryFilterCancellations } from './lib/issueBrowserEvidence.mjs'
import { pageInstallIconInterruption } from './lib/iconInterruptionProbe.mjs'
import { pageInstallSnapshotInterruption, pageReadSnapshotScopes } from './lib/snapshotInterruptionProbe.mjs'
import { pageInstallIconPerformanceProbe, pageReadIconStorageAudit, assessIconStorageAudit, pageInstallCapacityCommitProbe, summarizeIconPerformanceRequests } from './lib/iconPerformanceProbe.mjs'
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
for(const failure of ['408','429','500','WRONG-IMAGE'])optionalCases.add('28-COPY-FAILURE-'+failure)
optionalCases.add('29-FROZEN-TAB-LOGOUT')
optionalCases.add('28-PRIVATE-COPY-TIMEOUT')
optionalCases.add('28-PRIVATE-COPY-TIMEOUT-SLOW-PROXY')
optionalCases.add('28-COPY-CONNECTION-RESET')
for(const id of ['29-DECODE-LOGOUT','29-DECODE-RELOGIN','29-DECODE-FROZEN-LOGOUT','28-IDB-TRANSACTION-ABORT'])optionalCases.add(id)
optionalCases.add('29-OLD-401-DURING-INITIALIZATION')
optionalCases.add('29-PENDING-WRITE-LOGOUT')
for(const id of ['28-CATEGORY-EDIT-REFRESH','28-CATEGORY-MOBILE-MOVE','28-CATEGORY-PRIVACY'])optionalCases.add(id)
optionalCases.add('28-CATEGORY-FILTER-CANCEL')
optionalCases.add('28-PERFORMANCE-FLOW')
optionalCases.add('28-CAPACITY-EVICTION')
optionalCases.add('28-NATIVE-UI-TEARDOWN')
const snapshotCases = [
  ['local','before',false,false], ['local','after',true,false],
  ['cache','before',false,false], ['cache','after',true,false],
  ['cache','before',false,true], ['cache','after',true,true],
].map(([storage,boundary,relogin,frozen])=>({storage,boundary,relogin,frozen,id:`29-SNAPSHOT-${storage.toUpperCase()}-${boundary.toUpperCase()}-${frozen?'FROZEN-':''}${relogin?'RELOGIN':'LOGOUT'}`}))
for (const item of snapshotCases) optionalCases.add(item.id)
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
report.categoryFilters=[]
report.uiTransitions=[]
const authSessions = new Map() // Raw headers stay in memory, never in reports.
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
    const captured = await b.call(async urls => {
      const probe=window.__issueImageLifecycle
      if(!probe)return null
      const snapshot=probe.read(),adoptions=await probe.readAdoptions()
      return {snapshot:{...snapshot,adoptions},sourceIds:urls.map(url=>probe.sourceId(url)),baseSourceIds:urls.map(url=>{const base=new URL(url);base.searchParams.delete('retry');return probe.sourceId(base.href)})}
    }, rows.map(row=>imageRequestUrls.get(row.requestId)))
    if (!captured) throw new Error('Image lifecycle probe missing in active document')
    rows.forEach((row,index)=>{row.imageLifecycle={timeOrigin:captured.snapshot.timeOrigin,sourceId:captured.sourceIds[index],baseSourceId:captured.baseSourceIds[index]}})
    for(const adoption of captured.snapshot.adoptions){
      const persisted=await b.call(pageReadFixtureCopy,adoption.object)
      adoption.persisted=Boolean(persisted.entryPresent&&persisted.bodyPresent&&persisted.bodyRevision===adoption.revision&&persisted.descriptor?.content_revision===adoption.revision)
    }
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
  const windowsVirtualKeyCode=({Escape:27,Tab:9,Enter:13,ArrowDown:40,ArrowUp:38,Home:36})[key]??0
  const text=key==='Enter'&&modifiers===0?'\r':''
  await b.send('Input.dispatchKeyEvent', { type: text?'keyDown':'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode, ...(text?{text,unmodifiedText:text}:{}) })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode })
}
async function fill(selector, value) {
  await click(selector)
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
  await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17})
  const inputAt=Date.now()
  if(value==='') {
    await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8})
    await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8})
  } else await b.send('Input.insertText',{text:value})
  assert(await b.call((sel,expected)=>document.querySelector(sel)?.value===expected,selector,value),'Field replacement verification failed: '+selector)
  return {inputAt}
}
async function tap(selector) {
  const point=await wait(sel=>{const e=document.querySelector(sel);if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return r.width&&r.height&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&(hit===e||e.contains(hit))?{x,y}:null},[selector])
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:3,radiusY:3,force:1}]})
  await sleep(60)
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
}
const categoryDialog='[aria-labelledby="category-modal-title"]'
async function categoryPanel() {
  if(!await b.call(()=>Boolean(localStorage.getItem('cf-navs.auth'))))await login()
  const enteredAt=Date.now(),authSession=authSessions.get('Bearer '+token)
  await homeAction('admin');await wait(()=>document.querySelector('[data-testid="admin-tab-categories"]'))
  await click('[data-testid="admin-tab-categories"]')
  const beforeIds=await b.call(()=>[...document.querySelectorAll('.admin-compact-card[data-category-id]')].map(e=>Number(e.dataset.categoryId)))
  const {inputAt}=await fill('[data-testid="admin-category-search"]',run)
  await wait(id=>document.querySelector(`.admin-compact-card[data-category-id="${id}"]`),[category.id])
  const expand=await b.call(id=>{const e=document.querySelector(`[data-testid="admin-category-expand-${id}"]`);return e&&e.getAttribute('aria-expanded')!=='true'},category.id)
  if(expand)await click(`[data-testid="admin-category-expand-${category.id}"]`)
  const after=await b.call((expected,ids)=>({ids:[...document.querySelectorAll('.admin-compact-card[data-category-id]')].map(e=>Number(e.dataset.categoryId)),value:document.querySelector('[data-testid="admin-category-search"]')?.value===expected,auth:JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===ids}),run,token)
  report.categoryFilters.push({stage,enteredAt,inputAt,settledAt:Date.now(),authSession,beforeIds,afterIds:after.ids,matched:after.value&&after.auth&&after.ids.length>0&&after.ids.every(id=>ownedCategories.includes(id))})
}
async function editCategoryUi(id) {
  await categoryPanel()
  const selector=await b.call(id=>{const parent=`.admin-compact-card[data-category-id="${id}"] .admin-inline-actions`;const buttons=[...document.querySelectorAll(parent+' button')],index=buttons.findIndex(e=>e.textContent.trim()==='编辑');return index<0?null:parent+` button:nth-child(${index+1})`},id)
  assert(selector,'Owned category edit button missing')
  await click(selector);await wait(sel=>document.querySelector(sel),[categoryDialog])
}
async function saveCategoryUi(touch=false) {
  const box=await b.call(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}},categoryDialog)
  assert(box.left>=0&&box.right<=box.width+1&&box.top>=0&&box.bottom<=box.height+1&&!box.overflow,'Category dialog exceeds the viewport')
  ;(report.cases.at(-1).categoryLayouts??=[]).push(box)
  const requestStart=report.requests.length
  await (touch?tap:click)(categoryDialog+' button[type="submit"]')
  await wait(sel=>!document.querySelector(sel),[categoryDialog],30000)
  const confirmedAt=Date.now()
  await localWait(()=>report.requests.slice(requestStart).some(row=>row.method==='PUT'&&/^\/api\/categories\/\d+$/.test(row.path)&&Number.isFinite(row.finishedTime)),'Category save response completion')
  const writes=report.requests.slice(requestStart).filter(row=>row.method==='PUT'&&/^\/api\/categories\/\d+$/.test(row.path))
  assert(writes.length===1&&writes[0].status===200,'Category save did not produce one successful write')
  const response=await b.send('Network.getResponseBody',{requestId:writes[0].requestId})
  const envelope=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body),value=envelope.data
  const proof={requestId:writes[0].requestId,id:value?.id,revision:value?.icon_revision,writeEpoch:value?.icon_write_epoch,cached:value?.icon_cached,confirmedAt}
  ;(report.cases.at(-1).categoryMutationResponses??=[]).push(proof)
  assert(envelope.code===0&&ownedCategories.includes(value?.id)&&Object.hasOwn(value,'icon_revision')&&Number.isSafeInteger(value.icon_write_epoch)&&value.icon_write_epoch>=0&&[0,1].includes(value.icon_cached),'Category save response omitted the committed icon identity')
}
async function readOwnedCategory(id) {
  const data=await api('/admin/data',undefined,'GET'),row=data.categories.find(item=>item.id===id)
  assert(row,'Owned category disappeared')
  return row
}
async function prepareCategoryScenario() {
  if(!await b.call(()=>Boolean(localStorage.getItem('cf-navs.auth'))))await login()
  await api('/categories/'+category.id,{title:'Browser regression '+run,parent_id:null,icon:fixtures.category.base64Uri,is_private:false},'PUT')
  await api('/categories/'+child.id,{title:'Browser child '+run,parent_id:category.id,icon:fixtures.bookmark.base64Uri,is_private:false},'PUT')
}
async function homeAction(name) {
  const selector = name==='theme' ? '[data-testid="home-theme-toggle"]' : `[data-testid="home-${name}-button"]`
  let failedClicks=0
  for(let attempt=0;attempt<120;attempt++) {
    if(name==='login'&&await b.call(()=>Boolean(document.querySelector('[aria-labelledby="login-modal-title"]'))))return
    if(name==='admin'&&await b.call(()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]'))))return
    const state=await b.call(sel=>{const e=document.querySelector(sel),r=e?.getBoundingClientRect(),trigger=document.querySelector('[data-testid="home-actions-menu-trigger"]'),t=trigger?.getBoundingClientRect();return {exists:!!e,visible:!!r&&r.width>0&&r.height>0,trigger:!!t&&t.width>0&&t.height>0,expanded:trigger?.getAttribute('aria-expanded')==='true'}},selector)
    if(state.visible){try{
      let transition
      if(name==='admin'){transition={id:report.uiTransitions.length+1,kind:'admin',stage,beforeLoaderId:(await b.send('Page.getFrameTree')).frameTree.frame.loaderId,startedAt:Date.now(),completed:false};report.uiTransitions.push(transition)}
      await click(selector)
      if(transition){await wait(()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]')));Object.assign(transition,{completedAt:Date.now(),afterLoaderId:(await b.send('Page.getFrameTree')).frameTree.frame.loaderId,completed:true})}
      return
    }catch(error){if(!error.message.startsWith('Click failed '+selector)||++failedClicks>=2)throw error}}
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
  await collectImageLifecycle('home-ready')
}
async function verifyImages(items = manifest()) {
  const deadline=Date.now()+15000
  while(true) {
    const observed = await b.call(collectIconFixtures, items)
    const result = evaluateIconFixtures(items, observed)
    if (result.passed) return result
    if (Date.now()>=deadline) { report.cases.at(-1).imageEvidence={result,observed}; throw new Error('Fixture images: ' + result.errors.join(',')) }
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
  if(entry.status==='failed'&&id.startsWith('28-CATEGORY-')&&await b.call(sel=>Boolean(document.querySelector(sel)),categoryDialog).catch(()=>false)) {
    try {await click(categoryDialog+' .modal-header .ghost-button');await wait(sel=>!document.querySelector(sel),[categoryDialog]);entry.uiCleanup={categoryDialogClosed:true}}
    catch(error){entry.uiCleanup={categoryDialogClosed:false,error:safe(error.message)}}
  }
  if(entry.status==='failed'&&['28-CATEGORY-EDIT-REFRESH','28-CATEGORY-MOBILE-MOVE','28-CATEGORY-PRIVACY'].includes(id)) {
    try {await prepareCategoryScenario();entry.fixtureCleanup={restored:true}}
    catch(error){entry.fixtureCleanup={restored:false,error:safe(error.message)}}
  }
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
async function clickInSession(sessionId,selector) {
  let point=null
  for(let i=0;i<100&&!point;i++) {
    point=await sessionCall(sessionId,sel=>{const e=document.querySelector(sel);if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return r.width&&r.height&&(hit===e||e.contains(hit))?{x,y}:null},selector)
    if(!point)await sleep(100)
  }
  assert(point,'Second-tab control is not clickable: '+selector)
  await sessionSend(sessionId,'Input.dispatchMouseEvent',{type:'mouseMoved',button:'none',...point})
  await sessionSend(sessionId,'Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
  await sessionSend(sessionId,'Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
}
async function confirmSecondaryLogout(sessionId,requestStart,evidence) {
  await localWait(()=>report.requests.slice(requestStart).some(row=>row.path==='/api/logout'&&row.method==='POST'&&Number.isFinite(row.finishedTime)),'Secondary logout response completion')
  const rows=report.requests.slice(requestStart).filter(row=>row.path==='/api/logout'&&row.method==='POST')
  assert(rows.length===1&&rows[0].status===200,'Secondary logout request ownership is ambiguous')
  const row=rows[0],response=await sessionSend(sessionId,'Network.getResponseBody',{requestId:row.requestId})
  const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
  assert(body.code===0&&body.data?.revoked===true,'Secondary logout did not confirm server revocation')
  row.logoutRevoked=true
  row.clientClearedAt=await sessionCall(sessionId,()=>(performance.timeOrigin+performance.now())/1000)
  evidence.logout={requestId:row.requestId,serverRevoked:true,clientClearedAt:row.clientClearedAt,source:'secondary-session'}
}
async function installPageInstrumentation(sessionId = null) {
  const send=(method,params)=>sessionId?sessionSend(sessionId,method,params):b.send(method,params)
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`(${pageInstallImageLifecycleProbe.toString()})()`})
  await send('Runtime.addBinding',{name:'__issueCopyObserved'})
  // Observe the same response without substituting bytes or changing the request.
  // Chrome may drop Network.getResponseBody after an owner aborts an already-read
  // response. Retain only protocol metadata, never image bytes or auth headers.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),ids=new Map();let sequence=0;
    const state=window.__issueUrls={active:false,events:[],ids};
    URL.createObjectURL=function(blob){const url=create(blob);ids.set(url,++sequence);window.__issueImageLifecycle?.registerBlob(url,blob);if(state.active&&state.events.length<2000)state.events.push({kind:'create',id:sequence,size:blob.size,mime:blob.type,at:performance.now(),stack:new Error().stack});return url};
    URL.revokeObjectURL=function(url){if(state.active&&state.events.length<2000)state.events.push({kind:'revoke',id:ids.get(url),at:performance.now(),stack:new Error().stack});window.__issueImageLifecycle?.unregisterBlob(url);ids.delete(url);return revoke(url)};
  })()`})
  await send('Log.enable')
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
  b.on('Runtime.bindingCalled',(event,sessionId)=>{if(event.name==='__issueCopyObserved'){try{observedCopyResponses.push({sessionId,...JSON.parse(event.payload)})}catch{}}})
  b.on('Log.entryAdded',({entry})=>{if(['warning','error'].includes(entry.level)) report.browserLog.push({stage,level:entry.level,source:entry.source,requestId:entry.networkRequestId,text:safe(entry.text)})})
  await recordBrowserOwnership('initial')
  b.on('Fetch.requestPaused', event => {
    Promise.resolve(fetchHandler ? fetchHandler(event) : false).then(handled => {
      if (!handled) return b.send('Fetch.continueRequest', { requestId:event.requestId })
    }).catch(error => { report.interceptionError=safe(error.message) })
  })
  b.on('Network.requestWillBeSent', (e,sessionId) => {
    if(e.redirectResponse) {
      const previous=requests.get(e.requestId),response=e.redirectResponse
      if(previous) {
        Object.assign(previous,{status:response.status,redirected:true,terminalKind:'redirect',terminalTime:e.timestamp,durationMs:(e.timestamp-previous.time)*1000,disk:Boolean(response.fromDiskCache),sw:Boolean(response.fromServiceWorker)})
        if(Number.isFinite(response.encodedDataLength))previous.encodedDataLength=response.encodedDataLength
      }
    }
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
    row.cdpSessionId=sessionId
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
    const readBody=()=>row?.cdpSessionId&&row.cdpSessionId!==b.sessionId?sessionSend(row.cdpSessionId,'Network.getResponseBody',{requestId}):b.send('Network.getResponseBody',{requestId})
    if(row?.path==='/api/login' && row.status===200 && row.terminalKind==='finished' && !loginCaptures.has(requestId)) {
      loginCaptures.add(requestId)
      const read=readBody().then(response=>{
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
      const read=readBody().then(response=>{
        const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body)
        row.logoutRevoked=body.code===0 && body.data?.revoked===true
      }).catch(()=>{if(row.logoutRevoked!==true)row.logoutRevoked=false})
      responseReads.add(read);void read.finally(()=>responseReads.delete(read))
      return
    }
    if(row?.kind!=='icon-copy'||![200,409].includes(row.status)) return
    const read=readBody().then(response=>{
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
  await scenario('28-NATIVE-UI-TEARDOWN',async()=>{
    let held=null
    let cancelled=false
    await intercept([{urlPattern:'*/api/category-icon/'+category.id+'*',requestStage:'Response'}],async event=>{
      if(!held&&event.responseStatusCode===200){held=event;return true}return false
    },async()=>{
      await b.navigate(base);await wait(sel=>document.querySelector(sel),[scope()]);await click(scope()+' .scope-root-trigger')
      await localWait(()=>held,'Owned native category request before UI navigation')
      const row=requests.get(held.networkId)
      assert(row?.type==='Image'&&row.object==='category:'+category.id,'Native UI cancellation has no exact request ownership')
      await homeAction('admin')
      assert(await b.call(sel=>!document.querySelector(sel),scope()),'Home consumer remained mounted after entering admin')
      await b.send('Fetch.continueRequest',{requestId:held.requestId}).catch(()=>{})
      await localWait(()=>row.error||Number.isFinite(row.finishedTime),'Released native response termination',15000)
      await collectImageLifecycle('native-ui-teardown')
      if(row.error){const proof=verifiedUiImageCancellations(report.requests,report.imageLifecycles,report.uiTransitions).find(item=>item.requestId===row.requestId);assert(proof,'Native cancellation has no proved UI retirement');report.cases.at(-1).nativeUiCancellation=proof;cancelled=true}
      else assert(row.status===200,'Released native response did not complete successfully')
      assert(await b.call(sel=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]'))&&!document.querySelector(sel),scope()),'Late native completion changed the current view')
    })
    await home();await verifyImages()
    return {nativeRequestCancelled:cancelled,homeViewRemoved:true,lateResponseIsolated:true,homeImagesRestored:true}
  })
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
    const rows=report.requests.slice(start),objects=rows.filter(row=>['icon-body','icon-copy'].includes(row.kind))
    // The precondition proves these fixtures warm, not every image in the site.
    // Keep other traffic observable and subject to the global error gate.
    const network=assessStableIcons(objects.filter(row=>keys.includes(row.object)||row.object==='unknown'))
    const otherObjectRequests=objects.filter(row=>!keys.includes(row.object)).map(row=>({requestId:row.requestId,object:row.object,status:row.status}))
    assert(network.passed,JSON.stringify(network));return {persisted,warmObjects:keys,network,otherObjectRequests,otherImageRequests:rows.filter(row=>['external-image','iconify-body'].includes(row.kind)).length}
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
  for(const failure of ['503','408','429','500','WRONG-IMAGE','CONNECTION-RESET'])await scenario(failure==='503'?'28-COPY-503':failure==='CONNECTION-RESET'?'28-COPY-CONNECTION-RESET':'28-COPY-FAILURE-'+failure, async()=>{
    const targets=[0,2],evidence=report.cases.at(-1).copyFailure={failure,requests:[],cold:[],recovered:[]}
    try {
      for(const index of targets)await setFixtureIcon(index,fixtures[bookmarks[index].imageKey].uri)
      await clearCopies()
      const cold=await Promise.all(targets.map(index=>readFixtureCopy('bookmark:'+bookmarks[index].id)))
      assert(cold.every(row=>row.available&&row.enabled&&!row.entryPresent&&!row.bodyPresent),'Fault matrix requires native cold absence')
      await intercept([{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}],async event=>{
        let request;try{request=JSON.parse(event.request.postData)}catch{return false}
        const index=targets.find(index=>request.object_type==='bookmark'&&request.object_id===bookmarks[index].id)
        if(index===undefined)return false
        let data={protocol:1,reason:'unavailable'}
        if(failure==='WRONG-IMAGE') {
          const expected=Buffer.from(fixtures[bookmarks[index].imageKey].base64Uri.split(',')[1],'base64')
          const wrong=Buffer.from(fixtures[bookmarks[index].imageKey==='bookmark'?'category':'bookmark'].base64Uri.split(',')[1],'base64')
          const revision=request.expected_content_revision??'sha256-'+createHash('sha256').update('cf-navs-icon-v1\nimage/svg+xml\n').update(expected).digest('hex')
          data={protocol:1,persistence:'session-scoped',descriptor:{object_type:'bookmark',object_id:request.object_id,dataset_epoch:request.dataset_epoch,
            write_epoch:request.expected_write_epoch,state:'ready',content_revision:revision},image:{mime:'image/svg+xml',byte_length:wrong.length,base64:wrong.toString('base64')}}
        }
        evidence.requests.push({requestId:event.networkId,object:'bookmark:'+request.object_id})
        assert(event.networkId,'Injected copy failure has no Network requestId')
        if(failure==='CONNECTION-RESET') {
          await b.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'ConnectionReset'})
          return true
        }
        injectedRequests.add(event.networkId)
        await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:failure==='WRONG-IMAGE'?200:Number(failure),
          responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'private, no-store'}],
          body:Buffer.from(JSON.stringify({code:0,msg:'controlled copy failure',data})).toString('base64')})
        return true
      },async()=>{
        await home();await verifyImages()
        for(const index of targets) {
          const object='bookmark:'+bookmarks[index].id
          assert(evidence.requests.some(row=>row.object===object),'Fault did not reach '+object)
          const state=await readFixtureCopy(object)
          evidence.cold.push({object,entryPresent:state.entryPresent,bodyPresent:state.bodyPresent})
          assert(state.available&&state.enabled&&!state.entryPresent&&!state.bodyPresent,'Failed copy reached persistent storage')
        }
      })
      // The existing retry schedule / focus cooldown owns recovery, not a test fetch.
      await sleep(31000);await focusCycle()
      const deadline=Date.now()+20000
      do {
        evidence.recovered=await Promise.all(targets.map(async index=>({object:'bookmark:'+bookmarks[index].id,state:await readFixtureCopy('bookmark:'+bookmarks[index].id)})))
        if(evidence.recovered.every(row=>row.state.entryPresent&&row.state.bodyPresent&&row.state.bodyRevision===row.state.descriptor?.content_revision))break
        await sleep(250)
      }while(Date.now()<deadline)
      assert(evidence.recovered.every(row=>row.state.entryPresent&&row.state.bodyPresent&&row.state.bodyRevision===row.state.descriptor?.content_revision),'Natural retry did not restore valid persistent copies')
      await verifyImages();evidence.imagesPassed=true
      return {failure,publicAndPrivate:true,injected:evidence.requests.length,faultNotPersisted:true,naturalRecovery:true,imagesPassed:true}
    } finally {
      for(const index of targets)await setFixtureIcon(index,fixtures[bookmarks[index].imageKey].base64Uri)
    }
  })
  for (const [index, timeoutId, proxyMinimumMs] of [[0,'28-COPY-TIMEOUT',0],[2,'28-PRIVATE-COPY-TIMEOUT',0],[2,'28-PRIVATE-COPY-TIMEOUT-SLOW-PROXY',3200]]) await scenario(timeoutId, async () => {
    // Public and private objects use identical strict deadline evidence. An
    // early grant/owner cancellation must fail, never count as a timeout.
    const scenarioId = stage
    const target = manifest().find(row => row.key === 'bookmark:' + bookmarks[index].id)
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
      const patterns=[{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}]
      if(proxyMinimumMs)patterns.push({urlPattern:'*/api/icon/'+bookmarks[index].id+'*',requestStage:'Response'})
      await intercept(patterns, async event => {
        if(proxyMinimumMs&&new URL(event.request.url).pathname==='/api/icon/'+bookmarks[index].id&&event.responseStatusCode===200) {
          await localWait(()=>requests.get(evidence.held[0]?.requestId)?.failureTime,'Timed-out copy before slow proxy',1500)
          const failed=requests.get(evidence.held[0].requestId)
          const deadline=failed.wallTime*1000+(failed.failureTime-failed.time)*1000+proxyMinimumMs
          evidence.slowProxy={requestId:event.networkId,minimumMs:proxyMinimumMs,heldAt:Date.now()}
          await sleep(Math.max(0,deadline-Date.now()))
          await b.send('Fetch.continueRequest',{requestId:event.requestId})
          evidence.slowProxy.releasedAt=Date.now()
          return true
        }
        let payload; try { payload=JSON.parse(event.request.postData) } catch { return false }
        if (new URL(event.request.url).origin !== base || payload.object_type !== 'bookmark' || payload.object_id !== bookmarks[index].id) return false
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
          // The normal renderer may use a native image or a fetched Blob.
          // Each path must match its own real completed proxy request.
          evidence.displayed = await wait(selector => {
            const image = document.querySelector(selector)?.querySelector('img')
            if (!image?.complete || !image.naturalWidth) return null
            if(image.currentSrc.startsWith(location.origin+'/api/icon/'))return {kind:'native',id:null,width:image.naturalWidth,height:image.naturalHeight,observedWallTime:performance.timeOrigin+performance.now()}
            if(!image.src.startsWith('blob:'))return null
            const state = window.__issueUrls, id = state.ids.get(image.src)
            const created = state.events.find(event => event.kind === 'create' && event.id === id)
            return created ? {kind:'blob',id,createdWallTime:performance.timeOrigin+created.at,observedWallTime:performance.timeOrigin+performance.now(),bytes:created.size,mime:created.mime} : null
          }, [target.selector], 5000)
          const observed = await b.call(collectIconFixtures, [target])
          evidence.pixels = evaluateIconFixtures([target], observed)
          evidence.afterTimeout = await readFixtureCopy(target.key)
          const proxy = report.requests.slice(start).find(row => row.kind === 'icon-body' && row.object === target.key && row.type === (evidence.displayed.kind==='native'?'Image':'Fetch') && row.time >= requests.get(held.requestId).failureTime-0.1 && row.status === 200)
          if (proxy) await localWait(() => Number.isFinite(proxy.finishedTime), 'Ordinary proxy body completion', 1500)
          if(evidence.displayed.kind==='native') {
            evidence.displayed.sourceMatched=await b.call((selector,url)=>document.querySelector(selector)?.querySelector('img')?.currentSrc===url,target.selector,imageRequestUrls.get(proxy?.requestId))
            evidence.displayed.documentLoaderId=(await b.send('Page.getFrameTree')).frameTree.frame.loaderId
          }
          evidence.fallback = assessCopyTimeoutFallback(report.requests.slice(start), {
            scenario:scenarioId,
            object:target.key, requestId:held.requestId, proxyRequestId:proxy?.requestId, cold:evidence.cold, afterTimeout:evidence.afterTimeout,
            displayed:evidence.displayed, pixelsPassed:evidence.pixels.passed,
          })
          evidence.proxyRequestId = proxy?.requestId
          assert(evidence.fallback.passed, 'Timeout fallback: '+JSON.stringify(evidence.fallback))
          // The existing 1.2s retry may start while a slower native proxy is
          // still loading. Keep it held until fallback pixels are proved, then
          // release that exact sequential request; never accept overlapping work.
          assert(evidence.held.length <= 2, 'Unbounded copy attempts before fallback verification')
          const pendingRetry=evidence.held[1]&&requests.get(evidence.held[1].requestId)
          if(proxyMinimumMs)assert(pendingRetry&&evidence.slowProxy?.releasedAt,'Slow proxy did not exercise the sequential retry')
          if(pendingRetry)assert(pendingRetry.time>=row.failureTime&&pendingRetry.object===row.object&&pendingRetry.authSession===row.authSession&&pendingRetry.status==null&&!pendingRetry.error&&
            ['dataset_epoch','expected_write_epoch','expected_content_revision'].every(key=>pendingRetry.copyRequest?.[key]===row.copyRequest?.[key]),'Retry did not follow the timed-out request in the same identity')
          for (const id of evidence.fallback.expectedCanceledRequests) expectedTimeoutRequests.add(id)
          evidence.recovery.restoredWallTime=Date.now()
          evidence.recovery.releasedRetryRequestId=pendingRetry?.requestId
          faultSucceeded = true
        } catch (error) {
          // Persist the failed state BEFORE disabling Fetch can release a held
          // request and make the page look healed. scenario() preserves failure.
          evidence.failure = safe(error.message)
          evidence.failureStorage = await readFixtureCopy(target.key).catch(error => ({error:safe(error.message)}))
          await shot(scenarioId.toLowerCase()+'-before-restore').catch(error => { evidence.screenshotError=safe(error.message) })
          await persist()
          throw error
        }
      }) // existing finally disables Fetch even when the timed assertions fail
      evidence.recovery.interceptionDisabled = true
      await persist()
      // Let the mounted icon's real bounded retry reacquire; do not call the
      // loader, fetch the copy manually, edit the icon, or clear IDB a second time.
      const recoveryCandidate=row=>row.kind==='icon-copy'&&row.object===target.key&&(row.wallTime*1000>=evidence.recovery.restoredWallTime||row.requestId===evidence.recovery.releasedRetryRequestId)&&row.status===200&&row.copyResult?.hasImage
      await localWait(() => report.requests.slice(start).some(recoveryCandidate), 'Fresh real frontend copy after restoring interception', 20000)
      const recovered = report.requests.slice(start).find(recoveryCandidate)
      await wait((selector, previousId) => {
        const image=document.querySelector(selector)?.querySelector('img')
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:') && window.__issueUrls.ids.get(image.src) !== previousId
      }, [target.selector, evidence.displayed.id], 10000)
      evidence.recovery.pixels = await verifyImages([target])
      evidence.recovery.persisted = await readFixtureCopy(target.key)
      evidence.recovery.result = assessCopyTimeoutRecovery(report.requests.slice(start), {
        scenario:scenarioId,
        failedRequestId:evidence.held[0].requestId,releasedRetryRequestId:evidence.recovery.releasedRetryRequestId,
        object:target.key, requestId:recovered.requestId, restoredWallTime:evidence.recovery.restoredWallTime,
        persisted:evidence.recovery.persisted, blobDisplayed:true, pixelsPassed:evidence.recovery.pixels.passed,
      })
      assert(evidence.recovery.result.passed, 'Timeout recovery: '+JSON.stringify(evidence.recovery.result))
      const unexpected = report.requests.slice(start).filter(row => row.error && !expectedTimeoutRequests.has(row.requestId))
      assert(!unexpected.length, 'Unrelated network failures: '+JSON.stringify(unexpected.map(row=>({requestId:row.requestId,error:row.error}))))
      await shot(scenarioId.toLowerCase()+'-recovered')
      return {object:target.key, expectedCanceledRequests:evidence.fallback.expectedCanceledRequests, proxyRequestId:evidence.proxyRequestId,
        abortElapsedMs:evidence.fallback.abortElapsedMs, imageElapsedMs:evidence.fallback.imageElapsedMs, fallbackKind:evidence.displayed.kind, freshCopyRequestId:recovered.requestId, nativeStorageVerified:true}
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
  for(const variant of ['logout','relogin','frozen-logout','abort-write'])await scenario(variant==='abort-write'?'28-IDB-TRANSACTION-ABORT':'29-DECODE-'+variant.toUpperCase(),async()=>{
    const target=manifest().find(row=>row.key==='bookmark:'+bookmarks[2].id)
    const original=fixtures[bookmarks[2].imageKey].base64Uri
    const body=Buffer.from(original.split(',')[1],'base64').toString().replace('</svg>',`<!-- interruption-fixture-${run}-${variant} --></svg>`)
    const evidence=report.cases.at(-1).interruption={variant,object:target.key}
    let scriptId=null,frozen=false,secondarySession=null
    try {
      await setFixtureIcon(2,'data:image/svg+xml;base64,'+Buffer.from(body).toString('base64'))
      await clearCopies()
      evidence.cold=await readFixtureCopy(target.key)
      assert(evidence.cold.available&&!evidence.cold.entryPresent&&!evidence.cold.bodyPresent,'Interruption requires cold fixture storage')
      scriptId=(await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${pageInstallIconInterruption.toString()})(${JSON.stringify({mode:variant==='abort-write'?'abort-write':'decode',key:target.key,body})})`})).identifier
      await home({waitForImages:false})
      await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});scriptId=null
      await wait(abort=>abort?window.__iconInterruption?.state.aborted:window.__iconInterruption?.state.held,[variant==='abort-write'],30000)
      const expectedRevision='sha256-'+createHash('sha256').update('cf-navs-icon-v1\nimage/svg+xml\n').update(body).digest('hex')
      await localWait(()=>report.requests.some(row=>row.stage===stage&&row.kind==='icon-copy'&&row.object===target.key&&row.status===200&&row.copyResult?.descriptor?.content_revision===expectedRevision),'Real fixture copy before native interruption',10000)
      evidence.copyRequestId=report.requests.findLast(row=>row.stage===stage&&row.kind==='icon-copy'&&row.object===target.key&&row.copyResult?.descriptor?.content_revision===expectedRevision)?.requestId
      evidence.native=await b.call(()=>({...window.__iconInterruption.state}))
      if(variant==='abort-write') {
        assert(evidence.native.bodyWritten&&evidence.native.aborted&&!evidence.native.committed,'Native transaction interruption was not exercised')
        evidence.rollback=await readFixtureCopy(target.key)
        assert(evidence.rollback.available&&!evidence.rollback.entryPresent&&!evidence.rollback.bodyPresent,'Aborted transaction retained partial body/index')
        await verifyImages()
      } else {
        assert(evidence.native.holds===1&&evidence.native.nativeWidth>0&&evidence.native.nativeHeight>0,'Held continuation did not follow one actual native decoding')
        if(variant==='frozen-logout') {
          secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
          secondarySession=(await b.send('Target.attachToTarget',{targetId:secondary,flatten:true})).sessionId
          for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await sessionSend(secondarySession,method)
          await sessionSend(secondarySession,'Page.navigate',{url:base})
          let ready=false
          for(let i=0;i<100;i++){ready=await sessionCall(secondarySession,id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),bookmarks[2].id);if(ready)break;await sleep(150)}
          assert(ready,'Second tab lacks the private object before logout')
          await b.send('Target.activateTarget',{targetId:secondary})
          await b.send('Page.setWebLifecycleState',{state:'frozen'});frozen=true
          const visible=await sessionCall(secondarySession,()=>{const r=document.querySelector('[data-testid="home-logout-button"]')?.getBoundingClientRect();return r?.width>0&&r?.height>0})
          if(!visible)await clickInSession(secondarySession,'[data-testid="home-actions-menu-trigger"]')
          const logoutStart=report.requests.length
          await clickInSession(secondarySession,'[data-testid="home-logout-button"]')
          let loggedOut=false
          for(let i=0;i<100;i++){loggedOut=await sessionCall(secondarySession,()=>!localStorage.getItem('cf-navs.auth'));if(loggedOut)break;await sleep(100)}
          assert(loggedOut,'Second-tab UI logout did not clear authentication')
          await confirmSecondaryLogout(secondarySession,logoutStart,evidence)
          await b.send('Page.setWebLifecycleState',{state:'active'});frozen=false
          await b.send('Target.activateTarget',{targetId:b.targetId})
          assert(await b.call(()=>window.__iconInterruption.state.freezes>0),'Native freeze event missing')
        } else await homeAction('logout')
        await wait(id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),[bookmarks[2].id])
        const clientClearedAt=await b.call(()=>(performance.timeOrigin+performance.now())/1000)
        for(const row of report.requests)if(row.stage===stage&&row.path==='/api/logout')row.clientClearedAt=clientClearedAt
        if(variant==='relogin') {
          await signInPlace()
          // Authentication changes the page height and scroll anchor. Exercise
          // visibility normally instead of demanding lazy offscreen images load.
          await wait(id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),[bookmarks[2].id])
          await click(scope()+' .scope-root-trigger')
          for(const item of manifest())await wait(sel=>{const e=document.querySelector(sel),img=e?.querySelector('img');if(e&&(!img?.complete||!img.naturalWidth))e.scrollIntoView({block:'center',behavior:'instant'});return img?.complete&&img.naturalWidth>0},[item.selector],30000)
          await verifyImages()
          evidence.newSessionReady=await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,token)
          assert(evidence.newSessionReady,'New UI login not established before old completion')
          await b.call(()=>window.__iconInterruption.requireNewSession())
        }
        await b.call(()=>window.__iconInterruption.release())
        await wait(()=>window.__iconInterruption.state.finished)
        await sleep(250)
        if(variant==='relogin') {
          assert(await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,token),'Old decode completion cleared new session')
          await verifyImages()
        } else {
          assert(await b.call(id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),bookmarks[2].id),'Late decoded data restored private UI')
          evidence.afterLogout=await readFixtureCopy(target.key)
          assert(evidence.afterLogout.available&&!evidence.afterLogout.entryPresent&&!evidence.afterLogout.bodyPresent,'Late decode restored a private persistent copy')
        }
      }
      evidence.restored=await b.call(()=>window.__iconInterruption.restore())
      assert(evidence.restored.restored,'Native methods were not restored')
      assert(evidence.restored.frames>0&&evidence.restored.privateFrames===0&&evidence.restored.lostNewSessionFrames===0,'Private UI or new authentication regressed during native interruption')
      if(!await b.call(()=>Boolean(localStorage.getItem('cf-navs.auth'))))await signInPlace()
      await home();await verifyImages()
      evidence.recovered=await readFixtureCopy(target.key)
      assert(evidence.recovered.entryPresent&&evidence.recovered.bodyPresent&&evidence.recovered.bodyRevision===evidence.recovered.descriptor?.content_revision,'Actual UI recovery did not rebuild a valid private copy')
      await shot(stage.toLowerCase()+'-recovered')
      return {variant,nativeBoundary:true,privateIsolation:true,transactionAborted:variant==='abort-write',frozen:variant==='frozen-logout',newSessionRecovery:true}
    } finally {
      if(frozen)await b.send('Page.setWebLifecycleState',{state:'active'})
      if(scriptId)await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId})
      await b.call(()=>window.__iconInterruption?.restore())
      if(secondary){await b.send('Target.closeTarget',{targetId:secondary});secondary=null;await b.send('Target.activateTarget',{targetId:b.targetId})}
    }
  })
  for (const spec of snapshotCases) await scenario(spec.id,async()=>{
    const title=spec.relogin?`Browser edited ${run}`:`Edited ${run} 0`,privateId=bookmarks[2].id
    const evidence=report.cases.at(-1).snapshot={...spec}
    let peer,paused=null,armed=false,frozen=false,oldScope=null
    const pauseListener=event=>{if(armed&&event.callFrames?.some(frame=>frame.functionName==='snapshotSet'))paused=event}
    const peerWait=async(fn,...args)=>{let result;for(let i=0;i<200;i++){result=await sessionCall(peer,fn,...args);if(result)return result;await sleep(100)}throw new Error('Snapshot peer UI did not settle: '+fn.toString().slice(0,180))}
    const peerFill=async(selector,value)=>{
      await clickInSession(peer,selector)
      await sessionSend(peer,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
      await sessionSend(peer,'Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2})
      await sessionSend(peer,'Input.insertText',{text:value})
    }
    const peerAction=async(name)=>{
      if(name==='logout'&&await sessionCall(peer,()=>Boolean(document.querySelector('[data-testid="admin-logout-button"]')))){
        await clickInSession(peer,'[data-testid="admin-logout-button"]');return
      }
      const selector=`[data-testid="home-${name}-button"]`
      const visible=await sessionCall(peer,sel=>{const r=document.querySelector(sel)?.getBoundingClientRect();return r?.width>0&&r?.height>0},selector)
      if(!visible)await clickInSession(peer,'[data-testid="home-actions-menu-trigger"]')
      await clickInSession(peer,selector)
    }
    try {
      await home();await verifyImages()
      secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
      peer=(await b.send('Target.attachToTarget',{targetId:secondary,flatten:true})).sessionId
      for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await sessionSend(peer,method)
      await installPageInstrumentation(peer)
      await sessionSend(peer,'Page.navigate',{url:base+'/admin'})
      await peerWait(()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]')))
      evidence.peerEntry='admin'
      await b.send('Target.activateTarget',{targetId:b.targetId})
      await edit(0);await fill('[data-testid="bookmark-modal"] input[placeholder="例如：Svelte 官方网站"]',title)
      await b.call(pageInstallSnapshotInterruption,{...spec,bookmarkId:bookmarks[0].id,title,privateId})
      if(spec.storage==='local'){b.on('Debugger.paused',pauseListener);await b.send('Debugger.enable');armed=true}
      await click('[data-testid="bookmark-modal"] button[type="submit"]')
      if(spec.storage==='local'){
        await localWait(()=>paused,'Actual localStorage snapshot commit breakpoint')
        const frame=paused.callFrames.find(row=>row.functionName==='snapshotSet')
        const result=await b.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression:'({state:{...state},scope})',returnByValue:true})
        evidence.boundary=result.result.value.state;oldScope=result.result.value.scope
      } else {
        await wait(()=>window.__snapshotInterruption.state.held)
        evidence.boundary=await b.call(()=>({...window.__snapshotInterruption.state}));oldScope=await b.call(()=>window.__snapshotInterruption.scope())
      }
      assert(evidence.boundary.hits===1&&evidence.boundary.written===(spec.boundary==='after')&&oldScope,'Exact snapshot commit boundary not exercised')
      if(spec.frozen){
        // Freeze the snapshot continuation, not incidental IDB transactions
        // caused by opening the editor or warming the second document.
        await b.waitForNetworkIdle(1200,20000)
        await readFixtureCopy('bookmark:'+privateId)
      }
      await b.send('Target.activateTarget',{targetId:secondary})
      if(spec.frozen){await b.send('Page.setWebLifecycleState',{state:'frozen'});frozen=true}
      const start=report.requests.length
      await peerAction('logout')
      await peerWait(id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),privateId)
      await confirmSecondaryLogout(peer,start,evidence)
      evidence.logoutBeforeRelease=true
      if(spec.relogin){
        // Open the actual administrator login route in the second tab. The
        // first document remains paused and retains the old save continuation.
        await sessionSend(peer,'Page.navigate',{url:base+'/admin'})
        await peerWait(()=>Boolean(document.querySelector('input[autocomplete="username"]')||document.querySelector('[data-testid="home-login-button"]')))
        if(!await sessionCall(peer,()=>Boolean(document.querySelector('input[autocomplete="username"]'))))await peerAction('login')
        await peerFill('input[autocomplete="username"]',credentials.username)
        await peerFill('input[autocomplete="current-password"]',credentials.password)
        await clickInSession(peer,'[aria-labelledby="login-modal-title"] form button[type="submit"]')
        await peerWait(()=>!document.querySelector('input[autocomplete="current-password"]')&&Boolean(localStorage.getItem('cf-navs.auth')))
        await peerWait(id=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]')||document.querySelector(`[data-sort-id="${id}"]`)),privateId)
        if(!await sessionCall(peer,()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]')))){
          const loaderId=(await sessionSend(peer,'Page.getFrameTree')).frameTree.frame.loaderId
          await localWait(()=>report.requests.filter(row=>row.cdpSessionId===peer&&row.documentLoaderId===loaderId&&row.type==='Fetch').every(row=>row.terminalKind),'New-login response bodies before administrator navigation',60000)
          await sessionSend(peer,'Page.navigate',{url:base+'/admin'})
        }
        await peerWait(()=>Boolean(document.querySelector('[data-testid="admin-tab-settings"]')))
        const previous=token;token=await sessionCall(peer,()=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token||'')
        assert(token&&token!==previous,'Second UI login did not create a new session');serverCleanup.rememberSession(token)
        // Install a read-only observer, never write a new snapshot for the app.
        await sessionSend(peer,'Runtime.evaluate',{expression:`window.__readSnapshotScopes=(${pageReadSnapshotScopes.toString()})`})
        await peerWait(async(id,title,privateId,oldScope)=>{const rows=await window.__readSnapshotScopes(id,title,privateId);return rows.some(row=>row.scope!==oldScope&&row.titleMatches&&row.privatePresent)},bookmarks[0].id,title,privateId,oldScope)
        evidence.newBefore=await sessionCall(peer,pageReadSnapshotScopes,bookmarks[0].id,title,privateId)
      }
      if(frozen){await b.send('Page.setWebLifecycleState',{state:'active'});frozen=false}
      if(spec.relogin&&spec.storage==='cache')await b.call(scope=>window.__snapshotInterruption.protect(scope),evidence.newBefore[0].scope)
      if(spec.relogin&&spec.storage==='local')await b.send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames.find(row=>row.functionName==='snapshotSet').callFrameId,expression:`window.__snapshotInterruption.protect(${JSON.stringify(evidence.newBefore[0].scope)})`})
      if(spec.storage==='local'){await b.send('Debugger.resume');armed=false}else await b.call(()=>window.__snapshotInterruption.release())
      await b.send('Target.activateTarget',{targetId:b.targetId})
      await wait(()=>window.__snapshotInterruption.state.finished)
      await sleep(1500)
      evidence.after=await b.call(pageReadSnapshotScopes,bookmarks[0].id,title,privateId)
      assert(!evidence.after.some(row=>row.scope===oldScope),'Obsolete session snapshot survived completion')
      if(spec.relogin){
        assert(evidence.newBefore.every(before=>evidence.after.some(after=>before.scope===after.scope&&after.titleMatches&&after.privatePresent)),'Old snapshot completion deleted the new session snapshot')
        assert(await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,token),'Old snapshot completion cleared new authentication')
      }else{
        assert(evidence.after.length===0,'Logout retained an administrator snapshot')
        await wait(id=>!document.querySelector(`[data-sort-id="${id}"]`),[privateId])
      }
      evidence.probe=await b.call(()=>window.__snapshotInterruption.restore())
      assert(evidence.probe.protectedRemovals===0,'Old snapshot completion removed a valid new-session snapshot before rebuilding it')
      assert(evidence.probe.samples>0&&evidence.probe.privateFrames===0,'Private content reappeared during snapshot completion')
      if(spec.frozen)assert(evidence.probe.freezes>0,'Real freeze event was not observed')
      await b.waitForNetworkIdle(1200,20000)
      await b.send('Target.closeTarget',{targetId:secondary});secondary=null
      if(!spec.relogin)await login()
      if(spec.relogin){
        await wait(sel=>Boolean(document.querySelector(sel)),[scope()])
        await click(scope()+' .scope-root-trigger')
        for(const item of manifest()){
          await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),item.selector)
          await wait(sel=>{const e=document.querySelector(sel),image=e?.matches('img')?e:e?.querySelector('img');return image?.complete&&image.naturalWidth>0},[item.selector],60000)
        }
        await verifyImages()
      }else{await home();await verifyImages()}
      bookmarks[0].title=title
      return {storage:spec.storage,boundary:spec.boundary,frozen:spec.frozen,relogin:spec.relogin,oldScopeAbsent:true,newSessionPreserved:spec.relogin,uiRecovery:true}
    } finally {
      if(frozen)await b.send('Page.setWebLifecycleState',{state:'active'})
      if(armed)await b.send('Debugger.resume').catch(()=>{})
      await b.send('Debugger.disable')
      const listeners=b.listeners.get('Debugger.paused')??[];b.listeners.set('Debugger.paused',listeners.filter(fn=>fn!==pauseListener))
      await b.call(()=>window.__snapshotInterruption?.restore())
      if(secondary){await b.send('Target.closeTarget',{targetId:secondary});secondary=null;await b.send('Target.activateTarget',{targetId:b.targetId})}
    }
  })
  await scenario('29-PENDING-WRITE-LOGOUT',async()=>{
    const target=manifest().find(row=>row.key==='bookmark:'+bookmarks[2].id)
    const body=Buffer.from(fixtures[bookmarks[2].imageKey].base64Uri.split(',')[1],'base64').toString().replace('</svg>',`<!-- interruption-fixture-${run}-pending-write --></svg>`)
    const evidence=report.cases.at(-1).pendingWrite={object:target.key}
    let paused=null,armed=false,secondarySession=null,secondaryFrozen=false
    b.on('Debugger.paused',event=>{if(armed&&event.callFrames?.some(frame=>frame.functionName==='put'))paused=event})
    try {
      await setFixtureIcon(2,'data:image/svg+xml;base64,'+Buffer.from(body).toString('base64'))
      await home();await verifyImages()
      secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
      secondarySession=(await b.send('Target.attachToTarget',{targetId:secondary,flatten:true})).sessionId
      for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await sessionSend(secondarySession,method)
      await sessionSend(secondarySession,'Page.navigate',{url:base})
      let ready=false
      for(let i=0;i<100;i++){ready=await sessionCall(secondarySession,id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),bookmarks[2].id);if(ready)break;await sleep(150)}
      assert(ready,'Second tab lacks private fixture before pending-write logout')
      await sessionSend(secondarySession,'Page.setWebLifecycleState',{state:'frozen'});secondaryFrozen=true
      await b.send('Target.activateTarget',{targetId:b.targetId});await clearCopies()
      await b.call(pageInstallIconInterruption,{mode:'pause-write',key:target.key,body})
      await b.send('Debugger.enable');armed=true
      await click('[aria-label="返回首页"]')
      await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:650,y:500,deltaX:0,deltaY:100000})
      await localWait(()=>paused,'Native pending body write breakpoint',20000)
      const frame=paused.callFrames.find(frame=>frame.functionName==='put')
      const native=await b.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression:'({mode:state.mode,key:args[1],db:this.transaction.db.name,store:this.name,bodyRequested:state.bodyRequested,requestState:request.readyState})',returnByValue:true})
      evidence.native=native.result?.value
      assert(evidence.native?.mode==='pause-write'&&evidence.native.key===target.key&&evidence.native.db==='cf-navs-object-icons-v1'&&evidence.native.store==='bodies'&&evidence.native.bodyRequested&&evidence.native.requestState==='pending','Breakpoint is not the actual pending fixture body write')
      await sessionSend(secondarySession,'Page.setWebLifecycleState',{state:'active'});secondaryFrozen=false
      await b.send('Target.activateTarget',{targetId:secondary})
      const visible=await sessionCall(secondarySession,()=>{const r=document.querySelector('[data-testid="home-logout-button"]')?.getBoundingClientRect();return r?.width>0&&r?.height>0})
      if(!visible)await clickInSession(secondarySession,'[data-testid="home-actions-menu-trigger"]')
      const logoutStart=report.requests.length
      await clickInSession(secondarySession,'[data-testid="home-logout-button"]')
      let removed=false
      for(let i=0;i<100;i++){removed=await sessionCall(secondarySession,id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),bookmarks[2].id);if(removed)break;await sleep(100)}
      assert(removed,'UI logout waited for another tab\'s pending IDB write')
      await confirmSecondaryLogout(secondarySession,logoutStart,evidence)
      evidence.otherTabClearedBeforeResume=true
      await b.send('Debugger.resume');armed=false
      await b.send('Target.activateTarget',{targetId:b.targetId})
      await wait(id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),[bookmarks[2].id])
      await wait(()=>window.__iconInterruption.state.aborted||window.__iconInterruption.state.committed)
      evidence.afterLogout=await readFixtureCopy(target.key)
      assert(evidence.afterLogout.available&&!evidence.afterLogout.entryPresent&&!evidence.afterLogout.bodyPresent,'Pending write survived logout cleanup')
      evidence.restored=await b.call(()=>window.__iconInterruption.restore())
      assert(evidence.restored.frames>0&&evidence.restored.privateFrames===0,'Private DOM reappeared while the pending transaction resumed')
      await login();await home();await verifyImages()
      const recovered=await readFixtureCopy(target.key)
      assert(recovered.entryPresent&&recovered.bodyPresent&&recovered.bodyRevision===recovered.descriptor?.content_revision,'New UI session did not recover after a pending write')
      return {nativePendingWrite:true,otherTabUiLogout:true,lateWriteAbsent:true,newSessionRecovered:true}
    } finally {
      if(armed){await b.send('Debugger.resume').catch(()=>{});armed=false}
      await b.send('Debugger.disable')
      if(secondaryFrozen)await sessionSend(secondarySession,'Page.setWebLifecycleState',{state:'active'})
      await b.call(()=>window.__iconInterruption?.restore())
      if(secondary){await b.send('Target.closeTarget',{targetId:secondary});secondary=null;await b.send('Target.activateTarget',{targetId:b.targetId})}
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
  await scenario('29-OLD-401-DURING-INITIALIZATION',async()=>{
    await home();const previousToken=token,documentBefore=await b.call(()=>performance.timeOrigin)
    let oldResponse=null,newData=null,newLogin=false
    const evidence=report.cases.at(-1).initialization={}
    return intercept([{urlPattern:'*/api/data/version*',requestStage:'Response'},{urlPattern:'*/api/admin/data',requestStage:'Response'}],async event=>{
      const pathname=new URL(event.request.url).pathname
      if(pathname==='/api/data/version'&&!oldResponse&&!newLogin){oldResponse=event;return true}
      if(pathname==='/api/admin/data'&&newLogin&&!newData){newData=event;return true}
      return false
    },async()=>{
      await focusCycle();await localWait(()=>oldResponse,'Old authenticated version response')
      await homeAction('logout');await wait(id=>!localStorage.getItem('cf-navs.auth')&&!document.querySelector(`[data-sort-id="${id}"]`),[bookmarks[2].id])
      newLogin=true
      await homeAction('login');await fill('input[autocomplete="username"]',credentials.username);await fill('input[autocomplete="current-password"]',credentials.password)
      await click('[aria-labelledby="login-modal-title"] form button[type="submit"]')
      await localWait(()=>newData,'New login aggregate held before image initialization')
      token=await b.call(()=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token||'')
      assert(token&&token!==previousToken,'New session must exist while its aggregate is still pending');serverCleanup.rememberSession(token)
      assert(oldResponse.networkId&&newData.networkId&&newData.responseStatusCode===200,'Initialization response ownership missing')
      evidence.oldRequestId=oldResponse.networkId;evidence.pendingNewDataId=newData.networkId;evidence.newSessionBeforeData=true
      injectedRequests.add(oldResponse.networkId)
      await b.send('Fetch.fulfillRequest',{requestId:oldResponse.requestId,responseCode:401,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'no-store'}],body:Buffer.from(JSON.stringify({code:1001,msg:'Injected old session failure',data:null})).toString('base64')})
      await sleep(1000)
      assert(await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,token),'Old error cleared the initializing new session')
      await b.send('Fetch.continueRequest',{requestId:newData.requestId});evidence.newDataReleased=true
      await wait(()=>!document.querySelector('input[autocomplete="current-password"]'))
      await wait(id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),[bookmarks[2].id])
      await click(scope()+' .scope-root-trigger')
      for(const item of manifest()){
        await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center',behavior:'instant'}),item.selector)
        await wait(sel=>{const e=document.querySelector(sel),image=e?.matches('img')?e:e?.querySelector('img');return image?.complete&&image.naturalWidth>0},[item.selector],60000)
      }
      await verifyImages()
      assert(await b.call(()=>performance.timeOrigin)===documentBefore,'Initialization scenario changed document')
      assert(await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,token),'Image initialization lost the new session')
      return {oldErrorDuringInitialization:true,newSessionRetained:true,newPrivateImagesCorrect:true,sameDocument:true}
    })
  })
  for(const frozen of [false,true])await scenario(frozen?'29-FROZEN-TAB-LOGOUT':'29-CROSS-TAB-LOGOUT', async () => {
    await home({waitForImages:false}); secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
    const {sessionId}=await b.send('Target.attachToTarget',{targetId:secondary,flatten:true})
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable']) await sessionSend(sessionId,method)
    try {
      await sessionSend(sessionId,'Page.navigate',{url:base})
      let ready=false
      for(let i=0;i<100;i++){ready=await sessionCall(sessionId,id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),bookmarks[2].id);if(ready)break;await sleep(150)}
      assert(ready,'Private fixture missing in the second authenticated tab')
      if(frozen) {
        await sessionCall(sessionId,()=>{window.__issueFreezeObserved=false;document.addEventListener('freeze',()=>{window.__issueFreezeObserved=true},{once:true})})
        await b.send('Target.activateTarget',{targetId:b.targetId})
        await sessionSend(sessionId,'Page.setWebLifecycleState',{state:'frozen'})
      }
      await b.send('Target.activateTarget',{targetId:b.targetId});await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
      if(frozen) {
        await sessionSend(sessionId,'Page.setWebLifecycleState',{state:'active'})
        assert(await sessionCall(sessionId,()=>window.__issueFreezeObserved===true),'Browser did not deliver the real freeze lifecycle event')
      }
      let removed=false
      for(let i=0;i<100;i++){removed=await sessionCall(sessionId,id=>!document.querySelector(`[data-sort-id="${id}"]`)&&!localStorage.getItem('cf-navs.auth'),bookmarks[2].id);if(removed)break;await sleep(100)}
      assert(removed,'Other tab retained private data after logout')
      const clearedAt = await b.call(() => (performance.timeOrigin + performance.now()) / 1000)
      for (const row of report.requests) if (row.stage === stage && row.path === '/api/logout') row.clientClearedAt = clearedAt
      await signInPlace()
      return {privatePresentBefore:true,privateRemovedInOtherTab:true,frozen}
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
  await scenario('28-CATEGORY-FILTER-CANCEL',async()=>{
    await prepareCategoryScenario();await clearCopies()
    let held=null,objectId=null
    return intercept([{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}],async event=>{
      let payload;try{payload=JSON.parse(event.request.postData)}catch{return false}
      // Read-only delay in this disposable browser. Never modify or register
      // this existing category as a server cleanup fixture.
      if(!held&&payload.object_type==='category'&&!ownedCategories.includes(payload.object_id)){held=event;objectId=payload.object_id;return true}
      return false
    },async()=>{
      await categoryPanel();await localWait(()=>held,'Visible category copy suspended before filtering')
      const row=requests.get(held.networkId)
      assert(row&&row.authSession===authSessions.get('Bearer '+token),'Filter cancellation lacks session ownership')
      await localWait(()=>row.error,'Component-owned request cancellation',5000)
      assert(row.canceled&&row.error==='net::ERR_ABORTED'&&(row.failureTime-row.time)*1000<9000,'Filtered copy was not cancelled by component disposal')
      assert(verifiedCategoryFilterCancellations([row],report.categoryFilters).includes(row.requestId),'Filter cancellation evidence rejected')
      const absent=await readFixtureCopy('category:'+objectId)
      assert(absent.available&&!absent.entryPresent&&!absent.bodyPresent,'Cancelled filter copy reached persistent storage')
      await fill('[data-testid="admin-category-search"]','')
      await wait(id=>{const e=document.querySelector(`.admin-compact-card[data-category-id="${id}"]`),img=e?.querySelector('img');if(e)e.scrollIntoView({block:'center',behavior:'instant'});return img?.complete&&img.naturalWidth>0&&img.currentSrc.startsWith('blob:')},[objectId],30000)
      const restored=await readFixtureCopy('category:'+objectId)
      assert(restored.entryPresent&&restored.bodyPresent&&restored.bodyRevision===restored.descriptor?.content_revision&&restored.descriptor?.object_id===objectId,'Search restoration did not reacquire a valid category copy')
      return {filteredRequestId:row.requestId,componentCancelled:true,failedCopyAbsent:true,searchRestored:true}
    })
  })
  await scenario('28-CATEGORY-EDIT-REFRESH',async()=>{
    await prepareCategoryScenario()
    await home();await verifyImages()
    const original=await readOwnedCategory(child.id),evidence=report.cases.at(-1).categoryEdit={}
    await editCategoryUi(child.id)
    assert(await b.call((sel,icon)=>document.querySelector(sel+' .icon-row input')?.value===icon,categoryDialog,original.icon),'Category editor lost the original icon source')
    const cancelStart=report.requests.length
    await fill(categoryDialog+' .modal-form > label input[type="text"]','Draft '+run)
    await click('[data-testid="category-parent-tree-select"]')
    await key('ArrowDown')
    await wait(()=>document.activeElement?.closest('.category-tree-menu'))
    await key('Escape')
    await wait(()=>!document.querySelector('.category-tree-menu')&&document.activeElement?.getAttribute('data-testid')==='category-parent-tree-select')
    await key('Enter');await wait(()=>document.querySelector('.category-tree-menu'));await key('ArrowDown');await wait(()=>document.activeElement?.closest('.category-tree-menu'))
    await key('ArrowDown')
    assert(await b.call(()=>!document.activeElement?.classList.contains('root-choice')),'ArrowDown did not move beyond the first category option')
    await key('Home')
    assert(await b.call(()=>document.activeElement?.classList.contains('root-choice')),'Home did not return to the first category option')
    await key('Enter')
    await wait(()=>!document.querySelector('.category-tree-menu')&&document.querySelector('[data-testid="category-parent-tree-select"]')?.textContent.includes('无上级分类'))
    let cancelFocused=false
    for(let i=0;i<20;i++){cancelFocused=await b.call(sel=>document.activeElement===document.querySelector(sel+' .modal-actions .ghost-button'),categoryDialog);if(cancelFocused)break;await key('Tab')}
    assert(cancelFocused,'Category cancel cannot be reached by keyboard');await key('Enter');await wait(sel=>!document.querySelector(sel),[categoryDialog])
    assert(!report.requests.slice(cancelStart).some(row=>row.method==='PUT'&&row.path==='/api/categories/'+child.id),'Cancelled category draft was submitted')
    const cancelled=await readOwnedCategory(child.id)
    assert(cancelled.title===original.title&&cancelled.icon===original.icon&&cancelled.parent_id===original.parent_id,'Cancelled category draft changed persistence')
    evidence.keyboardAndCancel=true
    await editCategoryUi(child.id);await fill(categoryDialog+' .icon-row input',fixtures.category.base64Uri)
    await verifyImages([{key:'category:'+child.id,selector:categoryDialog+' .icon-row [data-category-icon]',kind:'image',pixels:fixtures.category.pixels}])
    await saveCategoryUi()
    assert((await readOwnedCategory(child.id)).icon===fixtures.category.base64Uri,'UI icon save did not reach the server')
    await verifyImages([{key:'category:'+child.id,selector:`.admin-compact-card[data-category-id="${child.id}"] [data-category-icon]`,kind:'image',pixels:fixtures.category.pixels}])
    const changed=manifest().map(row=>row.key==='category:'+child.id?{...row,pixels:fixtures.category.pixels}:row)
    await home();await verifyImages(changed)
    const before=await readFixtureCopy('category:'+child.id)
    assert(before.entryPresent&&before.bodyPresent&&before.bodyRevision===before.descriptor?.content_revision,'Saved category has no valid persistent image')
    const start=report.requests.length,documentBefore=await b.call(()=>performance.timeOrigin)
    await home();await verifyImages(changed)
    assert(await b.call(()=>performance.timeOrigin)!==documentBefore,'Refresh did not create a new document')
    const bodies=report.requests.slice(start).filter(row=>row.object==='category:'+child.id&&['icon-copy','icon-body'].includes(row.kind))
    evidence.refreshBodyRequests=bodies.map(row=>({id:row.requestId,kind:row.kind,status:row.status}))
    assert(!bodies.length,'Warm category refresh downloaded unchanged image bytes')
    await editCategoryUi(child.id);await fill(categoryDialog+' .icon-row input',original.icon);await saveCategoryUi();await home();await verifyImages()
    const mutations=report.cases.at(-1).categoryMutationResponses
    for(const [index,mutation]of mutations.entries()) {
      const end=mutations[index+1]?.confirmedAt??Date.now()
      const stale=report.requests.filter(row=>row.kind==='icon-copy'&&row.object==='category:'+child.id&&row.wallTime*1000>=mutation.confirmedAt&&row.wallTime*1000<end&&(!Number.isSafeInteger(row.copyRequest?.expected_write_epoch)||row.copyRequest.expected_write_epoch<mutation.writeEpoch))
      assert(stale.length===0,'Saved category regressed to an older/unknown write epoch: '+stale.map(row=>row.requestId).join(','))
    }
    return {keyboardAndCancel:true,sourcePreserved:true,previewAndSavedPixels:true,newDocument:true,warmCategoryBodyRequests:0,restored:true}
  })
  await scenario('28-CATEGORY-MOBILE-MOVE',async()=>{
    await prepareCategoryScenario()
    try {
      await b.setViewport({width:390,height:844,mobile:true,scale:1})
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
      await editCategoryUi(child.id);await tap('[data-testid="category-parent-tree-select"]')
      await wait(()=>document.querySelector('.category-tree-menu .root-choice'))
      const menu=await b.call(()=>{const r=document.querySelector('.category-tree-menu').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})
      assert(menu.left>=0&&menu.right<=menu.width+1&&menu.top>=0&&menu.bottom<=menu.height+1,'Mobile parent menu exceeds the viewport')
      await tap('.category-tree-menu .root-choice');await saveCategoryUi(true)
      assert((await readOwnedCategory(child.id)).parent_id==null,'Touch move did not promote the category')
      await categoryPanel();await wait(id=>document.querySelector(`.admin-root-category-card[data-category-id="${id}"]`),[child.id])
      await editCategoryUi(child.id);await tap('[data-testid="category-parent-tree-select"]');await tap(`[data-tree-root-id="${category.id}"]`)
      const clip=await b.call(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}},categoryDialog)
      const screenshot=await b.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true})
      await fs.writeFile(path.join(output,'category-mobile-parent.png'),Buffer.from(screenshot.data,'base64'))
      await saveCategoryUi(true)
      assert((await readOwnedCategory(child.id)).parent_id===category.id,'Touch move did not restore the original parent')
      await categoryPanel();await wait(id=>document.querySelector(`.admin-child-category-card[data-category-id="${id}"]`),[child.id])
      return {viewport:'390x844',touchInput:true,promotedAndRestored:true,uiHierarchyVerified:true,parentMenuInsideViewport:true}
    } finally {
      await b.send('Emulation.setTouchEmulationEnabled',{enabled:false})
      await b.setViewport({width:1366,height:900,scale:1})
    }
  })
  await scenario('28-CATEGORY-PRIVACY',async()=>{
    await prepareCategoryScenario()
    const evidence=report.cases.at(-1).categoryPrivacy={}
    const privacy=async(id,hidden)=>{
      await editCategoryUi(id)
      if(await b.call(sel=>document.querySelector(sel+' .visibility-toggle input').checked,categoryDialog)!==hidden)await click(categoryDialog+' .visibility-toggle input')
      await saveCategoryUi()
      assert(Boolean((await readOwnedCategory(id)).is_private)===hidden,'Category privacy did not persist')
    }
    await privacy(category.id,true);await home();await verifyImages()
    await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
    await b.navigate(base)
    await wait(()=>document.querySelectorAll('.bookmark-card-shell').length>0)
    assert(await b.call((root,child,ids)=>!document.querySelector(`[data-home-category-scope="${root}"]`)&&!document.querySelector(`[data-navigation-id="category-${child}"]`)&&ids.every(id=>!document.querySelector(`[data-sort-id="${id}"]`)),category.id,child.id,bookmarks.map(row=>row.id)),'Private parent subtree remains in anonymous UI')
    evidence.privateParentHidesSubtree=true
    await login();await privacy(category.id,false);await privacy(child.id,true);await home();await verifyImages()
    await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'))
    const anonymousStart=report.requests.length
    await b.navigate(base);await wait(sel=>document.querySelector(sel),[scope()]);await click(scope()+' .scope-root-trigger')
    const publicItems=manifest().filter(row=>row.key!=='category:'+child.id&&row.key!=='bookmark:'+bookmarks[2].id)
    // The native category path has four 10s attempts and 1.2/4/10s delays.
    // Wait for that existing bounded path before invoking the pixel oracle.
    const readinessStarted=Date.now(),readinessDeadline=readinessStarted+70000
    for(const item of publicItems)await wait(sel=>{const e=document.querySelector(sel),img=e?.querySelector('img');if(e&&(!img?.complete||!img.naturalWidth))e.scrollIntoView({block:'center',behavior:'instant'});return img?.complete&&img.naturalWidth>0},[item.selector],Math.max(1,readinessDeadline-Date.now()))
    evidence.anonymousReadiness={elapsedMs:Date.now()-readinessStarted,requests:report.requests.slice(anonymousStart).filter(row=>row.object==='category:'+category.id).map(row=>({requestId:row.requestId,time:row.time,end:row.terminalTime,status:row.status,error:row.error}))}
    await verifyImages(publicItems)
    assert(await b.call((child,privateId)=>!document.querySelector(`#home-category-tab-${child}`)&&!document.querySelector(`[data-navigation-id="category-${child}"]`)&&!document.querySelector(`[data-sort-id="${privateId}"]`),child.id,bookmarks[2].id),'Private child remains visible to a visitor')
    const stored=await readFixtureCopy('category:'+child.id)
    assert(!stored.available||(!stored.entryPresent&&!stored.bodyPresent),'Anonymous browser retained the private category copy')
    evidence.publicParentStillVisible=true;evidence.privateChildHidden=true
    await login();await privacy(child.id,false);await home();await verifyImages()
    return {parentSubtreeHidden:true,publicParentPreserved:true,privateChildHidden:true,privateLocalCopyRemoved:true,restoredByUi:true}
  })
  await scenario('28-CATEGORY-PERMISSIONS', async()=>{
    // The native-timeout case intentionally changes this SVG's nonvisual bytes.
    // Establish this case's own byte oracle instead of inheriting that mutation.
    await api('/categories/'+child.id,{parent_id:category.id,title:'Browser child '+run,icon:fixtures.bookmark.base64Uri},'PUT')
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
  await scenario('28-PERFORMANCE-FLOW',async()=>{
    const prefixes=[fixtures.bookmark.base64Uri.slice(0,256),fixtures.category.base64Uri.slice(0,256)]
    const initial=await api('/admin/data',undefined,'GET')
    const evidence=report.cases.at(-1).performance={dataset:{bookmarks:initial.bookmarks.length,categories:initial.categories.length},rounds:[],spa:[]}
    const {identifier}=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${pageInstallIconPerformanceProbe.toString()})()`})
    const audit=async()=>{const value=await b.call(pageReadIconStorageAudit,prefixes),result=assessIconStorageAudit(value);if(!result.passed)evidence.failedAudit=value;assert(result.passed,'Native storage audit: '+JSON.stringify(result));return value}
    async function settled() {
      const loader=(await b.send('Page.getFrameTree')).frameTree.frame.loaderId
      try {await wait(()=>[...document.images].filter(img=>{const r=img.getBoundingClientRect();return img.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth}).every(img=>img.complete&&img.naturalWidth>0),[],70000)}
      catch(error){evidence.unreadyVisibleImages=await b.call(()=>[...document.images].filter(img=>img.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&(!img.complete||!img.naturalWidth)).map(img=>({className:img.className,loading:img.loading,naturalWidth:img.naturalWidth,top:img.getBoundingClientRect().top})));throw error}
      await localWait(()=>!report.requests.some(row=>row.documentLoaderId===loader&&row.kind==='icon-copy'&&!Number.isFinite(row.terminalTime)),'Current document copy completion',20000)
    }
    async function flow(reload) {
      evidence.lastStep='navigate'
      if(reload)await b.navigate(base)
      await wait(()=>document.querySelectorAll('.bookmark-card-shell').length>0);await settled()
      const positions=[]
      evidence.lastStep='viewport-scroll'
      for(const fraction of [0,.25,.5,.75,1]) {
        const point=await b.call(f=>({delta:Math.max(0,document.documentElement.scrollHeight-innerHeight)*f-scrollY,x:innerWidth*.65,y:innerHeight*.55}),fraction)
        if(Math.abs(point.delta)>1)await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:point.delta})
        await sleep(180);await settled();positions.push(await b.call(()=>scrollY))
      }
      assert(new Set(positions.map(Math.round)).size>1,'Performance flow did not actually scroll')
      async function revealFixtures() {
        for(const item of manifest())await wait(sel=>{const e=document.querySelector(sel),img=e?.querySelector('img');if(e&&(!img?.complete||!img.naturalWidth))e.scrollIntoView({block:'center',behavior:'instant'});return img?.complete&&img.naturalWidth>0},[item.selector],70000)
        await verifyImages()
      }
      evidence.lastStep='home-fixtures'
      await click(scope()+' .scope-root-trigger');await revealFixtures();await settled()
      evidence.lastStep='spotlight'
      await b.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'k',code:'KeyK',windowsVirtualKeyCode:75,modifiers:2})
      await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK',windowsVirtualKeyCode:75,modifiers:2})
      await wait(()=>document.querySelector('.spotlight-input'));await fill('.spotlight-input',run)
      await wait(()=>document.querySelectorAll('.spotlight-option').length===3)
      const indexes=await b.call(titles=>titles.map(title=>[...document.querySelectorAll('.spotlight-option-title')].findIndex(e=>e.textContent===title)),bookmarks.map(item=>item.title))
      assert(indexes.every(index=>index>=0),'Search results do not contain the owned fixtures')
      await verifyImages(bookmarks.map((item,index)=>({key:'bookmark:'+item.id,selector:'#spotlight-opt-'+indexes[index],kind:'image',pixels:item.pixels})))
      await key('Escape');await wait(()=>!document.querySelector('.spotlight-input'))
      evidence.lastStep='admin'
      await categoryPanel();await verifyImages([{key:'category:'+category.id,selector:`.admin-compact-card[data-category-id="${category.id}"] [data-category-icon]`,kind:'image',pixels:fixtures.category.pixels},{key:'category:'+child.id,selector:`.admin-compact-card[data-category-id="${child.id}"] [data-category-icon]`,kind:'image',pixels:fixtures.bookmark.pixels}])
      evidence.lastStep='return-home'
      await click('[aria-label="返回首页"]');await wait(sel=>document.querySelector(sel),[scope()]);await click(scope()+' .scope-root-trigger');await revealFixtures();await settled()
      evidence.lastStep='complete'
      return {positions,domCards:await b.call(()=>document.querySelectorAll('.bookmark-card-shell').length)}
    }
    try {
      for(let round=1;round<=5;round++) {
        await clearCopies()
        for(const mode of ['cold','warm']) {
          const start=report.requests.length,started=Date.now(),ui=await flow(true),finished=Date.now()
          const rows=report.requests.slice(start).filter(row=>row.kind!=='local-image'),keys=new Set(manifest().map(row=>row.key))
          const fixtureBodies=rows.filter(row=>keys.has(row.object)&&['icon-copy','icon-body'].includes(row.kind))
          const measurement={round,mode,flowMs:finished-started,ui,requests:rows.length,fixtureBodyRequests:fixtureBodies.length,
            networkByKind:summarizeIconPerformanceRequests(rows),
            encodedBytes:rows.reduce((n,row)=>n+(Number.isFinite(row.encodedDataLength)?row.encodedDataLength:0),0),
            decodedNetworkBytes:rows.reduce((n,row)=>n+(Number.isFinite(row.receivedDataLength)?row.receivedDataLength:0),0),
            unknownTransferRequests:rows.filter(row=>!Number.isFinite(row.encodedDataLength)).length,
            cancelledRequests:rows.filter(row=>row.canceled).length,metrics:await b.call(()=>window.__iconPerformanceProbe.read()),storage:await audit()}
          evidence.rounds.push(measurement)
          if(mode==='cold')assert(fixtureBodies.length>0,'Cold flow did not fetch any fixture image bytes')
          else assert(fixtureBodies.length===0,'Warm unchanged fixture images were downloaded again')
          console.log(JSON.stringify({performanceRound:round,mode,flowMs:measurement.flowMs,fixtureBodyRequests:fixtureBodies.length,storageBytes:measurement.storage.bodyBytes}));await persist()
        }
      }
      await flow(false)
      const baseline={metrics:await b.call(()=>window.__iconPerformanceProbe.read()),storage:await audit(),timeOrigin:await b.call(()=>performance.timeOrigin)}
      evidence.spaBaseline=baseline
      for(let round=1;round<=5;round++) {
        await flow(false);assert(await b.call(()=>performance.timeOrigin)===baseline.timeOrigin,'SPA lifetime measurement changed document')
        const sample={round,metrics:await b.call(()=>window.__iconPerformanceProbe.read()),storage:await audit()};evidence.spa.push(sample)
        assert(sample.storage.entries===baseline.storage.entries&&sample.storage.bodyBytes===baseline.storage.bodyBytes,'Repeated warm UI flow grew persistent image storage')
        assert(sample.metrics.unreferencedImageUrls<=baseline.metrics.unreferencedImageUrls,'Repeated SPA flow accumulated unreferenced image handles');await persist()
      }
      await clearCopies();evidence.cleared=await audit()
      assert(evidence.cleared.entries===0&&evidence.cleared.bodies===0&&evidence.cleared.bodyBytes===0,'UI clear left persistent image data')
      await home();await verifyImages();evidence.recovered=await audit()
      assert(evidence.recovered.entries>0&&evidence.recovered.bodyBytes>0,'UI did not rebuild copies after clearing')
      return {coldWarmPairs:5,spaRounds:5,dataset:evidence.dataset,warmFixtureBodyRequests:0,stableStorage:true,uiClearAndRecovery:true}
    } finally {evidence.lastProbe=await b.call(()=>window.__iconPerformanceProbe?.read());await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});await b.call(()=>window.__iconPerformanceProbe?.restore())}
  })
  await scenario('28-CAPACITY-EVICTION',async()=>{
    await clearCopies()
    const evidence=report.cases.at(-1).capacity={targetBytes:384*1024,items:[],materialized:[]}
    const baseSvg=Buffer.from(fixtures.bookmark.base64Uri.split(',')[1],'base64').toString(),prefixes=[]
    let scriptId=null
    try {
      for(let index=3;index<33;index++) {
        const marker=`<!-- capacity-fixture-${run}-${index} `,suffix=' -->'
        const body=baseSvg.replace('</svg>',marker+'x'.repeat(evidence.targetBytes-Buffer.byteLength(baseSvg)-Buffer.byteLength(marker+suffix))+suffix+'</svg>')
        assert(Buffer.byteLength(body)===evidence.targetBytes,'Capacity fixture size mismatch')
        const icon='data:image/svg+xml;base64,'+Buffer.from(body).toString('base64')
        const item=await api('/bookmarks',{category_id:category.id,title:`Browser ${run} ${index}`,url:`https://example.com/capacity/${run}/${index}`,icon,icon_source:'custom',is_private:false})
        assert(Number.isSafeInteger(item.id)&&item.title===`Browser ${run} ${index}`&&item.category_id===category.id,'Capacity fixture ownership mismatch')
        ownedBookmarks.push(item.id)
        evidence.items.push({id:item.id,index,revision:'sha256-'+createHash('sha256').update('cf-navs-icon-v1\nimage/svg+xml\n').update(body).digest('hex')})
        prefixes.push(icon.split(',')[1].slice(0,600));await persist()
      }
      scriptId=(await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${pageInstallCapacityCommitProbe.toString()})(${JSON.stringify(evidence.items.map(item=>'bookmark:'+item.id))})`})).identifier
      await home()
      for(const item of evidence.items) {
        const target={key:'bookmark:'+item.id,selector:`[data-sort-category-id="${category.id}"] [data-sort-id="${item.id}"] .bookmark-card-shell`,kind:'image',pixels:fixtures.bookmark.pixels}
        await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center',behavior:'instant'}),target.selector)
        await wait(sel=>{const img=document.querySelector(sel)?.querySelector('img');return img?.complete&&img.naturalWidth>0&&img.currentSrc.startsWith('blob:')},[target.selector],70000)
        await verifyImages([target])
        await wait(key=>window.__capacityCommitProbe.read().some(row=>row.key===key),[target.key],10000)
        const committed=await b.call(key=>window.__capacityCommitProbe.read().find(row=>row.key===key),target.key)
        assert(committed.bytes===evidence.targetBytes&&committed.revision===item.revision,'Capacity body was not committed with its expected identity')
        evidence.materialized.push(item.id)
      }
      evidence.audit=await b.call(pageReadIconStorageAudit,prefixes)
      assert(assessIconStorageAudit(evidence.audit).passed,'Capacity storage totals or budget invalid')
      evidence.retained=[]
      for(const item of evidence.items){const value=await readFixtureCopy('bookmark:'+item.id);if(value.entryPresent&&value.bodyPresent){assert(value.bodyBytes===evidence.targetBytes&&value.bodyRevision===item.revision&&value.descriptor?.content_revision===item.revision&&value.descriptor?.object_id===item.id,'Retained capacity image bytes do not match their identity');evidence.retained.push(item.id)}}
      assert(evidence.materialized.length*evidence.targetBytes>10*1024*1024&&evidence.retained.length<evidence.materialized.length,'Over-budget working set did not exercise eviction')
      await settings();evidence.settingsAudit=await b.call(pageReadIconStorageAudit,prefixes)
      assert(assessIconStorageAudit(evidence.settingsAudit).passed,'Settings entered with inconsistent native storage')
      await wait(count=>Number(document.querySelector('.device-cache dd')?.textContent.split('/')[0].trim())===count,[evidence.settingsAudit.entries])
      evidence.displayed=await b.call(()=>[...document.querySelectorAll('.device-cache dd')].map(e=>e.textContent.trim()))
      await click('.device-actions button:nth-child(2)');await wait(()=>document.querySelector('.device-status')?.textContent.startsWith('已启用'))
      evidence.cleared=await b.call(pageReadIconStorageAudit,prefixes)
      assert(assessIconStorageAudit(evidence.cleared).passed&&evidence.cleared.entries===0&&evidence.cleared.bodyBytes===0,'Capacity UI clear left data or invalid accounting')
      await home();await verifyImages();evidence.recovered=await b.call(pageReadIconStorageAudit,prefixes)
      assert(assessIconStorageAudit(evidence.recovered).passed&&evidence.recovered.entries>0,'Capacity UI recovery failed')
      return {images:evidence.items.length,bytesPerImage:evidence.targetBytes,retained:evidence.retained.length,bodyBytes:evidence.audit.bodyBytes,evictionObserved:true,uiAccounting:true,clearedAndRecovered:true}
    } finally {
      if(scriptId)await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId})
      await b.call(()=>window.__capacityCommitProbe?.restore())
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
    const candidates=report.requests.filter(row=>row.cdpSessionId===packet.sessionId&&row.kind==='icon-copy'&&row.object===packet.object&&row.status===packet.status&&
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
  report.verifiedUiImageCancellations=verifiedUiImageCancellations(report.requests,report.imageLifecycles,report.uiTransitions)
  const uiImageCancellations=new Set(report.verifiedUiImageCancellations.map(row=>row.requestId))
  report.verifiedLocalImageAdoptions=verifiedLocalImageAdoptions(report.requests,report.imageLifecycles)
  report.verifiedLogoutCopyCancellations=verifiedLogoutCopyCancellations(report.requests)
  const completedLifecycle=new Set([...report.verifiedLocalImageAdoptions.map(row=>row.requestId),...report.verifiedLogoutCopyCancellations])
  report.failedRequests = report.requests.filter(e => e.error)
  report.expectedOfflineRequests=[...expectedOfflineRequests]
  report.expectedTimeoutRequests=[...expectedTimeoutRequests]
  report.expectedReacquireRequests=[...expectedReacquireRequests]
  report.validatedInjectedCancellations=report.failedRequests.filter(row=>isExpectedInjectedCancellation(row,expectedInjectedCancellations)).map(row=>row.requestId)
  report.verifiedInjectedCopyResets=verifiedInjectedCopyResets(report.requests,report.cases)
  const copyResets=new Set(report.verifiedInjectedCopyResets)
  report.verifiedCategoryFilterCancellations=verifiedCategoryFilterCancellations(report.requests,report.categoryFilters)
  const filteredCopies=new Set(report.verifiedCategoryFilterCancellations)
  report.unexpectedFailures=report.failedRequests.filter(e=>!completedLifecycle.has(e.requestId)&&!expectedOfflineRequests.has(e.requestId)&&!isExpectedInjectedCancellation(e,expectedInjectedCancellations)&&!signedImageCancellations.has(e.requestId)&&!editedCopyCancellations.has(e.requestId)&&!nativeCategoryRetries.has(e.requestId)&&!navigationImageCancellations.has(e.requestId)&&!uiImageCancellations.has(e.requestId)&&!copyResets.has(e.requestId)&&!filteredCopies.has(e.requestId))
  report.consoleFindings=report.browserLog.filter(e=>e.level==='error'&&!injectedRequests.has(e.requestId)&&!protocolConflicts.has(e.requestId)&&!(e.source==='network'&&(completedLifecycle.has(e.requestId)||canceledHttp.has(e.requestId)||expectedOfflineRequests.has(e.requestId)||report.validatedInjectedCancellations.includes(e.requestId)||signedImageCancellations.has(e.requestId)||editedCopyCancellations.has(e.requestId)||nativeCategoryRetries.has(e.requestId)||navigationImageCancellations.has(e.requestId)||uiImageCancellations.has(e.requestId)||revokedRequests.has(e.requestId)||copyResets.has(e.requestId)||filteredCopies.has(e.requestId))))
  report.injectedRequests=[...injectedRequests]
  report.unexecutedRequestedCases=unexecutedRequestedCases(selectedCases,report.cases)
  await persist()
  console.log(JSON.stringify({ output, cases: report.cases.map(({id,status})=>({id,status})), unexecutedRequestedCases:report.unexecutedRequestedCases, cleanup: report.cleanup, fatal: report.fatal }))
  if (report.fatal || report.interceptionError || report.unexecutedRequestedCases.length || report.imageLifecycleErrors.length || report.unexpectedHttp.length || report.unexpectedFailures.length || report.consoleFindings.length || report.cases.some(c => c.status === 'failed') || !report.cleanup.serverFixturesRemoved || !report.cleanup.sessionRevoked || report.cleanup.preparationError || report.cleanup.pagePreparationFailed || sessionCaptureErrors.length || report.cleanup.errors?.length || !report.cleanup.browser.profileRemoved || report.cleanup.browser.errors.length || report.cleanup.browser.warnings.length) process.exitCode = 1
}

// Headed, test-site-only regression. Explicit opt-in authorizes creation and
// removal of this run's synthetic records, never editing existing site data.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { resolveBaseUrl, resolveSetting } from './lib/verifyTarget.mjs'
import { requireAdminCredentials, redactCredentials } from './lib/verifyCredentials.mjs'
import { createIconAcceptanceFixtures } from './lib/iconAcceptanceFixtures.mjs'
import { collectIconFixtures, evaluateIconFixtures } from './lib/iconAcceptance.mjs'
import { classifyIssueRequest, assessStableIcons, assessIconTrace, validatedIconConflicts } from './lib/issueBrowserEvidence.mjs'
if (process.env.ISSUE_BROWSER_WRITE_FIXTURES !== '1') throw new Error('Explicit ISSUE_BROWSER_WRITE_FIXTURES=1 required for temporary test-site records')
const base = resolveBaseUrl(), credentials = requireAdminCredentials()
const selectedCases=new Set((process.env.ISSUE_CASES??'').split(',').filter(Boolean))
const cacheMode=process.env.ISSUE_CACHE_MODE??'on'
assert(['on','off'].includes(cacheMode),'Invalid ISSUE_CACHE_MODE')
if(cacheMode==='off') assert(selectedCases.size>0&&[...selectedCases].every(id=>['28-EDIT-TITLE-DATA','28-EDIT-CANCEL','28-IDLE-CONTROL','28-RIGHT-CLICK-OFF'].includes(id)),'Off mode requires explicit compatible cases')
const requiredCases=new Set(['LOGIN-UI','28-BASELINE','28-ENABLE-DEFERRED'])
const run = randomUUID().slice(0, 8), fixtures = createIconAcceptanceFixtures()
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-navs-issue-browser-'))
const profile = path.join(os.tmpdir(), 'cf-navs-chrome-profile-issue-' + run)
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r))
const port = probe.address().port; await new Promise(r => probe.close(r))
const b = new CdpSession({ chromeExe: resolveSetting('CHROME_EXE', 'chromeExe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), debugPort: port, userDataDir: profile, headless: false })
const report = { run, cacheMode, browserLog: [], cases: [], requests: [], cleanup: {}, excluded: [], limitations: [] }
let stage = 'setup', token = '', category, child, bookmarks = [], ownedCategories = [], ownedBookmarks = [], secondary = null
const requests = new Map()
const responseReads = new Set()
let fetchHandler = null
let editorObject = null
const injectedRequests = new Set()
function safe(value) { return redactCredentials(String(value), credentials).replaceAll(base, '[test-origin]').replaceAll(token || '\u0000', '[token]').replace(/([?&](?:key|token)=)[^\s&"']+/g, '$1[redacted]') }
async function persist() { await fs.writeFile(path.join(output, 'report.json'), safe(JSON.stringify(report, null, 2))) }
function assert(value, message) { if (!value) throw new Error(message) }
async function wait(fn, args = [], timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const result = await b.call(fn, ...args); if (result) return result; await sleep(120) }
  throw new Error('UI condition timed out: ' + fn.toString().slice(0, 140)+' args='+JSON.stringify(args))
}
async function click(selector, button = 'left') {
  const hover=await b.call(sel=>{const e=document.querySelector(sel);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null},selector)
  if(hover) { await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hover,button:'none'}); await sleep(250) }
  const point = await wait(sel => {
    const e = document.querySelector(sel); if (!e || e.disabled) return null
    e.scrollIntoView({ block: 'center', behavior: 'instant' })
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
  const selector = `[data-testid="home-${name}-button"]`
  if (!await b.call(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 }, selector)) await click('[data-testid="home-actions-menu-trigger"]')
  await click(selector)
}
async function login() {
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
}
async function api(route, body, method = 'POST') {
  const result = await b.call(async (route, body, method, token) => {
    const response = await fetch('/api' + route, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, ...(body == null ? {} : { body: JSON.stringify(body) }) })
    const envelope = await response.json(); return { status: response.status, code: envelope.code, data: envelope.data }
  }, route, body ?? null, method, token)
  assert(result.status < 400 && result.code === 0, `Fixture API failed ${method} ${route} status=${result.status} code=${result.code}`)
  return result.data
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
async function home({ waitForImages = true } = {}) {
  await b.navigate(base)
  await wait(sel => Boolean(document.querySelector(sel)), [scope()], 30000)
  await click(scope() + ' .scope-root-trigger')
  await wait(id => document.querySelectorAll(`[data-sort-category-id="${id}"] .bookmark-card-shell`).length >= 3, [category.id], 30000)
  if (waitForImages) for (const item of manifest()) {
    await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),item.selector)
    await wait(sel=>{const e=document.querySelector(sel),img=e?.matches('img')?e:e?.querySelector('img');return img?.complete&&img.naturalWidth>0},[item.selector],20000)
  }
  await b.call(sel=>document.querySelector(sel)?.scrollIntoView({block:'center'}),card(0))
  await b.waitForNetworkIdle(900, 15000)
}
async function verifyImages() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const observed = await b.call(collectIconFixtures, manifest())
    const result = evaluateIconFixtures(manifest(), observed)
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
  await b.call(manifest => {
    window.__issueTrace?.stop?.()
    if(window.__issueUrls){window.__issueUrls.events=[];window.__issueUrls.active=true}
    const baseline = new Map(), changes = [], samples = { frames: 0 }; let running = true
    for (const row of manifest) { const e = document.querySelector(row.selector); const img = e?.matches('img') ? e : e?.querySelector('img'); baseline.set(row.key, img?.src || '') }
    function scan() {
      if (!running) return; samples.frames++
      for (const row of manifest) {
        const e = document.querySelector(row.selector), img = e?.matches('img') ? e : e?.querySelector('img')
        const state = !e ? 'missing' : !img ? 'text' : !img.complete || !img.naturalWidth ? 'unloaded' : img.src !== baseline.get(row.key) ? 'src-changed' : 'stable'
        if (state !== 'stable' && changes.length < 2000) { const r=e?.getBoundingClientRect(); changes.push({ key: row.key, state, visible:Boolean(r&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth), at:Math.round(performance.now()) }) }
      }
      requestAnimationFrame(scan)
    }
    requestAnimationFrame(scan)
    window.__issueTrace = { changes, samples, stop: () => { running = false } }
  }, manifest())
}
async function traceEnd() { return b.call(() => { const t = window.__issueTrace; t?.stop(); if(window.__issueUrls)window.__issueUrls.active=false; return t ? { objectUrls:window.__issueUrls?.events??[], changes: t.changes, frames: t.samples.frames, timeOrigin:performance.timeOrigin } : null }) }
async function scenario(id, action) {
  if(id==='28-ENABLE-DEFERRED'&&cacheMode==='off'){const skipped={id,status:'not-run',reason:'Explicit cache-off matrix'};report.cases.push(skipped);return skipped}
  if(selectedCases.size&&!selectedCases.has(id)&&!requiredCases.has(id)){const skipped={id,status:'not-run'};report.cases.push(skipped);return skipped}
  stage = id; editorObject=null; const start = report.requests.length, consoles = b.consoleErrors.length, exceptions = b.pageExceptions.length
  const entry = { id, expectedFault: ['28-COPY-503', '29-OLD-401', '29-OFFLINE-FOCUS'].includes(id), started: new Date().toISOString(), status: 'running' }; report.cases.push(entry)
  try { if((id.startsWith('29-')||id.startsWith('30-')||id.startsWith('28-STORAGE'))&&!await b.call(()=>Boolean(JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token))) await login(); entry.detail = await action(); entry.status = 'passed' } catch (error) { entry.status = 'failed'; entry.error = safe(error.message); if(category && !await b.call(()=>Boolean(document.querySelector('input[type="password"]'))).catch(()=>true)) await shot(id+'-failed').catch(()=>{}) }
  entry.requests = report.requests.slice(start).map(r => r.requestId)
  entry.console = b.consoleErrors.slice(consoles).map(e => safe(JSON.stringify(e)))
  entry.exceptions = b.pageExceptions.slice(exceptions).map(e => safe(JSON.stringify(e)))
  if (entry.exceptions.length || entry.console.length) entry.status = 'failed'
  console.log(JSON.stringify({ id, status: entry.status, error: entry.error, detail: entry.status==='passed' ? entry.detail : undefined }))
  await persist(); return entry
}
async function stableOperation(action, allowed = []) {
  await home(); await verifyImages(); await traceStart(); const start = report.requests.length
  report.cases.at(-1).actionRequestOffset=start
  await action(); await b.waitForNetworkIdle(1000, 15000); await sleep(1500)
  const trace = await traceEnd(), network = assessStableIcons(report.requests.slice(start), allowed, editorObject ? [editorObject] : [])
  const traceResult = assessIconTrace(trace, allowed), regressions = traceResult.regressions
  report.cases.at(-1).detail={network,trace}
  assert(network.passed && traceResult.passed, JSON.stringify({ network, regressions: regressions.slice(0, 15) }))
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
  await b.send('Fetch.enable',{patterns})
  try { return await action() } finally { fetchHandler=null; await b.send('Fetch.disable') }
}
async function signInPlace() {
  await homeAction('login'); await fill('input[autocomplete="username"]',credentials.username)
  await fill('input[autocomplete="current-password"]',credentials.password)
  await click('[aria-labelledby="login-modal-title"] form button[type="submit"]')
  await wait(()=>!document.querySelector('input[autocomplete="current-password"]'))
  token=await b.call(()=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token||'')
  assert(token,'In-page login did not establish a session')
}
async function clearCopies() {
  await home(); await settings()
  await click('.device-actions button:nth-child(2)')
  await wait(()=>document.querySelector('.device-status')?.textContent.startsWith('已启用'),[],30000)
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
async function settings() { await homeAction('admin'); await wait(() => document.querySelector('[data-testid="admin-tab-settings"]')); await click('[data-testid="admin-tab-settings"]'); await wait(() => [...document.querySelectorAll('.settings-submenu button')].some(e => e.textContent.includes('设备缓存'))); const selector = await b.call(() => { const buttons = [...document.querySelectorAll('.settings-submenu button')]; return '.settings-submenu button:nth-child(' + (buttons.findIndex(e => e.textContent.includes('设备缓存')) + 1) + ')' }); await click(selector); await wait(() => document.querySelector('.device-cache input')) }
async function edit(index) { editorObject=`bookmark:${bookmarks[index].id}`; await click(card(index), 'right'); await click('[data-testid="bookmark-context-edit"]'); await wait(() => document.querySelector('[data-testid="bookmark-modal"]')) }
try {
  // smoke-local owns the empty D1 and its one-time bootstrap credentials. Match
  // the existing icon smoke setup, then still exercise the real login form.
  if (new URL(base).hostname === '127.0.0.1' && process.env.SETUP_TOKEN) {
    const response = await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:credentials.username,password:credentials.password})})
    const bootstrap = await response.json()
    assert(bootstrap.code===0&&bootstrap.data?.token,'Disposable local bootstrap failed')
    await fetch(base+'/api/logout',{method:'POST',headers:{authorization:'Bearer '+bootstrap.data.token}})
  }
  await b.start(); await b.attach()
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),ids=new Map();let sequence=0;
    const state=window.__issueUrls={active:false,events:[]};
    URL.createObjectURL=function(blob){const url=create(blob);ids.set(url,++sequence);if(state.active&&state.events.length<2000)state.events.push({kind:'create',id:sequence,size:blob.size,mime:blob.type,at:performance.now(),stack:new Error().stack});return url};
    URL.revokeObjectURL=function(url){if(state.active&&state.events.length<2000)state.events.push({kind:'revoke',id:ids.get(url),at:performance.now(),stack:new Error().stack});ids.delete(url);return revoke(url)};
  })()`})
  await b.send('Log.enable')
  b.on('Log.entryAdded',({entry})=>{if(['warning','error'].includes(entry.level)) report.browserLog.push({stage,level:entry.level,source:entry.source,requestId:entry.networkRequestId,text:safe(entry.text)})})
  report.ownership = { profile, pid: b.chromeProcess.pid, port, targetId: b.targetId, headed: true }
  await fs.writeFile(path.join(output, 'ownership.json'), JSON.stringify(report.ownership))
  b.on('Fetch.requestPaused', event => {
    Promise.resolve(fetchHandler ? fetchHandler(event) : false).then(handled => {
      if (!handled) return b.send('Fetch.continueRequest', { requestId:event.requestId })
    }).catch(error => { report.interceptionError=safe(error.message) })
  })
  b.on('Network.requestWillBeSent', e => {
    const row = { requestId: e.requestId, stage, time: e.timestamp, wallTime: e.wallTime, method: e.request.method, type: e.type, initiator: e.initiator?.type, initiatorFrames:e.initiator?.stack?.callFrames?.slice(0,4).map(f=>({function:f.functionName,url:safe(f.url),line:f.lineNumber,column:f.columnNumber})), ...classifyIssueRequest(e.request.url, e.request.postData, base) }
    if (row.kind === 'external' && row.type === 'Image') row.kind = 'external-image'
    if(row.kind==='icon-copy') {try{const body=JSON.parse(e.request.postData);row.copyRequest={dataset_epoch:body.dataset_epoch,expected_write_epoch:body.expected_write_epoch,expected_content_revision:body.expected_content_revision}}catch{}}
    requests.set(e.requestId, row); report.requests.push(row)
    if(editorObject && ['icon-body','icon-copy','iconify-body','external-image'].includes(row.kind)) {
      const previewFor=editorObject
      void b.call(url=>[...document.querySelectorAll('[data-testid="bookmark-modal"] img')].some(img=>img.src===url||img.currentSrc===url),e.request.url).then(matches=>{if(matches){row.surface='editor-preview';row.previewFor=previewFor}}).catch(()=>{})
    }
  })
  b.on('Network.responseReceived', e => { const row = requests.get(e.requestId); if (row) Object.assign(row, { status:e.response.status,disk:e.response.fromDiskCache,sw:e.response.fromServiceWorker,headers:Object.fromEntries(Object.entries(e.response.headers??{}).filter(([name])=>['content-type','cache-control','x-icon-fallback'].includes(name.toLowerCase()))) }) })
  b.on('Network.loadingFinished', e => {
    const row=requests.get(e.requestId)
    if(row?.kind!=='icon-copy'||![200,409].includes(row.status)) return
    const read=b.send('Network.getResponseBody',{requestId:e.requestId}).then(response=>{
      const envelope=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body),data=envelope.data
      row.copyResult={protocol:data?.protocol,reason:data?.reason,persistence:data?.persistence,descriptor:data?.descriptor,hasImage:Boolean(data?.image),imageBytes:data?.image?.byte_length??0}
    }).catch(()=>{row.copyResult={unreadable:true}})
    responseReads.add(read);void read.finally(()=>responseReads.delete(read))
  })
  b.on('Network.loadingFailed', e => { const row = requests.get(e.requestId); if (row) Object.assign(row, { error: e.errorText, canceled: Boolean(e.canceled) }) })
  await b.setViewport({ width: 1366, height: 900, scale: 1 })
  await scenario('LOGIN-UI', async () => { await login(); return { authenticated: true } })
  assert(token, 'Login prerequisite failed')
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
  await scenario('28-ENABLE-DEFERRED', async () => {
    await home(); const documentStart = await b.call(()=>performance.timeOrigin); await settings(); const start = report.requests.length
    await click('.device-cache input'); await wait(() => document.querySelector('.device-status')?.textContent.includes('下次刷新'))
    await click('[aria-label="返回首页"]')
    await wait(sel => document.querySelector(sel), [scope()]); await click(scope() + ' .scope-root-trigger'); await verifyImages()
    const copies = report.requests.slice(start).filter(r => r.kind === 'icon-copy')
    assert(!copies.length, 'Enabling issued local-copy requests before complete reload'); assert(await b.call(()=>performance.timeOrigin)===documentStart,'Return unexpectedly replaced the document'); return { copyRequests: copies.length, sameDocument: true }
  })
  await scenario('28-COLD-RELOAD', async () => { await home(); const images = await verifyImages(); await shot('28-cold'); return images })
  await scenario('28-WARM-RELOAD', async () => { const start = report.requests.length; await home(); await verifyImages(); const network = assessStableIcons(report.requests.slice(start)); assert(network.passed, JSON.stringify(network)); return network })
  await scenario('28-RIGHT-CLICK-ON', async () => stableOperation(async () => { await click(card(0), 'right'); await key('Escape'); }))
  await scenario('29-TAB-FOCUS', async () => stableOperation(async () => {
    secondary = (await b.send('Target.createTarget', { url: 'about:blank' })).targetId
    await b.send('Target.activateTarget', { targetId: secondary }); await sleep(1200)
    await b.send('Target.activateTarget', { targetId: b.targetId }); await sleep(1500)
    await b.send('Target.closeTarget', { targetId: secondary }); secondary = null
  }))
  await scenario('28-EDIT-CANCEL', async () => stableOperation(async () => { await edit(0); await click('[data-testid="bookmark-modal"] .modal-actions .ghost-button') }, [`bookmark:${bookmarks[0].id}`]))
  await scenario('28-EDIT-ICON-SAVE', async () => stableOperation(async () => {
    await edit(0); await fill('[data-testid="bookmark-modal"] .icon-row input', fixtures.category.base64Uri)
    await click('[data-testid="bookmark-modal"] button[type="submit"]'); await wait(() => !document.querySelector('[data-testid="bookmark-modal"]'), [], 30000)
    bookmarks[0].pixels = fixtures.category.pixels; bookmarks[0].imageKey='category'
  }, [`bookmark:${bookmarks[0].id}`]))
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
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    try { await click(card(1), 'right'); await key('Escape'); await focusCycle(); await sleep(1500); return await verifyImages() }
    finally { await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }) }
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
  await scenario('28-COPY-503', async () => {
    await b.setViewport({width:1366,height:900,scale:1});
    await setFixtureIcon(0,fixtures[bookmarks[0].imageKey].uri); await clearCopies()
    let injected=0
    try { return await intercept([{urlPattern:'*/api/icon-local-copy',requestStage:'Request'}], async event => {
      let payload; try { payload=JSON.parse(event.request.postData) } catch { return false }
      if(payload.object_type!=='bookmark'||payload.object_id!==bookmarks[0].id) return false
      injected++; report.cases.at(-1).injection={kind:'target-copy-503',count:injected}; if(event.networkId) injectedRequests.add(event.networkId)
      await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'private, no-store'}],body:Buffer.from(JSON.stringify({code:5000,message:'Injected temporary copy failure'})).toString('base64')})
      return true
    },async()=>{ await home(); await verifyImages(); assert(injected>0,'Copy fault not exercised'); await shot('28-copy-fallback'); return {injected,images:'correct'} }) } finally { await setFixtureIcon(0,fixtures[bookmarks[0].imageKey].base64Uri) }
  })
  await scenario('29-OLD-ADMIN-RESPONSE', async () => {
    await home(); let held=null, forced=false
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
    await home();await homeAction('logout');await wait(()=>!localStorage.getItem('cf-navs.auth'));await b.waitForNetworkIdle(1000,15000)
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
  await scenario('29-OLD-401', async () => {
    await home(); const previousToken=token; let held=null
    return intercept([{urlPattern:'*/api/data/version*',requestStage:'Response'}],async event=>{
      if(held) return false; held=event; return true
    },async()=>{
      await focusCycle(); await localWait(()=>held,'Old version response')
      await homeAction('logout'); await wait(()=>!localStorage.getItem('cf-navs.auth'))
      await signInPlace(); const currentToken=token
      assert(currentToken&&currentToken!==previousToken,'Fresh-session prerequisite failed')
      await wait(id=>Boolean(document.querySelector(`[data-sort-id="${id}"]`)),[bookmarks[2].id])
      report.cases.at(-1).preconditions={freshSession:true,privateVisibleBeforeRelease:true}
      if(held.networkId) injectedRequests.add(held.networkId)
      await b.send('Fetch.fulfillRequest',{requestId:held.requestId,responseCode:401,responseHeaders:[{name:'content-type',value:'application/json'},{name:'cache-control',value:'no-store'}],body:Buffer.from(JSON.stringify({code:1001,message:'Injected old session failure'})).toString('base64')})
      await sleep(1500)
      const retained=await b.call(expected=>JSON.parse(localStorage.getItem('cf-navs.auth')||'null')?.token===expected,currentToken)
      report.cases.at(-1).afterRelease={sessionRetained:retained}
      assert(retained,'Old 401 cleared new session')
      await click(scope()+' .scope-root-trigger'); await verifyImages(); return {oldResponseDelivered:true,newSessionRetained:true}
    })
  })
  await scenario('29-CROSS-TAB-LOGOUT', async () => {
    await home(); secondary=(await b.send('Target.createTarget',{url:'about:blank'})).targetId
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
      assert(removed,'Other tab retained private data after logout'); await signInPlace()
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
  await scenario('29-LOGOUT', async () => {
    await b.setViewport({ width: 1366, height: 900, scale: 1 }); await home()
    await homeAction('logout'); await wait(() => !localStorage.getItem('cf-navs.auth'))
    await wait(title => ![...document.querySelectorAll('.bookmark-card-shell')].some(e => e.getAttribute('aria-label') === title), [bookmarks[2].title])
    return { privateRemoved: true }
  })
  report.limitations.push('Signed lease expiry boundaries, old-build upgrade and real mobile keyboard remain unexecuted; not implied by these results.')
} catch (error) { report.fatal = safe(error.message); console.log('FATAL ' + report.fatal) }
finally {
  stage = 'cleanup'
  try {
    await b.send('Fetch.disable').catch(() => {})
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {})
    if (ownedCategories.length) {
      await login()
      for (const id of [...ownedBookmarks].reverse()) await api('/bookmarks/' + id, undefined, 'DELETE')
      for (const id of [...ownedCategories].reverse()) await api('/categories/' + id, undefined, 'DELETE')
      const data = await api('/admin/data', undefined, 'GET')
      assert(!data.bookmarks.some(e => ownedBookmarks.includes(e.id)) && !data.categories.some(e => ownedCategories.includes(e.id)), 'Synthetic data remains')
      report.cleanup.serverFixturesRemoved = true
      await api('/logout', undefined)
    }
  } catch (error) { report.cleanup.serverError = safe(error.message) }
  if (secondary) await b.send('Target.closeTarget', { targetId: secondary }).catch(() => {})
  await Promise.allSettled([...responseReads])
  report.cleanup.browser = await b.cleanup()
  const protocolConflicts=new Set(validatedIconConflicts(report.requests))
  report.validatedConflicts=[...protocolConflicts]
  report.unexpectedHttp = report.requests.filter(e => e.status >= 400 && !injectedRequests.has(e.requestId) && !protocolConflicts.has(e.requestId))
  report.failedRequests = report.requests.filter(e => e.error)
  report.consoleFindings=report.browserLog.filter(e=>e.level==='error'&&!injectedRequests.has(e.requestId)&&!protocolConflicts.has(e.requestId))
  report.injectedRequests=[...injectedRequests]
  await persist()
  console.log(JSON.stringify({ output, cases: report.cases.map(({id,status})=>({id,status})), cleanup: report.cleanup, fatal: report.fatal }))
  if (report.fatal || report.interceptionError || report.unexpectedHttp.length || report.consoleFindings.length || report.cases.some(c => c.status === 'failed') || !report.cleanup.serverFixturesRemoved || !report.cleanup.browser.profileRemoved || report.cleanup.browser.errors.length || report.cleanup.browser.warnings.length) process.exitCode = 1
}

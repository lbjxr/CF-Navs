// CF-Navs API 冒烟测试：对本地 wrangler dev 实例跑一轮端到端接口验证。
// 用法：node scripts/smoke-test.mjs  （需先 npm run dev 并完成本地 D1 初始化）

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787'
const USER = process.env.ADMIN_USER || 'admin'
const PASS = process.env.ADMIN_PASS || 'replace-with-a-local-dev-password'
const SETUP_TOKEN = process.env.SETUP_TOKEN || ''

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(`${name}${detail ? ' — ' + detail : ''}`)
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function call(path, { method = 'GET', token, body, headers: extraHeaders } = {}) {
  const headers = { accept: 'application/json', ...extraHeaders }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  const text = await res.text()
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, headers: res.headers, json, text }
}

function section(title) {
  console.log(`\n# ${title}`)
}

async function main() {
  console.log(`CF-Navs 冒烟测试 → ${BASE}\n`)

  // 1. health
  section('健康检查')
  {
    const r = await call('/api/health')
    check('GET /api/health code=0', r.json?.code === 0, JSON.stringify(r.json))
    check('health status=ok', r.json?.data?.status === 'ok')
  }

  // 2. config
  section('公开配置')
  {
    const r = await call('/api/config')
    check('GET /api/config code=0', r.json?.code === 0)
    check('config 含 site_title', typeof r.json?.data?.site_title === 'string')
    check('config 含 public_mode', typeof r.json?.data?.public_mode === 'boolean')
  }

  // 3. 错误登录
  section('登录鉴权')
  {
    const r = await call('/api/login', { method: 'POST', body: { username: USER, password: 'wrong-password' } })
    check('错误密码登录被拒绝', r.json?.code !== 0, `code=${r.json?.code}`)
  }

  // 4. 正确登录
  let token = ''
  {
    const r = await call('/api/login', { method: 'POST', body: { username: USER, password: PASS } })
    check('正确登录 code=0', r.json?.code === 0, JSON.stringify(r.json))
    check('返回 token', typeof r.json?.data?.token === 'string' && r.json.data.token.length > 0)
    check('返回 expires_at', typeof r.json?.data?.expires_at === 'number')
    token = r.json?.data?.token || ''
  }
  if (!token) {
    console.log('\n无法获取 token，后续鉴权测试中止。')
    return finish()
  }

  // 5. me
  {
    const r = await call('/api/me', { token })
    check('GET /api/me 带 token code=0', r.json?.code === 0)
    check('me.username 匹配', r.json?.data?.username === USER, JSON.stringify(r.json?.data))
  }
  {
    const r = await call('/api/me')
    check('GET /api/me 无 token → 401', r.status === 401, `status=${r.status}`)
    check('me 无 token code=1001', r.json?.code === 1001, `code=${r.json?.code}`)
  }
  {
    const r = await call('/api/me', { token: 'invalid-token-xyz' })
    check('GET /api/me 无效 token → 401', r.status === 401, `status=${r.status}`)
  }

  // 6. 分类 CRUD + sort
  section('分类 CRUD 与排序')
  let catA, catB
  {
    const r = await call('/api/categories', { token })
    check('初始分类列表为空', Array.isArray(r.json?.data) && r.json.data.length === 0, `len=${r.json?.data?.length}`)
  }
  {
    const r = await call('/api/categories', { method: 'POST', token, body: { title: '常用工具', icon: '🔧' } })
    check('创建分类 A code=0', r.json?.code === 0, JSON.stringify(r.json))
    catA = r.json?.data
    check('分类 A 有 id', typeof catA?.id === 'number')
  }
  {
    const r = await call('/api/categories', { method: 'POST', token, body: { title: '学习资料' } })
    catB = r.json?.data
    check('创建分类 B code=0', r.json?.code === 0)
  }
  {
    const r = await call('/api/categories', { token })
    check('分类列表含 2 项', r.json?.data?.length === 2)
  }
  {
    const r = await call(`/api/categories/${catA.id}`, { method: 'PUT', token, body: { title: '常用工具(改)', icon: '🛠️' } })
    check('更新分类 A code=0', r.json?.code === 0)
    check('更新后标题生效', r.json?.data?.title === '常用工具(改)', r.json?.data?.title)
  }
  {
    // 顶层分类排序：PR #7 起 /api/categories/sort 按 CategorySortReq 要求 parent_id，
    // 顶层传 null（`worker/routes/categories.ts` sort 路由）。
    const r = await call('/api/categories/sort', {
      method: 'POST',
      token,
      body: { parent_id: null, ids: [catB.id, catA.id] },
    })
    check('分类排序 code=0', r.json?.code === 0, JSON.stringify(r.json))
    const list = (await call('/api/categories', { token })).json?.data || []
    check('排序后 B 在前', list[0]?.id === catB.id, `first=${list[0]?.id} expect=${catB.id}`)
  }

  // 7. 书签 CRUD + sort
  section('书签 CRUD 与排序')
  let bm1, bm2
  {
    const r = await call('/api/bookmarks', { method: 'POST', token, body: { category_id: catA.id, title: 'GitHub', url: 'https://github.com', icon: '', description: '代码托管', open_method: 1 } })
    check('创建书签1 code=0', r.json?.code === 0, JSON.stringify(r.json))
    bm1 = r.json?.data
  }
  {
    const r = await call('/api/bookmarks', { method: 'POST', token, body: { category_id: catA.id, title: 'MDN', url: 'https://developer.mozilla.org', open_method: 2 } })
    bm2 = r.json?.data
    check('创建书签2 code=0', r.json?.code === 0)
    check('open_method=2 持久化', bm2?.open_method === 2, `om=${bm2?.open_method}`)
  }
  {
    const r = await call(`/api/bookmarks/${bm1.id}`, { method: 'PUT', token, body: { category_id: catA.id, title: 'GitHub(改)', url: 'https://github.com', open_method: 1 } })
    check('更新书签1 code=0', r.json?.code === 0)
    check('书签标题更新', r.json?.data?.title === 'GitHub(改)')
  }
  {
    const r = await call('/api/bookmarks/sort', { method: 'POST', token, body: { ids: [bm2.id, bm1.id] } })
    check('书签排序 code=0', r.json?.code === 0)
    const list = (await call('/api/bookmarks', { token })).json?.data || []
    check('排序后 bm2 在前', list[0]?.id === bm2.id, `first=${list[0]?.id}`)
  }

  // 写后只确认版本的前提（代码审查三轮第 31 项）：写响应包络上的 data_version 就是随后
  // /api/data/version 报告的版本，且写接口返回的行与 /api/admin/data 里的同一行一致。
  section('写响应 data_version 与本地应用一致性')
  {
    const sameRow = (a, b) => {
      if (!a || !b) return false
      for (const key of Object.keys(a)) {
        if (key === 'icon_blob' || key === 'version') continue
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return `${key}: ${JSON.stringify(a[key])} != ${JSON.stringify(b[key])}`
      }
      return true
    }
    const versionAfter = async (label, r) => {
      const remote = (await call('/api/data/version', { token })).json?.data?.version
      check(`${label} 响应带 data_version 且等于服务端版本`, typeof r.json?.data_version === 'string' && r.json.data_version === remote, `resp=${r.json?.data_version} remote=${remote}`)
    }
    const adminData = async () => (await call('/api/admin/data', { token })).json?.data
    const created = await call('/api/bookmarks', { method: 'POST', token, body: { category_id: catA.id, title: '一致性', url: 'https://example.org', open_method: 1 } })
    await versionAfter('新建书签', created)
    const createdRow = (await adminData())?.bookmarks?.find((row) => row.id === created.json?.data?.id)
    const createdSame = sameRow(created.json?.data, createdRow)
    check('新建书签响应行 = 后台数据行', createdSame === true, String(createdSame))
    const updated = await call(`/api/bookmarks/${created.json?.data?.id}`, { method: 'PUT', token, body: { category_id: catA.id, title: '一致性(改)', url: 'https://example.org', open_method: 2 } })
    await versionAfter('更新书签', updated)
    const updatedRow = (await adminData())?.bookmarks?.find((row) => row.id === updated.json?.data?.id)
    const updatedSame = sameRow(updated.json?.data, updatedRow)
    check('更新书签响应行 = 后台数据行', updatedSame === true, String(updatedSame))
    const sorted = await call('/api/bookmarks/sort', { method: 'POST', token, body: { ids: [created.json?.data?.id, bm2.id, bm1.id] } })
    await versionAfter('书签排序', sorted)
    const sortedRows = (await adminData())?.bookmarks ?? []
    const sortOf = (id) => sortedRows.find((row) => row.id === id)?.sort
    check('书签排序后 sort = 提交下标', sortOf(created.json?.data?.id) === 0 && sortOf(bm2.id) === 1 && sortOf(bm1.id) === 2, `sorts=${sortOf(created.json?.data?.id)},${sortOf(bm2.id)},${sortOf(bm1.id)}`)
    const cat = await call('/api/categories', { method: 'POST', token, body: { title: '一致性分类' } })
    await versionAfter('新建分类', cat)
    const catRow = (await adminData())?.categories?.find((row) => row.id === cat.json?.data?.id)
    const catSame = sameRow(cat.json?.data, catRow)
    check('新建分类响应行 = 后台数据行', catSame === true, String(catSame))
    const catDeleted = await call(`/api/categories/${cat.json?.data?.id}`, { method: 'DELETE', token })
    await versionAfter('删除分类', catDeleted)
    const removed = await call(`/api/bookmarks/${created.json?.data?.id}`, { method: 'DELETE', token })
    await versionAfter('删除书签', removed)
    const sortedBack = await call('/api/bookmarks/sort', { method: 'POST', token, body: { ids: [bm2.id, bm1.id] } })
    check('恢复书签排序 code=0', sortedBack.json?.code === 0)
  }

  // 图标本地优先 v2：全局 icon_epoch 只随图标相关变化递增；可信设备副本接口已移除。
  section('图标全局标志位 icon_epoch')
  {
    const epochOf = async () => (await call('/api/data/version', { token })).json?.data?.icon_epoch
    const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>').toString('base64')
    const before = await epochOf()
    check('版本接口返回整数 icon_epoch', Number.isInteger(before), String(before))
    const created = await call('/api/bookmarks', { method: 'POST', token, body: { category_id: catA.id, title: 'Icon epoch fixture', url: 'https://example.com', icon, icon_source: 'custom', is_private: true } })
    check('icon_epoch fixture 创建成功', created.json?.code === 0 && Boolean(created.json?.data?.id))
    const id = created.json?.data?.id
    if (id) {
      try {
        const afterCreate = await epochOf()
        check('新增书签递增 icon_epoch', afterCreate > before, `${before} -> ${afterCreate}`)
        const admin = await call('/api/admin/data', { token, headers: { 'cache-control': 'no-cache' } })
        check('后台聚合携带同一 icon_epoch', admin.json?.data?.icon_epoch === afterCreate)
        const row = admin.json?.data?.bookmarks?.find(item => item.id === id)
        check('聚合返回轻量版本而非完整 icon_blob', row !== undefined && row.icon_blob === null)
        await call('/api/public/bookmarks/' + id + '/click', { method: 'POST' })
        check('点击不递增 icon_epoch', await epochOf() === afterCreate)
        const changed = await call('/api/bookmarks/' + id, { method: 'PUT', token, body: { category_id: catA.id, title: 'Changed epoch fixture', url: 'https://example.com', icon: null, is_private: true } })
        check('清空图片成功', changed.json?.code === 0)
        check('修改图标递增 icon_epoch', await epochOf() > afterCreate)
        const removedRoute = await call('/api/icon-local-copy', { method: 'POST', token, body: {} })
        check('可信副本接口已移除', removedRoute.json?.code !== 0 || removedRoute.status === 404, String(removedRoute.status))
      } finally {
        const mid = await epochOf()
        const removed = await call('/api/bookmarks/' + id, { method: 'DELETE', token })
        check('icon_epoch fixture 已清理', removed.json?.code === 0)
        check('删除书签递增 icon_epoch', await epochOf() > mid)
      }
    }
  }

  // 8. PROB-38 图标隐私缓存回归：公开 → 私密、分类公开 → 私密必须阻断旧 edge 正文。
  section('PROB-38 图标隐私缓存')
  const PROB38_ICON = 'data:image/svg+xml;base64,PHN2Zy8+'
  let prob38Bookmark
  {
    const r = await call('/api/bookmarks', {
      method: 'POST',
      token,
      body: {
        category_id: catA.id,
        title: 'PROB-38 bookmark',
        url: 'https://prob38.example',
        icon: PROB38_ICON,
        icon_source: 'custom',
        is_private: false,
      },
    })
    prob38Bookmark = r.json?.data
    check('PROB-38 创建公开图标书签', r.json?.code === 0)
  }
  if (prob38Bookmark?.id) {
    const iconPath = `/api/icon/${prob38Bookmark.id}?v=prob38-bookmark&cv=4`
    const publicIcon = await call(iconPath)
    check('公开图标首次返回真实响应', publicIcon.status === 200 && publicIcon.headers.get('X-Icon-Fallback') === null)
    check('公开图标不进入浏览器缓存', publicIcon.headers.get('Cache-Control') === 'no-store')
    const repeatedIcon = await call(iconPath)
    check('重复读取公开图标正文一致且仍为 no-store', repeatedIcon.status === 200 && repeatedIcon.text === publicIcon.text && repeatedIcon.headers.get('Cache-Control') === 'no-store')

    const makePrivate = await call(`/api/bookmarks/${prob38Bookmark.id}`, {
      method: 'PUT',
      token,
      body: {
        category_id: catA.id,
        title: 'PROB-38 bookmark',
        url: 'https://prob38.example',
        icon: PROB38_ICON,
        icon_source: 'custom',
        is_private: true,
      },
    })
    check('公开书签切私密成功', makePrivate.json?.code === 0)

    const privateIcon = await call(iconPath)
    check('私密翻转后同 URL 不命中旧真实图标', privateIcon.headers.get('X-Icon-Fallback') === '1')
    check('私密翻转后的兜底不进入共享缓存', privateIcon.headers.get('Cache-Control') === 'no-store')
  }
  {
    const categoryIcon = await call(`/api/categories/${catB.id}`, {
      method: 'PUT',
      token,
      body: { title: '学习资料', icon: PROB38_ICON, is_private: false },
    })
    check('创建公开分类图标成功', categoryIcon.json?.code === 0)
    const categoryPath = `/api/category-icon/${catB.id}?v=prob38-category&cv=4`
    const publicCategoryIcon = await call(categoryPath)
    check('公开分类图标首次返回真实响应', publicCategoryIcon.headers.get('X-Icon-Fallback') === null)
    check('公开分类图标不进入浏览器缓存', publicCategoryIcon.headers.get('Cache-Control') === 'no-store')
    const repeatedCategoryIcon = await call(categoryPath)
    check('重复读取分类图标正文一致且仍为 no-store', repeatedCategoryIcon.status === 200 && repeatedCategoryIcon.text === publicCategoryIcon.text && repeatedCategoryIcon.headers.get('Cache-Control') === 'no-store')

    const makePrivate = await call(`/api/categories/${catB.id}`, {
      method: 'PUT',
      token,
      body: { title: '学习资料', icon: PROB38_ICON, is_private: true },
    })
    check('公开分类切私密成功', makePrivate.json?.code === 0)
    const privateCategoryIcon = await call(categoryPath)
    check('分类私密翻转后同 URL 不命中旧真实图标', privateCategoryIcon.headers.get('X-Icon-Fallback') === '1')
    check('分类私密翻转后的兜底不进入共享缓存', privateCategoryIcon.headers.get('Cache-Control') === 'no-store')
  }

  // 9. 设置（含 background / theme / search_engine）
  section('设置读写（背景/主题/搜索引擎）')
  {
    const r = await call('/api/settings', { token })
    check('GET /api/settings code=0', r.json?.code === 0)
    const s = r.json?.data
    check('默认含 background 对象', s?.background && typeof s.background.type === 'string')
    check('默认含 search_engine.engines', Array.isArray(s?.search_engine?.engines) && s.search_engine.engines.length >= 2)
  }
  {
    const patch = {
      site_title: '我的导航',
      theme: 'dark',
      background: { type: 'image', value: 'https://img.example.com/bg.jpg', blur: 12, mask: 0.45 },
      search_engine: {
        current: 'DuckDuckGo',
        engines: [
          { name: 'DuckDuckGo', icon: '', url_template: 'https://duckduckgo.com/?q={q}' },
          { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
        ],
      },
    }
    const r = await call('/api/settings', { method: 'PUT', token, body: patch })
    check('PUT /api/settings code=0', r.json?.code === 0, JSON.stringify(r.json))
    const s = r.json?.data
    check('site_title 已更新', s?.site_title === '我的导航')
    check('theme=dark 已更新', s?.theme === 'dark')
    check('background.type=image', s?.background?.type === 'image')
    check('background.blur=12', s?.background?.blur === 12)
    check('background.mask=0.45', s?.background?.mask === 0.45)
    check('search_engine.current=DuckDuckGo', s?.search_engine?.current === 'DuckDuckGo')
    check('search_engine 引擎数=2', s?.search_engine?.engines?.length === 2)
  }
  {
    // 非法 theme 应被拒绝
    const r = await call('/api/settings', { method: 'PUT', token, body: { theme: 'rainbow' } })
    check('非法 theme 被拒绝(code=1002)', r.json?.code === 1002, `code=${r.json?.code}`)
  }
  {
    // 非法 background.type 应被拒绝
    const r = await call('/api/settings', { method: 'PUT', token, body: { background: { type: 'video' } } })
    check('非法 background.type 被拒绝', r.json?.code === 1002, `code=${r.json?.code}`)
  }

  // 浏览器扩展逐条确认分类；旧客户端不传 category_id 时仍使用默认收件分类。
  section('浏览器同步分类选择')
  {
    const enabled = await call('/api/settings', { method: 'PUT', token, body: { browser_sync_enabled: true } })
    check('开启浏览器同步', enabled.json?.code === 0)
    const preflight = await call('/api/categories', {
      method: 'OPTIONS',
      headers: { origin: 'chrome-extension://cf-navs-test', 'access-control-request-method': 'GET' },
    })
    check('扩展可预检分类列表', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === '*')
    const categories = await call('/api/categories', { token, headers: { origin: 'chrome-extension://cf-navs-test' } })
    check('分类列表鉴权响应带 CORS', categories.json?.code === 0 && categories.headers.get('access-control-allow-origin') === '*')

    const selected = await call('/api/browser-sync/bookmarks', {
      method: 'POST', token,
      body: { category_id: catA.id, bookmarks: [{ title: 'Selected category', url: 'https://selected.example' }] },
    })
    check('同步到显式选择的分类', selected.json?.code === 0 && selected.json?.data?.category_id === catA.id, JSON.stringify(selected.json))
    const selectedRows = (await call('/api/bookmarks', { token })).json?.data || []
    const selectedRow = selectedRows.find(item => item.url === 'https://selected.example')
    check('书签实际写入所选分类', selectedRow?.category_id === catA.id, JSON.stringify({ catA, selectedRows }))

    const missing = await call('/api/browser-sync/bookmarks', {
      method: 'POST', token,
      body: { category_id: 999999, bookmarks: [{ title: 'Missing category', url: 'https://missing.example' }] },
    })
    check('不存在的分类返回 1003', missing.json?.code === 1003)
    const missingRow = (await call('/api/bookmarks', { token })).json?.data?.find(item => item.url === 'https://missing.example')
    check('无效分类不会静默写入默认分类', missingRow === undefined)

    const legacy = await call('/api/browser-sync/bookmarks', {
      method: 'POST', token,
      body: { bookmarks: [{ title: 'Legacy category', url: 'https://legacy.example' }] },
    })
    check('旧客户端仍同步到默认分类', legacy.json?.code === 0 && legacy.json?.data?.category_title === '浏览器新增收藏')
    const invalid = await call('/api/browser-sync/bookmarks', {
      method: 'POST', token,
      body: { category_id: -1, bookmarks: [{ title: 'Invalid category', url: 'https://invalid.example' }] },
    })
    check('非法 category_id 返回 1002', invalid.json?.code === 1002)
    if (selectedRow?.id) await call(`/api/bookmarks/${selectedRow.id}`, { method: 'DELETE', token })
    const legacyRow = (await call('/api/bookmarks', { token })).json?.data?.find(item => item.url === 'https://legacy.example')
    if (legacyRow?.id) await call(`/api/bookmarks/${legacyRow.id}`, { method: 'DELETE', token })
  }

  // 9. public/data（公开模式开）
  section('公开数据聚合')
  {
    const r = await call('/api/public/data')
    check('GET /api/public/data 未登录可读(公开模式)', r.json?.code === 0, `code=${r.json?.code}`)
    const d = r.json?.data
    check('public/data 含 categories', Array.isArray(d?.categories))
    check('public/data 含 bookmarks', Array.isArray(d?.bookmarks))
    check('public settings 不含 admin_password', d && d.settings && !('admin_password' in d.settings))
    check('public settings 不含 public_mode', d && d.settings && !('public_mode' in d.settings))
    check('public settings 含 search_engine', !!d?.settings?.search_engine)
  }

  // 9b. 公开点击计数：D1 限流（每 IP + 书签 10 分钟 3 次），与计数同 batch
  section('点击计数限流')
  {
    const clickOnce = () => call(`/api/public/bookmarks/${bm1.id}/click`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.50' } })
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await clickOnce()).status)
    check('点击 4 次均返回 200', statuses.every((status) => status === 200), statuses.join(','))
    const bms = (await call('/api/bookmarks', { token })).json?.data || []
    const clicked = bms.find((b) => b.id === bm1.id)
    check('同一 IP + 书签只计数 3 次', clicked?.click_count === 3, `click_count=${clicked?.click_count}`)
    const missing = await call('/api/public/bookmarks/999999/click', { method: 'POST' })
    check('不存在的书签点击 → 404', missing.status === 404, `status=${missing.status}`)
  }

  // 10. 公开模式关闭 → 未登录被拒
  section('公开模式开关')
  {
    await call('/api/settings', { method: 'PUT', token, body: { public_mode: false } })
    const anon = await call('/api/public/data')
    check('public_mode=false 未登录被拒(code=1005)', anon.json?.code === 1005, `code=${anon.json?.code}`)
    const authed = await call('/api/public/data', { token })
    check('public_mode=false 带 token 可读', authed.json?.code === 0)
    // 恢复
    const back = await call('/api/settings', { method: 'PUT', token, body: { public_mode: true } })
    check('恢复 public_mode=true', back.json?.data?.public_mode === true)
  }

  // 11. 删除级联
  section('删除与级联')
  {
    // 删除分类 A（其下有 bm1,bm2）→ 书签应一并删除
    const del = await call(`/api/categories/${catA.id}`, { method: 'DELETE', token })
    check('删除分类 A code=0', del.json?.code === 0)
    const bms = (await call('/api/bookmarks', { token })).json?.data || []
    const leftover = bms.filter((b) => b.category_id === catA.id)
    check('分类下书签被级联删除', leftover.length === 0, `leftover=${leftover.length}`)
    const cats = (await call('/api/categories', { token })).json?.data || []
    check('分类 A 已删除', !cats.some((c) => c.id === catA.id))
  }
  {
    // 删除剩余书签（catB 下应无书签了，再建一个删之）
    const created = (await call('/api/bookmarks', { method: 'POST', token, body: { category_id: catB.id, title: '临时', url: 'https://example.com' } })).json?.data
    const del = await call(`/api/bookmarks/${created.id}`, { method: 'DELETE', token })
    check('删除单个书签 code=0', del.json?.code === 0)
    const bms = (await call('/api/bookmarks', { token })).json?.data || []
    check('书签确实被删除', !bms.some((b) => b.id === created.id))
  }

  // 12. favicon（容忍外网失败）
  section('favicon 获取（容忍外网受限）')
  {
    try {
      const r = await call('/api/fetch-favicon?url=' + encodeURIComponent('https://github.com'), { token })
      if (r.json?.code === 0 && typeof r.json?.data?.icon === 'string') {
        check('fetch-favicon 返回图标 URL', true)
        console.log(`    icon = ${r.json.data.icon}`)
      } else {
        console.log(`    (跳过断言) favicon 返回 code=${r.json?.code}（沙箱外网可能受限）`)
      }
    } catch (e) {
      console.log(`    (跳过断言) favicon 请求异常：${e.message}`)
    }
  }

  // 12.1 站点名称解析（容忍外网失败，但鉴权必须成立）
  section('站点名称解析 /api/fetch-site-meta')
  {
    const anon = await call('/api/fetch-site-meta?url=' + encodeURIComponent('https://github.com'))
    check('fetch-site-meta 未登录被拒绝', anon.status === 401 || anon.json?.code === 1001)

    const bad = await call('/api/fetch-site-meta?url=' + encodeURIComponent('ftp://example.com'), { token })
    check('fetch-site-meta 拒绝非 http(s) 地址', bad.json?.code === 1002)

    try {
      const r = await call('/api/fetch-site-meta?url=' + encodeURIComponent('https://github.com'), { token })
      if (r.json?.code === 0 && typeof r.json?.data?.title === 'string') {
        // 接口契约是永不失败：解析不出来也要给出域名兜底
        check('fetch-site-meta 返回非空站点名称', r.json.data.title.length > 0)
        console.log(`    title = ${r.json.data.title}`)
      } else {
        console.log(`    (跳过断言) fetch-site-meta 返回 code=${r.json?.code}（沙箱外网可能受限）`)
      }
    } catch (e) {
      console.log(`    (跳过断言) fetch-site-meta 请求异常：${e.message}`)
    }
  }

  // 13. 数据导入（覆盖式）
  section('数据导入 /api/import')
  {
    // 合法导入：2 分类 + 2 书签 + 设置
    const payload = {
      categories: [
        { id: 101, title: '导入分类A', icon: '', sort: 0, created_at: Date.now() },
        { id: 102, title: '导入分类B', icon: '', sort: 1, created_at: Date.now() },
      ],
      bookmarks: [
        { id: 201, category_id: 101, title: '导入书签1', url: 'https://a.example.com', icon: '', description: '', open_method: 1, sort: 0, created_at: Date.now() },
        { id: 202, category_id: 102, title: '导入书签2', url: 'https://b.example.com', icon: '', description: '', open_method: 2, sort: 0, created_at: Date.now() },
      ],
      settings: { site_title: '导入后的标题' },
    }
    const r = await call('/api/import', { method: 'POST', token, body: payload })
    check('合法导入 code=0', r.json?.code === 0, JSON.stringify(r.json))
    check('导入返回 2 分类', r.json?.data?.categories === 2, `got=${r.json?.data?.categories}`)
    check('导入返回 2 书签', r.json?.data?.bookmarks === 2)
    check('导入响应包含新数据集身份', /^[a-f0-9]{32}$/.test(r.json?.data?.data?.dataset_epoch ?? ''))

    const cats = (await call('/api/categories', { token })).json?.data || []
    const bms = (await call('/api/bookmarks', { token })).json?.data || []
    check('导入后分类被覆盖为 2 个', cats.length === 2, `len=${cats.length}`)
    check('导入后书签被覆盖为 2 个', bms.length === 2)
    // 导入按 remapImportRecords 从 1 起重编号（root 先于 child），并把书签的
    // category_id 重绑到新分类 id；原始 id 不保留，这是既有设计而非缺陷。
    const sortedCatIds = cats.map((c) => c.id).sort((a, b) => a - b)
    check('导入分类按 remap 从 1 起重编号', sortedCatIds.join(',') === '1,2', `ids=${sortedCatIds.join(',')}`)
    check('导入未保留原始分类 id', !cats.some((c) => c.id === 101 || c.id === 102), `ids=${sortedCatIds.join(',')}`)
    const catTitleById = new Map(cats.map((c) => [c.id, c.title]))
    const bmA = bms.find((b) => b.title === '导入书签1')
    const bmB = bms.find((b) => b.title === '导入书签2')
    check(
      '书签 category_id 重绑到正确分类',
      catTitleById.get(bmA?.category_id) === '导入分类A' && catTitleById.get(bmB?.category_id) === '导入分类B',
      `bm1→${catTitleById.get(bmA?.category_id)} bm2→${catTitleById.get(bmB?.category_id)}`,
    )
    const s = (await call('/api/settings', { token })).json?.data
    check('导入应用了 settings.site_title', s?.site_title === '导入后的标题', s?.site_title)
  }
  {
    // 非法导入：书签引用不存在的分类 → 拒绝
    const bad = {
      categories: [{ id: 1, title: 'X', icon: '', sort: 0, created_at: Date.now() }],
      bookmarks: [{ id: 1, category_id: 999, title: 'Y', url: 'https://y.example.com', icon: '', description: '', open_method: 1, sort: 0, created_at: Date.now() }],
    }
    const r = await call('/api/import', { method: 'POST', token, body: bad })
    check('引用缺失分类的导入被拒绝(1002)', r.json?.code === 1002, `code=${r.json?.code}`)
  }
  {
    // 非法导入：缺少 categories 数组 → 拒绝
    const r = await call('/api/import', { method: 'POST', token, body: { bookmarks: [] } })
    check('缺少 categories 的导入被拒绝', r.json?.code === 1002, `code=${r.json?.code}`)
  }
  {
    // 未授权导入 → 401
    const r = await call('/api/import', { method: 'POST', body: { categories: [], bookmarks: [] } })
    check('未登录导入 → 401', r.status === 401, `status=${r.status}`)
  }

  // 14. 登出
  section('登出')
  {
    const r = await call('/api/logout', { method: 'POST', token })
    check('登出 code=0', r.json?.code === 0)
    const after = await call('/api/me', { token })
    check('登出后 token 失效 → 401', after.status === 401, `status=${after.status}`)
  }

  // 15. 密码恢复（放最后：会重置密码并轮换 JWT secret，作废全部会话）
  section('密码恢复 /api/recover')
  if (!SETUP_TOKEN) {
    check('SETUP_TOKEN 未配置，跳过恢复场景', true, 'skipped')
  } else {
    const NEW_PASS = 'recovNew1'
    {
      const r = await call('/api/recover', { method: 'POST', body: { password: NEW_PASS }, headers: { 'X-Setup-Token': 'wrong-token' } })
      check('恢复错误令牌 → 401', r.status === 401, `status=${r.status}`)
    }
    {
      const r = await call('/api/recover', { method: 'POST', body: { password: NEW_PASS } })
      check('恢复缺令牌头 → 401', r.status === 401, `status=${r.status}`)
    }
    {
      const r = await call('/api/recover', { method: 'POST', body: { password: 'short1' }, headers: { 'X-Setup-Token': SETUP_TOKEN } })
      check('恢复弱密码 → 1002', r.json?.code === 1002, `code=${r.json?.code}`)
    }
    {
      const r = await call('/api/recover', { method: 'POST', body: { password: NEW_PASS }, headers: { 'X-Setup-Token': SETUP_TOKEN } })
      check('恢复成功 code=0', r.json?.code === 0, JSON.stringify(r.json))
      check('恢复返回原用户名', r.json?.data?.username === USER, `u=${r.json?.data?.username}`)
      check('恢复返回可用 token', typeof r.json?.data?.token === 'string' && r.json.data.token.length > 0)
    }
    {
      const r = await call('/api/login', { method: 'POST', body: { username: USER, password: NEW_PASS } })
      check('新密码可登录 code=0', r.json?.code === 0, JSON.stringify(r.json))
    }
    {
      const r = await call('/api/login', { method: 'POST', body: { username: USER, password: PASS } })
      check('旧密码登录被拒绝', r.json?.code !== 0, `code=${r.json?.code}`)
    }
  }

  finish()
}

function finish() {
  console.log(`\n================ 结果 ================`)
  console.log(`通过 ${pass} / ${pass + fail}`)
  if (failures.length) {
    console.log('失败项：')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  } else {
    console.log('全部通过 ✅')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('测试运行异常：', e)
  process.exit(2)
})

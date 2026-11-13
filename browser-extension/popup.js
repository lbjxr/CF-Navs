const $ = (id) => document.getElementById(id)
let currentConfig = null
let formEdited = false
let draft = null
let configRequest = 0
const panel = createPanelClient('popup', () => currentConfig ? ({
  baseUrl: $('baseUrl').value, username: $('username').value, expanded: $('credentials-panel').open,
}) : (draft || {}), loadConfig)

function isConnected(config) {
  return Boolean(
    config?.enabled &&
    config.baseUrl &&
    config.token &&
    (!config.expiresAt || config.expiresAt > Date.now()),
  )
}

function showStatus(message, type = 'neutral') {
  $('status').className = `notice ${type}`
  $('status-text').textContent = message
}

function setBusy(isBusy) {
  $('login').disabled = isBusy
  $('disable').disabled = isBusy
  $('pending').disabled = isBusy
  for (const id of ['baseUrl', 'username', 'password']) $(id).disabled = isBusy
  $('login').textContent = isBusy
    ? '正在连接...'
    : (isConnected(currentConfig) ? '保存并重新连接' : '登录并开启同步')
}

function applyConfig(config) {
  currentConfig = config
  const connected = isConnected(config)
  if (!formEdited) {
    $('baseUrl').value = draft?.baseUrl ?? config.baseUrl ?? ''
    $('username').value = draft?.username ?? config.username ?? ''
    $('credentials-panel').open = draft?.expanded ?? !connected
  }
  $('connection-summary').hidden = !connected
  $('connection-detail').textContent = connected ? `${config.username || '已登录'} · ${config.baseUrl}` : ''
  $('credentials-title').textContent = connected ? '修改登录信息' : '连接导航页'
  $('credentials-hint').textContent = connected ? '修改地址、账号或密码' : '首次使用需要登录'
  $('login').textContent = connected ? '保存并重新连接' : '登录并开启同步'
  if (connected) {
    showStatus('同步已开启 · 仅处理之后新增的书签', 'success')
  } else if (config.expiresAt && config.expiresAt <= Date.now()) {
    showStatus('登录会话已过期，请重新登录', 'error')
  } else {
    showStatus('尚未连接导航页')
  }
}

async function loadConfig() {
  const request = ++configRequest
  try {
    const response = await panel.send({ type: 'get-config' })
    if (request !== configRequest) return
    applyConfig(response.config)
    await panel.save()
  } catch (error) { showStatus(error.message || '读取连接状态失败', 'error') }
}

panel.restore().then((saved) => { draft = saved; return loadConfig() })
  .catch((error) => showStatus(error.message || '读取连接草稿失败', 'error'))

for (const id of ['baseUrl', 'username']) $(id).addEventListener('input', () => { formEdited = true })
$('credentials-panel').addEventListener('toggle', () => { if (currentConfig) formEdited = true })

$('toggle-password').addEventListener('click', () => {
  const password = $('password')
  const visible = password.type === 'text'
  password.type = visible ? 'password' : 'text'
  $('toggle-password').setAttribute('aria-label', visible ? '显示密码' : '隐藏密码')
})

$('login').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim()
  const username = $('username').value.trim()
  const password = $('password').value
  if (!baseUrl || !username || !password) {
    showStatus('请填写导航页地址、账号和密码', 'error')
    return
  }
  setBusy(true)
  showStatus('正在连接导航页...')
  try {
    await panel.send({ type: 'login', baseUrl, username, password })
    $('password').value = ''
    formEdited = false
    draft = null
    await loadConfig()
  } catch (error) { showStatus(error.message || '登录失败，请检查地址和账号', 'error') }
  finally { setBusy(false) }
})

$('pending').addEventListener('click', async () => {
  try {
    await panel.save()
    await panel.send({ type: 'open-pending' })
  } catch (error) { showStatus(error.message || '没有待同步的收藏', 'error') }
})

$('disable').addEventListener('click', async () => {
  setBusy(true)
  try {
    await panel.send({ type: 'clear-session' })
    formEdited = false
    draft = null
    applyConfig({ ...currentConfig, token: '', expiresAt: 0, enabled: false })
    await panel.save()
    showStatus('同步已暂停，会话已清除')
  } catch (error) { showStatus(error.message || '操作失败', 'error') }
  finally { setBusy(false) }
})

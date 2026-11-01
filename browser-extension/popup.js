const $ = (id) => document.getElementById(id)
let currentConfig = null

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
  $('baseUrl').value = config.baseUrl || ''
  $('username').value = config.username || ''
  $('connection-summary').hidden = !connected
  $('connection-detail').textContent = connected ? `${config.username || '已登录'} · ${config.baseUrl}` : ''
  $('credentials-panel').open = !connected
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

function loadConfig() {
  chrome.runtime.sendMessage({ type: 'get-config' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) return
    applyConfig(response.config)
  })
}

loadConfig()

$('toggle-password').addEventListener('click', () => {
  const password = $('password')
  const visible = password.type === 'text'
  password.type = visible ? 'password' : 'text'
  $('toggle-password').setAttribute('aria-label', visible ? '显示密码' : '隐藏密码')
})

$('login').addEventListener('click', () => {
  const baseUrl = $('baseUrl').value.trim()
  const username = $('username').value.trim()
  const password = $('password').value
  if (!baseUrl || !username || !password) {
    showStatus('请填写导航页地址、账号和密码', 'error')
    return
  }
  setBusy(true)
  showStatus('正在连接导航页...')
  chrome.runtime.sendMessage({ type: 'login', baseUrl, username, password }, (response) => {
    setBusy(false)
    if (chrome.runtime.lastError || !response?.ok) {
      showStatus(response?.error || '登录失败，请检查地址和账号', 'error')
      return
    }
    $('password').value = ''
    loadConfig()
  })
})

$('pending').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open-pending' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      showStatus(response?.error || '没有待同步的收藏', 'error')
      return
    }
    window.close()
  })
})

$('disable').addEventListener('click', () => {
  setBusy(true)
  chrome.runtime.sendMessage({ type: 'clear-session' }, (response) => {
    setBusy(false)
    if (chrome.runtime.lastError || !response?.ok) {
      showStatus(response?.error || '操作失败', 'error')
      return
    }
    applyConfig({ ...currentConfig, token: '', expiresAt: 0, enabled: false })
    showStatus('同步已暂停，会话已清除')
  })
})

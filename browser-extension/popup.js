const $ = (id) => document.getElementById(id)

function showStatus(message, type = 'neutral') {
  $('status').className = `notice ${type}`
  $('status-text').textContent = message
}

function setBusy(isBusy) {
  $('login').disabled = isBusy
  $('disable').disabled = isBusy
  $('pending').disabled = isBusy
  $('login').textContent = isBusy ? '正在连接...' : '登录并开启同步'
}

chrome.runtime.sendMessage({ type: 'get-config' }, (response) => {
  if (chrome.runtime.lastError || !response?.ok) return
  $('baseUrl').value = response.config.baseUrl || ''
  $('username').value = response.config.username || ''
  if (response.config.enabled) showStatus('同步已开启 · 仅处理之后新增的书签', 'success')
})

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
    showStatus('已开启同步 · 新增收藏时将打开分类选择窗口', 'success')
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
    showStatus('同步已暂停，会话已清除')
  })
})

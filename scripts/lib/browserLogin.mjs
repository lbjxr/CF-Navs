// 在页面里调用 /api/login 并把会话写进 localStorage（与前端 authSession 的存储键一致）。
// 该函数会被序列化后注入页面执行，必须自包含、不引用外部变量。
// chrome-regression、perf-audit 与两个图标实验脚本原先各自复制了一份（代码审查三轮第 35 项）。
// includeToken 仅供登记本轮会话的调用者；返回的 Token 不得进入日志或审计结果。
export async function loginInPage(baseUrl, username, password, includeToken = false) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || body.code !== 0) {
    return includeToken
      ? { ok: false, status: response.status, code: typeof body?.code === 'number' ? body.code : null }
      : { ok: false, status: response.status, body }
  }
  try {
    localStorage.setItem('cf-navs.auth', JSON.stringify(body.data))
  } catch (error) {
    // 已签发的会话仍须返回给本轮清理登记；存储失败单独报告。
    if (includeToken) return { ok: false, status: response.status, token: body.data.token, storageFailed: true }
    throw error
  }
  const result = { ok: true, status: response.status, username: body.data.username, expires_at: body.data.expires_at }
  return includeToken ? { ...result, token: body.data.token } : result
}

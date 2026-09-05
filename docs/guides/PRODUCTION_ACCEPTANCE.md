# 部署后验收

CF-Navs 的部署来源是 `develop`：代码推上去之后 Cloudflare 自动构建并更新站点，没有手动 deploy 步骤。本文是「推送之后怎么验收」的操作手册。

目标站点与凭据一律来自仓库根目录的 `verify.local.json`（已在 `.gitignore` 中），模板见 `verify.local.example.json`。**真实域名、账号、密码不写进任何会提交的文件**，本文也不例外。

## 1. 先分清三层，再决定跑什么

生产实例带着真实数据。把「能不能自动跑」这个问题拆成副作用等级之后，绝大多数验收其实是安全的：

| 层 | 副作用 | 怎么跑 | 覆盖内容 |
| --- | --- | --- | --- |
| **Tier 0** | 无服务端状态变化 | `npm run accept:prod`，随时可跑 | 首访/二访、Service Worker 与预缓存、离线、匿名边界、导出子集、弹窗尺寸、三档截图、登出撤销 |
| **Tier 1** | 改设置再还原 | 逐次授权，手动执行 | 自定义 JS 执行（S3）、13 套预设逐套视觉（REQ-08b） |
| **Tier 2** | 破坏性 | **生产禁止**，只在本地实例做 | replace/merge 导入（会清库）、管理员密码轮换 |

Tier 0 之所以能无条件跑，是因为它连一次写接口都不调。唯一会改变服务端状态的动作是登出，而它作废的只是本次脚本自己创建的会话。

`npm run regression:chrome` 里的密码轮换场景属于 Tier 1，已默认关闭 —— 见 §6。

## 2. 标准流程

```bash
# 1. 本地闸门先过，别把已知失败推上去
npm run type-check && npm test && npm run build

# 2. 推送到 develop，Cloudflare 自动部署
git push origin HEAD:develop

# 3. 等新版本真正生效（不要凭推送成功就断定线上已更新）
#    判据是构建产物哈希，不是 /api/data/version——后者返回的是数据版本号，与部署无关
curl.exe -s "$BASE_URL/" | Select-String -Pattern 'assets/index-[^"]+\.js'

# 4. 只读验收
npm run accept:prod

# 5. 需要旧的完整回归时（同样只读，密码轮换默认关闭）
npm run regression:chrome

# 6. 性能预算
npm run perf:audit
```

第 3 步不能省。Cloudflare 的构建需要时间，推送返回成功只代表 Git 收到了提交。

判断新版本是否已生效的唯一可靠依据是**构建产物哈希**：首页 HTML 里引用的 `assets/index-<hash>.js` 变了，说明新构建已经上线。`/api/data/version` 不能用于此 —— 它返回的是数据版本号（`data_version`，随书签/分类/设置变化），与部署了哪个构建完全无关。本地 `npm run build` 后 `dist/index.html` 里的哈希就是期望值，和线上比对即可。

`npm run accept:prod` 的报告里带 `deployedBundle` 字段，记录本次实际测到的 bundle 文件名。**在旧版本上跑验收会得出与代码无关的结论**，事后靠这个字段能分辨报告对应哪个构建。

## 3. 配置

```jsonc
// verify.local.json（Git 忽略）
{
  "baseUrl": "https://<你的域名>",
  "adminUser": "<管理员账号>",
  "adminPass": "<管理员密码>",
  "chromeDebugPort": "9228",   // regression:chrome 用
  "acceptDebugPort": "9231"    // accept:prod 用
}
```

凭据也可以只用 `ADMIN_USER` / `ADMIN_PASS` 环境变量，环境变量优先级更高。

写进文件的前提是它确实没被 Git 跟踪。`.gitignore` 里有一行并不等于安全 —— 如果文件曾被 `git add -f` 或在 ignore 规则生效前提交过，之后每次写入都会进版本库。因此脚本每次运行都用 `git ls-files --error-unmatch` 复核，一旦发现被跟踪就拒绝执行，并提示轮换密码（旧密码可能已经在历史里）。

两个脚本用不同的调试端口，这样可以同时跑而不互相抢。

## 4. Tier 0 覆盖了 backlog 的哪些条目

| 检查 ID | Backlog | 判据 |
| --- | --- | --- |
| `install-status-probed-once-on-first-visit` | PROB-13 L1 | 清空站点状态后首访，`/api/install/status` 恰好一次 |
| `install-status-not-probed-on-second-visit` | PROB-13 L1 | 二访零次 |
| `home-app-mounted` | PROB-13 L1 | 首页挂载且渲染出分类区 |
| `precache-holds-entry-bundle` | PROB-13 L3 | `cf-navs-v*` 里同时有 `assets/index-*.js` 与 `.css` |
| `second-visit-served-by-service-worker` | PROB-13 L3 | 二访存在 `fromServiceWorker` 的响应 |
| `offline-navigation-renders-shell` | PROB-13 L4 | CDP 置离线后仍能渲染首页 |
| `cache-storage-within-budget` | PROB-23 | Cache Storage 总量 ≤ 5 MiB |
| `home-images-not-broken` | PROB-23 | 无 `naturalWidth === 0` 的已加载图片 |
| `anonymous-admin-data-denied` | PROB-20c | 匿名 `/api/admin/data` 得到 401 或 `code=1001` |
| `anonymous-private-bookmark-icon-denied` | PROB-20c | 匿名取私密分类下书签的图标被拒 |
| `anonymous-private-category-icon-denied` | PROB-20c | 匿名取私密分类图标被拒 |
| `partial-export-builds-subset-with-parent` | PROB-14 | 子集导出含被选分类且补齐父分类 |
| `bookmark-modal-*`（3 项） | PROB-13 U1–U4 | 桌面与 390x844 下弹窗渲染、圆角一致、不溢出视口 |
| `bookmark-modal-actions-single-row-on-mobile` | PROB-13 U1–U4 | 移动端底部操作栏所有按钮同一行且不溢出 |
| `viewport-screenshots-captured` | PROB-17 | 430x932 / 768x1024 / 1440x900 三档截图落盘 |
| `logout-accepted` + `revoked-token-rejected-within-window` | PROB-19v | 登出后旧 token 在窗口内被拒，并记录实际生效毫秒数 |
| `no-page-exceptions` / `no-console-errors` | PROB-13 | 全程无页面异常与 console error |

报告与截图写到 `tmp/acceptance/`（该目录已被 Git 忽略）。报告在落盘前过一遍脱敏，凭据不会出现在文件里。

**`SKIP` 不是失败。** 实例上不存在被测对象（例如一个私密分类都没有）时记为 skip 并说明原因，不计入失败，也不影响退出码 —— 否则真失败会被噪声淹没。要验证私密对象的匿名边界，实例上至少得有一个私密分类和一个挂在它下面的书签。

## 5. Tier 0 覆盖不到的，仍然要人工

这些不是「懒得自动化」，是自动化拿不到有效证据：

| 条目 | 为什么必须人工 |
| --- | --- |
| PROB-13 `U1–U4` 的 iOS 输入放大 | iOS Safari 在计算后字号 < 16px 时自动放大页面。这是 iOS Safari 独有行为，桌面 Chrome 的移动仿真不复现 —— 必须真实 iPhone |
| PROB-13 `L4` 的「已检测到新版本」提示 | 需要连续两次真实部署，第二次部署后旧页面才会收到 SW 更新事件 |
| PROB-13 `S3` 自定义 JS | 要写入 `custom_js` 设置才能验证真实执行与 CSP 行为，属 Tier 1 |
| PROB-13 `S3 导入提示` | 要选一个含自定义 JS 的备份文件才会弹确认框。只看提示不点确认是安全的，但需要人工选文件 |
| PROB-13 `S4` 当前页弹层 | 需要一个允许被嵌入的站点作为书签目标，取决于实例数据 |
| PROB-14 的 replace/merge 导入 | replace 会清库。**只在本地实例验证**，绝不在生产跑 |
| PROB-19v 的 KV 写入故障注入 | 要让 KV 真的写失败才能走到 `store_unavailable` 分支，生产上没有安全的注入手段 |
| REQ-08b 13 套预设视觉 | 要逐套写入 `background_preset_id`，属 Tier 1；且「好不好看」需要人眼 |
| PROB-16 的数值断点 | `820px` 分行 2 行/98px、浮动按钮 `top=18` 这类一次性数值证据，已在台账里明确标为不构成持续回归 |

## 6. 安全边界

- **端口被占用时默认拒绝**，不静默复用。那个实例可能是使用者自己的 Chrome，也可能是上一次被强杀留下的孤儿（进程收到 SIGKILL 时清理逻辑跑不到）。静默复用会让结果建立在未知浏览器状态上，还会让清理整段跳过。确实要连专用实例时设 `ACCEPT_ALLOW_EXISTING_CHROME=1`。
- **临时 profile 名必须匹配 `cf-navs-chrome-profile-<id>`**，否则脚本拒绝启动。清理只按这个精确路径匹配进程，**绝不按进程名批量结束 Chrome**。
- **清理结果属于测试结果**。场景全过但清理失败时报告「场景通过，清理失败」并以非零码退出，不报告完整通过。
- **密码轮换默认关闭**。`npm run regression:chrome` 原本会把管理员密码改成随机临时值再还原；进程在中途被打断时，临时密码只存在于内存里，管理员访问就永久丢失。现在需要 `REGRESSION_ALLOW_PASSWORD_ROTATION=1` 显式开启，跳过时那两条断言记为通过并在 `actual` 里标明 `skipped`。登出撤销的等价验证由 `accept:prod` 用只读方式覆盖，不需要动密码。
- 报告与日志在输出前过 `redactCredentials()`。不要把 `verify.local.json`、报告 JSON 或终端输出贴进 Issue 或提交信息。

## 7. 孤儿进程怎么清

脚本被强杀后可能留下临时 Chrome。按精确 profile 路径清，一条 PowerShell：

```powershell
Get-ChildItem $env:TEMP -Directory -Filter 'cf-navs-chrome-profile-*' | ForEach-Object {
  $dir = $_.FullName
  $owned = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($dir) }
  foreach ($proc in $owned) { Stop-Process -Id $proc.ProcessId -Force }
  Start-Sleep -Milliseconds 800
  Remove-Item $dir -Recurse -Force
}
```

它只结束命令行里精确包含测试 profile 路径的进程。**不要用 `taskkill /IM chrome.exe` 或 `Get-Process chrome | Stop-Process`** —— 那会关掉使用者自己的浏览器。

## 8. 排障

| 现象 | 原因与处理 |
| --- | --- |
| `Debug port N is already in use` | 端口上有别的 Chrome。先 `curl http://127.0.0.1:N/json/version` 看它是谁；是孤儿就按 §7 清理，是专用实例就设 `ACCEPT_ALLOW_EXISTING_CHROME=1` |
| `Port N is in use but does not answer /json/version` | 端口被非 DevTools 的东西占着。**使用者自己的 Chrome 会随机占用一批本地端口**——首次配置时实测撞上过一个。换一个空闲端口写进 `chromeDebugPort` / `acceptDebugPort` |
| 用 `curl` / `urllib` 直接请求站点得到 **403** | Cloudflare 拦掉了不带 `User-Agent` 的请求，返回的是挑战页而不是站点内容。**这不代表站点故障**：带上正常浏览器 UA 就是 200，验收脚本用真实 Chrome 也不受影响。手工探测时记得加 `-H "user-agent: Mozilla/5.0 ..."` |
| `temp profile not deleted after 18s of retries` | Windows 上 Chrome 退出后 `first_party_sets.db`、`*.bdic` 等文件的句柄释放滞后于进程退出。**这是 warning 不是 error**：进程已归零，没有安全问题，只是磁盘上留了个目录。按 §7 清掉即可 |
| `verify.local.json is tracked by Git` | 凭据文件进了版本库。`git rm --cached verify.local.json`，然后**轮换管理员密码** |
| `Missing verification target origin` | `verify.local.json` 缺 `baseUrl`，或 JSON 语法错误 |
| 验收结果与代码不符 | 大概率是在旧版本上跑的。回到 §2 第 3 步确认部署已生效 |
| `profile removal: EBUSY` | Chrome 刚退出，文件句柄未释放。脚本已做退避重试；仍失败时按 §7 手动清 |
| localhost 目标返回 502 | `HTTP_PROXY` 拦截了本地请求。用 `curl.exe --noproxy '*'` 或给脚本设 `NO_PROXY=127.0.0.1,localhost` |

## 9. 首次生产验收基线（2026-09-05）

被测构建 `assets/index-E5e6ANTt.js`。这组数字是后续比较的基线，明显偏离时先怀疑回归。

| 指标 | 实测 | 阈值 |
| --- | --- | --- |
| `accept:prod` | 27 passed / 0 failed / 0 skipped | 全通过 |
| `perf:audit` | 9 passed / 0 failed | 全通过 |
| 登出撤销生效 | 178 ms | ≤ 15 000 ms |
| 书签图标请求数 | 235 | ≤ 260 |
| Cache Storage | 0.74 MiB | ≤ 5 MiB |
| 管理数据传输量 | 37 669 B | ≤ 60 000 B |
| 首页书签卡片 | 370 | ≥ 300 |
| 首页破图 | 0 | 0 |
| Service Worker 命中 | 9 个响应 | > 0 |

**最有价值的一条结论**：匿名取私密书签图标（`/api/icon/1015`）与「不存在的 id」**逐字节相同**（326 B，SHA-256 一致），私密分类同理；带授权 key 时返回不同内容（568 B / 329 B），且 `cache-control: private, no-store`。四条组合起来才证明 PROB-20 方案 1 与 PROB-20b 在生产上真的生效——单看 HTTP 状态码永远得不出这个结论，因为该设计**刻意不返回 401**。

一处已知的第三方失败：某书签指向的外站图片设了 `Cross-Origin-Resource-Policy: same-origin`，浏览器拒收。站点管不着，前端兜底生效（首页 0 破图），因此计入 informational 而不是失败。

## 10. 脚本分工

| 脚本 | 目标 | 副作用 | 说明 |
| --- | --- | --- | --- |
| `npm run accept:prod` | 生产 | 无 | 本文主角。部署后验收，覆盖 §4 的清单 |
| `npm run regression:chrome` | 生产 | 无（除显式开启密码轮换） | 更早的功能回归：首页/后台/搜索/右键菜单/鉴权探针 |
| `npm run perf:audit` | 生产 | 无 | 性能预算：图标请求数、Cache Storage、传输量 |
| `npm run smoke` | 本地 | 有（自建临时实例） | 自己起隔离实例 + 临时 D1，跑 API 端到端后拆除 |

`scripts/lib/cdpSession.mjs` 是 `accept:prod` 用的 CDP 会话层。`chrome-regression.mjs` 目前仍带着自己那份同源的内联实现 —— 两份尚未合并，等它下次需要改连接层时再迁移，不为了去重就动一个已经在用的验证工具。

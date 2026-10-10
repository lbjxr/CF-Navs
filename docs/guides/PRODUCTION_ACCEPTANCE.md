# 部署后验收

CF-Navs 的部署来源是 `develop`：代码推上去之后 Cloudflare 自动构建并更新站点，没有手动 deploy 步骤。本文是「推送之后怎么验收」的操作手册。

目标站点与凭据一律来自仓库根目录的 `verify.local.json`（已在 `.gitignore` 中），模板见 `verify.local.example.json`。**真实域名、账号、密码不写进任何会提交的文件**，本文也不例外。

## 1. 先分清三层，再决定跑什么

生产实例带着真实数据。把「能不能自动跑」这个问题拆成副作用等级之后，绝大多数验收其实是安全的：

| 层 | 副作用 | 怎么跑 | 覆盖内容 |
| --- | --- | --- | --- |
| **Tier 0** | 无服务端状态变化 | `npm run accept:prod`，随时可跑 | 首访/二访、Service Worker 与预缓存、离线、匿名边界、导出子集、弹窗尺寸、三档截图、登出撤销 |
| **Tier 1** | 改设置再还原 | 获得对应写入与恢复授权后，通过真实页面控件执行；可使用浏览器自动化 | 自定义 JS 执行（S3）、导航布局切换、13 套预设逐套视觉（REQ-08b） |
| **Tier 2** | 破坏性 | **生产禁止**，只在本地实例做 | replace/merge 导入（会清库）、管理员密码轮换 |

Tier 0 之所以能无条件跑，是因为它连一次写接口都不调。唯一会改变服务端状态的动作是登出，而它作废的只是本次脚本自己创建的会话。

`npm run regression:chrome` 里的密码轮换场景属于 Tier 2，已默认关闭，仅在隔离本地实例获得明确授权后执行 —— 见 §6。

## 2. 标准流程

```bash
# 1. 本地闸门先过，别把已知失败推上去
npm run type-check && npm test && npm run build

# 2. 推送到 develop，Cloudflare 自动部署
git push origin HEAD:develop

# 3. 等新版本真正生效（不要凭推送成功就断定线上已更新）
#    Cloudflare 的 UA 拦截：不带 user-agent 会拿到 403 挑战页，不是站点故障
curl.exe -s -H "user-agent: Mozilla/5.0 Chrome/152" "$BASE_URL/" | Select-String -Pattern 'assets/index-[^"]+\.js'

# 4. 只读验收
npm run accept:prod

# 5. 需要旧的完整回归时（同样只读，密码轮换默认关闭）
npm run regression:chrome

# 6. 性能预算
npm run perf:audit
```

第 3 步不能省。Cloudflare 的构建需要时间，推送返回成功只代表 Git 收到了提交。

**不要拿本地 `dist` 的哈希去等线上出现同一个值。** Cloudflare 在自己的环境重新构建，产物哈希与本机 `npm run build` 的结果不必相同 —— 实测等了 400 秒也等不到：线上哈希确实变了（说明部署已发生），但那是它自己算出来的值。

可用的判据，按可靠性排序：

1. **验证改动本身的可观察结果**。这是最强的判据，因为它同时证明了「部署了」和「部署对了」。例如加了一条 CSS 预留，就去线上量那个元素的 `padding-right`。
2. **线上哈希相对上次验收记录的值变了**。只能说明有新部署，不能说明是哪一次推送。
3. `/api/data/version` **不能用**：它返回的是数据版本号（`data_version`，随书签/分类/设置变化），与部署了哪个构建完全无关。

`npm run accept:prod` 的报告里带 `deployedBundle`，记录本次实际测到的 bundle 文件名。它的用途是事后分辨「这份报告对应哪个构建」，不是用来和本地比对。

### 同仓库关联多个 Cloudflare 账号时

- GitHub 上不同账号的 Worker 可能都叫同一个名字，检查名称相同不能证明目标账号已部署。读取 check-runs 时使用 `filter=all` 并处理分页；按 `details_url` 中已核准的 Cloudflare 账号、Worker 和 build ID 区分，不能只取默认返回的最新一项。同一 build 可能保留较早的 in_progress 记录，要核验它对应的成功完成记录。
- GitHub API 调用前确认活动账号，Git 推送的 SSH 身份另行核验。实际账号 ID 与站点 URL 只存在本地验证配置/证据，不写进仓库。
- 如果最新提交只有 GitHub CI 而没有目标账号的 Cloudflare 构建，先检查完整构建历史、Git App 授权、分支及路径过滤；不要把清浏览器缓存、重试旧提交或他账号的成功当作修复。
- 授权正常但单次事件未建立构建时，可由维护者明确授权一次标注用途的空提交触发新 push。新旧 tree 应相同，禁止强推；它只是恢复手段，不证明平台内部根因，也不是自动循环重试机制。推送可能触发所有已关联账号的既有自动化，需事先说明，不能擅自断开其他账号。
- 目标账号构建成功后，仍按本节的可观察行为和真实站点验收确认上线，不以本地/线上产物哈希必须相同作为门槛。

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
| `prob38-public-to-private-same-url` | PROB-38 | 公开图标匿名预热后改为私密，使用同一 `v` 的匿名请求不得返回旧真实正文，必须为 `no-store` identity-free fallback |
| `prob38-ancestor-privacy-flip` | PROB-38 | 公开祖先→私密、私密祖先→公开分别验证深层 bookmark/category-icon 的拒绝与恢复 |
| `prob38-orphan-cycle-fail-closed` | PROB-38 | 缺失父级、孤儿分类和循环分类的 bookmark/category-icon 匿名请求均 `no-store` fallback |
| `prob38-sw-cache-migration` | PROB-38 | 新 SW 激活后旧 `cf-navs-v*` runtime cache 删除，`/api/category-icon/*` 不进入 Cache Storage |
| `export-control-restores-test-target` | PROB-13 | 主动切到本轮自建空标签，测量前激活原测试页，防止后台 requestAnimationFrame 永久等待；精确清理额外标签 |
| `partial-export-rejects-empty-selection` | PROB-14 | 清空真实分类选择后，导出按钮禁用 |
| `partial-export-child-with-parent-no-settings` | PROB-14 | 实际下载只含所选非空子分类、必要父分类及该子分类的全部书签，设置为 `null` |
| `partial-export-child-with-settings` | PROB-14 | 同一子集在设置开关开启后带出完整设置，分类与书签内容不变 |
| `partial-export-root-includes-children` | PROB-14 | 选择父分类时，下载包含该父分类、全部直接子分类及其书签并集 |
| `bookmark-modal-*`（3 项） | PROB-13 U1–U4 | 桌面与 390x844 下弹窗渲染、圆角一致、不溢出视口 |
| `bookmark-modal-actions-single-row-on-mobile` | PROB-13 U1–U4 | 精确匹配表单直属动作栏，取消/保存两按钮可见、同一行、可命中且不溢出卡片或视口；缺失/隐藏/空栏一律失败 |
| `modal-real-input-*` | PROB-13 U1–U4 | 桌面与移动视口用真实鼠标打开/取消分类和书签弹窗，点击表单输入框后用 Tab/Enter 取消书签；等待懒加载可见，不合成 DOM 事件 |
| `modal-negative-control-*` | PROB-13 U1–U4 | 在本轮页面依次注入动作栏缺失、空栏、隐藏、溢出和遮挡，断言均被拒绝；每项恢复 DOM 后重新通过，不写服务端 |
| `modal-flow-no-server-writes` / `modal-flow-browser-diagnostics` | PROB-13 U1–U4 | 弹窗阶段无业务写入、非预期 HTTP/网络错误、Chrome Log 错误、console error 或页面异常；导航/交互及取消分别留证 |
| `viewport-screenshots-captured` | PROB-17 | 430x932 / 768x1024 / 1440x900 三档截图落盘 |
| `logout-accepted` + `revoked-token-rejected-within-window` | PROB-19v | 登出后旧 token 在窗口内被拒，并记录实际生效毫秒数 |
| `no-page-exceptions` / `no-console-errors` | PROB-13 | 全程无页面异常与 console error |

> PROB-38 四项是图标隐私专项验收目标：当前 `accept:prod` 通用脚本尚未自动执行它们。当前提交已由本地 L1 smoke、真实隔离 Worker/Chrome 和单测覆盖；推送后应按上述 ID 运行只读专项探针并把结果写入发布记录，不能用通用首页/Cache Storage 通过推断 PROB-38 已通过。

导出验证通过真实鼠标操作备份面板，在应用的下载边界捕获实际 Blob；不由探针自行构造备份。按 ID 和完整字段比对分类、书签及设置，整站备份冒充子集、缺失父分类、混入父级/兄弟书签、丢记录或设置开关失效都会失败。生产备份正文只驻留内存，原生磁盘下载被禁止，报告只保存计数与判定，不保存书签内容。

定向定位可设置 `ACCEPT_SCOPE=modals`；报告会列出未执行的首访、离线、匿名、导出及三档首页截图，不得把定向通过当全量验收。默认 `all` 仍运行完整流程。中途异常也记录失败、已执行检查及资源清理，不能丢失报告。

报告与截图写到 `tmp/acceptance/`（该目录已被 Git 忽略）。报告在落盘前过一遍脱敏，凭据不会出现在文件里。

**必需 UI 缺失不是 `SKIP`。** 动作栏定位失败、无按钮、懒加载超时或取消无效均失败；报告中的 `modals` 保存几何、真实输入结果、负向对照和该阶段请求。分类弹窗未定义 Escape 关闭，不凭空要求该行为；书签键盘取消先通过真实点击进入输入框，再使用 Tab 到取消按钮并按 Enter。报告同时保留 `initialFocusInside`；该路径不等于首次打开自动聚焦或完整焦点陷阱通过。首访/离线等待可观测页面就绪，不用固定短延时替代；清站点状态后先离开旧文档再开始首访计数。

**`SKIP` 不是失败。** 实例上不存在被测对象（例如一个私密分类都没有）时记为 skip 并说明原因，不计入失败，也不影响退出码 —— 否则真失败会被噪声淹没。要验证私密对象的匿名边界，实例上至少得有一个私密分类和一个挂在它下面的书签。

PROB-14 还要求至少有一个带书签的二级分类，并有不属于该子分类的书签用于验证排除边界。找不到该样本时，`partial-export-real-download` 记为 `skip`，该项仍未验收；不要因脚本退出码为 0 而关闭验证欠账。追加/覆盖回导仍只在隔离本地实例中，通过实际文件导入流程验证。

## 5. Tier 0 之外的验证边界

下表说明通用 Tier 0 脚本未覆盖的范围，不是当前待办清单，也不表示这些项目全部无法自动化。真实设备限制、需要写入授权的专项和历史已完成验收须区分；当前欠账看 [BACKLOG.md](../BACKLOG.md)，已交付证据看变更记录。

| 条目 | 环境或副作用边界 |
| --- | --- |
| PROB-13 `U1–U4` 的 iOS 输入放大 | iOS Safari 在计算后字号 < 16px 时自动放大页面。这是 iOS Safari 独有行为，桌面 Chrome 的移动仿真不复现 —— 必须真实 iPhone |
| PROB-13 `L4` 的「已检测到新版本」提示 | 需要连续两次真实部署，第二次部署后旧页面才会收到 SW 更新事件 |
| PROB-13 `S3` 自定义 JS | 要写入 `custom_js` 设置才能验证真实执行与 CSP 行为，属 Tier 1 |
| PROB-13 `S3 导入提示` | 通过真实文件选择控件加载含自定义 JS 的备份，核对 UTF-8 体积、执行风险与换行后取消；可使用浏览器原生文件选择自动化。不得确认覆盖导入，且应核验没有 `/api/import` 请求 |
| PROB-13 `S4` 当前页弹层 | 需要一个允许被嵌入的站点作为书签目标，取决于实例数据 |
| PROB-14 的 replace/merge 导入 | replace 会清库。**只在本地实例验证**，绝不在生产跑 |
| PROB-19v 的 KV 写入故障注入 | 要让 KV 真的写失败才能走到 `store_unavailable` 分支，生产上没有安全的注入手段 |
| REQ-08b 13 套预设视觉 | 要逐套写入 `background_preset_id`，属 Tier 1；且「好不好看」需要人眼 |
| PROB-16 的数值断点 | `820px` 分行 2 行/98px、浮动按钮 `top=18` 这类一次性数值证据，已在台账里明确标为不构成持续回归 |
| REQ-15 可信图标的部署与升级验收 | `accept:prod` / `perf:audit` 不会启用设备信任或取得可信副本。授权测试站的真实 UI 专项见 [Issue 浏览器回归](ISSUE_BROWSER_REGRESSION.md)；同 profile 重开等已有证据不再视为未验收，剩余租期/权限组合及跨构建范围看 BACKLOG。`test:icon-storage` 和 `regression:icons:local` 只证明隔离本地环境 |

### 5.1 自定义 JS 与 CSP 专项的复验步骤

S3 的已完成证据见 [变更记录](../../CHANGELOG.md#prob-13-自定义-js-与-csp-验收)，当前剩余任务只在 [BACKLOG](../BACKLOG.md) 维护。以下是后续复验方法，不表示通用 `accept:prod` 已自动覆盖 S3。

1. 使用专用临时浏览器，先备份原设置到仓库外；确认本轮获准临时修改并恢复 `custom_js`。测试脚本只计数并显示标记，不访问外部服务；已有脚本须保留，不能静默覆盖。
2. 从后台“自定义样式/脚本”文本框输入。保存前检查隔离预览不执行；实际点击保存并返回首页，验证可见标记、执行计数和 Blob 脚本加载。正常流程同时监听 CSP 违规、控制台、页面异常及网络错误。
3. 连续点击主题开关，确认同一文档内内容未变时计数不增加；刷新后新文档执行一次。响应头须允许 `script-src 'self' blob:` 且不允许脚本的 `unsafe-inline` / `unsafe-eval`，但响应头检查不能代替执行结果。
4. 在测试文档内创建无外部副作用的内联脚本及内联事件反例，通过真实点击触发事件；确认均未执行，并分别观察 `script-src-elem` / `script-src-attr` 拦截。只将准确匹配反例的安全日志归类为预期，随后移除反例。
5. 从真实文件选择按钮加载含中文 JS 的合成备份，分别覆盖小于和大于 1 KiB 的内容及空 JS 对照。核对 UTF-8 字节数、B/KB 显示、执行风险和段落换行；在桌面、平板及手机模拟视口检查提示边界与按钮命中。点击取消或按 Escape，不确认覆盖导入，并核验没有 `/api/import` 请求。
6. 通过设置表单恢复原值，再回读完整设置核对一致；刷新后确认测试标记消失。退出测试会话并确认撤销，清理专用浏览器/profile。恢复或清理失败必须单独报告，不计为完整通过。

导航布局专项的控件路径、矩阵和图标证据边界见 [导航布局组合复验](ISSUE_BROWSER_REGRESSION.md#导航布局组合复验)。Chrome 手机模拟不替代 iOS/Safari、软键盘、安全区或实际读屏软件。

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
| 预缓存长期为空，或独立 `CacheStorage.open()` / `put()` 报内部错误 | 先用新的短临时 Chrome profile 对照，避免把 profile 根目录放进多层报告输出目录。Windows 上过长的完整 profile 路径可能导致浏览器存储失败；保留 `CHROME_PROFILE_ROOT` 的系统临时目录默认值，报告/截图仍可输出到仓库外的独立目录。若短路径仍失败，再查站点 SW 与网络，不能放宽缓存断言 |
| 验收结果与代码不符 | 大概率是在旧版本上跑的。回到 §2 第 3 步确认部署已生效 |
| `profile removal: EBUSY` | Chrome 刚退出，文件句柄未释放。脚本已做退避重试；仍失败时按 §7 手动清 |
| localhost 目标返回 502 | `HTTP_PROXY` 拦截了本地请求。用 `curl.exe --noproxy '*'` 或给脚本设 `NO_PROXY=127.0.0.1,localhost` |

## 9. 首次生产验收基线（2026-09-05）

首次基线构建 `assets/index-E5e6ANTt.js`；子分类标签预留修复上线后在 `assets/index-CydO-vTL.js` 上复跑，同样 27/27。这组数字是后续比较的基线，明显偏离时先怀疑回归。

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
| `npm run test:icon-storage` | 本地 | 有（隔离 Chrome/临时 IndexedDB） | 原生存储、断网读盘与 100/500/1,000 条五轮暖命中基准；不测 Worker/D1 或生产平台 |

`scripts/lib/cdpSession.mjs` 是 `accept:prod` 用的 CDP 会话层。`chrome-regression.mjs` 目前仍带着自己那份同源的内联实现 —— 两份尚未合并，等它下次需要改连接层时再迁移，不为了去重就动一个已经在用的验证工具。

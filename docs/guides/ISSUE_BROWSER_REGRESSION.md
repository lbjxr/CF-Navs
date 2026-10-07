# Issue 28–30：测试站真实浏览器回归

本流程承接 `ICON_ACCEPTANCE.md`，不是接口 smoke 的替代名称。通过真实 Chrome 的鼠标、键盘、标签页激活执行操作；网络、控制台、实际图像和生命周期分别验收。测试失败只记录证据，本脚本不修复产品或自动部署。

## 安全与运行条件

- 目标和凭据仅从未跟踪的 `verify.local.json` / 环境变量读取，不复制到本文件。
- 仅在当前任务明确授权测试站临时数据写入后，设置 `ISSUE_BROWSER_WRITE_FIXTURES=1` 并运行 `node scripts/issue-browser-regression.mjs`。
- 创建独立有头 Chrome profile；真实 UI 登录。测试专用 Chrome 禁用 Windows 原生窗口遮挡暂停，避免窗口被其他应用覆盖时懒加载/动画帧停滞；不覆盖 visibilityState、不改图片 loading，真实标签切换与生命周期仍然生效。报告记录该环境边界，不能拿它证明原生窗口遮挡下的性能。API 仅用于创建、核验和删除本轮合成数据，不替代被验收的 UI 保存、菜单、登录或退出动作。
- 本轮数据：唯一名称的父分类、子分类、两个公开书签与一个私密书签。书签和分类使用不同的合成像素签名；一般用 base64 控制格式，专门的代理回退用例才切换至 URL 编码格式，避免一种失败污染所有独立用例。
- `ISSUE_CASES` 可用逗号指定独立用例；登录、基线、开启偏好仍执行；冷加载作为独立用例选择，未选项明确记录为 not-run。`28-COPY-TIMEOUT`、`28-BROWSER-RESTART-ONLINE`、`28-BROWSER-RESTART-OFFLINE`、`29-LOGOUT-NAVIGATION-RACE`、`28-NATIVE-CATEGORY-TIMEOUT` 是额外 opt-in，全量默认命令也不隐式运行，必须在 `ISSUE_CASES` 中点名。
- 字段使用完整原生按键序列替换，保存前逐字核验 value；只读投影造成的数据丢失会保留为失败，再恢复本轮自己的 fixture 隔离后续用例。
- 不修改既有书签、全站设置、密码，不批量导入；不触发部署或 Issue 状态变化。
- 最终按记录 ID 删除本轮对象并重新读取验证不存在；撤销测试会话；关闭本次 target/浏览器并验证 profile 清理。失败仍保存报告，清理失败为整轮失败。

## 证据和判定

报告与截图写入系统临时目录，路径由终端返回，不进入仓库。报告记录被测入口脚本路径；本地构建成功不代表测试站已部署相同代码。

- 请求从发起时绑定场景，记录 requestId、时间、类型、initiator 类型、无查询参数路径、对象类型/ID、响应码、浏览器缓存/SW 标记、取消和错误。终止事件记录 CDP `terminalTime`、`terminalKind`、`durationMs`，并保留 `finishedTime` / `failureTime`；未终止请求没有这些字段，不能记为耗时 0。响应增加 `protocol`（如 h3）和仅含有限数值的 `timing`，`-1` 表示该阶段未提供测量，不是负耗时；不新增远端 IP、原始 header/body 采集。`Network.dataReceived` 另记首/末数据时间、数据块数和累计明文/编码字节数；`loadingFinished` 记最终 `encodedDataLength`，`loadingFailed` 保留 `blockedReason`。没有对应事件时字段缺失，不伪造 0 字节完成。
- 普通书签图标、分类图标、两类副本、Iconify、外部图片必须区分。data/blob 资源不计作外网请求；有正向 DOM 归属证据的编辑预览单列。HTTP 200 和取消的网络请求都计入额外工作量，不能只看失败请求。
- 可用性判定：独立 fixture 清单、实际图像解码/像素，以及每个展示位置的存在性。缺失不通过，图片能解码也不等于内容正确。
- 过程判定：操作前安装 rAF 采集，记录 missing/text/unloaded/src-changed；没有采集到帧不能通过。单图修改仅豁免该对象，不豁免分类或其他书签。
- 启用偏好只允许同 document 延迟生效；返回首页必须点击应用按钮，不把后台的 replaceState 当成浏览器可后退历史。
- 热缓存前置条件包含子分类实际加载，不能以“主卡片就绪”推断其他对象也已预热。
- Runtime console、页面异常与 Chrome Log 域分别记录。CSP 等基线问题单列；故障注入只按确切 requestId 标记，不整体忽略 401/503。
- 单个用例失败后保留失败，不用后来成功覆盖；基线失败应停止依赖用例。

## 用例步骤与出口

| 用例 | 操作及前置 | 必须满足 |
| --- | --- | --- |
| LOGIN-UI | 全新 profile，登录弹窗填写账号并提交 | 建立真实登录态；不能误点背景搜索表单 |
| 28-BASELINE | 缓存关闭，显示固定合成分类和三张书签 | 父/子分类、公开/私密书签均匹配独立像素清单 |
| 28-RIGHT-CLICK-OFF | 基线稳定，右键目标卡片，Escape | 非目标图像不退化；没有冗余图标正文请求 |
| 28-ENABLE-DEFERRED | UI 进入设备缓存，开启，点应用“返回首页” | 同一 document；副本零请求，图像保持正确 |
| 28-COLD-RELOAD | 完整加载并显示全部 fixture | 正确图像与必要副本建立完成 |
| 28-WARM-RELOAD | 已完成预热的同 profile 再加载 | 图像正确；检查正文请求，出现新请求不能直接通过 |
| 28-LEGACY-SNAPSHOT-ADMIN / PUBLIC | 同一专用 profile 中仅将本轮书签的快照图标种成旧版 empty、移除本地投影版本，但保持服务端数据版本不变；分别走登录/匿名的真实完整加载 | 实际聚合元数据请求成功、持久化恢复当前投影版本、所有可见合成图像匹配独立像素预期；匿名不能显示私密 fixture。只证明旧格式恢复，不冒充跨两构建或旧 SW 升级 |
| 28-RIGHT-CLICK-ON | 可信热状态，打开/关闭菜单 | 无无关正文请求与过程退化 |
| 29-TAB-FOCUS | 建专用第二标签，激活后再返回原标签 | 合法私密对象保留；无无关图标重载 |
| 28-EDIT-CANCEL | 右键编辑，取消 | 无服务端书签写入；非目标图像稳定 |
| 28-EDIT-ICON-SAVE | UI 更换目标合成图并保存 | 目标内容更新；非目标图像与正文请求稳定 |
| 28-EDIT-TITLE-DATA | 先确认本 profile 已保存省略图标正文的快照，再完整加载并编辑公开/私密书签 | 表单源字段完整，标题修改不会清空服务端图标；不把其他待修复的全局重建当成本用例前置 |
| 28-EDIT-TITLE-SAVE | 只修改目标标题并保存 | 图像内容不变，记录不必要重建/正文请求 |
| 29-OFFLINE-FOCUS | 已加载有效私密图，测试标签断网，交互后恢复网络 | 保留仍合法的本地内容；断网仅作用测试目标 |
| 30-MENU-三档视口 | 1366×768、390×844、1000×300；末排右键 | 菜单矩形可见，编辑按钮实际命中 |
| 30-嵌套移动 | 先进入排序草稿，再打开移动分类选择 | 嵌套列表可用；Escape/取消退出；不能在普通菜单里假定存在“移动” |
| 28-CANCEL-REACQUIRE | 暂扣私密副本与授权回复，先放行授权；图标在线 URL 在复制未完成时变化 | 被取消操作不能让新申请卡住；必须观测到新申请并校验真实图像 |
| 28-COPY-503 | 本 profile 清理副本；只对目标副本请求返回 503 | 故障确实命中；在线回退内容正确；记录有界重试和实际正文 |
| 28-COPY-TIMEOUT（显式可选） | UI 清理副本，原生 IDB 核验目标公开 fixture 的 entry/body 均不存在；完整重载清除内存句柄，暂扣该对象真实副本请求，HTTP 缓存/SW 暂时旁路 | 9–15 秒内由前端自行取消被扣请求；15 秒内真实普通代理显示正确像素，错误不落 IDB；解除拦截后自动发起新副本请求，正确 Blob 及内容哈希写入 IDB；只核准具体注入取消 requestId |
| 29-OLD-ADMIN-RESPONSE / 29-OLD-ANONYMOUS-RESPONSE | 真正焦点刷新，暂扣对应聚合响应，身份切换后释放 | 旧成功响应不能污染新身份视图 |
| 28-STORAGE-QUOTA / UNAVAILABLE | 清理本 profile 副本，注入 IDB 写配额或打开失败 | 注入命中且控制样本仍显示正确 |
| 28-CLOCK-BEHIND-600MS | 测试页面时钟慢 600ms，不改服务端 | 页面仍正确恢复图像，不据此扩展到过期边界 |
| 29-LOGOUT-LOGIN-INTENT | 暂扣退出后的匿名公开数据或暖快照版本确认响应（排除带认证头请求）；真实打开登录弹窗并输入合成用户名，再释放旧响应 | 新弹窗与输入值保持；不靠等待旧流程完成来掩盖竞态，不提交该合成登录 |
| 29-OLD-401 | 真正切页触发版本请求，暂扣响应；退出后在同文档重新登录，先验证新会话图像就绪，再释放旧 401 | 旧错误不能清除已就绪的新会话、私密数据或图像；不把初始化中的未就绪图像误归因于旧错误 |
| 29-CROSS-TAB-LOGOUT | 第二真实标签先看到私密对象；第一标签退出 | 第二标签私密 DOM 与认证状态均清除 |
| CSP-THEME-COLOR | 真实切换亮/暗模式并读取当前 HTML 响应策略 | meta theme-color 与实际模式一致，严格脚本策略和 no-transform 均存在 |
| 28-RELOGIN-ICONS | 同 profile 退出后重新 UI 登录并完整加载 | 新会话下所有 fixture 图像重新正确显示，不与数据乱序前置混淆 |
| 29-LOGOUT | UI 退出 | 私密对象清除，不仅检查登录按钮变化 |

## 独立的持续挂起验收：28-COPY-TIMEOUT

由负责运行的会话在确认测试站已更新后执行；编辑脚本不意味着已完成浏览器验证：

```powershell
$env:ISSUE_BROWSER_WRITE_FIXTURES='1'
$env:ISSUE_CACHE_MODE='on'
$env:ISSUE_CASES='28-COPY-TIMEOUT'
node scripts/issue-browser-regression.mjs
```

上述环境变量已有值时，运行前保存、结束后恢复；不要复制凭据到命令中。命令沿用目标/凭据解析器，执行登录、图像基线、延迟开启缓存三个必需前置；其他案例记 not-run。不依赖先跑 503、取消重申请或热加载，不允许 cache-off 代替。

- 选择本轮一个公开书签，避免把私密 grant URL 替换的 owner 取消误认成网络期限。私密 grant 交错由 `28-CANCEL-REACQUIRE` 覆盖；本例不声称覆盖私密超时、全部队列槽位耗尽或各类连接故障。
- 通过真实设置 UI 清副本；原生 `indexedDB.databases/open` 只读核验库已存在且启用、目标 `entries` / `bodies` 均缺失，再验证新 document。不存在/不可用的库不算冷缺失。HTTP 缓存与 SW 仅在案例内旁路，不改许可、快照、Loader 或 IDB 实现。
- 现有 CDP Fetch Request 阶段仅暂扣该 fixture 的真实副本，不 fulfill、不主动 fail、不用测试自己的 abort 定时器。报告关联 Fetch ID、Network requestId、暂扣时刻、单调请求/终止时间。早于 9 秒的 owner 取消、晚于 15 秒的结束、503 或连接关闭均不能冒充 10 秒期限通过。
- 故障仍在时读取实际 DOM 图像，要求目标 `/api/icon/<id>` 的真实 Fetch 请求：200、image MIME、非兜底、非 HTTP 缓存/SW、正文完成且像素符合独立 fixture。要求该响应结束后新创建并已显示的 Blob（创建时间、MIME、大小与独立像素证据）；原生 Image 假设、既有 blob/data 热图、单纯 200、诊断 fetch、重载或解除暂扣后才显示均不算回退证据。随后 IDB 仍须 entry/body 均缺失；同一故障窗口出现第二个目标副本请求会保留现场并失败，不把多次取消合并成一次成功。
- 解除拦截后不改数据、不再次清库、不调用 Loader 或手工 fetch；等待挂载组件现有有界重试发出晚于恢复时刻的新请求。要求 protocol=1、session-scoped、正确描述符和正文字节数、正确 Blob 像素；IDB 原生 Blob 按协议前缀 + MIME + 正文计算的 SHA-256、大小及描述符必须与响应相符（不是裸正文 SHA-256）。被解除暂扣的旧请求不能当成新申请。
- `cases[].timeout` 保留冷前置、注入请求、失败前截图/存储元数据、取消耗时、代理 requestId、恢复新 requestId 及 IDB 校验。故障失败在 Fetch 恢复前持久化；后续恢复不改写失败。既有 intercept finally 及案例 finally 恢复 Fetch、HTTP 缓存/SW；全局 finally 删除本轮服务器 fixture 并清理专用浏览器。恢复失败使整轮失败。
- `expectedTimeoutRequests` 仅在冷缺失、时限、真实代理和像素全部通过后加入暂扣的确切 requestId；`28-CANCEL-REACQUIRE` 同样只记录自己的被扣请求。最终 `validatedInjectedCancellations` 还须核对 `canceled=true + net::ERR_ABORTED`。**未注入取消不再默认成功**；只有下节规定的完整原生图片签名换源链可另行核准。另一个 requestId、其他网络错误、HTTP 错误和控制台异常仍进失败门，不能恢复整体豁免。

无需浏览器的判定逻辑检查：

```powershell
node --check scripts/issue-browser-regression.mjs
node --check scripts/lib/issueBrowserEvidence.mjs
node --check scripts/lib/iconCopyStorageProbe.mjs
node --experimental-sqlite node_modules/vitest/vitest.mjs run tests/unit/issueBrowserEvidence.test.ts tests/unit/iconCopyStorageProbe.test.ts
```

`protocol` / timing 是观测证据，不是连接异常根因结论。副本队列 10 秒期限与普通 `<img>` 持续挂起是两条链路：即使同路径 `fetch(cache:no-store)` 成功，原 Image 仍未响应/显示时也不能判通过，不能由副本修复推断匿名图片挂起根因已定位。不得延长既有等待或用额外请求掩盖失败；保留原图片 requestId 与独立诊断请求。纯判定单测通过不代表测试站案例通过。

## 快速退出导航与原生分类图片超时

```powershell
$env:ISSUE_BROWSER_WRITE_FIXTURES='1'
$env:ISSUE_CASES='28-BROWSER-RESTART-OFFLINE,29-LOGOUT-NAVIGATION-RACE,28-NATIVE-CATEGORY-TIMEOUT'
node scripts/issue-browser-regression.mjs
```

- 快速导航用例保留旧反例：退出后只确认本地会话清除，不等匿名图片/快照就绪，立即完整导航；保留原 home 首个分类图像等待顺序。先证明原页面仍未就绪，再检查新文档、私密对象移除、独立像素和有界恢复，不以普通旧快照用例的就绪前置替代它。
- 原生超时用例单独先建立匿名就绪前置。仅修改本轮子分类 SVG 的无视觉注释，产生同像素但新内容版本，避免继承另一用例的悬空 URL；该 fixture 最终统一删除。先通过应用确认已物化的版本和当前实际节点，固定准确 URL，再通过 CDP 暂扣真实原生图片的 200 响应，不主动发送 error/load，也不直接改图片 URL；允许产品自己用 retry=1 发出新请求并校验完整正文和像素。
- 原生加载仅在元素实际可见、document 可见且在线时计 10 秒；成功、错误、换源、离屏、隐藏、离线和销毁均取消对应期限；完成状态必须属于当前请求源，不能让旧 Blob 的完成状态提前结束新 URL 的等待。重试复用有界退避，最多三次自动重试，之后仅由限频的 focus/online 事件恢复；成功后保留已恢复的 retry URL，避免重新请求原悬空 URL。可信 Blob 仍由可信副本模块管理，外部/data 预览不走该网络看门狗。
- `verifiedNativeCategoryRetries` 仅单列有完整恢复链的旧 ERR_ABORTED：至少九秒等待、同文档/场景/对象、旧使用者退出、新节点首次挂载、同一原始 URL 身份（只删除 retry，保留 key/v）、重试序号递增、200 非兜底完整响应和原生解码成功。没有终止事件时不虚构取消，HTTP 错误、丢事件、换 key/v 和未完成替代仍失败。
- 报告只记录 retry 数字与不透明 baseSourceId，不记录完整 URL 或签名参数。普通请求统计、授权边界和所有失败门保持有效。

## 匿名旧快照的前置与快速导航竞态

旧快照用例不应只等 localStorage 登录标记消失就立刻导航。退出仍可能正在刷新公开数据；现在先在原文档确认私密 fixture 已移除、公开 fixture 图像与公共快照均就绪，再开始完整重载及旧格式注入。report.cases[].anonymousBaseline 记录同文档、像素和持久化前置，不使用固定延时伪造完成。

“退出尚未完成就立即再次导航”是独立的交错路径。该对照曾复现原生分类图像挂起，单纯改用 Page.reload 没有消除；旧失败报告保留在本地证据，不能由正常前置的旧快照通过推断此竞态已解决。

## 真正关闭重开：同一 profile 的在线与离线恢复

```powershell
$env:ISSUE_BROWSER_WRITE_FIXTURES='1'
$env:ISSUE_CASES='28-BROWSER-RESTART-ONLINE,28-BROWSER-RESTART-OFFLINE'
node scripts/issue-browser-regression.mjs
```

- 三个必需前置仍执行，其他未选择场景明列 not-run。在线和离线场景各自先验证本轮公开/私密书签及两类分类图标均为正确 Blob，原生 IDB 中 entry/body 存在且协议哈希一致。
- 仅关闭本轮创建的浏览器：关闭前精确 profile 进程计数为正，关闭 target 和 Browser 后计数归零，目录保留；随后在相同绝对路径创建新进程与新标签。复用用户浏览器、仅刷新、仅关闭标签、计数未知、换 profile 均不能通过。
- 使用本轮 localStorage 标记证明 profile 连续性，比较原会话仅输出相等布尔值，不记录凭据。重开后不得调用登录接口，不清理或拷贝站点数据，也不人工补发副本请求。逐项复核持久化描述符、正文大小/协议哈希、真实像素、Blob 展示和私密对象。
- 在线重开要求页面自己发起并成功完成真实鉴权元数据刷新；离线重开先确认旧页面已由 SW 接管，在新目标首次导航前断网，必须观察到真实 API 断网失败且没有成功的鉴权数据响应，同时保留有效许可范围内的本地展示。随后恢复网络并复验图像。
- 零图标正文请求只针对本轮五个 fixture，其他请求仍完整记录并受全局错误门约束。该用例不声称覆盖过期许可、真实24小时等待、服务器已撤销的离线会话、不同构建升级或回滚。
- 中间关闭结果 profilePreserved=true 是有意保留，不是最终清理。report.browserLifetimes 与 cases[].restart 记录每次 PID/target 及关闭计数，最终 cleanup 必须删除同一临时 profile、撤销会话并删除本轮服务器数据。
- CdpSession.restart 保留主机事件监听和证据数组，runner 重新安装新页面的 bindings/采证脚本；不重复注册 b.on。进程查询失败或空输出不能解释为0，PowerShell路径使用正确的单引号字面量。

## 原生图片签名换源的取消证据

原生 Image 的取消不等于网络故障，也不能按 ERR_ABORTED 整体忽略。runner 在每个 document 安装只读 MutationObserver/load/error 探针，导航前与场景结束时批量关联请求；不更改 src、loading、网络响应或产品 store。

- URL 与 query 值只在本轮内存中用于关联，不写入报告。报告只含 sourceId、nodeId、对象类型/ID、参数名、文档时间原点、加载尺寸和时间。每个文档最多保留 2000 条事件；丢事件、探针缺失、错误时间线均不能形成成功证明。
- `verifiedSignedImageReplacements` 要求同一文档/场景/对象：旧请求确实 ERR_ABORTED；src 只更换 key 参数；取消前所有旧 source 使用者都已换源或移除；准确的新请求返回 200 图像、非兜底，正文完成，并有对应节点完成解码的原生 load 事件。
- 支持同节点换源，或完整的“换 key → 旧节点 removed → 新节点 observed → loaded”交接链；单纯另一张图片成功不够。节点期间再次换源、仍有旧使用者、替代请求未完成、HTTP 错误或文档不匹配，全部拒绝。
- 时间关联使用 CDP 单调时间与文档 performance.timeOrigin；MutationObserver 只保证观察时刻，允许 100ms 交付容差和明确的 500ms 换源关联窗口。没有时间字段时不填零、不猜测。
- 用户更换图标时，已发出的副本请求可能被完整保存响应中的已验证正文替代。`verifiedEditCopyCancellations` 只接受成功的真实图标保存场景：同会话、同对象的唯一 PUT 成功；取消发生在保存响应附近；请求描述符匹配已知保存前/后版本；独立像素通过，原生 IDB 正文及哈希确实更换且持久化。未知描述符、缺少前后记录、其他会话、错误状态或失败场景仍拒绝；旧报告缺少这些证据时不回填通过。
- 已核准旧 requestId 保留在 failedRequests，并单独列出 replacementRequestId、nodeId/replacementNodeId、换源/取消/加载时间。其他取消、真正的超时或连接错误仍进入失败门。采证失败本身也使整轮失败。
- 暖快照刷新应直接应用完整权威数据；不能为渐进首屏优化把已显示的完整列表重新缩为首批。只有冷状态继续分批，权限变化/删除仍立即生效。本轮不改变 Chrome 协议偏好，不通过禁用 QUIC 或强制 eager 制造通过。

## 扩展用例：不得用上述结果替代

以下单独设计，结果必须按“已执行/失败/未执行”列示：

- 延迟成功响应的可见对象交错已有主用例；本地快照在途写入、更多 ABA 会话组合仍需扩展。
- 200 可解码兜底、连接中断、图片解码失败：分别注入目标请求，断言不能误认成功、重试预算有界、恢复无需编辑。
- IDB 配额/不可用已有展示主用例；所有持久化边界和失败后空间占用仍需独立核验。
- 回执时间偏差与租约边界：使用可控时钟/网络回执测试，不能修改测试站系统时钟或延长签名授权。
- 同 profile 合成旧格式快照恢复已有独立主用例；真实旧构建/旧 SW 升级仍需要明确旧构建及新构建；不能通过清站点数据证明迁移，也不能用同构建重复部署替代。
- 公开转私密/祖先权限变化：只操作本轮 synthetic 对象，测试匿名与已授权会话、旧缓存与撤销。
- 真实移动键盘、缩放与安全区：桌面 390px viewport 不等于手机真机证据。

后续补测只扩展现有 CDP/验收器边界，不另起一个无法复用的临时自动化框架。

## 已知失败不能折算为通过

`tests/unit/iconProxyDataUriRegression.test.ts` 的两个 URL 编码图标用例在修复前是明确的预期失败，现已转为普通回归。新增已知失败不得折算为产品成功；移除预期失败标记必须同时验证真实普通代理路径。基线 CSP 错误、输入/定位前置失败、产品断言失败要分别呈现，不以总测试数宣称验收完成。

本地验证使用 `node scripts/smoke-local.mjs --issues`，由现有隔离 Worker/D1 生命周期提供一次性凭据；仍须显式设置 `ISSUE_BROWSER_WRITE_FIXTURES=1`。`ISSUE_CASES=28-EDIT-TITLE-DATA` 可独立验证编辑数据完整性。409 只在对应新描述符重试并收到正确正文后按 requestId 标记为已验证协商，不整体豁免。

`ISSUE_CACHE_MODE=off` 只允许显式选择兼容的编辑/普通路径用例，用于区分始终存在的快照投影与可信设备副本；默认仍为 on。不得用关闭模式冒充可信副本验收。

若 Chrome 在客户端取消后不再提供 Network 响应正文，浏览器只读克隆观察器保留真实响应的协议元数据，通过对象/描述符/时间匹配原 requestId；不改变响应或存储图像正文。无法匹配或读取时仍不豁免冲突。

经具体注入 requestId 核准的已取消错误响应保留在 `canceledResponses`，不冒充已验证的 409 协商；其请求仍受操作级稳定性检查约束。未注入取消始终保留在 `failedRequests`；缺少下述完整签名换源证明时仍进入失败门。仅具有真实 CSS URL 匹配的站点背景请求可移出图标正文预算，外部图像不得整体豁免。

独立热路径用例必须先核验原生 IndexedDB 已保存各 fixture 正文，再重载检查对象 URL 与对象正文零请求；其他页面图片请求继续在报告中计数，不把首次填充叫作热命中。弹层点击优先保持已可见目标，仅在需要时最小滚动，始终复核实际命中。

本地可设置 `ISSUE_TEST_TOP_NAV=1` 创建顶部导航测试布局；仅允许隔离 localhost + 一次性 setup token，禁止用该开关修改测试站全局导航设置。菜单验收要核对顶部导航/底部栏实际遮挡，并验证内部滚动后选择不会因重新测量而跳回。

主动断网只在开关注入期间按 `ERR_INTERNET_DISCONNECTED` 和 requestId 标记；其他网络失败仍进入失败门。401/503 使用实际 API 信封形状。浮动操作先核对菜单展开和目标可见性；输入/定位失败不能伪装成业务失败。错误诊断只读设备状态和本轮 fixture 元数据，不记录认证回执或图像正文；未取得状态时明确标记不可用。

退出期间的 401 只在同一场景、同一匿名化会话序号、请求在撤销回复前发出（或在已记录的双标签确认本地退出前发出）且 401 跨过撤销开始时刻、并读到退出响应明确 revoked=true 时单独分类。其他会话、失败撤销、缺少时间/响应证据或后发请求均不豁免；报告保存具体 requestId，不记录认证头。

旧 401 的旧响应在新会话图像基线验证期间仍保持暂扣，禁止通过重新导航让它消失。该用例验证“新会话就绪之后”的迟到错误；初始化中的图像交错仍属于扩展矩阵，不由此结果代替。

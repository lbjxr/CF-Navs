# 图标验收器与合成数据

## 两种证据不能互相替代

- `scripts/lib/iconAcceptance.mjs` 的 `compareIconSamples` 用于只读站点的显示对比：比较完整 key 多重集合、可解码图片数量及破图状态。基线里的文字项也不能丢失。返回 `display-non-regression-only`，**不证明图片内容正确**；标题/链接散列也不等同于稳定对象 ID。
- 同模块的 `evaluateIconFixtures` 用于独立预期清单：每个对象/展示位置必须恰好出现一次，展示类型和图像像素签名必须匹配。缺失、重复、额外记录、解码/画布读取错误均失败。
- `collectIconFixtures` 是可序列化 CDP 页面函数，只读取实际展示的图片；不重新 fetch 图片来替代展示证据。它保留所有 selector 命中，不能使用 `querySelector` 或 `some` 掩盖重复实例。

## 合成图像契约

`scripts/lib/iconAcceptanceFixtures.mjs` 的 `createIconAcceptanceFixtures` 生成两张互不相同的 32×32 四象限 SVG（书签与分类）。预期值直接由作者指定的颜色生成，是独立于浏览器解码结果的 8×8 RGBA 签名。

该签名只用于这些专门设计的合成图，不是任意图像的无碰撞内容哈希。不得将生产图片采集结果原样作为“独立预期”。

现有 `scripts/icon-ui-regression.mjs` 已通过临时 Worker API 写入不同的书签、分类图，校验三个明确位置：

1. 父分类标题的直接图标（不包含其下的子分类 tab）；
2. 经常访问区中的目标书签；
3. 所属分类中的同一书签。

各位置拥有独立 key，不能根据本次 DOM 命中数量动态生成预期数量。当前 manifest 是限定合成对象的局部验收，不代表整个页面全部对象都经过内容核验。

## 运行

```sh
node --experimental-sqlite node_modules/vitest/vitest.mjs run tests/unit/iconAcceptance.test.ts tests/unit/iconAcceptanceCollector.test.ts
npm run build
npm run regression:icons:local
```

复用已有隔离运行器，自动创建临时 Worker/D1、一次性测试凭据和 Chrome profile；不对生产写入合成数据。运行器的资源归属和清理失败门保持不变。

单测先证明验收器会拒绝：可解码错图、兜底、重复位置缺失、分类缺失、重复身份、额外私密对象、证据缺失、解码/画布错误、图文替换和错误文字。采集层另测重复 DOM 命中、不存在元素及画布失败。

## 后续 Issue 回归边界

此基础设施不是 #28、#29、#30 闭环证据。后续按项增加：

- #28：普通/可信/失败回退、私密与旧格式 fixture，逐对象请求增量、句柄生命周期和操作期间的展示序列；尤其是编辑与右键不能使未修改对象整批重载。
- #29：双标签/会话切换/延迟响应/旧 401，使用独立预期的公开与私密对象集合，不能用数量代替身份。
- #30：真实输入、菜单几何与实际命中、嵌套分类/焦点恢复；移动软键盘与可视视口单列验证。

生产比较脚本不会因为引入本模块就升级为内容正确性验收。已有历史通过数也不自动升级为以上新场景的证据。

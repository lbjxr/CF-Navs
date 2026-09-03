# Sun-Panel 数据导入指南

本指南帮助你将 Sun-Panel 导出的数据导入到 CF-Navs。

## 📋 准备工作

1. 从 Sun-Panel 导出数据
2. 确保 CF-Navs 已部署并可以访问
3. 准备好管理员账号

## 🔄 导入方式

### 方法一：后台直接导入（推荐）

当前后台已经内置 Sun-Panel JSON 转换逻辑，不需要先运行转换脚本。

1. 登录 CF-Navs 后台
2. 进入 **数据备份与导入**
3. 在"导入来源"中选择 **SunPanel 导出**
4. 点击 **导入数据**，选择 Sun-Panel 导出的 JSON 文件
5. 确认覆盖导入

导入时可选择“追加合并”或“覆盖现有数据”；管理员账号与密码不受影响。覆盖前建议先导出一份 CF-Navs 备份。

### 方法二：使用转换脚本（可选）

如果你希望先生成一份可检查的中间 JSON，可以使用脚本转换：

```bash
# 转换 Sun-Panel 导出的 JSON 文件
node scripts/convert-sunpanel.cjs <sun-panel导出文件.json> <输出文件.json>

# 示例
node scripts/convert-sunpanel.cjs SunPanel-Data.json cf-navs-import.json
```

转换完成后会显示：
- 分类数量
- 书签数量
- 输出文件路径

注意：后台内置导入是当前推荐路径；脚本主要用于离线检查或手动处理。

### 数据映射说明

| Sun-Panel 字段 | CF-Navs 字段 | 说明 |
|---------------|-------------|------|
| icons[].title | categories.title | 分类名称 |
| icons[].sort | categories.sort | 分类排序 |
| - | categories.parent_id | 固定为 `null`，Sun-Panel 分类导入为一级分类 |
| children[].title | bookmarks.title | 书签标题 |
| children[].url | bookmarks.url | 书签URL |
| children[].description | bookmarks.description | 书签描述 |
| children[].icon.src | bookmarks.icon | 图标地址 |
| children[].openMethod | bookmarks.open_method | 打开方式 |
| children[].sort | bookmarks.sort | 书签排序 |

### 特殊处理

1. **图标转换**：
   - HTTP/HTTPS 图标：转换为可访问的图标 URL；
   - Sun-Panel 上传的图标：旧版转换脚本会尝试转换为 favicon.im 候选地址；
   - Iconify 图标：**后台直接导入路径**可识别 `mdi:home`、`simple-icons:github`、`iconify:`、`@iconify-json/*`、`@iconify-icons/*` 和 `icon-sets.iconify.design/...`，保存为标准 Iconify URL；后台预览通过 `/api/iconify/*` 代理加载。旧版 `scripts/convert-sunpanel.cjs:54-112` 不负责 Iconify 解析，遇到这类值会置空并回退 favicon；
   - 非图片图标：旧版转换脚本不保留文字/Iconify 值，按脚本规则回退 favicon；后台直接导入则按 `src/lib/importData.ts:46-94` 的 Iconify/文字图标转换处理。

运行时聚合响应不携带 `icon_blob` 二进制，仅用 `icon_cached` 表示已有持久化缓存；首页根据该标志配合本地缓存、`/api/icon/:id` 兼容路径或已保存 URL 取图。编辑弹窗打开后会在后台调用短超时刷新接口更新完整实体缓存，保存书签后也会显式刷新。HTTP(S) 分类图片通过 `/api/category-icon/:id` 代理读取，data URI、文字和表情分类图标直接渲染；Iconify 书签后台预览走 `/api/iconify/*`，首页可复用浏览器 HTTP 缓存。

2. **打开方式**：
   - Sun-Panel 的 `2`（新窗口）→ CF-Navs 的 `1`
   - Sun-Panel 的 `1`（当前窗口）→ CF-Navs 的 `2`

## 📥 导入到 CF-Navs

### 步骤 1：登录后台

1. 访问你的 CF-Navs 站点
2. 点击右上角 **⚙️** 图标
3. 输入管理员凭据登录

### 步骤 2：进入数据备份与导入

1. 在侧边栏点击 **数据备份与导入**
2. 找到"导入 / 导出"区域

### 步骤 3：导入数据

1. 在"导入来源"中选择 **SunPanel 导出**
2. 点击 **导入数据** 按钮
3. 选择 Sun-Panel 导出的 JSON 文件，或选择转换后的 `cf-navs-import.json`

### 步骤 4：确认导入

- 系统会显示导入的分类和书签数量
- 导入前可选择追加合并或覆盖现有分类和书签；选择覆盖时会显示危险操作确认
- 确认后点击 **确定**

### 步骤 5：验证数据

1. 返回首页查看导入的分类和书签
2. 检查图标是否正常显示
3. 测试书签链接是否可以正常打开

## ⚙️ 导入后调整

### 1. 修复图标

部分书签的图标可能无法自动获取，你可以：

1. 编辑该书签
2. 在图标候选中选择 Favicon.im、文字图标、Google 或 Iconify
3. 选择文字图标时可切换内置配色方案
4. 或手动输入图标 URL / 表情

### 2. 调整分类排序

1. 在后台“分类管理”中进入对应同级分类的排序模式
2. 拖动分类调整顺序
3. 点击“保存排序”提交，或点击“取消”放弃本次调整

### 3. 调整书签排序

1. 在首页找到目标一级分组，切换到“本分类”或对应二级标签后点击“排序”
2. 拖动书签调整顺序
3. 点击“保存排序”提交，或点击“取消”放弃本次调整

### 4. 修改站点设置

1. 进入"站点设置"
2. 配置：
   - 站点标题
   - 背景样式
   - 主题模式
   - 搜索引擎
   - 卡片样式

## ❓ 常见问题

### Q: 导入后图标显示不正常？

**A:** 这很正常，因为：
- Sun-Panel 上传的图标无法直接迁移
- 部分网站的 favicon 可能获取失败

**解决方法：**
1. 编辑书签
2. 选择文字图标、Google、Favicon.im 或 Iconify 候选
3. 或使用图床上传图标后手动填写 URL；首页根据聚合返回的 `icon_cached` 标志选择本地缓存、兼容代理或已保存的图标 URL，不假设聚合响应携带 `icon_blob`。

### Q: 导入后排序不对？

**A:** Sun-Panel 和 CF-Navs 的排序字段可能不完全一致。

**解决方法：**
- 使用拖拽功能重新排序

### Q: 可以导入到已有数据的 CF-Navs 吗？

**A:** 可以，但：
- 可在导入时选择“追加合并”或“覆盖现有数据”；只有选择覆盖时才会清空现有分类和书签
- 建议先导出当前数据备份

### Q: 导入失败怎么办？

**A:** 检查：
1. JSON 文件格式是否正确
2. 浏览器控制台是否有错误信息
3. 尝试分批导入（先删除部分数据）

### Q: 能否只导入部分分类？

**A:** 可以，手动编辑转换后的 JSON 文件：
1. 打开 `cf-navs-import.json`
2. 删除不需要的分类和对应的书签
3. 保存后再导入

## 🔄 批量操作技巧

### 只导入特定分类

编辑 `cf-navs-import.json`，保留需要的分类：

```json
{
  "categories": [
    {"id": 1, "title": "需要的分类1", ...},
    {"id": 2, "title": "需要的分类2", ...}
  ],
  "bookmarks": [
    // 只保留 category_id 为 1 或 2 的书签
  ]
}
```

### 批量修改图标

使用文本编辑器全局替换：

```bash
# 将所有旧域名替换为新域名
sed -i 's/old-domain.com/new-domain.com/g' cf-navs-import.json
```

## 📊 转换统计

转换脚本会显示：
- 成功转换的分类数量；
- 成功转换的书签数量。
脚本**不输出“需要手动处理的图标数量”**；如需核对 Iconify 或文字图标，请使用后台直接导入并在导入后检查图标来源。脚本实际输出的后续提示仍写作“数据管理 / 导入备份”（`scripts/convert-sunpanel.cjs:139-151`），当前后台界面对应“数据备份与导入 / 导入数据”，按当前界面名称操作。

## 🎉 完成

导入完成后，请按“验证数据”步骤确认分类、书签、排序和图标来源；本指南不把未在当前环境执行的导入过程宣称为已验证成功。

**下一步建议：**
1. 检查所有书签是否正常
2. 调整站点设置
3. 配置背景和主题
4. 设置公开模式（如需要）
5. 导出备份（重要！）

---

如有问题，请查看 [README.md](../../README.md) 或提交 Issue。

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
2. 进入 **数据备份**
3. 在"导入来源"中选择 **SunPanel 导出**
4. 点击 **导入备份**，选择 Sun-Panel 导出的 JSON 文件
5. 确认覆盖导入

导入会覆盖现有分类和书签；管理员账号与密码不受影响。建议导入前先导出一份 CF-Navs 备份。

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
| children[].title | bookmarks.title | 书签标题 |
| children[].url | bookmarks.url | 书签URL |
| children[].description | bookmarks.description | 书签描述 |
| children[].icon.src | bookmarks.icon | 图标地址 |
| children[].openMethod | bookmarks.open_method | 打开方式 |
| children[].sort | bookmarks.sort | 书签排序 |

### 特殊处理

1. **图标转换**：
   - HTTP/HTTPS 图标：直接使用
   - Sun-Panel 上传的图标：可转换为 favicon.im 候选地址保存
   - Iconify 图标：识别 `mdi:home`、`simple-icons:github`、`iconify:`、`@iconify-json/*`、`@iconify-icons/*` 和 `icon-sets.iconify.design/...`，保存为标准 Iconify URL，并通过 `/api/iconify/*` 代理缓存加载
   - 非图片图标：无法识别为 Iconify 时，导入后按现有图标候选逻辑处理

   运行时普通书签图标会优先读取浏览器本地缓存和聚合数据中的 `icon_blob`；缓存缺失时首页会回退使用已保存的普通 HTTP(S) 图标 URL。编辑打开或保存书签时才会调用短超时刷新接口更新本地图标缓存。分类图标会通过 `/api/category-icon/:id` 代理读取，Iconify 图标始终通过 `/api/iconify/*` 代理缓存加载，非 URL 的自定义文字或表情图标会直接按文本渲染。

2. **打开方式**：
   - Sun-Panel 的 `2`（新窗口）→ CF-Navs 的 `1`
   - Sun-Panel 的 `1`（当前窗口）→ CF-Navs 的 `2`

## 📥 导入到 CF-Navs

### 步骤 1：登录后台

1. 访问你的 CF-Navs 站点
2. 点击右上角 **⚙️** 图标
3. 输入管理员凭据登录

### 步骤 2：进入数据管理

1. 在侧边栏点击 **数据备份**
2. 找到"导入 / 导出"区域

### 步骤 3：导入数据

1. 在"导入来源"中选择 **SunPanel 导出**
2. 点击 **导入备份** 按钮
3. 选择 Sun-Panel 导出的 JSON 文件，或选择转换后的 `cf-navs-import.json`

### 步骤 4：确认导入

- 系统会显示导入的分类和书签数量
- 如果已有数据，会提示覆盖现有分类和书签
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

1. 在后台"分类管理"中
2. 使用拖拽功能调整分类顺序
3. 拖拽结束后自动保存

### 3. 调整书签排序

1. 展开某个分类
2. 拖拽书签调整顺序
3. 自动保存

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
3. 或使用图床上传图标后手动填写 URL；运行时仍会优先通过 CF-Navs 图标代理缓存展示

### Q: 导入后排序不对？

**A:** Sun-Panel 和 CF-Navs 的排序字段可能不完全一致。

**解决方法：**
- 使用拖拽功能重新排序

### Q: 可以导入到已有数据的 CF-Navs 吗？

**A:** 可以，但：
- 导入会覆盖现有数据（慎重操作）
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
- ✅ 成功转换的分类数量
- ✅ 成功转换的书签数量
- ⚠️ 需要手动处理的图标数量

## 🎉 完成

导入完成后，你的 Sun-Panel 数据已成功迁移到 CF-Navs！

**下一步建议：**
1. 检查所有书签是否正常
2. 调整站点设置
3. 配置背景和主题
4. 设置公开模式（如需要）
5. 导出备份（重要！）

---

如有问题，请查看 [README.md](../README.md) 或提交 Issue。

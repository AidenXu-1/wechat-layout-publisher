# 微信正文 HTML 约束

微信公众号正文只保留有限的 HTML 与 CSS 子集。制作时采用保守策略。

## 必须遵守

- 正文样式全部写在 `style=""` 中。
- 使用 `section`、`p`、`h1`、`h2`、`strong`、`span`、`img`、`blockquote`、`table`、`svg` 等语义标签。
- 允许本 Skill 的 `data-wlp-visual-id`、`data-wlp-visual-block` 与 `data-wlp-added` 数据属性，用于计划对账、强视觉密度检查和定稿新增节点审计。
- 文章图片尽量控制在约 1 MB 内。
- 本地预览外壳的 JavaScript 必须放在 `ARTICLE HTML START` 和 `ARTICLE HTML END` 之外。

## 正文中禁止或避免

- 禁止 `<style>` 标签。
- 禁止 `<script>` 标签。
- 禁止 `class` 和 `id` 属性。
- 禁止外部样式表。
- 禁止 CSS 动画、transform、固定定位和媒体查询。
- 避免依赖 `gap`、`position` 或 `float` 的布局。
- 禁止把 Markdown 分隔符 `---`、`***`、`___` 作为可见正文字符或独立段落输出。
- 禁止空 `section`、空 `p`、仅含 `&nbsp;` 的节点、固定高度占位块或重复 `<br>` 制造纵向留白。

## 图片说明

- 本地预览可以使用本地路径。
- 微信正式可复制版不能使用本地相对路径或 `file://` 路径。这些图在浏览器里可能正常，粘贴进公众号编辑器后会消失。
- 正式可复制版的图片 `src` 应使用准确主机名为 `mmbiz.qpic.cn` 或 `mmbiz.qlogo.cn` 的微信托管 URL。普通远程 `http(s)` URL 或有效 PNG/JPEG data URI，只有在目标编辑器完成真实粘贴验证后才可接受。
- 通过草稿 API 发布时，`scripts/publish.ts` 会把本地、远程或 base64 正文图上传到微信，并改写成微信托管 URL。
- 网络图片优先下载后嵌入或保存到本地，避免预览失效。

## 最终正文检查

交付前搜索正文：

```bash
rg -n "<style|<script|class=|id=" <output.html>
```

预览外壳中的匹配可以保留，文章标记之间的匹配必须删除。

优先使用内置验证器：

```bash
cd scripts
npm run verify-article -- <preview-or-fragment.html>
```

文件有标记时，它只提取 `ARTICLE HTML START` 和 `ARTICLE HTML END` 之间的正文，再检查常见的微信不兼容标签与属性。

同时运行统一布局检查：

```bash
cd scripts
npm run verify-layout -- --article <preview-or-fragment.html> --image-plan <image-plan.json>
```

它会把可见 Markdown 分隔符、异常空白、首节视觉过晚、相邻重视觉、连续长截图和语义重复视为正式交付失败。

正式可复制图片还要运行：

```bash
cd scripts
npm run verify-copy-ready -- <preview-or-fragment.html>
```

只要存在本地路径、`file://` 来源或非微信托管的普通远程 URL，就会失败。

只有真实粘贴测试通过后，才可开启例外：

```bash
cd scripts
npm run verify-copy-ready -- --allow-remote <preview-or-fragment.html>
npm run verify-copy-ready -- --allow-data-uri <preview-or-fragment.html>
```

这些例外只能用于独立验证，输出仍不自动获得“正式可复制”状态。正式可复制预览必须由 `publish.ts --prepare-only` 在最终图片计划、视觉 QA 和正文图片上传授权都通过后生成。

```bash
node scripts/make-preview.mjs <fragment.html> <local-preview.html>
```

`make-preview.mjs` 永远只生成本地工作预览，不显示复制按钮，也不接受 `--copy-ready`、`--allow-remote` 或 `--allow-data-uri`。

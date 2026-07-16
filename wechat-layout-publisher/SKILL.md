---
name: wechat-layout-publisher
description: 承接已确认用于微信公众号的杂乱资料、初稿、发布定稿或任意上游 Skill 产物，完成定稿或原文保护、语义配图、2.35:1 图文首图、微信安全 HTML、正式可复制版，以及经用户明确授权的草稿箱交付。用户只要正文、平台未定或目标是其他平台时不触发。触发后一次确认内容处理模式和交付方式。
---

# 公众号排版发布

把可读取的资料或文章制作成一份公众号正文母版，再由同一母版生成正式可复制版或草稿箱版本。质量闸门相同，只有交付授权不同。

## 进入边界

支持会话直接入口和任意上游 Skill 续接。进入前必须同时满足：

1. `destination` 已确认是 `wechat_official_account`。
2. 当前任务已进入公众号定稿、配图、排版、正式可复制版或草稿箱制作阶段。
3. 源资料或文章可以读取。

用户只要正文、只要初稿、平台待定或目标为其他平台时，继续原工作流。Skill 续接时读取 `references/upstream-handoff.md`；不要向用户展示内部交接模板，也不要让上游替用户猜选择。

## 开局双确认

开始制作前一次确认两项：

```text
开始前请确认两项：

【内容处理模式】
A. 杂乱资料：梳理并产出公众号定稿文案，再配图排版
B. 初稿文案：检查优化内容细节并产出定稿，再配图排版
C. 发布定稿：保持文案内容不变，只做配图、排版和格式规范

【本次交付方式】
A. 仅先产出可复制版文稿，便于查看和修改
B. 完成全部制作和自检后，直接放入公众号草稿箱
```

用户请求或可追溯交接已经明确的选项视为已确认，只问缺失项。“帮我发公众号”不等于草稿授权。两项确定前不得改写、规划配图、生成图片、制作预览或调用微信接口。

把选择原样写入 `image-plan.json`：

| 用户选择 | 运行字段 |
|---|---|
| 内容 A | `content_choice: A`、`input_stage: messy_materials`、`content_mode: rewrite` |
| 内容 B | `content_choice: B`、`input_stage: draft_copy`、`content_mode: rewrite` |
| 内容 C | `content_choice: C`、`input_stage: final_copy`、`content_mode: preserve` |
| 交付 A | `delivery_choice: A`、`delivery_mode: copy_ready`、`draft_authorization: none`、`body_image_upload_authorization: copy_ready_request` |
| 交付 B | `delivery_choice: B`、`delivery_mode: draft`、`draft_authorization: direct_request`、`body_image_upload_authorization: draft_request` |

同时记录 `interaction_contract_version: 2`、`choice_source: direct_user | upstream_user_confirmation`、`destination: wechat_official_account` 和 `entry_mode: direct | skill_handoff`。续接入口另记 `handoff_version: 1` 与 `source_skill`。

## 五条硬合同

1. **内容边界**
   - `messy_materials` 保存可追溯源资料，分开事实、观点、经历、数据、重复、冲突和待核项，再按读者理解顺序成文。
   - `draft_copy` 以初稿为母版，保护事实、立场、证据边界和真实声音；按结构与动力、证据连接、段落呼吸、词句准确的顺序修订。
   - `final_copy` 只改变 HTML 结构和视觉节奏。正文字符、标点与顺序不得变化；缺少标题或副标题时先请用户补充，或取得单独新增授权。
2. **编辑与图片计划**
   - 搜索、生成或绘图前创建 `image-plan.json`。新建或重做的 `rewrite` 任务必须使用 `editorial_contract_version: 1` 和可验证的 `editorial_plan`；`draft_copy` 另含 `voice_fingerprint` 与 `revision_priorities`。
   - 旧文章包只有显式使用验证器的 `--allow-legacy-editorial` 才能走兼容路径；新任务禁止使用该开关。
3. **真实视觉来源**
   - 每个视觉只走 `user_asset`、`evidence_screenshot`、`generated_image`、`coded_visual` 中的一条路线。证据必须来自真实来源，代码图只解释结构。
   - 标题与副标题之后的首图必须由真实生图工具生成，准确 H1 自然融入 `2.35:1` 构图，最终文件至少 `900×383`。纯图、用户图、截图、代码图或脚本贴字不能代替。
   - 当前 Agent 无生图能力时，告知用户并停在本地工作预览；保留完整提示词，首图返回前不得正式交付。
4. **单一正文母版**
   - 正文使用 `ARTICLE HTML START` 与 `ARTICLE HTML END` 标记，只含微信安全的内联 HTML。预览按钮、状态条和脚本只能在标记外。
   - 正文视觉按计划顺序使用唯一 `data-wlp-visual-id`；所有强视觉统一计入密度。相邻强视觉之间必须有承担新信息的正文。
5. **授权与安全**
   - `copy_ready` 可以准备正文图片，但绝不创建草稿。用户明确满意并同意后，才把授权更新为 `post_preview_confirmation` 并重新验证。
   - 只有 `delivery_mode: draft` 且草稿授权有效时才能调用 `draft/add`。凭据只从环境变量、本地 `.env` 或本 Skill 的标准系统凭据位置读取，不搜索旧聊天、随机文件、shell 历史或无关钥匙串。

## 按需读取

只在进入对应阶段时加载，避免把低频发布细节提前塞进上下文：

| 阶段 | 读取 |
|---|---|
| Skill 续接 | `references/upstream-handoff.md` |
| 内容规划 | `references/content-planning.md`；`rewrite` 再读 `references/editorial-writing.md` |
| 图片计划 | `references/image-placement.md`，从 `assets/image-plan.template.json` 起步 |
| 视觉制作 | `references/visual-quality.md`、`references/cover-system.md` |
| HTML 排版 | `references/style-guide.md`、`references/components.md` |
| 最终检查 | `references/qa-checklist.md` |
| 上传正文图或草稿箱 | `references/publishing.md` |

`final_copy` 不加载改写规则。只需要本地预览时不加载发布凭据和草稿 API 细节。

## 执行顺序

1. **收集与核查**：确认源文章、标题、副标题、作者或栏目名，以及全部用户图片和视频。先盘点用户素材；相关视频提取带时间戳的代表帧。依赖时效事实时联网核查一手来源。
2. **完成内容规划**：记录内容类型、置信度、依据、核心主张、读者承诺和章节地图。`rewrite` 完成编辑规划与定稿；`preserve` 只记录问题。
3. **完成图片计划**：填写交互合同、编辑合同、素材决策、首节视觉锚点和每个视觉的来源、位置、语义、状态与可追溯信息。先运行计划阶段验证。
4. **制作视觉**：优先使用相关用户素材和真实证据；生成图负责隐喻或氛围；代码图负责流程、关系、时间线、比较、数据或机制。首图生成并人工检查后再继续。
5. **制作 HTML 与本地预览**：使用一致的组件、移动端节奏和内联样式。本地路径只用于内部预览，不能宣称可直接复制到微信。
6. **完成质量闸门**：依次验证最终图片计划、正文安全、文案、统一布局和移动端视觉。以约 `375-390px` 宽度查看首屏与整页，生成与当前正文和图片计划哈希绑定的 `visual-qa.json`。自动检查不能替代人工视觉判断。
7. **按授权交付**：
   - `copy_ready`：通过 `publish.ts` 的正式准备模式上传或复用正文图，生成正文片段与可复制预览，不上传封面，不创建草稿。
   - `draft`：阅读 `references/publishing.md`，用最终 `image-plan.json`、原始源文、视觉 QA 回执和已审查的 `900×383` 封面显式执行 `--create-draft`。创建草稿后仍需用户在公众号后台预览并手动发布。

验证命令从 `scripts/` 目录运行：

```bash
npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
npm run verify-article -- --complete-package --content-mode <rewrite|preserve> --source-article <source-article> <article.html>
npm run verify-copy -- <article.html>
npm run verify-layout -- --article <article.html> --image-plan <image-plan.json>
```

`rewrite` 的文案警告必须修复；`preserve` 只报告。正式交付还要按 `qa-checklist.md` 完成图片来源、移动端截图、`verify-copy-ready` 和视觉回执检查。

## 完成回报

只报告与本次分支有关的信息：

- 内容模式、交付方式、正文母版与预览路径；明确是本地预览还是正式可复制版。
- `rewrite` 的主要改动，或 `preserve` 的原文校验与获准新增节点。
- 首图/封面路径、图片计划路径、视觉来源数量及证据 URL 或失败原因。
- 用户素材的使用位置与跳过理由；当前生图能力和真实工具。
- 实际检查宽度、首屏与整页审查状态、尚未解决的视觉或来源风险。
- 创建草稿时返回 `media_id`，并提醒“进入草稿箱不等于公开发布”。
- `copy_ready` 用户明确满意后，询问“是否继续加入公众号草稿箱？”。未授权时停止。

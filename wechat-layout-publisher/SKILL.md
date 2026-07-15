---
name: wechat-layout-publisher
description: 公众号文案定稿、语义配图、排版与草稿箱交付：接收会话中的杂乱资料、初稿文案或发布定稿；也在任意上游 Skill 或当前工作流已经明确产出目标为微信公众号的内容，并进入配图、排版、可复制版或草稿箱制作阶段时接管。仅写正文、其他平台内容、尚未确认公众号目的地或用户明确要求停在写稿阶段时不触发。开局一次确认内容处理模式和交付方式，再制作微信安全的可复制图文 HTML、2.35:1 头条封面和可追溯配图；只有用户明确授权时才写入公众号草稿箱。
---

# 公众号排版发布

把用户或上游 Skill 交付的资料制作成公众号定稿与图文排版稿，并生成 `2.35:1` 公众号头条封面。只维护一份正文母版；用户选择可复制版时先完成审阅修改循环，用户选择直接进草稿箱时减少中途停顿，两条路径使用同一套质量闸门。

## 入口与 Skill 交接

入口按公众号制作能力设计，可由任意上游 Skill 使用，不绑定某个写作 Skill。支持两种入口：

1. **会话直接入口**：用户提供资料、初稿或定稿，并提到公众号定稿、配图、排版、可复制文稿、封面或草稿箱。
2. **工作流续接入口**：任意上游 Skill 已产出或整理内容，当前任务已确认目的地为微信公众号，并进入公众号制作阶段。Codex 根据本 Skill 的 `description` 隐式选用本 Skill；上游也可以传递结构化交接信息。整个过程不向用户展示交接模板，也不要求用户补说调用口令。

进入本 Skill 前同时满足：

1. `destination` 已由用户请求、已确认的平台选择或可追溯任务状态确定为 `wechat_official_account`。
2. 当前下一步包含公众号定稿、配图、排版、正式可复制版或加入草稿箱，或上游已进入明确的公众号制作交付阶段。
3. 源资料或文章可以读取。用户要求只写正文、停在初稿，或目标平台是小红书、短视频、网站等其他渠道时，继续原工作流，不进入本 Skill。

工作流续接时阅读 `references/upstream-handoff.md`。上游使用同一份轻量协议，不复制本 Skill 的内部制作流程：

```yaml
handoff_version: 1
target_capability: wechat_article_production
destination: wechat_official_account
entry_mode: skill_handoff
source_skill: <任意上游 Skill 名称>
source_artifact: <可读的文章或资料绝对路径>
source_status: messy_materials | draft_copy | final_copy
next_action: wechat_production
assets: [<用户素材路径>]
```

兼容已有交接中的 `source_article`，将其视为 `source_artifact`。只有用户已明确做出选择时，上游 Skill 才可以附带 `content_choice` 或 `delivery_choice`。不得由上游 Skill 替用户猜测。目标 Skill 不可用、目的地未确认、文件路径无法读取或素材缺失时，明确报告交接阻塞。

## 开局双确认

开始处理前，一次确认以下两项：

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

执行规则：

1. 用户当前请求或可追溯交接中已明确的选项视为已确认，只询问缺失项，不重复确认。
2. “帮我发公众号”等含义不明的表达不等于草稿授权；询问交付方式。
3. 这三种内容模式缺一不可。任何只提供“粗稿/定稿”两种选择的旧问句均视为失效；`draft_copy` 必须作为独立模式出现。
4. 两项都确定前，不得改写、规划配图、生成图片、制作预览或调用微信接口。
5. 将选择原样写入 `image-plan.json`，不得用输入看起来像什么来替代用户选择：
   - `interaction_contract_version: 2`
   - `content_choice: A | B | C`
   - `delivery_choice: A | B`
   - `choice_source: direct_user | upstream_user_confirmation`
   - 内容 A → `input_stage: messy_materials`、`content_mode: rewrite`
   - 内容 B → `input_stage: draft_copy`、`content_mode: rewrite`
   - 内容 C → `input_stage: final_copy`、`content_mode: preserve`
   - 交付 A → `delivery_mode: copy_ready`、`draft_authorization: none`、`body_image_upload_authorization: copy_ready_request`
   - 交付 B → `delivery_mode: draft`、`draft_authorization: direct_request`、`body_image_upload_authorization: draft_request`
6. 记录 `destination: wechat_official_account` 和 `entry_mode: direct | skill_handoff`；`skill_handoff` 同时记录 `handoff_version: 1` 与 `source_skill`。
7. `preserve` 模式缺少标题或副标题时先请用户补充，或取得单独授权后再新增；所有新增标题、副标题、图注和来源文字按 `references/qa-checklist.md` 标记。

## 交付合同

只维护一份公众号正文母版，严格按 `delivery_mode` 进入两条路径：

- **正式可复制版**（`copy_ready`）：制作、自检并交付可复制预览。若正文含本地图片，用户选择本路径时已同时授权把正文图片上传到公众号图片服务；该动作不创建草稿。用户提出修改时循环修改并重做受影响的验证。用户明确表示满意后，主动询问“是否继续加入公众号草稿箱？”。只有用户同意时，把 `delivery_mode` 改为 `draft`、`draft_authorization` 与 `body_image_upload_authorization` 改为 `post_preview_confirmation`，重新验证后创建草稿。
- **直接草稿箱版**（`draft`）：开局获得用户明确授权后，完成文案、配图、排版、本地预览和全部质量闸门，再一步写入草稿箱。不因减少用户停顿而跳过内部检查。同次运行保留可复制归档。
- 内部本地预览可以使用本地图片，只用于质量检查或凭据不可用时的退化交付。必须标注为仅限本地，且绝不显示复制按钮。
- 用 `ARTICLE HTML START` 和 `ARTICLE HTML END` 包住文章正文。
- 正文只使用微信安全的内联 HTML：不用 CSS 类、外部样式或 JavaScript。
- 按语义把图片放在能帮助理解的位置，禁止集中堆在开头或结尾。
- 生成 `image-plan.json`，记录内容分类、用户素材、四种素材路线、准确位置及来源决策。
- 完整文章包必须包含 `2.35:1` 头条封面方案或成品。
- 记录生成图片、网络素材和用户素材的来源说明。

复制按钮、预览状态、回到顶部按钮和脚本只属于浏览器预览外壳，绝不能进入标记正文或 `draft/add` 的 `content`。如果正文仍有待上传图片，而凭据或 IP 白名单不可用，只能交付明确标注的本地预览，并说明正式可复制版尚未完成；正文已经全部使用有效微信图片 URL 时可以直接验证并复用。

开始时先检查当前 Agent 是否有图片生成工具。正文首图必须调用真实生图工具，在 Codex 中使用 Image Gen；其他分配为 `generated_image` 的视觉也必须真实生成。当前 Agent 无生图能力时，先说明限制并停在本地工作预览，保留完整首图提示词，等外部生成图返回后才能进入正式交付。

## 必读文件

按阶段读取，禁止一开始加载与当前路径无关的发布细节：

1. 确认后阅读 `references/content-planning.md` 和 `references/image-placement.md`。
2. `messy_materials` 或 `draft_copy` 再阅读 `references/editorial-writing.md`；`final_copy` 不加载改写规则。
3. 制作视觉时阅读 `references/visual-quality.md` 和 `references/cover-system.md`。
4. 编写 HTML 前阅读 `references/style-guide.md`、`references/components.md` 和 `references/wechat-html-spec.md`。
5. 最终交付前阅读 `references/qa-checklist.md`。
6. `delivery_mode: draft` 或需要上传正文图时再阅读 `references/publishing.md`。

需要把网络或本地图片转换成可嵌入的 data URI 时，使用 `scripts/img2base64.ts`。

## 工作流

1. **收集输入**
   - 先完成双确认，再确认源文章、标题、副标题、作者或栏目名，以及用户提供的图片。
   - `messy_materials` 将会话资料、链接和附件先保存为可追溯源资料文件，标出来源边界和冲突项；禁止只把改写后的文章当作原始输入。
   - 搜索或生成素材前，先盘点用户提供的全部图片和视频。相关视频要规划带时间戳的代表帧。
   - 检查可用工具，把 `image_generation_capability` 记录为 `available` 或 `unavailable`；可用时同时记录 `image_generation_tool`。不要假设所有 Agent 都是 Codex 或都能生成图片。
   - `messy_materials` 和 `draft_copy` 可以推断克制的标题和副标题；`final_copy` 必须使用原文或用户补充的内容。
   - `delivery_mode: draft` 在重型制作前尽早运行凭据诊断并提醒 IP 白名单；只诊断就绪性，不提前发起微信写请求。
   - 文章依赖时效事实时，先联网核查一手来源。

2. **按内容模式处理文章**
   - `messy_materials` 先区分事实、观点、经历、数据、重复和冲突，再按 `references/editorial-writing.md` 组织成完整定稿。没有来源或无法确认的信息不得补齐成事实。
   - `draft_copy` 是独立修订流程：先诊断标题、结构、开头、段落、人味、证据和结尾，再逐项优化并完成定稿。它以现有初稿为母版，保留原事实、核心观点、作者立场和证据边界；不得把它退化成杂乱资料重写，也不得像发布定稿一样完全冻结文案。完成时记录主要修改。
   - `final_copy` 只改变 HTML 结构和视觉节奏；可以在原句边界拆段，但不得改变任何原文字符、标点或顺序。文案检查只报告问题，不执行改写。
   - 按 `references/content-planning.md`，先确定核心主张、读者承诺、章节地图和视觉地图。
   - 按 `references/content-planning.md` 先分类内容类型并记录置信度和依据。
   - 文章涉及近期事件、公告、争议、政策或产品变化、官方回应、公开帖子、媒体报道或时效性事实时，使用 `news_event` 或 `mixed_news_commentary`。新闻与观点难以区分时，采用混合新闻路线并保留证据要求。
   - 公共争议、产品变化、官方回应、媒体报道、Reddit/X/社区讨论、论文或文档型文章，至少规划并截取一张靠近对应论点的证据截图。记录全部来源 URL；只有真实记录的访问失败可以进入降级路径。
   - `rewrite` 模式的开头先写真实体验、读者痛点或具体不适，再给专业解释；`preserve` 模式只评估，不改动原开头。
   - 完整文章包固定顺序：HTML H1、克制副标题、`2.35:1` 正文首图、导语、阅读单元、真实结论。首图必须由生图模型生成，准确标题必须自然融入画面构图；纯图、用户图、截图、代码图、白框贴字和黑罩贴字均不得作为最终首图。更换首图不得删除 HTML H1 或副标题。
   - `rewrite` 模式让每个阅读单元只承载一个主旨，小点过多时可以合并；`preserve` 模式只能用排版或信息图组织原有内容，不合并、删改或调序正文。
   - `rewrite` 模式让章节标题直接表达内容；`preserve` 模式保留原章节标题。

3. **先规划配图，再制作素材**
   - 先做深层语义识别，判断每个视觉需求属于证据、结构、数据、流程、框架、隐喻、氛围还是用户素材。
   - 按 `references/image-placement.md` 的结构建立 `image-plan.json`，必须先于搜索、生成或绘图；完整记录交互合同、选择来源、`destination`、`entry_mode`、`source_skill`、`input_stage`、`content_mode`、`delivery_mode`、`draft_authorization` 和 `body_image_upload_authorization`；Skill 续接同时记录 `handoff_version`。
   - `runtime` 必填。最终 `asset_path` 必须指向正文真实使用的素材；正文中的每个视觉按计划顺序标记 `data-wlp-visual-id`。发布预检会对本地、远程和微信托管图片逐张核对 ID、顺序和内容哈希，禁止计划与成品各走各的。
   - 首图提示词必须写入准确 `title_text` 与 `2.35:1`，最终源图至少 `900×383`。每个 `coded_visual` 记录与确定文件一致的 `asset_sha256`，发布预检还会核对 SVG/HTML 原文只出现一次。
   - 为首个 H2 阅读单元记录 `first_section_visual_anchor`。有实质内容时，语义视觉应在标题后的前两段内出现；确实不需要时记录具体 `skip_reason`，不能以“后文已有图”代替。
   - 每个非首图视觉填写 2 至 12 个 `semantic_signature`；最终素材填写 `asset_dimensions`。证据截图另填 `crop_strategy: focused | full_context`，高长图只有在上下文不可裁时才能使用 `full_context`，并填写 `full_context_reason`。
   - 默认每个阅读单元一个视觉锚点。同一 `section` 的第二张及后续视觉都填写 `density_override_reason`，说明不同职责；该字段只触发复审，不能覆盖连续重视觉、连续长截图或语义重复失败。最终计划禁止重复 `semantic_reason`。
   - 验证规划阶段：
     ```bash
     cd scripts && npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
     ```
   - 每张重要图片都要符合 `references/visual-quality.md`：角色明确、通过对应质量闸门，并靠近它服务的段落。
   - 每个视觉只走以下一种路线，按顺序判断：
     1. `user_asset`：优先使用相关用户图片；相关视频提取有意选择且带时间戳的画面。
     2. `evidence_screenshot`：新闻、公开主张、引语、公告、社交帖子、官方页面、论文或产品状态，应截取原始来源或现有最权威来源。
     3. `generated_image`：首图的强制路线，也用于抽象映射、隐喻、氛围或需要位图质感的场景。此路线下每一张图都要使用真实图片工具；Codex 中全部使用 Image Gen。
     4. `coded_visual`：只用于流程、关系、时间线、框架、比较、数据或机制解释。禁止用代码伪造证据、填充装饰，或替代真正需要的生成隐喻图。
   - 新闻或事件跟踪中，证据截图负责建立可信度，代码视觉只负责解释。代码制作的卡片、时间线、引语图或仿帖子都不算证据。
   - 图片生成不可用时，必须先告知用户。非首图可使用明确标注的代码替代稿；首图只能保留 `desired_generation_prompt` 等待真实生图，不得用任何替代稿完成正式交付。

4. **规划公众号封面**
   - 阅读 `references/cover-system.md`。
   - 完整文章包默认制作 `2.35:1` 头条封面。
   - `1:1` 只在用户要求封面组合、需要方形分享或归档复用、或准备多文章缩略图时制作。
   - 禁止直接把 `2.35:1` 盲裁成 `1:1`；方图需要单独压缩标题。

5. **制作微信安全的文章 HTML**
   - 优先按 `references/components.md` 手写组件化 HTML。Markdown 渲染只用于临时低质量草稿。
   - 遵循 `references/style-guide.md`：白色编辑页、居中标题、灰色副标题、暖纸视觉块、低饱和砖红强调线、居中图注和紧凑章节标题。
   - 正文样式全部内联。
   - Markdown 的 `---`、`***`、`___` 只表示源结构，不能作为可见正文输出。章节间距只由一个相邻组件负责，禁止标题底边距、空白占位块和前一组件底边距重复叠加。
   - 图片、SVG、大卡片、引用、表格、矩阵、步骤块和长截图统一视为强视觉块。可识别组件在根节点填写 `data-wlp-visual-block`，相邻强视觉块之间必须有承担新信息的正文解释。
   - 同一组数据或步骤只选择一种主要视觉表达。已经用数字卡表达的数据不要紧接柱状图；已经用步骤卡表达的路径不要紧接流程图。
   - 保持移动端友好；正文禁用固定元素、脚本、媒体查询、transform 和 CSS 动画。
   - 重要图片下写图注，来源已知时注明来源。

6. **生成内部预览**
   - 先制作内部本地预览用于检查；本地 `images/foo.jpg` 或 `file://` 路径绝不算正式可复制。
   - 本阶段只做排版和视觉自查，不上传正文图。先修正首图、截图可读性、图表留白、图片节奏和正文结构，再进入正式准备。

7. **视觉验证**
   - 用 `references/qa-checklist.md` 做最终交付检查。
   - 先运行 `npm run verify-layout -- --article <output-preview-or-fragment.html> --image-plan <image-plan.json>`。原始 Markdown 分隔符、无意义空白、首节视觉过晚、相邻重视觉、连续长截图和相邻语义重复均为硬失败。
   - 检查图片、图注、文字溢出和首屏风格；视觉回执必须逐项确认首图无额外文字、无横向溢出、无破图、全部视觉文字可读、图片密度平衡、无异常留白、首节锚点靠前、无重视觉连排、无长截图连排、无语义重复、整页截图稳定和视觉系统一致。
   - 检查密度时统计全部强视觉块，而不只统计图片和 SVG。默认每个阅读单元一个视觉锚点；引用、表格、矩阵、大卡片、步骤块和长截图也会消耗同一阅读区间的视觉预算。
   - 检查语义：每张图使用适合其职责的来源路线，并靠近所解释的论点、结构、数据、流程或隐喻。
   - 按 `references/visual-quality.md` 检查首图、截图可读性、生成图瑕疵、裁切安全和来源完整性。
   - 在 `image-plan.json` 中补全最终状态、素材路径、来源 URL、提供方、视频时间戳及失败记录，再运行：
     ```bash
     cd scripts && npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
     ```
   - 新闻最终验证至少需要一张已截取的证据截图。截图记录 `captured_at` 和真实文件 `asset_sha256`，尺寸不得小于 `320×120`。只有所有来源尝试都以 `failure_code`、`attempted_at` 和原因记录真实访问失败时，才可使用 `--allow-evidence-failure`，并向用户说明降级。
   - 最终状态不得保留 `user_decision: pending` 的无生成能力替代稿。明确记录用户接受代码版，还是提供了外部替换图。
   - 正文不得出现 `<style>`、`<script>`、`class=` 或 `id=`。
   - 条件允许时先运行：
     ```bash
     cd scripts && npm run verify-article -- --complete-package --content-mode <rewrite|preserve> --source-article <source-article> <output-preview-or-fragment.html>
     npm run verify-copy -- <output-preview-or-fragment.html>
     ```
   - `rewrite` 模式下，`verify-copy` 标出 AI 腔或长段落时按 `references/editorial-writing.md` 重写；`preserve` 模式只报告并保持原文。
   - `verify-copy-ready` 失败时，先上传并改写图片地址，禁止宣称文件可直接复制到微信。
   - 只有真实粘贴测试通过后，才可用 `verify-copy-ready -- --allow-data-uri <file>`；原图尽量控制在约 1 MB 内。
   - 必须以约 `375-390px` 宽度打开完整预览，保存首屏和整页截图。浏览器原生 `fullPage` 出现重复平铺时，改用分段滚动截图并稳定拼接；重复平铺的整页截图不能生成通过回执。检查通过后按 `references/publishing.md` 生成与当前正文及图片计划哈希绑定的 `visual-qa.json`；自动检查只证明审查产物存在，不能替代视觉判断。
   - `publish.ts` 的正式入口只接受已完成组件排版和视觉审查的 HTML；Markdown 自动渲染只用于内部工作预览。它默认只准备正式可复制版，通常同时输出正文片段和预览，必须接收 `--visual-qa`，不处理封面，也不调用 `draft/add`。`make-preview.mjs` 只生成本地工作预览，禁止用它冒充正式可复制版。
   - 最后运行 `verify-copy-ready` 并再次打开正式可复制预览做快速复核。普通远程 URL 或 data URI 只有在真实粘贴测试通过并显式开启例外时才可交付。

8. **按需写入草稿箱**
   - 只有 `delivery_mode: draft` 且 `draft_authorization` 为 `direct_request` 或 `post_preview_confirmation` 时才执行。
   - 阅读并遵循 `references/publishing.md`。
   - 用 `--image-plan` 传入最终 `image-plan.json`，并传 `--source-article <original article>`，防止改写后的文章隐藏新闻信号。草稿入口只接受通过视觉 QA 的 HTML。
   - 从可复制版继续时，用户明确确认草稿箱后才更新交付状态；重新打开当前正式可复制预览，生成匹配的视觉 QA 回执，再用显式 `--create-draft` 原样复用标记正文。已有有效微信 URL 的正文图不得重复上传。
   - 用户明确要求直接进入草稿箱时，可对本地验证通过的母版使用 `--create-draft`；同次运行可以保留可复制归档。缺少该参数时绝不创建草稿。
   - 草稿封面必须在调用发布脚本前生成并完成视觉检查。默认复用已经审查通过的 `900×383` 正文首图；需要独立封面时先生成、查看、修正，再用 `--cover <path>` 传入。禁止在创建草稿的同一次运行中临时生成一张未经审查的新封面。
   - 使用 upload manifest 在文字或排版调整后复用未变化的正文图。manifest 只记录来源、哈希、URL 和时间，并原子写入。
   - 运行 `publish.ts` 前先诊断或检查凭据，把凭据当作就绪闸门。
   - 发起任何微信请求前，`publish.ts` 必须通过正文安全、最终图片计划、本地或远程正文图、素材边界和封面裁切预检。不得绕过失败验证。
   - 微信托管图片在本地预览出现防盗链占位时，预览必须明确提示，并以 HTML 引用与微信编辑器内效果验收。创建草稿时若 `mmbiz.qpic.cn` 无法被受保护下载器安全回拉，保持 SSRF 限制不变；仅可使用最终计划中同一 `data-wlp-visual-id`、哈希一致且位于许可目录内的本地母版重新上传。
   - 远程正文图只能走受保护下载器：公开 http(s)、受限重定向、超时和大小限制、真实 PNG/JPEG 校验。
   - 本地图片默认仅限文章目录；外部素材目录必须显式使用 `--asset-dir <directory>`，禁止默认扩大到整个用户目录。
   - 凭据只检查环境变量、本地 `.env`，以及此 Skill 标准服务名下的 macOS Keychain 或 Windows Credential Manager。禁止搜索旧聊天、随机文件、shell 历史或任意钥匙串条目。
   - 找不到凭据时停止，请用户选择标准安全设置、从现有 `.env`/环境变量导入，或临时提供一次用于导入。禁止无止境搜索。
   - 分发包中绝不保存真实 AppID、AppSecret 或 OpenAI API key。
   - 首次使用时，引导运行 `cd scripts && npm ci --omit=dev && npm run setup`，安装锁定的轻量运行依赖，并把凭据存入系统安全凭据库。
   - 缺少发布凭据时，运行 `npm run diagnose-credentials`，只显示标准服务和账户的查找结果，绝不泄露密钥。
   - 环境变量或本地 `.env` 已有有效凭据时，使用 `npm run import-credentials` 导入标准系统凭据库。
   - `.env` 仅作为高级本地备用方案，绝不随 Skill 分发。用户在聊天中粘贴 AppSecret 时，不要复述，并建议测试后轮换。
   - `draft/add` 只创建草稿，禁止宣称已公开发布。用户仍需在 `mp.weixin.qq.com` 中预览并手动发布。

## 完成回报

回复用户时包含：

- 预览 HTML 路径，并明确它是仅限本地还是微信正式可复制版。
- 入口方式、内容处理模式和交付方式；`messy_materials` 或 `draft_copy` 说明主要改动，`final_copy` 说明原文保留校验结果与任何额外标题、图注或来源文字。
- `2.35:1` 头条封面路径或方案；只有实际生成时才附 `1:1` 路径。
- 配图来源汇总：生成图、网络素材、用户素材、SVG 或 HTML 代码图。
- `image-plan.json` 路径、内容类型、分类置信度和依据，以及四种来源路线的数量。
- 当前 Agent 的图片生成能力与工具；不可用时说明代码替代稿、保留的外部提示词和用户选择，禁止称其为生成图。
- 用户图片和视频的使用位置与原因，以及任何相关素材未采用的理由。
- 新闻或混合新闻评论的证据 URL，或证据截取失败的真实原因。
- 正文图片属于微信托管、普通远程 URL、data URI 还是本地路径。
- 人工视觉审查状态：实际检查宽度、首屏与整页是否已查看，以及仍未解决的截图可读性、封面融合、裁切、留白或图片节奏问题。没有完成这一步时，禁止报告正式交付完成。
- 用户要求写入草稿箱时，返回草稿 `media_id`。
- 缺失项或未解决的署名与来源风险。
- `copy_ready` 交付后，用户明确表示满意时主动询问是否加入草稿箱；用户未授权时停止，不自动创建草稿。
- 提醒用户：进入草稿箱不等于公开发布。

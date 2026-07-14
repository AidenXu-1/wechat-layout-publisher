---
name: wechat-layout-publisher
description: 公众号排版发布：把用户文章制作成可复制到微信公众号的图文 HTML，按语义规划并生成、联网寻找或引用用户图片，制作 2.35:1 头条封面；用户明确要求时再通过公众号 API 写入草稿箱。适用于公众号排版、文章美化、图文配图、公众号封面、WeChat cover、copy-ready WeChat HTML、草稿箱和发布到公众号等任务。
---

# 公众号排版发布

把用户提供的文章制作成可直接复制到公众号正文编辑器的图文排版稿，并生成 `2.35:1` 公众号头条封面。仅在用户明确要求时，继续通过公众号 API 写入草稿箱。

## 交付合同

只维护一份公众号正文母版，并提供两种最终交付状态：

- **正式可复制版**：普通排版或复制任务默认先交付。正文图片必须使用验证通过的 `mmbiz.qpic.cn` 或 `mmbiz.qlogo.cn` 地址；浏览器预览外壳可提供复制和回到顶部按钮。
- **草稿箱版**：仅在用户要求时创建。原样复用正式可复制版正文，补充封面和元数据后调用 `draft/add`。
- 内部本地预览可以使用本地图片，只用于质量检查或凭据不可用时的退化交付。必须标注为仅限本地，且绝不显示复制按钮。
- 用 `ARTICLE HTML START` 和 `ARTICLE HTML END` 包住文章正文。
- 正文只使用微信安全的内联 HTML：不用 CSS 类、外部样式或 JavaScript。
- 按语义把图片放在能帮助理解的位置，禁止集中堆在开头或结尾。
- 生成 `image-plan.json`，记录内容分类、用户素材、四种素材路线、准确位置及来源决策。
- 完整文章包必须包含 `2.35:1` 头条封面方案或成品。
- 记录生成图片、网络素材和用户素材的来源说明。

复制按钮、预览状态、回到顶部按钮和脚本只属于浏览器预览外壳，绝不能进入标记正文或 `draft/add` 的 `content`。如果正文仍有待上传图片，而凭据或 IP 白名单不可用，只能交付明确标注的本地预览，并说明正式可复制版尚未完成；正文已经全部使用有效微信图片 URL 时可以直接验证并复用。

开始时先检查当前 Agent 是否有图片生成工具。有工具时，每个分配为 `generated_image` 的视觉都必须调用真实工具；在 Codex 中使用 Image Gen。没有工具时，先说明限制，制作明确标注的代码视觉替代稿以继续排版，保留完整图片提示词，再让用户选择接受替代稿或从外部生成图片后替换。

## 必读文件

开始编写文章 HTML 前，依次阅读：

1. `references/content-planning.md`：阅读路径、章节职责和语义配图密度。
2. `references/editorial-writing.md`：内容类型、开头钩子、人味、段落密度和新闻证据闸门。
3. `references/style-guide.md`：兆基日报视觉规范。
4. `references/components.md`：可复用的内联 HTML 组件。
5. `references/cover-system.md`：生成 `2.35:1` 头条封面或可选 `1:1` 方形封面时阅读。
6. `references/image-placement.md`：配图规划与素材来源选择。
7. `references/visual-quality.md`：首图、截图、生成图、裁切和最终视觉质量闸门。
8. `references/wechat-html-spec.md`：微信编辑器约束。
9. `references/qa-checklist.md`：最终交付或草稿写入前检查。

需要把网络或本地图片转换成可嵌入的 data URI 时，使用 `scripts/img2base64.ts`。

需要写入草稿箱时，再阅读 `references/publishing.md`。

## 工作流

1. **收集输入**
   - 确认源文章、标题、副标题、作者或栏目名，以及用户提供的图片。
   - 搜索或生成素材前，先盘点用户提供的全部图片和视频。相关视频要规划带时间戳的代表帧。
   - 检查可用工具，把 `image_generation_capability` 记录为 `available` 或 `unavailable`；可用时同时记录 `image_generation_tool`。不要假设所有 Agent 都是 Codex 或都能生成图片。
   - 只有原始正文时，可以推断克制的标题和副标题，但不得编造事实。
   - 文章依赖时效事实时，先联网核查一手来源。

2. **重组文章**
   - 除非用户要求改写，否则保留核心措辞和论证顺序。
   - 按 `references/content-planning.md`，先确定核心主张、读者承诺、章节地图和视觉地图。
   - 按 `references/editorial-writing.md`，先分类内容类型并记录置信度和依据。
   - 文章涉及近期事件、公告、争议、政策或产品变化、官方回应、公开帖子、媒体报道或时效性事实时，使用 `news_event` 或 `mixed_news_commentary`。新闻与观点难以区分时，采用混合新闻路线并保留证据要求。
   - 公共争议、产品变化、官方回应、媒体报道、Reddit/X/社区讨论、论文或文档型文章，至少规划并截取一张靠近对应论点的证据截图。记录全部来源 URL；只有真实记录的访问失败可以进入降级路径。
   - 开头先写真实体验、读者痛点或具体不适，再给专业解释。
   - 完整文章包固定顺序：HTML H1、克制副标题、`2.35:1` 正文首图、导语、阅读单元、真实结论。正文首图使用无内嵌标题的视觉底图；公众号头条封面是独立的 `900 x 383` 成品，使用同一视觉系统并由可控排版层合成标题。更换任一图片不得删除 H1 或副标题。
   - 每个阅读单元只承载一个主旨。小点过多时合并成卡片或信息图，避免每一点都升格为完整章节。
   - 章节标题直接表达内容，少用装饰性标签。

3. **先规划配图，再制作素材**
   - 先做深层语义识别，判断每个视觉需求属于证据、结构、数据、流程、框架、隐喻、氛围还是用户素材。
   - 按 `references/image-placement.md` 的结构建立 `image-plan.json`，必须先于搜索、生成或绘图。
   - `runtime` 必填。最终 `asset_path` 必须指向正文真实使用的素材；发布预检会按内容哈希双向核对本地正文图与图片计划，禁止计划与成品各走各的。
   - 验证规划阶段：
     ```bash
     cd scripts && npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
     ```
   - 每张重要图片都要符合 `references/visual-quality.md`：角色明确、通过对应质量闸门，并靠近它服务的段落。
   - 每个视觉只走以下一种路线，按顺序判断：
     1. `user_asset`：优先使用相关用户图片；相关视频提取有意选择且带时间戳的画面。
     2. `evidence_screenshot`：新闻、公开主张、引语、公告、社交帖子、官方页面、论文或产品状态，应截取原始来源或现有最权威来源。
     3. `generated_image`：用于编辑首图、抽象映射、隐喻、氛围或需要位图质感的场景。有图片生成能力时，此路线下每一张图都要使用真实图片工具；Codex 中全部使用 Image Gen，不限于首图。
     4. `coded_visual`：只用于流程、关系、时间线、框架、比较、数据或机制解释。禁止用代码伪造证据、填充装饰，或替代真正需要的生成隐喻图。
   - 新闻或事件跟踪中，证据截图负责建立可信度，代码视觉只负责解释。代码制作的卡片、时间线、引语图或仿帖子都不算证据。
   - 图片生成不可用时，必须先告知用户。制作代码视觉替代稿，把原始意图存入 `desired_generation_prompt`，并标记 `fallback_for: generated_image` 与 `user_decision: pending`。
   - 用替代稿继续完成预览。最终交付前，用户必须选择 `accept_current`，或在外部生成并返回替换图片；替换后记录 `provider: external_user_supplied` 和 `user_decision: replace_externally`。
   - 除上述明确的无生成能力替代路径外，首张视觉不得使用 `coded_visual`。替代稿也绝不能代替证据截图，或冒充模型生成图片。

4. **规划公众号封面**
   - 阅读 `references/cover-system.md`。
   - 完整文章包默认制作 `2.35:1` 头条封面。
   - `1:1` 只在用户要求封面组合、需要方形分享或归档复用、或准备多文章缩略图时制作。
   - 禁止直接把 `2.35:1` 盲裁成 `1:1`；方图需要单独压缩标题。

5. **制作微信安全的文章 HTML**
   - 优先按 `references/components.md` 手写组件化 HTML。Markdown 渲染只用于临时低质量草稿。
   - 遵循 `references/style-guide.md`：白色编辑页、居中标题、灰色副标题、暖纸视觉块、低饱和砖红强调线、居中图注和紧凑章节标题。
   - 正文样式全部内联。
   - 保持移动端友好；正文禁用固定元素、脚本、媒体查询、transform 和 CSS 动画。
   - 重要图片下写图注，来源已知时注明来源。

6. **生成内部预览**
   - 先制作内部本地预览用于检查；本地 `images/foo.jpg` 或 `file://` 路径绝不算正式可复制。
   - 本阶段只做排版和视觉自查，不上传正文图。先修正首图、截图可读性、图表留白、图片节奏和正文结构，再进入正式准备。

7. **视觉验证**
   - 用 `references/qa-checklist.md` 做最终交付检查。
   - 检查图片、图注、文字溢出和首屏风格。
   - 检查密度：默认每个阅读单元一个视觉锚点。连续大图、没有独立证据或解释职责的第二张大图、以及重复附近文字的图片，都要重新判断。
   - 检查语义：每张图使用适合其职责的来源路线，并靠近所解释的论点、结构、数据、流程或隐喻。
   - 按 `references/visual-quality.md` 检查首图、截图可读性、生成图瑕疵、裁切安全和来源完整性。
   - 在 `image-plan.json` 中补全最终状态、素材路径、来源 URL、提供方、视频时间戳及失败记录，再运行：
     ```bash
     cd scripts && npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
     ```
   - 新闻最终验证至少需要一张已截取的证据截图。只有所有来源尝试都真实记录访问失败时，才可使用 `--allow-evidence-failure`，并向用户说明降级。
   - 最终状态不得保留 `user_decision: pending` 的无生成能力替代稿。明确记录用户接受代码版，还是提供了外部替换图。
   - 正文不得出现 `<style>`、`<script>`、`class=` 或 `id=`。
   - 条件允许时先运行：
     ```bash
     cd scripts && npm run verify-article -- --complete-package --source-article <source-article> <output-preview-or-fragment.html>
     npm run verify-copy -- <output-preview-or-fragment.html>
     ```
   - `verify-copy` 标出 AI 腔或长段落时，按 `references/editorial-writing.md` 重写。
   - `verify-copy-ready` 失败时，先上传并改写图片地址，禁止宣称文件可直接复制到微信。
   - 只有真实粘贴测试通过后，才可用 `verify-copy-ready -- --allow-data-uri <file>`；原图尽量控制在约 1 MB 内。
   - 必须以约 `375-390px` 宽度打开完整预览，检查首屏和整页。自动检查无法证明截图可读性、封面融合、图片节奏或图表留白。
   - 人工视觉检查通过后，才按 `references/publishing.md` 运行 `publish.ts --prepare-only`，通常同时输出正文片段和正式可复制预览。`--prepare-only` 不处理封面，也不调用 `draft/add`。
   - 最后运行 `verify-copy-ready` 并再次打开正式可复制预览做快速复核。普通远程 URL 或 data URI 只有在真实粘贴测试通过并显式开启例外时才可交付。

8. **按需写入草稿箱**
   - 只有用户明确要求文章进入公众号草稿箱时才执行。
   - 阅读并遵循 `references/publishing.md`。
   - 用 `--image-plan` 传入最终 `image-plan.json`。HTML 输入必须同时传 `--source-article <original article>`，防止改写后的文章隐藏新闻信号；Markdown 可以使用自身。
   - 用户确认后，把正式可复制版正文片段交给默认草稿模式，原样复用标记正文。已有有效微信 URL 的正文图不得重复上传。
   - 用户明确要求直接进入草稿箱时，可对本地验证通过的母版运行默认草稿模式；同次运行可以保留可复制归档。
   - 使用 upload manifest 在文字或排版调整后复用未变化的正文图。manifest 只记录来源、哈希、URL 和时间，并原子写入。
   - 运行 `publish.ts` 前先诊断或检查凭据，把凭据当作就绪闸门。
   - 发起任何微信请求前，`publish.ts` 必须通过正文安全、最终图片计划、本地或远程正文图、素材边界和封面裁切预检。不得绕过失败验证。
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
   - 使用 `--gen-cover` 时，如有语义隐喻就通过 `--cover-prompt` 传入。备用生成器先把无文字底图裁成 `900 x 383`，再用可控的安静区文字层合成真实标题。

## 完成回报

回复用户时包含：

- 预览 HTML 路径，并明确它是仅限本地还是微信正式可复制版。
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
- 提醒用户：进入草稿箱不等于公开发布。

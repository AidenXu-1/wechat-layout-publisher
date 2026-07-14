# 配图位置与来源策略

目标是语义配图：每张图都应承担解释、证明、比较或建立氛围的职责。禁止机械选择图片类型。先理解附近段落在做什么，再决定来源和位置。

## 目录

- 语义路由与视觉角色
- 图片位置与来源选择
- 图片计划、质量检查和图注

## 语义路由

不要先选绘图工具。先判断附近段落希望读者完成什么：

- **看见用户提供的东西**：`user_asset`。
- **相信公共事件、引语、帖子、页面或产品状态确实存在**：`evidence_screenshot`。
- **感受或理解抽象隐喻、氛围、冲突或概念映射**：`generated_image`。
- **理解流程、关系、时间线、框架、比较、数据集或机制**：`coded_visual`。
- **没有真实语义配图需求**：不放图，改进留白、标题或提示块。

完成路由后，再执行 `visual-quality.md`。来源类型选对了，也可能因裁切不安全、截图不可读或生成图过于通用而失败。

## 视觉角色判断

每张候选图片只分配一个角色：

| 角色 | 适用情况 | 优先来源 |
|------|----------|----------|
| 首图隐喻 | 建立全文张力或氛围 | 带准确标题的生成图 |
| 证据 | 证明引语、页面、界面状态或主张 | 网络截图、官方图片、用户图片 |
| 解释图 | 解释结构、机制、时间线、流程或比较 | SVG、HTML 信息图、图表 |
| 实物/照片 | 展示真实产品、人物、地点或场景 | 用户图片、官方图片、网络图片 |
| 数据总览 | 压缩数字或并列事实 | SVG、卡片、表格 |
| 呼吸图 | 不增加新主张，只缓解阅读疲劳 | 极少使用生成图或编辑图 |

角色说不清时，不使用这张图。

## 放置规则

- **首图**：放在标题和副标题之后，必须由生图模型生成，带与 H1 准确一致且融入构图的标题。
- **导语视觉**：导语包含多项主张时，在导语后放紧凑总览图。
- **章节视觉**：放在章节第一段之后，让读者先知道应该看什么。
- **数据视觉**：数字、时间线、矩阵、流程和比较使用 SVG 或 HTML 图形。
- **证据图片**：截图或用户图片靠近它支持的主张。
- **外部语境截图**：文章引用或实质依赖公共页面、论文、信息网站、社交网络或技术社区讨论时使用；不能因为主题公开就随意加图。
- **新闻证据**：事件、争议或报道型文章中，证据截图属于必需信任层。靠近对应主张放置；无法截取时记录真实失败原因。
- **结尾图片**：可选，只有能形成最终综合判断时才使用，禁止纯装饰。

禁止连续放置超过两张大图。文字、图片、图注和分析要交替出现。

强视觉之后不要立即重复同一种动作。大首图或照片后接文字、紧凑卡片组或图表；密集截图后先解释，再放下一张证据图。

## 来源选择

首图固定使用 `generated_image`。其他视觉每个只能分配一条路线，按以下顺序判断，以保护用户意图和证据质量。

### 路线 1：`user_asset`

- 任何联网搜索或生成前，先盘点用户提供的全部图片与视频。
- 用户素材能支持段落时优先使用，即使另一张图片可能更精致。
- 视频要检查内容并提取代表帧，把时间戳记录到 `frame_timestamp`；禁止使用随机开场画面。
- 有 `ffmpeg` 时运行：
  ```bash
  cd scripts && npm run extract-video-frame -- <video> --time 00:01:42 --out <frame.jpg>
  ```
- 没有 `ffmpeg` 时，说明这个轻量依赖并征求安装许可，或请用户提供静帧。禁止默默忽略相关视频。
- 保留证据语境。只为提高可读性裁切，不能删掉让素材有意义的界面、环境、时间戳、人物、产品或动作。
- 只有重复、不可读、隐私、版权或语义不匹配等明确 `override_reason`，才可跳过相关用户素材。

### 路线 2：`evidence_screenshot`

- 文章报道新闻、引用来源、转述公开声明、描述社会反应，或依赖真实页面、界面、文档和产品状态时使用。
- 来源优先级：官方页面或回应，其次原始社交帖子或公开讨论，再次可信媒体，最后社区源头。
- 在 Codex 中使用可用浏览器导航和截图工具打开来源，截取有意义区域。只有在适当且获授权时才使用用户已登录的浏览器状态。
- 保留来源身份和足够上下文，证明页面是什么。脱离语境的一小句文字证据很弱。
- 能访问原始页面时禁止截搜索结果。绝不使用代码重建帖子、引语、标志、标题或界面，再把它称为证据。
- 记录 `source_url`、`source_tier`、截取状态、素材路径、图注，以及受阻时的失败原因。
- 新闻与混合新闻评论最终交付前至少截取一张截图；除非全部尝试都明确记录为不可访问。

### 路线 3：`generated_image`

- 是首图的强制路线，也适用于抽象映射、中心隐喻、情绪、冲突、氛围，或位图质感能明显提升阅读体验的场景。
- 先检查当前 Agent 的工具。有图片生成能力时，每个 `generated_image` 都必须调用真实工具，正文图与首图、封面都一样。
- Codex 使用 Image Gen；其他 Agent 使用其原生图片能力，并在计划中记录真实提供方。
- 禁止因为代码更快，就把 Image Gen 任务悄悄替换成 SVG/HTML。只有语义分析确认它实际属于结构图时，才能修改路线。
- 当前 Agent 只有脚本/API 图片生成能力，或明确运行自动化 `publish --gen-cover` 时，可以使用脚本/API。
- 提示词来自附近段落，并包含：角色、读者所得、具体隐喻或主体、氛围、配色、目标裁切、手机构图和排除项。首图额外写入完整标题、`2.35:1` 与文字融合规则。
- 首图必须带准确标题，其他位图禁止文章标题、图注、伪界面、伪社交帖子、标志、水印或海报布局。

### 没有图片生成能力

当前 Agent 没有图片生成工具时：

1. 告知用户当前无法生成语义上更合适的位图。
2. 把完整目标提示词保存到 `desired_generation_prompt`。
3. 制作克制的 SVG/HTML 代码替代稿，让排版和预览继续。
4. 实际路线标记为 `coded_visual`，并使用 `semantic_kind: editorial_fallback`、`fallback_for: generated_image`、`user_decision: pending`。
5. 给用户两个选择：`accept_current`，或在外部按保留提示词生成图片后返回替换。
6. 禁止把替代稿称为 AI 生成图。用户选择未解决前不得完成最终验证。

用户接受时，保留代码素材并设置 `user_decision: accept_current`。用户返回外部生成图时，替换为 `source_type: generated_image`、`provider: external_user_supplied`、`user_decision: replace_externally`。

这个例外不得占用首图位置；无生图能力时，首图保留提示词并停在本地工作预览。

### 路线 4：`coded_visual`

- 只用于流程、关系、时间线、框架、比较、数据总览或机制。
- 精确标签、数字卡、关系图、决策树、管线、矩阵和步骤图优先使用 SVG/HTML。
- 只能使用文章事实作为数据。禁止为了让图完整而编造数字、节点、因果箭头或时间顺序。
- `role: data` 或 `semantic_kind: data` 必须填写 `data_sources`，每项使用真实 `http(s)` URL、`sha256:<64位哈希>` 或 `user-provided:<来源说明>`。
- 禁止把代码图用作首图、证据或装饰填充。
- 代码时间线可以在截图证明事件之后解释经过，不能代替截图。

需要处理外部图片直链时，使用受保护转换器：

```bash
cd scripts && npx tsx img2base64.ts "<image-url-or-local-path>" --max-kb 980
```

## 图片计划模板

把计划保存为 `image-plan.json`。最小示例：

```json
{
  "runtime": "codex",
  "content_mode": "preserve",
  "image_generation_capability": "available",
  "image_generation_tool": "imagegen",
  "content_type": "mixed_news_commentary",
  "classification_confidence": 0.9,
  "classification_signals": ["recent company response", "article cites an official page"],
  "supplied_assets": [
    {
      "id": "user-video-1",
      "kind": "video",
      "relevance": "relevant",
      "decision": "use",
      "semantic_reason": "shows the product behavior described in section 2"
    }
  ],
  "visuals": [
    {
      "id": "hero",
      "order": 1,
      "section": "lead",
      "placement": "after subtitle",
      "role": "hero",
      "source_type": "generated_image",
      "semantic_reason": "maps the trust conflict into one editorial metaphor",
      "title_text": "文章的准确 H1",
      "prompt": "2.35:1 premium editorial metaphor with the exact title naturally integrated into the quiet area",
      "provider": "imagegen",
      "status": "planned"
    },
    {
      "id": "official-evidence",
      "order": 2,
      "section": "event background",
      "placement": "after the official-response paragraph",
      "role": "evidence",
      "source_type": "evidence_screenshot",
      "semantic_reason": "proves the official response and wording",
      "source_url": "https://example.com/official",
      "source_tier": "official",
      "status": "planned"
    },
    {
      "id": "video-frame",
      "order": 3,
      "section": "product behavior",
      "placement": "after the behavior description",
      "role": "object",
      "source_type": "user_asset",
      "asset_ref": "user-video-1",
      "frame_timestamp": "00:01:42",
      "semantic_reason": "shows the exact behavior in the supplied video",
      "status": "planned"
    },
    {
      "id": "mechanism",
      "order": 4,
      "section": "how it works",
      "placement": "after the mechanism explanation",
      "role": "explainer",
      "source_type": "coded_visual",
      "semantic_kind": "process",
      "semantic_reason": "turns the four-step mechanism into a readable flow",
      "status": "planned"
    }
  ]
}
```

制作素材前和素材就绪后分别验证：

```bash
npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
```

最终阶段把 `status` 改为 `ready`、`captured` 或 `attempt_failed`，并补充 `asset_path`、图注、提供方或来源细节。已截取证据还要记录 ISO 时间 `captured_at` 和 `asset_sha256: sha256:<64位哈希>`；真实访问失败记录 `failure_code`（`http_error|access_denied|login_required|network_error|removed|policy_blocked`）、`attempted_at` 和具体原因。`runtime` 不能为空；`content_mode` 必须与开局选择一致。使用 `--check-files` 时，首图必须是带 `title_text` 的 `generated_image`、状态为 `ready` 且比例为 `2.35:1`；证据截图至少 `320×120`。其他文件、来源与证据安全规则保持不变。

正文按 `order` 放置每个视觉，并在实际 `<img>` 上写 `data-wlp-visual-id="计划 id"`；内联 SVG/HTML 写在其最外层节点。每个视觉只标记一次。发布预检会按 ID 和顺序逐项对账，并对所有位图下载真实字节后核对内容哈希，包括已经是微信 URL 的图片。

## 质量检查

最终确定图片计划前检查：

- 新闻/事件与混合新闻文章至少有一张来自官方、原始社交来源、可信媒体或社区的证据截图；只有明确记录访问失败并获允许时例外。
- 每个相关用户图片或视频已使用，或有明确跳过原因。
- 每个 `generated_image` 记录真实可用工具；Codex 记录 Image Gen，包括首图后的正文图。
- 同一 `section` 出现第二张视觉，或多张图使用相同 `semantic_reason` 时，验证器会发出复审警告；只在职责确实不同的情况下保留。
- 图片生成不可用时，非首图生成需求可有已标注的代码替代稿；首图保留提示词并停在本地工作预览。
- 每个 `coded_visual` 都承担结构职责，不能作为首图或证据。
- 首图焦点清楚，并通过 `visual-quality.md`。
- 截图在手机宽度下可读。
- 首图标题准确并融入构图；其他生成图无文字瑕疵、标志、伪界面或水印状痕迹。
- 裁切保留人脸、手、产品、界面文字和支持主张的语境。
- 图片与附近文字节奏交替，不能连续堆大幅装饰图。
- 图注说明读者看到什么，必要时说明来源。

## 图注规则

- 图注回答：这是什么、来自哪里、为什么重要。
- 格式：`图注：说明｜来源：...`
- 生成图：`图注：根据文章语义生成的编辑配图`
- 用户图片：`图注：用户提供图片`
- 网络图片：正文图注过长时保持简短，在完成回报中提供来源名称与链接。

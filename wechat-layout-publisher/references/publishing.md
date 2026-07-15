# 微信正式交付与草稿箱

文章母版、最终 `image-plan.json` 和视觉检查完成后，使用本流程。同一份文章正文支持两种最终交付：正式可复制版，以及仅在用户要求时创建的草稿箱版。

`image-plan.json` 必须记录开局确认的入口、内容阶段、内容模式、交付方式、草稿授权和正文图片上传授权。`--prepare-only` 只接受 `delivery_mode: copy_ready` 与 `body_image_upload_authorization: copy_ready_request`；`--create-draft` 只接受 `delivery_mode: draft`、有效草稿授权，以及 `draft_request` 或 `post_preview_confirmation` 的正文图片上传授权。`preserve` 会在任何微信请求前核对源文字符与顺序，检测到删改或调序立即停止；`rewrite` 允许改写，但仍使用源文章做内容分类、证据和事实边界检查。

## 目录

- 前置条件与首次设置
- 凭据查找与安全导入
- 正式准备模式与草稿命令
- 错误处理

## 前置条件

- 目标账号必须是已认证且拥有 `draft/add` 权限的微信公众号。
- 需要上传正文图或创建草稿时，`WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 必须来自环境变量、本地 `.env` 或系统安全凭据库。`--prepare-only` 输入已经全部是有效微信图片 URL 时，只验证并复用，不要求凭据。
- 调用方公网 IP 必须加入公众号 IP 白名单。
- 只有草稿模式需要封面，且必须传入已经人工查看并通过视觉 QA 的 `--cover <path>`。发布命令禁止临时生成封面，避免未经审看的图片直接进入草稿箱。
- 普通发布的 `--cover` 使用 `2.35:1` 头条封面，标准成品为 `900 x 383`。当前 `draft/add` 脚本只发送一个封面 media id；可选 `1:1` 是附加素材，不是第二个 API 封面字段。
- 官方 API 参考：
  - Access token：`https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html`
  - 添加草稿：`https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html`

## 分发用户首次设置

真实 AppSecret 绝不能进入 Skill 包。分发时只保留 `.env.example`。

## 凭据查找规则

本 Skill 不会搜索整台电脑里的密钥。那既慢、出人意料，也不安全。

发布时只检查：

1. 当前环境变量。
2. 当前项目或 Skill 根目录的本地 `.env`。
3. 标准系统安全凭据库：
   - macOS Keychain：`service=wechat-layout-publisher`，`account=WECHAT_APP_ID` / `WECHAT_APP_SECRET`。
   - Windows Credential Manager：`target=wechat-layout-publisher:WECHAT_APP_ID` / `wechat-layout-publisher:WECHAT_APP_SECRET`。

仍未找到时，只向用户询问一次：

```text
我没在标准位置找到公众号凭据。你想怎么配置？
1. 跑 npm run setup，把 AppID/AppSecret 存进系统安全凭据。
2. 你已经有 .env 或环境变量，我帮你 npm run import-credentials 导入标准位置。
3. 你临时提供一次 AppID/AppSecret，我只导入系统安全凭据，不写进 Skill 包。
```

除非用户明确要求取证式搜索，否则禁止搜索旧会话、截图、随机笔记、shell 历史或无关钥匙串条目。

在 Skill 根目录运行：

```bash
cd scripts
npm ci --omit=dev
npm run setup
```

设置脚本会：

- macOS：保存到 macOS Keychain。
- Windows：保存到 Windows Credential Manager。
- 显示当前公网 IP，供用户添加到公众号 IP 白名单。
- 保存凭据后，检查微信能否签发 access token。
- 使用统一凭据标识：
  - macOS Keychain：`service=wechat-layout-publisher`，`account=WECHAT_APP_ID` / `WECHAT_APP_SECRET`。
  - Windows Credential Manager：`target=wechat-layout-publisher:WECHAT_APP_ID` / `wechat-layout-publisher:WECHAT_APP_SECRET`。

用户在微信公众号后台查找凭据的路径：

1. 打开 `https://mp.weixin.qq.com` 并登录目标公众号。
2. 进入“设置与开发 / 基本配置”。
3. 复制公众号 AppID。
4. 生成或复制 AppSecret，并把它当作密码保护。
5. 把本机当前公网 IP 加入 IP 白名单。
6. 白名单修改后运行 `npm run check-credentials`。

缺少凭据，或用户表示凭据配置在别处时：

```bash
cd scripts
npm run diagnose-credentials
```

该命令只显示准确的服务名、账户名及是否找到，不打印密钥。

环境变量或本地 `.env` 已有凭据时，导入标准安全凭据库：

```bash
cd scripts
npm run import-credentials
```

禁止擅自搜索旧聊天中的 AppSecret，优先使用标准安全设置或导入流程。

高级用户可以把 `.env.example` 复制为 Skill 根目录或当前项目根目录的 `.env`：

```bash
WECHAT_APP_ID=
WECHAT_APP_SECRET=
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
```

禁止分发 `.env`，也禁止向用户回显 AppSecret。用户把密钥粘贴到聊天中时，建议测试后轮换。

## 交付模式

### 正式可复制版

这是普通排版或复制任务默认先交付的用户成品。只有内部本地预览已在 `375-390px` 宽度完成人工视觉审查后才执行。它会上传或复用正文图，验证全部正文图都使用有效微信主机，写出正文片段和预览外壳；绝不上传封面，也绝不调用 `draft/add`。

先保存同一移动宽度的首屏截图和整页截图，再生成与当前正文哈希绑定的视觉 QA 回执。截图与回执放在同一目录：

```bash
cd scripts
npm run record-visual-qa -- \
  --article <article.html> \
  --image-plan <image-plan.json> \
  --viewport-screenshot <output/qa-mobile.png> \
  --full-page-screenshot <output/qa-full-page.png> \
  --width 390 --out <output/visual-qa.json> \
  --confirm-reviewed --confirm-hero-title --confirm-hero-integration \
  --confirm-hero-clean --confirm-no-overflow --confirm-no-broken-images \
  --confirm-visual-text-readable --confirm-density-balanced --confirm-visual-system \
  --confirm-no-unexplained-gaps --confirm-no-raw-separators \
  --confirm-first-section-anchor --confirm-no-heavy-visual-runs \
  --confirm-no-tall-screenshot-runs --confirm-no-semantic-duplicates \
  --confirm-stable-full-page-capture
```

回执同时绑定正文哈希与最终图片计划哈希。录制前先运行：

```bash
npm run verify-layout -- --article <article.html> --image-plan <image-plan.json>
```

浏览器原生 `fullPage` 截图如果出现章节重复平铺，不能勾选稳定截图确认。改用固定移动宽度的分段滚动截图，按滚动顺序拼接并人工检查接缝；回执会再次检测近似重复的纵向图块。

`publish.ts` 默认进入正式准备模式。保留 `--prepare-only` 作为可读性更强的显式写法；即使漏写它，也不会创建草稿。

```bash
cd scripts
npx tsx publish.ts <article.html> --prepare-only \
  --image-plan <image-plan.json> --source-article <source-article.md> --visual-qa <output/visual-qa.json> \
  --upload-manifest <output/upload-manifest.json> \
  --write-uploaded-fragment <output/article-fragment-wechat.html> \
  --write-copy-ready <output/preview-wechat-copy.html>
```

`--prepare-only` 至少要求一个输出参数；普通交付同时使用两个。只有需要上传本地正文图时才使用微信凭据。成功含义是：`正文图片已准备，可复制；未创建草稿`。

正式可复制预览中的正文图已经是微信托管地址时，本地浏览器可能因防盗链显示占位图。预览必须显示这一限制说明；验收以正文 HTML 仍引用正确微信 URL，以及粘贴进微信公众号编辑器后的实际显示为准，不能把本地占位图误判为素材丢失。

### 用已准备正文创建草稿

用户确认后，重新打开正式可复制预览，保存首屏与整页截图，并为准备好的正文片段生成一份匹配其微信图片 URL 的新视觉 QA 回执。随后显式传入 `--create-draft`。脚本只提取 `ARTICLE HTML START/END` 之间的内容，验证微信图片真实字节与最终计划一致，上传封面，再把完全相同的正文发送到 `draft/add`。

```bash
cd scripts
npx tsx publish.ts <output/article-fragment-wechat.html> --create-draft \
  --image-plan <image-plan.json> --source-article <source-article.md> \
  --visual-qa <output/visual-qa-wechat.json> \
  --title "标题" --author "作者" --cover <cover-900x383.png>
```

复制按钮、预览状态、回到顶部按钮和脚本只存在于预览外壳，绝不能进入草稿正文。

### 直接创建草稿

用户明确要求直接进入草稿箱时，对本地验证通过的文章母版显式使用 `--create-draft`：

```bash
cd scripts
npx tsx publish.ts <article.html> --create-draft --image-plan <image-plan.json> --source-article <source-article.md> \
  --visual-qa <output/visual-qa.json> \
  --title "标题" --author "作者" --cover <cover-900x383.png> \
  --upload-manifest <output/upload-manifest.json>
```

可选参数：

```bash
--digest "摘要"
--source-url "https://..."
--no-comment
--asset-dir "../shared-materials"
--upload-manifest "../output/upload-manifest.json"
--allow-evidence-failure
--write-uploaded-fragment "../output/article-fragment-wechat.html"
--write-copy-ready "../output/preview-wechat-copy.html"
```

对生成的文章预览文件，`publish.ts` 只提取以下标记之间的内容：

```html
<!-- ARTICLE HTML START -->
...
<!-- ARTICLE HTML END -->
```

只有 `--create-draft` 会进入草稿模式。该模式只上传没有有效 manifest 记录或有效微信 URL 的正文图片，然后通过 `material/add_material` 上传封面，再调用 `draft/add`。

在 token、上传或草稿 API 调用前，`publish.ts` 会验证文章安全、统一布局、最终图片计划、视觉 QA 回执、素材边界和 `900 x 383` 封面裁切。每个视觉必须用 `data-wlp-visual-id` 与计划按顺序绑定；所有位图都以真实字节核对内容哈希，包括微信托管 URL。受保护远程下载器会检查公网路由、重定向、超时、大小、MIME 与文件签名。`--allow-evidence-failure` 只适用于最终计划中所有证据尝试都结构化记录真实访问失败的情况。

若微信托管图因 DNS、保留地址解析、防盗链或临时网络条件无法由受保护下载器回拉，禁止关闭 SSRF、放宽私网规则或盲信原 URL。只有同时满足以下条件才可回退：最终计划中存在同一 `data-wlp-visual-id` 的本地母版；母版位于文章目录或显式 `--asset-dir`；文件为真实 PNG/JPEG；字节哈希与最终计划一致。正式准备可以用它完成内容绑定；创建草稿时重新上传该母版并替换正文 URL。

`publish.ts` 的正式可复制版与草稿箱入口只接受已经完成组件排版和视觉审查的 HTML；Markdown 自动渲染只用于内部工作预览，不得绕过组件层直接进入正式交付。`--image-plan`、`--visual-qa` 与 `--source-article` 均为必填，语义分类器始终读取原始文章而非排版输出。本地图片只能位于文章目录，或显式 `--asset-dir` 指定的目录，防止文章 HTML 上传无关文件。

封面应在正式发布命令前生成、裁为准确的 `900 x 383`，并完成标题准确、文字融合、无额外文字、缩略图可读和整体风格一致的人工检查。检查通过后才把该确定文件传给 `--cover`。`publish.ts --gen-cover` 会直接拒绝，防止新图片绕过视觉审查。

## 上传复用清单

默认 manifest 位于输入文章旁的 `wechat-upload-manifest.json`；用 `--upload-manifest` 可放到输出目录。它只保存 `schema_version`，以及包含 `source`、`sha256`、`wechat_url`、`uploaded_at` 的条目。

- 文件哈希未变，且微信 PNG/JPEG URL 仍可取回：复用。
- 哈希变化或 URL 失效：只重新上传该图。
- 文字与排版修改不触发正文图上传。
- 已有有效 `mmbiz.qpic.cn` 或 `mmbiz.qlogo.cn` 正文图保持不变。
- 原子写入。token、AppID、AppSecret 和 API key 都不能进入 manifest。

生成的正式可复制文件正文只使用微信图片 URL。运行：

```bash
npm run verify-copy-ready -- ../output/preview-wechat-copy.html
```

禁止把使用 `images/foo.jpg` 的本地预览称为“可直接复制到微信”；默认本地预览故意不显示复制按钮。普通远程 URL 和 data URI 默认不会通过正式可复制验证。只有真实粘贴测试证明该路线在编辑器中有效时，才可使用 `--allow-remote` 或 `--allow-data-uri`。

## 错误处理

- `Missing WECHAT_APP_ID / WECHAT_APP_SECRET`：运行 `npm run diagnose-credentials`，再执行 `npm run setup` 或 `npm run import-credentials`。
- `--image-plan is required`：完成并验证 `image-plan.json`，然后显式传入。
- `outside the article or allowed asset directories`：把文件放到文章旁，或用 `--asset-dir` 添加范围最小的素材目录。
- `errcode=40164`：把当前公网 IP 加入公众号 IP 白名单。
- `errcode=48001`：账号未认证或缺少所需 API 权限。
- `Body image too large`：把正文图压到 1 MB 内后重试。
- `WeChat-hosted image could not be safely fetched`：保持远程安全限制，确认最终计划中的本地母版、许可目录和哈希；不要通过关闭 SSRF 解决。
- `full_page_screenshot appears to contain repeated vertical tiles`：重新执行分段滚动截图并稳定拼接，人工检查后重录视觉回执。
- `A cover image is required for draft mode`：传入已经审查通过的 `--cover`；`--prepare-only` 不需要封面。

草稿创建成功不等于公开发布。用户仍需打开 `mp.weixin.qq.com`，预览草稿并手动发布。

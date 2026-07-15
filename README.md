# wechat-layout-publisher（公众号排版发布）

这是可公开分发的 `wechat-layout-publisher` 智能体 Skill。

它可以接收会话中的杂乱资料、初稿文案、发布定稿，也可续接任意上游 Skill 已经产出的公众号内容。续接条件是目的地已经确认是微信公众号，并且流程已经进入定稿、配图、排版、可复制版或草稿箱制作阶段；其他平台、平台待定或用户只要求写正文时不会触发。它先一次确认内容处理模式和交付方式，再完成公众号定稿、四种语义配图路线、`2.35:1` 头条封面、微信安全排版和经过验证的可复制预览。只有用户明确授权时，才会将成品写入微信公众号草稿箱。

## 核心能力

- 深度识别内容类型，为新闻和事件类文章设置强制证据截图门禁。
- 使用版本化三模式合同区分杂乱资料、初稿文案和发布定稿；初稿文案拥有独立的诊断、修订、定稿流程。
- 四种配图路线：用户素材、资讯证据截图、编辑型生成图片、代码结构图。
- 统一统计图片、长截图、表格、引用、大卡片和步骤块，自动拦截异常留白、首节配图过晚、连续重视觉、连续长截图与语义重复。
- 不绑定特定智能体：有生图能力时调用原生生图工具，没有时提供明确标记的代码降级图和可复用提示词。
- 严格区分本地预览与经过验证的公众号可复制预览。
- 提供远程图片安全下载、本地素材目录隔离、图片真实性检查和微信请求前置验证。
- 支持使用 macOS 钥匙串和 Windows 凭据管理器安全保存配置。
- 通过 GitHub Actions 在 macOS、Windows 和 Linux 上进行跨平台验证。

## 安装

环境要求：Node.js `18.17+`、npm，以及支持本地 Skill 的智能体。

普通用户和自动安装 Agent 建议使用始终指向最新正式版本的入口：

- [查看最新正式版本](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest)
- [直接下载最新纯净 Skill 包](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest/download/wechat-layout-publisher.zip)

下载并解压后，将其中的 `wechat-layout-publisher/` 文件夹放到 `~/.codex/skills/`，再进入其 `scripts` 目录执行 `npm ci --omit=dev`。

需要源码仓库时，可以使用下面的安装方式。无版本号的克隆命令会跟随 `main` 的最新源码。

macOS 或 Linux：

```bash
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git wechat-layout-publisher-repo
mkdir -p ~/.codex/skills
cp -R wechat-layout-publisher-repo/wechat-layout-publisher ~/.codex/skills/
cd ~/.codex/skills/wechat-layout-publisher/scripts
npm ci --omit=dev
```

Windows PowerShell：

```powershell
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git wechat-layout-publisher-repo
New-Item -ItemType Directory -Force "$HOME\.codex\skills" | Out-Null
Copy-Item -Recurse -Force "wechat-layout-publisher-repo\wechat-layout-publisher" "$HOME\.codex\skills\wechat-layout-publisher"
Set-Location "$HOME\.codex\skills\wechat-layout-publisher\scripts"
npm ci --omit=dev
```

如果需要写入公众号草稿箱，请在安装后的 `scripts` 目录运行 `npm run setup`。配置向导会说明如何获取微信公众号 AppID 和 AppSecret，并将它们保存到系统凭据管理器。不要提交本地 `.env` 文件。

## 使用

让你的智能体调用 `wechat-layout-publisher`，然后提供杂乱资料、初稿、发布定稿或文件路径，也可同时提供图片和视频。Skill 会先一次确认内容处理模式与交付方式，再生成并验证 `image-plan.json`。选择可复制版时，用户可以循环修改，确认满意后再决定是否加入草稿箱；选择直接草稿箱时，所有内部检查仍会完整执行。

多个上游 Skill 不需要分别复制公众号制作步骤。只需在目标渠道确定为微信公众号且任务进入制作交付阶段时，按 `references/upstream-handoff.md` 传递来源 Skill、产物路径、内容成熟度和用户已经确认的选项。用户无需补充调用口令。写作、访谈整理、研究、资料汇总等 Skill 都可以使用同一份协议。

## 文件边界

- `wechat-layout-publisher/` 是可直接分发的纯净 Skill 包，也是项目源码真相源。
- `~/.codex/skills/wechat-layout-publisher/` 是本机全局安装副本，可以包含 `node_modules`。
- 生成的文章、截图、封面、`.env` 和凭据都不属于 Skill 安装包。
- 微信公众号凭据应保存在 macOS 钥匙串或 Windows 凭据管理器中，标准服务名为 `wechat-layout-publisher`。

不要把全局安装副本反向同步到源码包。正确流程是：先修改源码、完成验证，再将同一版本安装到全局目录。

## 验证

普通运行环境只安装生产依赖：

```bash
cd wechat-layout-publisher/scripts
npm ci --omit=dev
```

仓库开发和版本发布需要安装完整依赖并执行全部检查：

```bash
cd wechat-layout-publisher/scripts
npm ci
npm run validate-skill
npm run typecheck
npm test
npm run quick-validate
```

单篇文章在正式交付前还会运行 `npm run verify-layout`，并生成同时绑定正文与图片计划的移动端视觉 QA 回执。

如果本机安装了 Codex 系统验证器，还应执行：

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ../
```

GitHub Actions 会在 macOS、Windows 和 Linux 上重复执行完整验证栈。

## 开源许可证

版权所有 © 2026 AidenXu-1。本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。设计研究来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

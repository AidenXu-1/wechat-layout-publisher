# wechat-layout-publisher（公众号排版发布）

这是可公开分发的 `wechat-layout-publisher` 智能体 Skill。

它可以将文章生成适合微信公众号的精美图文排版，通过四种语义配图路线规划并放置图片，生成 `2.35:1` 公众号头条封面，提供经过验证的可复制预览，并在用户明确要求时将成品写入微信公众号草稿箱。

## 核心能力

- 深度识别内容类型，为新闻和事件类文章设置强制证据截图门禁。
- 四种配图路线：用户素材、资讯证据截图、编辑型生成图片、代码结构图。
- 不绑定特定智能体：有生图能力时调用原生生图工具，没有时提供明确标记的代码降级图和可复用提示词。
- 严格区分本地预览与经过验证的公众号可复制预览。
- 提供远程图片安全下载、本地素材目录隔离、图片真实性检查和微信请求前置验证。
- 支持使用 macOS 钥匙串和 Windows 凭据管理器安全保存配置。
- 通过 GitHub Actions 在 macOS、Windows 和 Linux 上进行跨平台验证。

## 安装

环境要求：Node.js `18.17+`、npm，以及支持本地 Skill 的智能体。

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

让你的智能体调用 `wechat-layout-publisher`，然后提供文章正文或文章路径，也可以同时提供图片和视频素材。Skill 会先生成并验证 `image-plan.json`，再输出本地预览。只有用户明确要求时，才会执行公众号草稿箱写入。

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

如果本机安装了 Codex 系统验证器，还应执行：

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ../
```

GitHub Actions 会在 macOS、Windows 和 Linux 上重复执行完整验证栈。

## 开源许可证

版权所有 © 2026 AidenXu-1。本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。设计研究来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

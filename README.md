<div align="center">

# wechat-layout-publisher

**公众号排版发布 Skill**

从杂乱资料、初稿或发布定稿，到语义配图、微信安全排版、可复制版与公众号草稿箱。

[![最新版本](https://img.shields.io/github/v/release/AidenXu-1/wechat-layout-publisher?style=flat-square&label=release)](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest)
[![跨平台验证](https://img.shields.io/github/actions/workflow/status/AidenXu-1/wechat-layout-publisher/validate.yml?branch=main&style=flat-square&label=build)](https://github.com/AidenXu-1/wechat-layout-publisher/actions/workflows/validate.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18.17%2B-43853D?style=flat-square)](https://nodejs.org/)
[![许可证](https://img.shields.io/github/license/AidenXu-1/wechat-layout-publisher?style=flat-square)](LICENSE)

[下载最新纯净包](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest/download/wechat-layout-publisher.zip) · [查看最新版](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest) · [更新记录](CHANGELOG.md)

</div>

## 它能处理什么

| 内容状态 | Skill 的处理方式 |
|---|---|
| 杂乱资料 | 梳理资料并产出公众号定稿，再配图排版 |
| 初稿文案 | 检查并优化内容细节，完成定稿后再配图排版 |
| 发布定稿 | 保持文案内容不变，只做配图、排版和格式规范 |

交付可以先生成方便查看和修改的正式可复制版，也可以在用户明确授权后直接加入公众号草稿箱。草稿创建成功仍需要用户进入微信公众号后台预览并手动发布。

## 工作流程

```text
确认内容模式与交付方式
        ↓
定稿或保护原文 → 语义配图 → 微信安全排版 → 移动端质量检查
        ↓
正式可复制版  /  经授权写入公众号草稿箱
```

## 核心能力

- **三种内容模式**：杂乱资料、初稿文案、发布定稿各有明确处理边界。
- **四路语义配图**：用户素材、证据截图、编辑型生成图片、代码结构图。
- **公众号视觉系统**：生成 `2.35:1` 头条封面，统一正文组件、色彩、间距和图注。
- **实战质量闸门**：拦截异常留白、配图过晚、连续长截图、重视觉堆叠和语义重复。
- **双交付路线**：支持正式可复制版，以及经用户授权的公众号草稿箱交付。
- **安全发布**：提供素材目录隔离、远程图片防护、图片真实性检查和系统凭据管理。

## 快速安装

环境要求：Node.js `18.17+`、npm，以及支持本地 Skill 的智能体。

推荐普通用户使用始终指向最新正式版本的纯净包：

1. [下载最新纯净 Skill 包](https://github.com/AidenXu-1/wechat-layout-publisher/releases/latest/download/wechat-layout-publisher.zip)。
2. 解压后，把 `wechat-layout-publisher/` 文件夹放入 `~/.codex/skills/`。
3. 安装运行依赖：

```bash
cd ~/.codex/skills/wechat-layout-publisher/scripts
npm ci --omit=dev
```

需要源码仓库时，可以直接克隆 `main`：

```bash
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git
cd wechat-layout-publisher/wechat-layout-publisher/scripts
npm ci --omit=dev
```

Windows PowerShell：

```powershell
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git
New-Item -ItemType Directory -Force "$HOME\.codex\skills" | Out-Null
Copy-Item -Recurse -Force ".\wechat-layout-publisher\wechat-layout-publisher" "$HOME\.codex\skills\wechat-layout-publisher"
Set-Location "$HOME\.codex\skills\wechat-layout-publisher\scripts"
npm ci --omit=dev
```

## 使用方式

向智能体提供杂乱资料、初稿、发布定稿或文件路径，也可以同时提供图片和视频。Skill 会一次确认内容处理模式与交付方式，然后生成并验证 `image-plan.json`，完成定稿、配图、排版和交付。

- 选择可复制版时，可以持续提出修改；确认满意后再决定是否加入草稿箱。
- 选择直接草稿箱时，内部质量检查仍会完整执行。
- 只有用户明确授权时，才会创建微信公众号草稿。

### 上游 Skill 无缝续接

写作、访谈整理、研究或资料汇总 Skill 无需复制公众号制作规则。目标渠道确认是微信公众号，且任务进入定稿、配图、排版或交付阶段时，按[上游 Skill 续接协议](wechat-layout-publisher/references/upstream-handoff.md)传递产物路径、内容成熟度和已经确认的用户选择即可。

## 公众号凭据

需要写入公众号草稿箱时，在安装后的 `scripts` 目录运行：

```bash
npm run setup
```

配置向导会说明如何获取微信公众号 AppID 和 AppSecret，并将它们保存到 macOS Keychain 或 Windows Credential Manager。真实凭据不会进入 Skill 包；不要提交本地 `.env` 文件。

## 安全与文件边界

- `wechat-layout-publisher/` 是可直接分发的纯净 Skill 包，也是项目源码真相源。
- `~/.codex/skills/wechat-layout-publisher/` 是本机安装副本，可以包含 `node_modules`。
- 生成文章、截图、封面、测试过程素材、`.env` 和凭据不属于发行包。
- 本地预览与正式可复制版有明确状态区分，本地图片不会被误称为可直接复制到微信。
- 创建草稿必须有明确授权；草稿箱交付不会自动公开发布文章。

## 开发与验证

仓库开发和版本发布使用完整依赖：

```bash
cd wechat-layout-publisher/scripts
npm ci
npm run validate-skill
npm run typecheck
npm test
npm run quick-validate
```

本机安装了 Codex 系统验证器时，再运行：

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ../
```

单篇文章正式交付前还会运行统一布局检查，并生成同时绑定正文与图片计划的移动端视觉 QA 回执：

```bash
npm run verify-layout -- --article <article.html> --image-plan <image-plan.json>
```

GitHub Actions 会在 Ubuntu、macOS 和 Windows 上重复执行完整验证栈。

## 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 发布。第三方设计研究与许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

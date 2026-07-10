# wechat-layout-publisher

Public repository for the distributable `wechat-layout-publisher` Agent Skill.

It turns an article into polished WeChat Official Account HTML, plans and places visuals through four semantic routes, creates a `2.35:1` headline cover, produces verified copy-ready previews, and can add the finished article to the WeChat draft box when explicitly requested.

## Highlights

- Deep content classification with a hard evidence-screenshot gate for news and event coverage.
- Four visual routes: user assets, evidence screenshots, generated editorial images, and coded structural visuals.
- Agent-agnostic image generation with a disclosed coded fallback when the current Agent cannot generate images.
- Separate local-only and verified WeChat copy-ready previews.
- Guarded remote-image fetching, local asset boundaries, image validation, and preflight before WeChat requests.
- Secure credential setup for macOS Keychain and Windows Credential Manager.
- Cross-platform validation on macOS, Windows, and Linux through GitHub Actions.

## Install

Requirements: Node.js `18.17+`, npm, and an Agent that supports local Skills.

macOS or Linux:

```bash
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git wechat-layout-publisher-repo
mkdir -p ~/.codex/skills
cp -R wechat-layout-publisher-repo/wechat-layout-publisher ~/.codex/skills/
cd ~/.codex/skills/wechat-layout-publisher/scripts
npm ci --omit=dev
```

Windows PowerShell:

```powershell
git clone https://github.com/AidenXu-1/wechat-layout-publisher.git wechat-layout-publisher-repo
New-Item -ItemType Directory -Force "$HOME\.codex\skills" | Out-Null
Copy-Item -Recurse -Force "wechat-layout-publisher-repo\wechat-layout-publisher" "$HOME\.codex\skills\wechat-layout-publisher"
Set-Location "$HOME\.codex\skills\wechat-layout-publisher\scripts"
npm ci --omit=dev
```

For draft-box publishing, run `npm run setup` in the installed `scripts` directory. The setup wizard explains how to obtain the WeChat AppID/AppSecret and stores them in the system credential manager. Do not commit a local `.env`.

## Use

Ask your Agent to use `wechat-layout-publisher` and provide an article or article path plus any images or videos. The Skill first builds and validates `image-plan.json`, then produces a local preview. Draft-box publishing happens only when explicitly requested.

## Source Of Truth

- `wechat-layout-publisher/` is the clean distributable Skill package.
- `~/.codex/skills/wechat-layout-publisher/` is an installed runtime copy and may contain `node_modules`.
- Generated articles, screenshots, covers, `.env`, and credentials do not belong in the Skill package.
- WeChat credentials belong in macOS Keychain or Windows Credential Manager under the service name `wechat-layout-publisher`.

Never sync changes from the installed runtime back into the source package. Update the source first, validate it, then install that exact version globally.

## Validation

Normal runtime installation uses only production dependencies:

```bash
cd wechat-layout-publisher/scripts
npm ci --omit=dev
```

Repository development and release validation use the complete dependency set:

```bash
cd wechat-layout-publisher/scripts
npm ci
npm run validate-skill
npm run typecheck
npm test
npm run quick-validate
```

Also run the Codex system validator when available:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py ../
```

Before a GitHub release, repeat the complete validation stack from a fresh clone on macOS and Windows, then compare the installed Skill source files with the tagged source package.

## License

Copyright (c) 2026 AidenXu-1. Released under the [GNU Affero General Public License v3.0](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for design-research provenance.

# Draft Box Publishing

Use this only when the user explicitly asks to send the finished article to the WeChat Official Account draft box.

## Contents

- Requirements and first-time setup
- Credential lookup and secure import
- Publishing commands and copy-ready outputs
- Error handling

## Requirements

- The account must be an authenticated WeChat Official Account with `draft/add` permission.
- `WECHAT_APP_ID` and `WECHAT_APP_SECRET` must be available from environment variables, a local `.env`, or the system credential store.
- The caller's public IP must be in the official account IP whitelist.
- A cover image is required: pass `--cover <path>` or use `--gen-cover` with `OPENAI_API_KEY`.
- Use the `2.35:1` headline cover as `--cover` for normal publishing. Recommended size: `900 x 383`; high-resolution equivalent: `2350 x 1000`. The current `draft/add` script sends one cover media id; optional `1:1` cover files are extra assets, not a second API cover field.
- Official API references:
  - Access token: `https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html`
  - Add draft: `https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html`

## First-Time Setup for Distributed Users

Never put a real AppSecret in the Skill package. Give users the Skill folder with `.env.example` only.

## Credential Lookup Policy

The Skill deliberately does not search the whole computer for secrets. That would be slow, surprising, and unsafe.

When publishing, check only these sources:

1. Current environment variables.
2. Local `.env` in the current project or Skill root.
3. Standard system credential store:
   - macOS Keychain: `service=wechat-layout-publisher`, `account=WECHAT_APP_ID` / `WECHAT_APP_SECRET`.
   - Windows Credential Manager: `target=wechat-layout-publisher:WECHAT_APP_ID` / `wechat-layout-publisher:WECHAT_APP_SECRET`.

If not found, ask the user once:

```text
我没在标准位置找到公众号凭据。你想怎么配置？
1. 跑 npm run setup，把 AppID/AppSecret 存进系统安全凭据。
2. 你已经有 .env 或环境变量，我帮你 npm run import-credentials 导入标准位置。
3. 你临时提供一次 AppID/AppSecret，我只导入系统安全凭据，不写进 Skill 包。
```

Do not search old conversations, screenshots, random notes, shell history, or unrelated Keychain entries unless the user explicitly asks for that forensic search.

From the Skill root:

```bash
cd scripts
npm ci --omit=dev
npm run setup
```

The setup script:

- macOS: saves credentials in macOS Keychain.
- Windows: saves credentials in Windows Credential Manager.
- Shows the current public IP so the user can add it to the WeChat Official Account IP whitelist.
- Checks whether WeChat can issue an access token after credentials are saved.
- Uses the standard credential identity:
  - macOS Keychain: `service=wechat-layout-publisher`, `account=WECHAT_APP_ID` / `WECHAT_APP_SECRET`.
  - Windows Credential Manager: `target=wechat-layout-publisher:WECHAT_APP_ID` / `wechat-layout-publisher:WECHAT_APP_SECRET`.

Where users find credentials in the WeChat Official Account backend:

1. Open `https://mp.weixin.qq.com` and log in to the target Official Account.
2. Go to Settings and Development / Basic Configuration.
3. Copy the account's AppID.
4. Generate or copy AppSecret. Treat it as a password.
5. Add this computer's current public IP to the IP whitelist.
6. Run `npm run check-credentials` after changing the whitelist.

If credentials are missing or the user says they configured them elsewhere:

```bash
cd scripts
npm run diagnose-credentials
```

This prints the exact service/account lookup and whether each value is found, without printing secrets.

If the user has credentials in environment variables or a local `.env`, import them into the standard secure store:

```bash
cd scripts
npm run import-credentials
```

Do not search old chat logs for AppSecret unless the user explicitly asks. Prefer standard secure setup/import.

Advanced users can copy `.env.example` to `.env` in the skill root or current project root:

```bash
WECHAT_APP_ID=
WECHAT_APP_SECRET=
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
```

Do not distribute `.env`. Do not print AppSecret back to the user. If a secret is pasted into chat, recommend rotating it after testing.

## Command

From the skill root:

```bash
cd scripts
npm ci --omit=dev
npx tsx publish.ts <article.html> --image-plan <image-plan.json> --source-article <source-article.md> \
  --title "标题" --author "作者" --cover <cover-image>
```

Optional flags:

```bash
--digest "摘要"
--source-url "https://..."
--no-comment
--gen-cover
--model gpt-image-2
--cover-prompt "用户把高权限交给 AI 后出现信任裂缝"
--asset-dir "../shared-materials"
--allow-evidence-failure
--write-uploaded-fragment "../output/article-fragment-wechat.html"
--write-copy-ready "../output/preview-wechat-copy.html"
```

For generated article preview files, `publish.ts` extracts content between:

```html
<!-- ARTICLE HTML START -->
...
<!-- ARTICLE HTML END -->
```

It uploads body images to WeChat with `media/uploadimg`, uploads the cover with `material/add_material`, then calls `draft/add`.

Before any WeChat request, `publish.ts` validates article safety, the final image plan, every body image, the allowed local-asset boundary, and the `900 x 383` cover crop. Remote body images also pass public-network, redirect, timeout, size, MIME, and file-signature checks. `--allow-evidence-failure` is only for a final plan whose attempted evidence sources all record real access failures.

`--image-plan` is mandatory. For HTML input, `--source-article` is also mandatory so the semantic classifier inspects the original article rather than a rewritten output. Markdown input may use itself. Local image paths may only resolve inside the article directory or a directory explicitly supplied with `--asset-dir`; this prevents article HTML from uploading unrelated files.

`--gen-cover` generates a landscape source image and center-crops it to an exact `900 x 383` JPEG. Use `--cover-prompt` to provide the semantic metaphor or visual direction; title-only generation is a fallback.

If the user also wants a preview they can copy into the WeChat editor with images preserved, add:

```bash
npx tsx publish.ts <article.html> --image-plan <image-plan.json> --source-article <source.md> \
  --title "标题" --cover <cover.png> \
  --write-uploaded-fragment "../output/article-fragment-wechat.html" \
  --write-copy-ready "../output/preview-wechat-copy.html"
```

The generated WeChat copy-ready files use the uploaded WeChat image URLs in the article body. Run:

```bash
npm run verify-copy-ready -- ../output/preview-wechat-copy.html
```

Do not present a local preview with `images/foo.jpg` as "copy-ready for WeChat"; the default local preview intentionally has no copy button. Ordinary remote image URLs and data URIs are not accepted by the default copy-ready verifier. Use `--allow-remote` or `--allow-data-uri` only after a manual paste test proves that exact route survives in the editor.

## Error Handling

- `Missing WECHAT_APP_ID / WECHAT_APP_SECRET`: run `npm run diagnose-credentials`, then `npm run setup` or `npm run import-credentials`.
- `--image-plan is required`: finish and validate `image-plan.json`, then pass it explicitly.
- `outside the article or allowed asset directories`: place the file beside the article or add its narrow material folder with `--asset-dir`.
- `errcode=40164`: add the current public IP to the official account IP whitelist.
- `errcode=48001`: the account is not authenticated or lacks the required API permission.
- `Body image too large`: compress the body image under 1 MB and retry.
- `A cover image is required`: pass `--cover` or use `--gen-cover`.

Successful draft creation is not public publishing. The user must still open `mp.weixin.qq.com`, preview the draft, and publish manually.

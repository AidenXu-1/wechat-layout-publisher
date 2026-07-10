---
name: wechat-layout-publisher
description: 公众号排版发布：将用户提供的文章排成参考图风格的微信公众号可复制 HTML，按语义自动规划、生成、联网寻找或引用用户图片插入配图，生成 2.35:1 公众号头条封面图，并在用户明确要求时通过公众号 API 写入草稿箱。Use when the user asks for 公众号排版发布, 微信公众号排版, 公众号文章美化, 图文排版, 配图, 公众号封面图, WeChat cover, copy-ready WeChat HTML, 公众号草稿箱, 发布到公众号, or wants an article styled like the provided 兆基日报 reference image.
---

# 公众号排版发布

把用户提供的文章做成“可直接复制到公众号正文编辑器”的图文排版稿，并生成 `2.35:1` 公众号头条封面图；用户明确要求时，可继续通过公众号 API 写入草稿箱。

## Output Contract

Produce a local preview HTML file with:

- A full browser preview shell. Local-only previews show a clear local status; only verified WeChat copy-ready previews expose the one-click copy button.
- Article body wrapped between `ARTICLE HTML START` and `ARTICLE HTML END`.
- WeChat-safe inline HTML inside the article body: no CSS classes, no external styles, no JavaScript.
- Semantic images placed where they help the reader understand the article, not dumped at the top or end.
- An `image-plan.json` that records content classification, user-supplied assets, the four material routes, exact placements, and source/provenance decisions.
- A `2.35:1` WeChat headline cover plan or cover file when producing a complete article package.
- Image source notes for generated, web-sourced, and user-supplied images.

Default to preview first, but do not call a preview "copy-ready for WeChat" if its images still use local relative paths. If the user needs to paste into the WeChat editor with images preserved, prefer WeChat-hosted image URLs. Remote URLs or valid data URIs require a documented real paste test and an explicit verifier override. If the user asks to publish into the WeChat Official Account draft box, use `scripts/publish.ts` only with the final `image-plan.json` and cover ready.

At the start, inspect whether the current Agent has an image-generation tool. If it does, use that tool for every visual assigned `generated_image`; in Codex, use Image Gen. If it does not, disclose the limitation, make a clearly labeled coded fallback so layout work can continue, preserve the desired image prompt, and ask the user whether to accept the fallback or return an externally generated image for replacement.

## Required Reads

Before writing the article HTML, read:

1. `references/content-planning.md` for the reading path, section roles, and image-count discipline.
2. `references/editorial-writing.md` for content type, opening hook, human voice, paragraph density, and news evidence gates.
3. `references/style-guide.md` for the 兆基日报 visual style.
4. `references/components.md` for reusable inline HTML components.
5. `references/cover-system.md` when generating the `2.35:1` headline cover or optional `1:1` square cover.
6. `references/image-placement.md` for image planning and source selection.
7. `references/visual-quality.md` for hero-image, screenshot, generated-image, crop, and final image QA gates.
8. `references/wechat-html-spec.md` for WeChat editor constraints.
9. `references/qa-checklist.md` before final delivery or draft publishing.

If converting web or local images to embeddable data URIs, use `scripts/img2base64.ts`.

If publishing to the draft box, read `references/publishing.md`.

## Workflow

1. **Collect inputs**
   - Identify the source article, title, subtitle, author or column name, and any user-provided images.
   - Inventory every supplied image and video before searching or generating anything. For video, plan representative still frames with timestamps when the footage is semantically relevant.
   - Inspect available tools and record `image_generation_capability` as `available` or `unavailable`. When available, record `image_generation_tool`; do not assume every Agent is Codex or has image generation.
   - If the user gave only raw article text, infer a concise title and subtitle, but do not invent facts.
   - If the article depends on current facts, browse or verify primary sources before writing.

2. **Restructure the article**
   - Keep the user's core wording and argument order unless they ask for rewriting.
   - Follow `references/content-planning.md`: identify the core claim, reader promise, section map, and visual map before writing HTML.
   - Follow `references/editorial-writing.md`: classify the content type before writing and record the classification confidence and signals.
   - Treat the article as `news_event` or `mixed_news_commentary` when it reports a recent event, announcement, controversy, policy/product change, official response, public post, media report, or time-sensitive claim. When uncertain between news and opinion, use the mixed-news route and keep the evidence requirement.
   - For public controversies, product changes, official responses, media reports, Reddit/X/community threads, papers, or documentation-based articles, plan and capture at least one evidence screenshot near the supported claim. Record every source URL; only documented access failures may use the explicit downgrade path.
   - Build the opening as a human hook: real experience, reader pain, or concrete discomfort first; professional explanation second.
   - Split into a title, subtitle, hero visual, lead paragraph, 3-5 reading units, image blocks, and a closing block.
   - Keep one main idea per reading unit. If the draft has many small points, group them into cards or an infographic instead of making every point a full section.
   - Prefer clear section titles over decorative labels.

3. **Plan images before building**
   - First perform deep semantic recognition: decide whether each visual need is evidence, structure, data, process, framework, metaphor, mood, or user-provided material.
   - Create `image-plan.json` using the schema and example in `references/image-placement.md`. Do this before browsing, generating, or drawing visuals.
   - Validate the planned routes:
     ```bash
     cd scripts && npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
     ```
   - For every major image, apply `references/visual-quality.md`: the image must have a visual role, pass the relevant quality gate, and sit near the paragraph it helps.
   - Route every visual through exactly one of four source types, in this decision order:
     1. `user_asset`: use relevant user images first; extract a representative timestamped frame from relevant user video.
     2. `evidence_screenshot`: for news, public claims, quotes, announcements, social posts, official pages, papers, or product states, capture the original source or the strongest available authority.
     3. `generated_image`: use for the editorial hero, abstract mapping, metaphor, mood, or a scene that needs bitmap quality. When the Agent has image generation, every visual assigned this route must use its actual image tool; in Codex, use Image Gen for all of them, not only the first image.
     4. `coded_visual`: use only for process, relationship, timeline, framework, comparison, data, or mechanism explanation. Do not use code to fake evidence, make decorative filler, or replace a needed generated metaphor.
   - For news/event tracking, evidence screenshots are the trust layer and coded visuals are only the explanation layer. A code-made card, timeline, quote graphic, or fake post is not evidence.
   - If image generation is unavailable, tell the user before claiming generated-image quality. Build a coded visual fallback, keep the intended generation prompt in `desired_generation_prompt`, and mark `fallback_for: generated_image` plus `user_decision: pending`.
   - Continue the preview with that fallback so the whole workflow does not stop. Before final delivery, the user must choose `accept_current`, or generate elsewhere and return the image; after replacement, record `provider: external_user_supplied` and `user_decision: replace_externally`.
   - Do not use `coded_visual` as the first visual except for this explicit no-generation fallback. Never let the fallback replace evidence screenshots or claim to be a model-generated image.

4. **Plan the WeChat cover**
   - Read `references/cover-system.md`.
   - Default to a `2.35:1` headline cover for complete article packages.
   - Treat `1:1` as optional: make it only when the user asks for a cover pair, needs square sharing/archive reuse, or is preparing multi-article thumbnail surfaces.
   - Do not blindly crop the `2.35:1` cover into `1:1`; derive a short square title when needed.

5. **Build WeChat-safe article HTML**
   - Prefer componentized hand-written HTML using `references/components.md`. Use Markdown rendering only as a low-quality fallback for temporary drafts.
   - Follow `references/style-guide.md`: white editorial page, centered title, gray subtitle, warm paper visual blocks, muted brick accent lines, centered captions, compact section headings.
   - Put all article styles inline.
   - Keep the article width mobile-friendly and avoid fixed elements, scripts, media queries, transforms, or CSS animation inside article content.
   - Add captions under important images and cite sources when known.

6. **Create the copy preview**
   - Save the article body fragment as a working HTML file, or create the body directly in a full preview file.
   - Distinguish local preview from WeChat copy-ready preview:
     - Local preview may use local `images/foo.jpg` paths for development.
     - WeChat copy-ready preview must not use local relative paths or `file://` image paths, because they disappear after pasting into `mp.weixin.qq.com`.
   - When using a fragment, run:
     ```bash
     node scripts/make-preview.mjs <article-fragment.html> <output-preview.html>
     ```
   - Open the preview in a browser. The default output is visibly local-only and has no copy-to-WeChat button.
   - Use `node scripts/make-preview.mjs --copy-ready ...` only for a fragment that already passes `verify-copy-ready`; that verified mode exposes the copy button.

7. **Verify visually**
   - Use `references/qa-checklist.md` as the final delivery checklist.
   - Check that images render, captions are readable, text does not overflow, and the first viewport resembles the reference style.
   - Check density: each section should have one focus; long explanation chains should become cards, callouts, or an infographic.
   - Check semantic fit: every image should use the right source type for its job and sit next to the claim, structure, data, process, or metaphor it clarifies.
   - Check image quality with `references/visual-quality.md`: hero gate, screenshot readability, generated-image artifacts, crop safety, and source/caption completeness.
   - Update `image-plan.json` with final status, asset paths, source URLs, providers, video timestamps, and any capture failures. Then run:
     ```bash
     cd scripts && npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
     ```
   - For news, final validation requires at least one captured evidence screenshot. Use `--allow-evidence-failure` only when every attempted source is documented with a real access failure, and disclose the downgrade.
   - Final validation must not leave a no-generation fallback at `user_decision: pending`. Report whether the user accepted the coded version or supplied an external replacement.
   - Check that the article body contains no `<style>`, `<script>`, `class=`, or `id=` attributes.
   - Run the verifier when possible:
     ```bash
     cd scripts && npm run verify-article -- <output-preview-or-fragment.html>
     ```
   - Run the copy/density checker when possible:
     ```bash
     cd scripts && npm run verify-copy -- <output-preview-or-fragment.html>
     ```
   - If `verify-copy` flags AI-smell phrases or long paragraphs, rewrite using `references/editorial-writing.md`.
   - If the output is meant to be pasted into WeChat with images preserved, run:
     ```bash
     cd scripts && npm run verify-copy-ready -- <preview-or-fragment.html>
     ```
   - If `verify-copy-ready` fails, upload/rewrite image sources before saying the file is ready to copy into WeChat.
   - If using a data URI after a real paste test, validate it with `verify-copy-ready -- --allow-data-uri <file>` and keep the original image under about 1 MB.

8. **Optional draft publishing**
   - Only publish when the user explicitly asks for the article to enter the official account draft box.
   - Follow `references/publishing.md`.
   - Pass the final `image-plan.json` with `--image-plan`. For every HTML publish input, `--source-article <original article>` is mandatory so rewritten output cannot hide news signals; Markdown input may use itself.
   - When publishing uploads body images, use `--write-uploaded-fragment` or `--write-copy-ready` if the user also wants a pasteable WeChat copy preview with images preserved.
   - Treat credentials as a readiness gate before attempting `publish.ts`: run the credential diagnosis/check path first.
   - `publish.ts` must pass article safety, final image-plan, local/remote body-image, asset-boundary, and cover-crop preflight before it calls WeChat. Do not bypass a failed verifier.
   - Remote body images are accepted only through the guarded downloader: public http(s), bounded redirects, timeout and size limits, and real PNG/JPEG validation.
   - Local article images are restricted to the article directory. Add an external material directory explicitly with `--asset-dir <directory>`; never broaden it to a home folder by default.
   - Only look in the standard locations: environment variables, local `.env`, macOS Keychain / Windows Credential Manager under this Skill's standard service/account. Do not search old chat logs, random files, shell history, or arbitrary Keychain names.
   - If credentials are missing, stop and ask the user where they want to configure them: standard secure setup, import from existing `.env`/environment variables, or paste once for import. Do not continue searching indefinitely.
   - Never put real AppID, AppSecret, or OpenAI API keys in the distributable Skill package.
   - For first-time users, guide them to run `cd scripts && npm ci --omit=dev && npm run setup`; this installs the locked lightweight runtime and stores credentials in macOS Keychain or Windows Credential Manager.
   - If publishing credentials are missing, run `npm run diagnose-credentials` to show the exact credential store service/account lookup without revealing secrets.
   - If valid credentials exist in environment variables or a local `.env`, use `npm run import-credentials` to copy them into the standard system credential store.
   - Use `.env` only as an advanced local fallback, and never distribute it. If a user shares AppSecret in chat, do not repeat it and recommend rotating it after testing.
   - Do not claim the article is published publicly; `draft/add` only creates a draft. The user still needs to preview and publish in `mp.weixin.qq.com`.
   - When using `--gen-cover`, pass `--cover-prompt` with the article's semantic metaphor when available. The fallback generator center-crops the generated source to an exact `900 x 383` headline cover.

## Completion Report

Reply with:

- The preview HTML path.
- Clearly identify whether the preview is local-only or WeChat copy-ready.
- The `2.35:1` headline cover path or cover plan; include the optional `1:1` path only if generated.
- The image source summary: generated, web-sourced, user-provided, SVG or HTML-made.
- The `image-plan.json` path, content type, classification confidence/signals, and counts for all four routes.
- The current Agent's image-generation capability/tool. If unavailable, report the coded fallback, preserved external prompt, and user decision without calling it a generated image.
- For supplied images/videos, report which were used, where they were placed, and why any relevant asset was skipped.
- For news or mixed news commentary, report captured evidence URLs or the documented reason evidence capture failed.
- Whether article images are WeChat-hosted, remote URLs, data URIs, or local-only paths.
- If draft publishing was requested, report the returned draft `media_id`.
- Any missing items or unresolved attribution risks.
- A reminder that draft-box creation is not public publishing.

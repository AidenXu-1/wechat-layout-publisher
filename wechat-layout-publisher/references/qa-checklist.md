# Quality Checklist

Run this before delivering preview HTML or writing to the WeChat draft box.

For draft publishing, require `publish.ts` preflight to pass before any WeChat request. Do not bypass a failed article verifier, final image-plan check, asset-boundary check, body-image check, cover crop, or copy-ready check.

## Structure

- Article has title, subtitle, hero or intentional no-hero decision, lead, 3-5 reading units, and close.
- Content type is classified before writing. News/event tracking articles include a captured evidence screenshot and source URL, or an explicitly documented access-failure downgrade.
- Opening has a human hook or reader pain before professional explanation.
- Each section has one main idea.
- Long lists are compressed into cards, table, or SVG overview.
- The article uses a consistent component set from `components.md`.
- There are no unexplained jumps from one section to another.

## WeChat Safety

- Article body between `ARTICLE HTML START` and `ARTICLE HTML END` contains no `<style>`, `<script>`, `class=`, or `id=`.
- All article styles are inline.
- No layout depends on fixed positioning, transforms, animation, media queries, or fragile float behavior.
- Images are local, base64, remote direct images, or already WeChat-hosted; draft publishing will upload/replace them.
- If the deliverable is WeChat copy-ready, no image uses a local path, `file://` path, or unverified remote URL. Run `npm run verify-copy-ready -- <file>`.
- Do not claim "copy to WeChat and images will remain" unless images use exact WeChat hosts, or a remote/data URI route has been manually paste-tested and explicitly allowed by the verifier.
- Body images are kept under about 1 MB when possible.

## Visuals

- `image-plan.json` exists and passes `npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>`.
- Every ready evidence/generated/user-image `asset_path` is a real local PNG/JPEG or valid PNG/JPEG data URI. A `coded_visual` may use a safety-checked, self-contained local SVG or inline-HTML component; protocol-relative, HTTP(S), FTP, file, and other external resource references are rejected. Directories and unverified remote URLs do not count as captured assets.
- Classification records content type, confidence, and specific semantic signals. Public-event-plus-opinion uses mixed-news evidence rules.
- Every supplied image/video was assessed before web search or generation; relevant assets are used or have an explicit override reason.
- News and mixed-news articles contain at least one captured evidence screenshot near the supported claim. A generated image, quote card, SVG, or timeline does not count.
- Evidence source priority is official, primary social, reputable media, then community; source URLs are recorded.
- The plan records whether the current Agent has image generation and names the actual tool when available.
- Every `generated_image` uses the available native tool; in Codex this is Image Gen, including non-hero body images.
- When image generation is unavailable, the user was notified, a coded fallback and reusable prompt were produced, and `user_decision` is no longer pending.
- `coded_visual` is used only for process, relationship, timeline, framework, comparison, data, or mechanism. The only first-image exception is the disclosed generated-image fallback, and it never counts as evidence.
- Complete article packages include a `2.35:1` headline cover or an explicit reason it was skipped.
- Optional `1:1` square cover is created only when there is a downstream use; it uses a shortened title, not a blind crop.
- Every visual has a role: hero, evidence, explainer, object/photo, data overview, or rare breathing divider.
- Hero passes `visual-quality.md` and does not contain malformed text or fake UI.
- Screenshots are cropped to the meaningful subject and readable on mobile.
- Generated images have no watermark-like artifacts, logos, unwanted letters, or poster text.
- User-provided images are not over-cropped or moved away from the paragraph they support.
- Web-sourced images/screenshots have source notes for the completion report.
- Captions are short, factual, and consistent.

## Rhythm

- No two large atmosphere images appear back-to-back.
- Dense text is broken with a real explainer, screenshot, callout, or table.
- Visual blocks do not dominate the article at the expense of reading.
- There is enough breathing room before and after section headings.

## Copy

- Claims are not invented.
- Paragraphs usually carry one point. Paragraphs over 90-120 Chinese characters have been inspected and usually split.
- AI-smell phrases from `editorial-writing.md` have been reduced.
- Product names, model names, paper titles, dates, and numbers are checked when they matter.
- The strongest sentence is highlighted once, not repeated as bold text everywhere.
- Closing block summarizes the article's actual conclusion.

## Preview

- Open the generated preview HTML.
- Local-only preview has no copy-to-WeChat button. For the verified copy-ready preview, click the copy button at least once if the environment supports it.
- Inspect mobile width: no text overflow, image distortion, unreadable captions, or broken image icons.
- Confirm whether this preview is local-only or WeChat copy-ready. Local-only previews can show local images that will not survive paste into WeChat.
- If draft publishing is requested, confirm credentials are configured, `--image-plan` is final, all local materials are inside the article directory or explicit `--asset-dir`, and the cover can be normalized to `900 x 383`.

# WeChat HTML Constraints

Inside the article body, WeChat keeps only a limited HTML and CSS subset. Build defensively.

## Required

- Put all article styles inline with `style=""`.
- Use semantic tags like `section`, `p`, `h1`, `h2`, `strong`, `span`, `img`, `blockquote`, `table`, `svg`.
- Keep article images under about 1 MB when possible.
- Use local preview shell JavaScript only outside `ARTICLE HTML START` and `ARTICLE HTML END`.

## Avoid Inside Article Body

- No `<style>` tags.
- No `<script>` tags.
- No `class` or `id` attributes.
- No external stylesheets.
- No CSS animation, transforms, fixed positioning, or media queries.
- Avoid layouts that depend on `gap`, `position`, or `float`.

## Image Notes

- Local preview mode can use local paths.
- WeChat copy-ready mode cannot use local relative paths or `file://` paths. Those images may render in the browser preview but disappear after pasting into the Official Account editor.
- For copy-ready delivery, image `src` values should be WeChat-hosted URLs with the exact host `mmbiz.qpic.cn` or `mmbiz.qlogo.cn`. A normal remote `http(s)` URL or valid PNG/JPEG data URI is acceptable only after manual paste verification in the target editor.
- Draft API publishing uses `scripts/publish.ts` to upload local, remote, or base64 article images to WeChat and replace them with WeChat-hosted URLs.
- For network images, prefer downloading and embedding or saving locally so the preview does not break.

## Final Body Check

Before delivery, grep the article body for:

```bash
rg -n "<style|<script|class=|id=" <output.html>
```

Matches in the preview shell are acceptable. Matches between the article markers must be removed.

Prefer the bundled verifier:

```bash
cd scripts
npm run verify-article -- <preview-or-fragment.html>
```

It extracts the body between `ARTICLE HTML START` and `ARTICLE HTML END` when markers exist, then checks for common WeChat-breaking tags and attributes.

For paste-ready image delivery, also run:

```bash
cd scripts
npm run verify-copy-ready -- <preview-or-fragment.html>
```

This fails if any image still uses a local path, `file://` style source, or normal remote URL that is not WeChat-hosted.

Use the escape hatch only after a manual paste test:

```bash
cd scripts
npm run verify-copy-ready -- --allow-remote <preview-or-fragment.html>
npm run verify-copy-ready -- --allow-data-uri <preview-or-fragment.html>
```

After that real paste test is documented, pass the same explicit override when creating the preview:

```bash
node scripts/make-preview.mjs --copy-ready --allow-remote <fragment.html> <preview.html>
node scripts/make-preview.mjs --copy-ready --allow-data-uri <fragment.html> <preview.html>
```

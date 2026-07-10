# WeChat Cover System

Use this when the user asks for a WeChat Official Account cover, asks to publish to the draft box, or wants a complete article package.

## Contents

- Cover outputs and title strategy
- Source selection and 2.35:1 layout patterns
- HTML constraints and export options
- Naming and QA

The default cover deliverable is the `2.35:1` WeChat headline cover. The `1:1` square cover is optional and should be created only when it has a real publishing use.

Important API boundary: the current `draft/add` publishing path uses one `thumb_media_id` for the article cover. It does not upload both `2.35:1` and `1:1` covers as separate fields. When publishing through this Skill, pass the `2.35:1` headline cover as the cover image.

## Cover Outputs

### 2.35:1 Headline Cover

Default:

- Size: `900 x 383`
- High-resolution equivalent: `2350 x 1000`
- Ratio: `2.35:1`
- Use: main article cover / headline cover image
- Priority: this is the primary cover for this Skill.

Purpose:

- Show the full or near-full article title.
- Establish the article's editorial metaphor, object, evidence, or tension.
- Give the user a strong first impression in the Official Account feed and article header.

Composition rules:

- Use one strong visual idea, not a collage of unrelated symbols.
- Keep title readable in a clear safe band, usually center-left or balanced center.
- Use the 兆基日报 palette: warm paper, ink, muted brick, sage, refined neutrals.
- Avoid fake text inside generated images. Put all real title text in HTML/SVG, not inside the generated bitmap.
- Keep enough center mass. A 2.35:1 cover with a tiny title and small image reads empty.

### Optional 1:1 Square Cover

Default:

- Size: `1080 x 1080`
- Ratio: `1:1`
- Use only when needed.

When 1:1 is useful:

- The article is part of a multi-article/multi-card package where secondary entries use square thumbnails.
- The platform or sharing surface crops the main cover into a square preview.
- The user wants a reusable square social cover for Moments, chat sharing, archive cards, or cross-platform reuse.
- The cover set needs a compact thumbnail that still reads when small.
- The user will manually use or upload a square asset outside this Skill's one-click draft API flow.

When to skip 1:1:

- The user only needs the main single-article cover.
- The user is publishing through this Skill's `draft/add` flow and has not asked for extra reusable cover assets.
- The article title is long and the square would only become a cramped text block.
- No downstream surface will use a square thumbnail.

Default square style:

- Short title only.
- Big centered type.
- Usually no image.
- No subtitle unless disambiguation is necessary.
- Keep the same palette as the 2.35:1 cover.

## Title Strategy

Write the long title for the `2.35:1` headline cover first.

For `1:1`, derive a separate short title:

1. Identify the core verb.
2. Identify the core object.
3. Compress to 4-10 Chinese characters when possible.
4. Keep only necessary English terms such as AI, Mac, iOS, MCP.
5. Add a tiny subtitle only if the short title becomes ambiguous.

Examples:

```text
2.35:1: 开源了一个 Skill，让 AI 接管你屏幕边那张便签纸
1:1: AI 接管便签纸
```

```text
2.35:1: 第三次进山，装备比上一次轻 3.4kg
1:1: 装备减重 3.4kg
```

Do not squeeze the full 2.35:1 title into the square. A square cover needs its own sentence.

## Source Selection

Choose the cover visual source by meaning:

- Real product/person/place/page/event -> official image, user image, or clean screenshot.
- Article depends on a public page or source -> screenshot/evidence-based cover can work.
- Abstract essay or conceptual AI topic -> generated editorial metaphor image.
- Structure-heavy analysis -> cover can use a restrained SVG/HTML composition instead of a bitmap.

For generated cover imagery, use `visual-quality.md`. Generate image content only. Add real title text in the cover HTML/SVG layer.

## 2.35:1 Layout Patterns

### Editorial Metaphor

- Left or center-left title block.
- Right-side generated/photo object with negative space.
- Warm paper base and one brick accent line.

### Evidence Cover

- Short title plus a staged screenshot or source page crop.
- Screenshot must remain readable enough to identify the source.
- Caption/source can stay outside the cover if the cover would become cluttered.

### Data/Structure Cover

- Big title plus one restrained visual system: timeline, number row, comparison axis, or mechanism diagram.
- Do not overfill the cover with tiny labels.

## Cover HTML Constraints

The cover can be built as a standalone HTML file for screenshot export. Unlike article body HTML, cover HTML may use CSS classes and `<style>` because it is rendered to PNG before upload.

Still keep the design simple:

- Stable canvas size.
- No decorative blobs/orbs.
- No random gradients.
- No title over busy image regions.
- All text should be readable when previewed at small size.

## Export Options

Preferred lightweight path:

1. Build a standalone `cover.html`.
2. Open it in Chrome/Edge.
3. Export the cover node to PNG using browser screenshot tooling or headless Chrome.

Optional heavy path:

- Use Playwright when the project accepts the extra browser automation dependency.
- Playwright makes automated PNG export and visual checks easier, but browser binaries can add hundreds of MB to a user's machine cache.

Do not add Playwright as a required dependency unless the user explicitly wants automated cover rendering and accepts the heavier setup.

For the script fallback, `publish.ts --gen-cover` uses the OpenAI landscape size and then crops it with the lightweight image pipeline to an exact `900 x 383` JPEG. Keep the subject inside the central horizontal band, and pass `--cover-prompt` when semantic direction is available.

## Naming

Recommended files:

```text
cover/wechat-headline-cover.html
cover/wechat-headline-cover.png
cover/wechat-1x1-cover.html
cover/wechat-1x1-cover.png
cover/wechat-cover-pair-preview.html
```

For normal article publishing, pass the `2.35:1` PNG to:

```bash
cd scripts
npx tsx publish.ts <article.html> --image-plan <image-plan.json> --source-article <source.md> \
  --title "标题" --cover <cover/wechat-headline-cover.png>
```

If a `1:1` cover is generated, report it as an optional extra asset. Do not imply that it was uploaded through `draft/add` unless the publishing script is explicitly extended in the future.

## QA

- 2.35:1 headline cover is the primary quality gate.
- Title is readable at thumbnail size.
- Cover does not contain AI-generated text artifacts.
- Visual metaphor/source matches the article.
- If a 1:1 cover is generated, it uses a separately shortened title.
- Pair uses the same palette and feels related, but the 1:1 is not a blind crop.

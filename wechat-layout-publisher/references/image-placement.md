# Image Placement And Source Policy

The goal is semantic illustration: every image should explain, prove, compare, or set tone. Do not choose image types mechanically. First understand what the paragraph is doing, then choose the visual source and placement.

## Contents

- Semantic routing and visual roles
- Placement and source selection
- Image plan, quality checks, and captions

## Semantic Routing

Do not start by choosing a drawing tool. First classify what the nearby paragraph needs the reader to do:

- **See something the user supplied** -> `user_asset`.
- **Believe that a public event, quote, post, page, or product state exists** -> `evidence_screenshot`.
- **Feel or grasp an abstract metaphor, mood, conflict, or conceptual mapping** -> `generated_image`.
- **Understand a process, relationship, timeline, framework, comparison, dataset, or mechanism** -> `coded_visual`.
- **No real semantic need for an image** -> skip the image and improve spacing, heading, or callout instead.

After routing, apply `visual-quality.md`. A correct source type can still fail if the crop is unsafe, the screenshot is unreadable, or the generated image looks generic.

## Visual Role Decision

For each proposed image, assign one role:

| Role | Use When | Preferred Source |
|------|----------|------------------|
| Hero metaphor | Sets the article-level tension or mood | Generated image, real photo, or object image |
| Evidence | Proves a quote, page, UI state, or claim | Web screenshot, official image, user-provided image |
| Explainer | Clarifies a structure, mechanism, timeline, process, or comparison | SVG, HTML infographic, diagram |
| Object/photo well | Shows a real product, person, place, or scene | User image, official image, web image |
| Data overview | Compresses numbers or sibling facts | SVG, cards, table |
| Breathing divider | Gives visual rest without adding a new claim | Rare generated/editorial image |

If the role is unclear, do not use the image.

## Placement Rules

- **Hero image**: place after title/subtitle. Use for the central metaphor, object, product, person, or scene.
- **Lead visual**: if the intro contains a thesis with multiple claims, add a compact overview infographic after the lead.
- **Section visual**: place after the first paragraph of a section, once the reader knows what to look for.
- **Data visual**: use SVG or HTML-made graphics for numbers, timelines, matrices, processes, and comparisons.
- **Evidence image**: use screenshots or user-provided images near the claim they support.
- **External-context screenshot**: use when the article quotes, cites, or materially relies on a public page, research paper, information website, social network, or technical-community discussion. Do not add one just because a topic is public.
- **News evidence**: if the article is an event/controversy/reporting piece, evidence screenshots are not optional decoration. Use them near the claim they support, or record why capture failed.
- **Closing image**: optional. Use only if it adds a final synthesis, not decoration.

Do not place more than two large images back-to-back. Alternate text, image, caption, and analysis.

For strong images, avoid repeating the same move immediately. After a large hero or photo, let the next unit be text, a compact card group, or a diagram. After a dense screenshot, add explanation before another evidence image.

## Source Selection

Assign exactly one route to every visual. Use this order because it protects user intent and evidence quality.

### Route 1: `user_asset`

- Inventory all supplied images and videos before any web search or generation.
- Use a supplied asset first when it supports the paragraph, even if another image might look more polished.
- For supplied video, inspect the content and extract a representative still frame. Record the timestamp in `frame_timestamp`; do not use a random opening frame.
- When `ffmpeg` is available, extract the selected frame with:
  ```bash
  cd scripts && npm run extract-video-frame -- <video> --time 00:01:42 --out <frame.jpg>
  ```
- If `ffmpeg` is unavailable, explain the lightweight dependency and ask for permission to install it or ask the user for a still frame. Do not silently ignore relevant video.
- Preserve evidentiary context. Crop only to improve readability, and do not remove the UI, surroundings, timestamp, person, product, or action that makes the asset meaningful.
- A relevant supplied asset may be skipped only with an explicit `override_reason`, such as duplication, unreadable quality, privacy, rights, or semantic mismatch.

### Route 2: `evidence_screenshot`

- Use when the article reports news, cites a source, quotes a public statement, describes a social reaction, or depends on a real page/interface/document/product state.
- Source priority: official page or response -> original social post/public thread -> reputable media -> community origin.
- In Codex, use available browser navigation and screenshot tools to open the source and capture the meaningful region. Use the user's signed-in browser state only when appropriate and authorized.
- Capture source identity and enough surrounding context to prove what the page is. A tiny decontextualized sentence is weak evidence.
- Do not screenshot search results when the original page is accessible. Never recreate a post, quote, logo, headline, or interface with code and label it evidence.
- Record `source_url`, `source_tier`, capture status, asset path, caption, and failure reason when blocked.
- For news and mixed news commentary, at least one screenshot must be captured before final delivery unless all attempts are explicitly documented as inaccessible.

### Route 3: `generated_image`

- Use for the first editorial image, a conceptual hero, abstract mapping, central metaphor, emotion, conflict, mood, or a scene where bitmap quality materially improves the reading experience.
- First inspect the current Agent's tools. When image generation is available, every visual assigned `generated_image` must call that actual tool. This applies to body images as well as the hero and cover.
- In Codex, use Image Gen. In another Agent, use its native image-generation capability and record the real provider in the plan.
- Do not quietly replace an Image Gen task with SVG/HTML because code is faster. Change the route only when semantic analysis says the visual is actually structural.
- Use script/API generation when that is the Agent's available image tool or for the explicit automated `publish --gen-cover` path.
- Derive the prompt from the nearby paragraph: role, reader takeaway, concrete metaphor/subject, mood, palette, intended crop, mobile composition, and exclusions.
- Generate image content only. No article title, captions, fake UI, fake social post, logo, watermark, or poster layout inside the bitmap.

### No Image-Generation Capability

When the current Agent has no image-generation tool:

1. Tell the user that the semantically preferred bitmap cannot be produced in the current Agent.
2. Preserve the complete intended prompt as `desired_generation_prompt`.
3. Create a tasteful SVG/HTML coded fallback so article layout and preview work can continue.
4. Mark the actual route as `coded_visual`, with `semantic_kind: editorial_fallback`, `fallback_for: generated_image`, and `user_decision: pending`.
5. Offer two choices: `accept_current`, or generate the preserved prompt elsewhere and feed the image back for replacement.
6. Do not call the fallback AI-generated. Do not finish final validation while the decision is pending.

If the user accepts it, keep the coded asset and set `user_decision: accept_current`. If the user returns an externally generated image, replace the visual with `source_type: generated_image`, `provider: external_user_supplied`, and `user_decision: replace_externally`.

This exception may occupy the hero/first slot because it preserves workflow continuity, but it must remain clearly labeled. It can never replace an `evidence_screenshot`.

### Route 4: `coded_visual`

- Use only for a process, relationship, timeline, framework, comparison, data overview, or mechanism.
- Prefer SVG/HTML for precise labels, numeric cards, relationship maps, decision trees, pipelines, matrices, and step diagrams.
- Use article facts as data. Do not invent numbers, nodes, causal arrows, or chronology to make the picture look complete.
- Do not use coded visuals as the hero/first image, as evidence, or as decorative filler, except for the explicitly labeled no-generation fallback above.
- A coded timeline can explain what happened after screenshots prove the event; it cannot replace the screenshots.

For direct external image URLs, use the guarded converter when needed:

```bash
cd scripts && npx tsx img2base64.ts "<image-url-or-local-path>" --max-kb 980
```

## Image Plan Template

Persist the plan as `image-plan.json`. Minimal example:

```json
{
  "runtime": "codex",
  "image_generation_capability": "available",
  "image_generation_tool": "imagegen",
  "content_type": "mixed_news_commentary",
  "classification_confidence": 0.9,
  "classification_signals": ["recent company response", "article cites an official page"],
  "supplied_assets": [
    {
      "id": "user-video-1",
      "kind": "video",
      "relevance": "relevant",
      "decision": "use",
      "semantic_reason": "shows the product behavior described in section 2"
    }
  ],
  "visuals": [
    {
      "id": "hero",
      "order": 1,
      "section": "lead",
      "placement": "after subtitle",
      "role": "hero",
      "source_type": "generated_image",
      "semantic_reason": "maps the trust conflict into one editorial metaphor",
      "prompt": "premium editorial metaphor, no text",
      "provider": "imagegen",
      "status": "planned"
    },
    {
      "id": "official-evidence",
      "order": 2,
      "section": "event background",
      "placement": "after the official-response paragraph",
      "role": "evidence",
      "source_type": "evidence_screenshot",
      "semantic_reason": "proves the official response and wording",
      "source_url": "https://example.com/official",
      "source_tier": "official",
      "status": "planned"
    },
    {
      "id": "video-frame",
      "order": 3,
      "section": "product behavior",
      "placement": "after the behavior description",
      "role": "object",
      "source_type": "user_asset",
      "asset_ref": "user-video-1",
      "frame_timestamp": "00:01:42",
      "semantic_reason": "shows the exact behavior in the supplied video",
      "status": "planned"
    },
    {
      "id": "mechanism",
      "order": 4,
      "section": "how it works",
      "placement": "after the mechanism explanation",
      "role": "explainer",
      "source_type": "coded_visual",
      "semantic_kind": "process",
      "semantic_reason": "turns the four-step mechanism into a readable flow",
      "status": "planned"
    }
  ]
}
```

No-generation fallback example:

```json
{
  "runtime": "generic-agent",
  "image_generation_capability": "unavailable",
  "generation_capability_notice": "This Agent cannot generate bitmap images. A coded preview is ready for your choice.",
  "visuals": [
    {
      "id": "hero-fallback",
      "order": 1,
      "section": "lead",
      "placement": "after subtitle",
      "role": "hero",
      "source_type": "coded_visual",
      "semantic_kind": "editorial_fallback",
      "fallback_for": "generated_image",
      "semantic_reason": "keeps the intended metaphor visible while generation is unavailable",
      "desired_generation_prompt": "complete external image-generation prompt",
      "fallback_reason": "the current Agent has no image-generation tool",
      "user_decision": "pending",
      "status": "planned"
    }
  ]
}
```

Validate before execution and after assets exist:

```bash
npm run verify-image-plan -- --stage plan --article <source-article> <image-plan.json>
npm run verify-image-plan -- --stage final --article <source-article> --check-files <image-plan.json>
```

At final stage, set `status` to `ready`, `captured`, or `attempt_failed`, add `asset_path`, captions, provider/source details, and failure reasons. With `--check-files`, evidence, generated images, and user images must resolve to a real local PNG/JPEG file or valid PNG/JPEG data URI. `coded_visual` may instead use a safety-checked local SVG or inline-HTML component file; it must be self-contained, with resource references limited to local `#fragment` links or validated embedded PNG/JPEG data. A directory or unverified remote URL is never a captured asset. If evidence cannot be captured, do not fake it with code or Image Gen.

## Quality Checks

Before finalizing the image plan:

- News/event and mixed-news articles have at least one captured evidence screenshot from an official, primary social, reputable media, or community source, unless documented access failures were explicitly allowed.
- Every relevant supplied image/video is used or has an explicit override reason.
- Every `generated_image` records the actual available image tool; Codex records Image Gen, including body images after the hero.
- When image generation is unavailable, every generated-image need has a labeled coded fallback, preserved prompt, user notice, and resolved decision before final delivery.
- Every ordinary `coded_visual` is structural and is not the first image or evidence. Editorial fallback is the only first-image exception and never counts as evidence.
- Hero image has one clear focal idea and passes `visual-quality.md`.
- Screenshots are readable at mobile width.
- Generated images contain no text artifacts, logos, fake UI, or watermark-like marks.
- Crops preserve faces, hands, products, UI text, and the claim-supporting context.
- Every visual alternates well with surrounding text; no large decorative run appears.
- Captions identify what the reader is seeing and, when relevant, where it came from.

## Caption Rules

- Captions should answer: what is this, where did it come from, why does it matter.
- Format: `图注：说明｜来源：...`
- For generated images: `图注：根据文章语义生成的编辑配图`
- For user images: `图注：用户提供图片`
- For web images: include source name and link in the completion note; if the visible caption would be too long, keep it short in the article.

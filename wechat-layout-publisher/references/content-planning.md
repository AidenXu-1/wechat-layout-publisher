# Article Planning

Use this before writing article HTML. A strong WeChat article is not a poster deck; it is a long-form reading path with a few precise visual anchors.

## Compression Ladder

Read the source and compress it in layers:

0. **Content type**: classify as news/event tracking, product/tool intro, opinion commentary, knowledge explainer, experience recap, or narrative. Use `editorial-writing.md`.
   Record confidence and the exact textual signals. Public-event-plus-opinion is `mixed_news_commentary`, not pure opinion.
1. **Core claim**: one sentence that names the article's real point.
2. **Reader promise**: what the reader will understand after reading.
3. **Section map**: 3-5 reading units, each with one job.
4. **Visual map**: 2-5 visuals that reduce effort, prove a claim, or create atmosphere.
5. **Body rhythm**: short paragraphs, callouts, diagrams, screenshots, and captions.

Do not put the whole article into images. Images should carry evidence, structure, and emotional entry points; nuance belongs in the article body.

## Section Roles

Prefer varied roles instead of repeating title + paragraph + picture:

- **Lead thesis**: one sharp opening paragraph with a left accent rule.
- **Signal overview**: numeric cards, a timeline, or a comparison map.
- **Evidence block**: screenshot, source quote, product page, document, or user image.
- **Mechanism explainer**: flow, framework, pipeline, decision tree, matrix.
- **Tension section**: misconception vs reality, old way vs new way, surface vs structure.
- **Takeaway section**: 3-point summary, closing note, or dark final block.

If a section has only one simple idea, do not force an image. Use spacing, a callout, or a short heading.

## Image Count Guidance

For long-form WeChat:

- 600-1000 Chinese characters: 1 hero + 1-2 supporting visuals.
- 1000-1800 Chinese characters: 1 hero + 2-4 supporting visuals.
- 1800+ Chinese characters: 1 hero + 3-6 supporting visuals, but group dense facts into overview graphics.

More images are not automatically better. The article should still read calmly.

## Copy Rules

- Preserve the user's argument and wording unless rewriting is requested.
- Use section titles that name the actual point, not generic labels such as "背景介绍".
- When a claim depends on a source, put evidence near it.
- When a claim describes structure, make a diagram instead of adding decorative images.
- Pull out the strongest sentence into a lead or closing block; do not bold every paragraph.

## Planning Template

Use internally:

```text
Title:
Subtitle:
Core claim:
Reader promise:
Tone:

Unit 1 / role / key point / visual need / source type
Unit 2 / role / key point / visual need / source type
Unit 3 / role / key point / visual need / source type
...
Closing / final takeaway
```

For each visual:

```text
Slot:
Placement:
Role:
Why needed:
Source type:
Prompt/query/source:
Caption:
Risk:
```

Persist the final plan as `image-plan.json` rather than keeping it only in hidden reasoning. Use the four exact source types from `image-placement.md`: `user_asset`, `evidence_screenshot`, `generated_image`, and `coded_visual`.

If the risk is unresolved (license, unreadable screenshot, weak generated image, missing source), fix it or disclose it.

# Visual Quality Gates

Use this before creating or placing major images. The goal is not to add more images; it is to make every image feel intentional, readable, and editorial.

These rules are adapted for long-form WeChat articles from social-card design systems. Do not copy poster layouts directly into the article. Use the judgment rules: visual role, subject safety, screenshot readability, and final QA.

## Contents

- Visual role and editorial hero gates
- Generated image and screenshot rules
- Text, crop, sequence rhythm, and final QA

## Visual Role First

Before selecting or generating an image, write a short internal answer:

- What should the reader understand faster because of this image?
- Is the image evidence, atmosphere, metaphor, structure, comparison, process, or data?
- Which paragraph does it support?
- What can be removed from the image because the article body already says it?

Reject the image if the answer is only "it looks nice".

Good long-form roles:

- **Editorial hero**: article-level mood or central metaphor.
- **Evidence screenshot**: proof of a public page, product interface, social discussion, document, or quoted source.
- **Explainer graphic**: framework, chain, mechanism, timeline, comparison, or checklist.
- **Object/photo well**: real product, person, place, scene, or supplied user material.
- **Breathing divider**: rare. Use only when the article is visually exhausting and the image still carries mood.

## Editorial Hero Gate

The hero image sits immediately after title/subtitle, so it sets the trust level of the whole article. It must pass all checks:

- One clear focal idea; no collage unless the article itself is about comparison.
- Generous negative space; the composition should not feel busy at mobile width.
- No embedded words, fake UI, watermarks, logos, poster borders, or malformed text.
- Restrained palette that fits `style-guide.md`: warm paper, ink, muted brick, muted sage, soft neutrals.
- Obvious semantic link to the article's core metaphor, object, or tension.
- Looks premium as an editorial image even without a caption.
- For news commentary, carries a metaphor, tension, or editorial mood; it should not be a low-effort technical schematic.

If a generated hero looks generic, replace it with one of:

- A cleaner generated image with fewer objects.
- A real screenshot/photo if the article is about a product, public page, person, or event.

Do not use SVG/HTML as the first visual when bitmap generation or a relevant real image is available. Mechanism diagrams belong after the reader understands the event or idea. The only exception is a clearly labeled coded fallback when the current Agent has no image-generation tool; the user must accept it or replace it externally before final delivery.

## Generated Image Prompt Rules

Generate image content only, not the final article layout. Do not ask the image model to create Chinese headlines, UI cards, captions, page numbers, badges, or poster text.

When the current Agent has image-generation capability, every item routed as `generated_image` must use that tool, including body images after the hero and generated cover imagery. In Codex, use Image Gen. Do not generate only the first image and turn later metaphor/scene slots into coded SVGs. The prompt should explicitly carry this Skill's design system:

- Editorial WeChat article image, not a poster and not a SaaS hero.
- Warm paper texture, restrained palette, muted brick accent and optional sage/ink neutrals.
- One clear focal idea tied to the nearby paragraph.
- Generous negative space, clean crop, mobile-readable composition.
- No text, no letters, no logos, no watermark, no fake UI, no malformed interface.
- Avoid neon sci-fi, purple-blue gradients, decorative orbs, clutter, and cheap terminal-window schematics.

For the optional OpenAI API fallback, use the current image model (`gpt-image-2`) by default. Keep the model configurable and use only dimensions supported by that model family. When the Agent already has a native image-generation tool, use that tool instead of requiring an API key.

Prompt shape:

```text
Premium editorial illustration for a WeChat long-form article about [central idea].
[Concrete visual metaphor or scene].
Warm paper texture, restrained muted brick and sage accents, refined negative space, soft natural light, magazine editorial composition.
No text, no letters, no logo, no watermark, no UI, no poster border, no neon, no sci-fi glow.
```

For technical topics:

```text
Premium editorial still life for an AI infrastructure essay: [objects or metaphor].
Clean desk-like composition, warm paper background, subtle ink lines, muted brick accent, calm analytical mood.
No text, no letters, no logo, no fake interface.
```

For conceptual metaphors:

```text
Minimal editorial metaphor image: [metaphor].
One strong focal object, generous negative space, tactile paper texture, muted warm palette, quiet magazine style.
No text, no letters, no logo, no watermark.
```

Bad prompt smells:

- "futuristic neon", "cyberpunk", "glowing network", "3D render dashboard" unless the article explicitly asks for that mood.
- Too many objects joined by commas.
- Asking the model to draw readable Chinese or English text.
- Asking for a complete poster/card layout.

## Screenshot Quality Gate

Use screenshots when the article quotes, references, or depends on a real public page, interface, document, social thread, research paper, or information website.

For news, source in this order: official page/response, original social post or thread, reputable media, then community origin. Capture the original source whenever accessible. Search-result pages, recreated quote cards, generated posts, and code-made UI are not evidence.

Before placing a screenshot:

1. Crop away accidental browser clutter, notifications, sidebars, or irrelevant surrounding UI unless that chrome is part of the evidence.
2. Keep UI text readable. Use `object-fit:contain` logic when detail matters; do not crop important labels.
3. Put screenshots on a quiet stage: warm paper or light gray background, small radius, soft border, modest padding.
4. Avoid 3D tilt, skew, exaggerated shadows, or perspective mockups unless the user explicitly wants a marketing image.
5. If the screenshot is too dense for mobile, zoom into the relevant region and explain the source in the caption/completion note.

Recommended WeChat-safe screenshot block:

```html
<section style="margin:18px 0 24px;padding:16px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
  <img src="images/source-shot.jpg" style="display:block;width:100%;height:auto;border-radius:3px;" />
</section>
<p style="margin:-12px 0 24px;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：页面截图｜来源：...</p>
```

For side-by-side screenshots, use the same treatment on both sides. Different frames make the comparison feel accidental.

## Text-On-Image Safety

For this WeChat article style, avoid putting article text on top of images. Prefer title/subtitle in HTML above the image and captions below it.

If text must sit on an image:

- Inspect the image first and identify the subject/focal feature.
- Place text only in a quiet zone that does not cross faces, hands, products, or key UI.
- Prefer no mask. If contrast fails, use a localized image-toned tint around the text area, not a full-image black overlay.
- Downscale the result to mobile width and check that text is still readable.
- If no safe quiet zone exists, move the text outside the image.

## Cropping And Subject Safety

Every photo crop should preserve the reason the image was chosen.

- Faces: never crop through eyes, mouth, or key expression.
- Hands/tools/products: keep the action or object fully understandable.
- Screenshots: preserve the relevant UI text; crop to the active area instead of shrinking the whole desktop.
- Landscape/place: keep horizon and spatial context unless using the image purely as texture.
- User-supplied evidence: do not crop out context that supports the claim.

If the image has a single subject, decide its crop intentionally. Do not leave default center crop when the subject is clearly high, low, left, or right.

## Visual Sequence Rhythm

Long-form WeChat articles need alternating rhythm:

- Do not place two large atmosphere images back-to-back.
- After a large hero, follow with lead text or a compact overview, not another hero-like image.
- Use screenshots only where they prove something; use diagrams where they explain something.
- If a section is dense, use one visual to reduce cognitive load, then continue text.
- If a section is already simple, improve spacing instead of adding decoration.

## Final Image QA

Before delivery, check:

- `image-plan.json` passes final validation.
- Every image has a named role and nearby paragraph.
- Hero image passes the Editorial Hero Gate.
- Screenshots are readable on mobile and not accidentally cropped.
- Generated images contain no unwanted text, logos, fake UI, or watermark artifacts.
- User-provided images appear near the relevant claim.
- Relevant user videos use intentional timestamped frames, not arbitrary thumbnails.
- Web-sourced images/screenshots have source records for the completion note.
- Every `generated_image` records the actual provider; Codex records Image Gen.
- When generation is unavailable, the coded fallback is labeled, preserves the desired prompt, and has a resolved user decision.
- Coded visuals are limited to structural explanation and never impersonate evidence or the first editorial image, except for the disclosed no-generation fallback.
- Captions are factual and short.
- No image is used only as decoration.
- The article still feels like one visual system: same palette, radius, caption style, and spacing.

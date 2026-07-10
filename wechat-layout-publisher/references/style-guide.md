# 兆基日报 Style Guide

Use this guide to create a restrained WeChat editorial layout similar to the provided reference image.

## Contents

- Visual DNA, typography, layout, and density
- Core inline-HTML snippets
- Final style rules

## Visual DNA

- **Page feel**: white editorial page, quiet magazine pacing, generous vertical rhythm.
- **Content width**: article body max width around `677px`; mobile preview width around `375px`.
- **Tone**: calm, analytical, precise. Avoid marketing-card density and decorative gradients.
- **Primary accent**: muted brick red `#d68163`.
- **Secondary accent**: muted sage `#8f9b83`.
- **Text**: near-black `#252525`; secondary gray `#8b8b8b`; captions `#999999`.
- **Warm panels**: paper beige `#f8f5ef` or `#fbf8f3`.
- **Borders**: soft warm gray `#e7dfd3`.
- **Radius**: small, usually `3px` to `6px`; avoid pill-heavy UI.

## Typography

- Font stack: `-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif`
- Title: `22px`, `font-weight:800`, centered, line-height `1.35`.
- Subtitle: `13px`, gray, centered, line-height `1.7`.
- Body: `15px`, line-height `1.85`, color `#333333`.
- Section title: `18px`, `font-weight:800`, line-height `1.45`.
- Caption: `12px`, gray, centered.
- Letter spacing: keep at `0`; do not use negative spacing.

## Layout Pattern

Use this sequence for most articles:

1. Centered title.
2. Centered subtitle.
3. Hero image or warm editorial visual.
4. Centered image caption.
5. Lead paragraph with a left brick rule.
6. Key infographic or numeric overview.
7. Numbered sections with a short brick underline.
8. Section images placed after the first explanatory paragraph.
9. Closing note or summary.

## Density Rules

- Build for scan rhythm, not source-document completeness.
- Prefer 3-5 reading units. Each unit should carry one main idea.
- Keep each section to 1-3 short paragraphs before the next visual, card group, or callout.
- If there are 5+ sibling points, render them as cards, a table, or an SVG overview instead of separate dense sections.
- Put the strongest sentence in a lead callout or dark closing block; do not bold too many lines inside normal paragraphs.

## Core Snippets

### Article Shell

```html
<section style="margin:0 auto;padding:22px 20px 34px;max-width:677px;background:#fff;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;letter-spacing:0;">
  <!-- article -->
</section>
```

### Title Block

```html
<h1 style="margin:0 0 16px;text-align:center;font-size:22px;line-height:1.35;color:#252525;font-weight:800;">兆基日报｜文章标题</h1>
<p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.7;color:#8b8b8b;">一句克制的副标题</p>
```

### Image Block With Caption

```html
<section style="margin:0 0 24px;">
  <img src="images/hero.jpg" style="display:block;width:100%;border-radius:4px;" />
  <p style="margin:10px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：来源或说明</p>
</section>
```

### Lead Paragraph

```html
<section style="margin:22px 0 24px;padding:0 0 0 14px;border-left:3px solid #d68163;">
  <p style="margin:0;font-size:15px;line-height:1.85;color:#333333;font-weight:600;">导语段落。重点可以用 <strong style="font-weight:800;color:#252525;">加粗</strong>。</p>
</section>
```

### Section Heading

```html
<section style="margin:28px 0 12px;">
  <h2 style="margin:0;font-size:18px;line-height:1.45;color:#252525;font-weight:800;">一 · 小标题</h2>
  <div style="margin:10px 0 0;width:36px;height:3px;background:#d68163;border-radius:2px;"></div>
</section>
```

### Warm Infographic Panel

```html
<section style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <p style="margin:0 0 14px;font-size:17px;line-height:1.45;color:#252525;font-weight:800;">一图速览：关键数字</p>
  <div style="width:54px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
  <!-- cards, svg, table, or image -->
</section>
```

### Numeric Cards

```html
<section style="margin:0;">
  <section style="display:inline-block;vertical-align:top;width:31%;min-height:96px;margin:0 1% 12px 0;padding:14px 12px;background:#fff;border:1px solid #e7dfd3;border-radius:3px;">
    <div style="width:32px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
    <p style="margin:0 0 8px;font-size:18px;line-height:1.3;color:#d68163;font-weight:800;">80.3%</p>
    <p style="margin:0;font-size:11px;line-height:1.55;color:#777777;">指标说明</p>
  </section>
</section>
```

### Timeline Infographic

Use inline SVG for clean timelines. Keep text large enough for mobile.

```html
<section style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 637 280" style="display:block;width:100%;height:auto;">
    <rect width="637" height="280" fill="#fbf8f3"/>
    <text x="24" y="34" font-size="20" font-weight="800" fill="#252525" font-family="system-ui">时间线标题</text>
    <line x1="60" y1="120" x2="580" y2="120" stroke="#252525" stroke-width="3"/>
    <circle cx="120" cy="120" r="5" fill="#252525"/>
    <text x="120" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="#252525" font-family="system-ui">阶段一</text>
    <circle cx="300" cy="120" r="5" fill="#252525"/>
    <text x="300" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="#252525" font-family="system-ui">阶段二</text>
    <circle cx="520" cy="120" r="6" fill="#d68163"/>
    <text x="520" y="92" text-anchor="middle" font-size="13" font-weight="800" fill="#d68163" font-family="system-ui">当前</text>
  </svg>
</section>
```

## Style Rules

- Prefer real editorial images, soft paper illustrations, clean screenshots, and simple data diagrams.
- Hero images must pass the full gate in `visual-quality.md`: clear hierarchy, generous negative space, restrained palette, no clutter, no visible text artifacts, safe crop, and an obvious connection to the article's central metaphor.
- For generated hero prompts, ask for premium magazine editorial illustration, warm paper texture, muted brick and sage accents, no text, no letters, no logo, no watermark, no fake UI, and no sci-fi neon.
- Treat screenshots as evidence blocks: crop to the meaningful subject, keep text readable, stage on warm paper or light gray, and avoid perspective mockups unless explicitly requested.
- Do not use purple-blue gradients, decorative orbs, oversized hero cards, or dark-heavy SaaS styling.
- Avoid nested cards. A warm panel may contain cards, but do not put a decorative card around the entire article.
- Keep captions factual and short.
- Use one accent color per visual block; brick red is the default.
- If the article is a daily note, use `兆基日报｜标题`; otherwise keep the user's title.

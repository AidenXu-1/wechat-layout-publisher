# WeChat Editorial Components

Use these components for hand-written article HTML. They are adapted to the 兆基日报 style: white page, warm paper panels, muted brick accents, compact editorial rhythm.

All snippets inside the article body must use inline styles only. No `class`, no `id`, no `<style>`, no JavaScript.

## Contents

- Tokens and article shell
- Title, hero, lead, heading, and paragraph
- Infographic, numeric, screenshot, quote, and step blocks
- Closing block, inline SVG, and component discipline

## Tokens

- Text: `#252525`
- Body: `#333333`
- Muted: `#8b8b8b`
- Caption: `#999999`
- Brick accent: `#d68163`
- Sage accent: `#8f9b83`
- Warm panel: `#fbf8f3`
- Paper panel: `#f8f5ef`
- Line: `#e7dfd3`
- Font stack: `-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif`

## Article Shell

```html
<section style="margin:0 auto;padding:22px 20px 34px;max-width:677px;background:#fff;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;letter-spacing:0;">
  <!-- article -->
</section>
```

## Title Block

```html
<h1 style="margin:0 0 14px;text-align:center;font-size:22px;line-height:1.35;color:#252525;font-weight:800;">兆基日报｜文章标题</h1>
<p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.7;color:#8b8b8b;">一句克制的副标题</p>
```

## Hero Image

```html
<section style="margin:0 0 24px;">
  <img src="images/hero.jpg" style="display:block;width:100%;height:auto;border-radius:4px;" />
  <p style="margin:10px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：根据文章语义生成的编辑配图</p>
</section>
```

## Lead Paragraph

```html
<section style="margin:22px 0 24px;padding:0 0 0 14px;border-left:3px solid #d68163;">
  <p style="margin:0;font-size:15px;line-height:1.85;color:#333333;font-weight:600;">导语段落。重点可以用 <strong style="font-weight:800;color:#252525;">加粗</strong>。</p>
</section>
```

## Section Heading

```html
<section style="margin:28px 0 12px;">
  <h2 style="margin:0;font-size:18px;line-height:1.45;color:#252525;font-weight:800;">一 · 小标题</h2>
  <div style="margin:10px 0 0;width:36px;height:3px;background:#d68163;border-radius:2px;"></div>
</section>
```

## Paragraph

```html
<p style="margin:0 0 16px;font-size:15px;line-height:1.85;color:#333333;">正文段落。需要强调时用 <strong style="font-weight:800;color:#252525;">克制加粗</strong>。</p>
```

## Warm Infographic Panel

```html
<section style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <p style="margin:0 0 12px;font-size:17px;line-height:1.45;color:#252525;font-weight:800;">一图速览：关键数字</p>
  <div style="width:54px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
  <!-- cards, svg, or table -->
</section>
```

## Numeric Cards

Use when there are 3-6 comparable metrics.

```html
<section style="margin:0;">
  <section style="display:inline-block;vertical-align:top;width:31%;min-height:96px;margin:0 1% 12px 0;padding:14px 12px;background:#fff;border:1px solid #e7dfd3;border-radius:3px;">
    <div style="width:32px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
    <p style="margin:0 0 8px;font-size:18px;line-height:1.3;color:#d68163;font-weight:800;">80.3%</p>
    <p style="margin:0;font-size:11px;line-height:1.55;color:#777777;">指标说明</p>
  </section>
</section>
```

## Screenshot Stage

Use for webpage, product UI, document, research, dashboard, or social discussion screenshots.

```html
<section style="margin:18px 0 24px;padding:16px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
  <img src="images/screenshot.jpg" style="display:block;width:100%;height:auto;border-radius:3px;" />
</section>
<p style="margin:-12px 0 24px;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：页面截图｜来源：...</p>
```

## Quote Block

```html
<blockquote style="margin:18px 0 24px;padding:18px 18px;background:#fbf8f3;border-left:3px solid #d68163;border-radius:4px;">
  <p style="margin:0;font-size:16px;line-height:1.75;color:#252525;font-weight:700;">一句值得停下来的判断。</p>
  <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#8b8b8b;">补一句来源或语境。</p>
</blockquote>
```

## Step Cards

```html
<section style="margin:16px 0 24px;">
  <section style="margin:0 0 10px;padding:14px 14px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
    <p style="margin:0;font-size:15px;line-height:1.75;color:#333333;"><span style="color:#d68163;font-weight:800;margin-right:6px;">第一步</span>动作或判断。</p>
  </section>
</section>
```

## Closing Block

```html
<section style="margin:28px 0 0;padding:20px 18px;background:#252525;border-radius:4px;">
  <p style="margin:0 0 10px;font-size:17px;line-height:1.45;color:#ffffff;font-weight:800;">写在最后</p>
  <p style="margin:0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.78);">收束全文的一段话。</p>
</section>
```

## Inline SVG Infographics

Prefer SVG for timelines, comparisons, flywheels, pipelines, matrices, and numeric summaries. Keep text large enough for mobile. Use `viewBox="0 0 637 H"` when the visual fills the article width.

```html
<section style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 637 260" style="display:block;width:100%;height:auto;">
    <rect width="637" height="260" fill="#fbf8f3"/>
    <text x="24" y="34" font-size="20" font-weight="800" fill="#252525" font-family="system-ui">结构标题</text>
    <line x1="60" y1="128" x2="580" y2="128" stroke="#252525" stroke-width="3"/>
    <circle cx="120" cy="128" r="5" fill="#252525"/>
    <text x="120" y="100" text-anchor="middle" font-size="13" font-weight="700" fill="#252525" font-family="system-ui">阶段一</text>
    <circle cx="320" cy="128" r="5" fill="#252525"/>
    <text x="320" y="100" text-anchor="middle" font-size="13" font-weight="700" fill="#252525" font-family="system-ui">阶段二</text>
    <circle cx="520" cy="128" r="6" fill="#d68163"/>
    <text x="520" y="100" text-anchor="middle" font-size="13" font-weight="800" fill="#d68163" font-family="system-ui">当前</text>
  </svg>
</section>
```

## Component Discipline

- Use 3-5 component types per article, not every component.
- Deep/dark blocks should be rare: opening emphasis or final close only.
- Warm panels may contain cards; do not wrap every paragraph in cards.
- Do not use pill-heavy tags unless tags are actual content.
- Use SVG or tables for structure before asking an image model to "draw a diagram".

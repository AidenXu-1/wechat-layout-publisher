# 微信公众号编辑组件

手写文章 HTML 时使用这些组件。整体适配兆基日报风格：白色页面、暖纸面板、低饱和砖红强调和紧凑的编辑节奏。

正文内所有片段只能使用内联样式，禁止 `class`、`id`、`<style>` 和 JavaScript。

## 目录

- 设计变量与正文外壳
- 标题、首图、导语、章节标题和段落
- 信息图、数字、截图、引用和步骤块
- 结尾块、内联 SVG 和组件纪律

## 设计变量

- 标题文字：`#252525`
- 正文：`#333333`
- 次要文字：`#8b8b8b`
- 图注：`#999999`
- 砖红强调：`#d68163`
- 鼠尾草绿强调：`#8f9b83`
- 暖色面板：`#fbf8f3`
- 纸张面板：`#f8f5ef`
- 边线：`#e7dfd3`
- 字体栈：`-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif`

## 正文外壳

```html
<section style="margin:0 auto;padding:22px 20px 34px;max-width:677px;background:#fff;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;letter-spacing:0;">
  <!-- 正文 -->
</section>
```

## 标题区

```html
<h1 style="margin:0 0 14px;text-align:center;font-size:22px;line-height:1.35;color:#252525;font-weight:800;">兆基日报｜文章标题</h1>
<p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.7;color:#8b8b8b;">一句克制的副标题</p>
```

## 首图

```html
<section style="margin:0 0 24px;">
  <img src="images/hero.jpg" style="display:block;width:100%;height:auto;border-radius:4px;" />
  <p style="margin:10px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：根据文章语义生成的编辑配图</p>
</section>
```

## 导语

```html
<section style="margin:22px 0 24px;padding:0 0 0 14px;border-left:3px solid #d68163;">
  <p style="margin:0;font-size:15px;line-height:1.85;color:#333333;font-weight:600;">导语段落。重点可以用 <strong style="font-weight:800;color:#252525;">加粗</strong>。</p>
</section>
```

## 章节标题

```html
<section style="margin:28px 0 12px;">
  <h2 style="margin:0;font-size:18px;line-height:1.45;color:#252525;font-weight:800;">一 · 小标题</h2>
  <div style="margin:10px 0 0;width:36px;height:3px;background:#d68163;border-radius:2px;"></div>
</section>
```

## 正文段落

```html
<p style="margin:0 0 16px;font-size:15px;line-height:1.85;color:#333333;">正文段落。需要强调时用 <strong style="font-weight:800;color:#252525;">克制加粗</strong>。</p>
```

## 暖色信息图面板

```html
<section style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <p style="margin:0 0 12px;font-size:17px;line-height:1.45;color:#252525;font-weight:800;">一图速览：关键数字</p>
  <div style="width:54px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
  <!-- 卡片、SVG 或表格 -->
</section>
```

## 数字卡片

适用于 3 至 6 个可比较指标。

```html
<section style="margin:0;">
  <section style="display:inline-block;vertical-align:top;width:31%;min-height:96px;margin:0 1% 12px 0;padding:14px 12px;background:#fff;border:1px solid #e7dfd3;border-radius:3px;">
    <div style="width:32px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
    <p style="margin:0 0 8px;font-size:18px;line-height:1.3;color:#d68163;font-weight:800;">80.3%</p>
    <p style="margin:0;font-size:11px;line-height:1.55;color:#777777;">指标说明</p>
  </section>
</section>
```

## 截图舞台

适用于网页、产品界面、文档、研究、仪表盘或社交讨论截图。

```html
<section style="margin:18px 0 24px;padding:16px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
  <img src="images/screenshot.jpg" style="display:block;width:100%;height:auto;border-radius:3px;" />
</section>
<p style="margin:-12px 0 24px;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：页面截图｜来源：...</p>
```

## 引用块

```html
<blockquote style="margin:18px 0 24px;padding:18px 18px;background:#fbf8f3;border-left:3px solid #d68163;border-radius:4px;">
  <p style="margin:0;font-size:16px;line-height:1.75;color:#252525;font-weight:700;">一句值得停下来的判断。</p>
  <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#8b8b8b;">补一句来源或语境。</p>
</blockquote>
```

## 步骤卡片

```html
<section style="margin:16px 0 24px;">
  <section style="margin:0 0 10px;padding:14px 14px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
    <p style="margin:0;font-size:15px;line-height:1.75;color:#333333;"><span style="color:#d68163;font-weight:800;margin-right:6px;">第一步</span>动作或判断。</p>
  </section>
</section>
```

## 结尾块

只有标题能概括文章真实结论时才使用。否则直接用最后一段收束。除非源文明确使用，禁止自动添加 `写在最后`、`总结`、`结语` 等泛标题。

```html
<section style="margin:28px 0 0;padding:20px 18px;background:#252525;border-radius:4px;">
  <p style="margin:0 0 10px;font-size:17px;line-height:1.45;color:#ffffff;font-weight:800;">真实结论标题（可选）</p>
  <p style="margin:0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.78);">用文章的真实判断收束全文。</p>
</section>
```

## 内联 SVG 信息图

时间线、比较、飞轮、管线、矩阵和数字总览优先使用 SVG。文字在手机上也要足够大。视觉占满正文宽度时，使用 `viewBox="0 0 637 H"`。

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

## 组件纪律

- 每篇文章使用 3 至 5 种组件，不要把所有组件都塞进去。
- 深色块只在开头强调或结尾收束时少量使用。
- 暖色面板可以容纳卡片，禁止把每个段落都包装成卡片。
- 标签确实是内容时才能使用胶囊标签。
- 结构表达优先用 SVG 或表格，再考虑让图片模型“画图表”。

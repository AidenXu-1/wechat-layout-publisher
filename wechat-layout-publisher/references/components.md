# 微信公众号编辑组件

手写文章 HTML 时使用这些组件。整体适配兆基日报风格：白色页面、暖纸面板、低饱和砖红强调和紧凑的编辑节奏。

正文内所有片段只能使用内联样式，禁止 `class`、`id`、`<style>` 和 JavaScript。

每个计划视觉只在实际 `<img>` 或内联代码视觉最外层标记一次 `data-wlp-visual-id="image-plan 中的 id"`。所有强视觉组件在最外层标记 `data-wlp-visual-block="data|process|steps|quote|table|matrix|screenshot|image|coded|framework"`。`preserve` 模式获准新增的标题、副标题、图注或来源节点，另加 `data-wlp-added="title|subtitle|caption|source"`；原文已有节点不要标记。

强视觉块包括图片、SVG、大卡片、引用、表格、矩阵、步骤块和长截图。布局密度按这些块统一计算，组件换成 HTML 卡片也不会恢复一份新的视觉预算。

## 目录

- 正文外壳
- 标题、首图、导语、章节标题和段落
- 信息图、数字、截图、引用和步骤块
- 结尾块、内联 SVG 和组件纪律

颜色、字体和间距以 `style-guide.md` 为唯一来源，本文件只保留可直接使用的组件。

## 正文外壳

```html
<section style="margin:0 auto;padding:22px 20px 34px;max-width:677px;background:#fff;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;letter-spacing:0;">
  <!-- 正文 -->
</section>
```

## 标题区

```html
<h1 style="margin:0 0 14px;text-align:center;font-size:22px;line-height:1.35;color:#252525;font-weight:800;">文章标题</h1>
<p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.7;color:#8b8b8b;">一句克制的副标题</p>
```

## 首图

```html
<section data-wlp-visual-block="image" style="margin:0 0 24px;">
  <img data-wlp-visual-id="hero" src="images/hero.jpg" style="display:block;width:100%;height:auto;border-radius:4px;" />
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
<section data-wlp-visual-block="data" style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <p style="margin:0 0 12px;font-size:17px;line-height:1.45;color:#252525;font-weight:800;">一图速览：关键数字</p>
  <div style="width:54px;height:3px;background:#d68163;border-radius:2px;margin:0 0 18px;"></div>
  <!-- 卡片、SVG 或表格 -->
</section>
```

## 数字卡片

适用于 3 至 6 个可比较指标。禁止用“百分比宽度 + 固定内边距”的 `inline-block` 卡片拼列，这会在手机宽度下发生内容盒溢出。使用固定表格布局；指标较长时改成纵向单列。

```html
<table data-wlp-visual-block="data" style="width:100%;table-layout:fixed;border-collapse:separate;border-spacing:6px 0;">
  <tbody>
    <tr>
      <td style="padding:12px 8px;vertical-align:top;background:#ffffff;border:1px solid #e7dfd3;border-radius:3px;">
        <p style="margin:0 0 6px;font-size:18px;line-height:1.3;color:#d68163;font-weight:800;">80.3%</p>
        <p style="margin:0;font-size:12px;line-height:1.55;color:#777777;word-break:break-word;">指标说明</p>
      </td>
      <td style="padding:12px 8px;vertical-align:top;background:#ffffff;border:1px solid #e7dfd3;border-radius:3px;">
        <p style="margin:0 0 6px;font-size:18px;line-height:1.3;color:#8f9b83;font-weight:800;">12 次</p>
        <p style="margin:0;font-size:12px;line-height:1.55;color:#777777;word-break:break-word;">交接次数</p>
      </td>
      <td style="padding:12px 8px;vertical-align:top;background:#ffffff;border:1px solid #e7dfd3;border-radius:3px;">
        <p style="margin:0 0 6px;font-size:18px;line-height:1.3;color:#252525;font-weight:800;">3 天</p>
        <p style="margin:0;font-size:12px;line-height:1.55;color:#777777;word-break:break-word;">完成周期</p>
      </td>
    </tr>
  </tbody>
</table>
```

## 截图舞台

适用于网页、产品界面、文档、研究、仪表盘或社交讨论截图。

```html
<section data-wlp-visual-block="screenshot" style="margin:18px 0 24px;padding:16px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;">
  <img data-wlp-visual-id="official-evidence" src="images/screenshot.jpg" style="display:block;width:100%;height:auto;border-radius:3px;" />
</section>
<p style="margin:-12px 0 24px;text-align:center;font-size:12px;line-height:1.6;color:#999999;">图注：页面截图｜来源：...</p>
```

## 引用块

```html
<blockquote data-wlp-visual-block="quote" style="margin:18px 0 24px;padding:18px 18px;background:#fbf8f3;border-left:3px solid #d68163;border-radius:4px;">
  <p style="margin:0;font-size:16px;line-height:1.75;color:#252525;font-weight:700;">一句值得停下来的判断。</p>
  <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#8b8b8b;">补一句来源或语境。</p>
</blockquote>
```

## 步骤卡片

```html
<section data-wlp-visual-block="steps" style="margin:16px 0 24px;">
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
<section data-wlp-visual-id="mechanism" data-wlp-visual-block="process" style="margin:18px 0 24px;padding:22px 20px;background:#fbf8f3;border-radius:4px;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 637 260" style="display:block;width:100%;height:auto;">
    <rect width="637" height="260" fill="#fbf8f3"/>
    <text x="24" y="40" font-size="30" font-weight="800" fill="#252525" font-family="system-ui">结构标题</text>
    <line x1="60" y1="128" x2="580" y2="128" stroke="#252525" stroke-width="3"/>
    <circle cx="120" cy="128" r="5" fill="#252525"/>
    <text x="120" y="96" text-anchor="middle" font-size="24" font-weight="700" fill="#252525" font-family="system-ui">阶段一</text>
    <circle cx="320" cy="128" r="5" fill="#252525"/>
    <text x="320" y="96" text-anchor="middle" font-size="24" font-weight="700" fill="#252525" font-family="system-ui">阶段二</text>
    <circle cx="520" cy="128" r="6" fill="#d68163"/>
    <text x="520" y="96" text-anchor="middle" font-size="24" font-weight="800" fill="#d68163" font-family="system-ui">当前</text>
  </svg>
</section>
```

## 组件纪律

- 每篇文章使用 3 至 5 种组件，不要把所有组件都塞进去。
- 深色块只在开头强调或结尾收束时少量使用。
- 暖色面板可以容纳卡片，禁止把每个段落都包装成卡片。
- 标签确实是内容时才能使用胶囊标签。
- 结构表达优先用 SVG 或表格，再考虑让图片模型“画图表”。
- 同一组数据只选择数字卡、表格或图表中的一种主要表达；同一组步骤只选择步骤卡或流程图中的一种。若同时保留证据与解释，二者之间加入解释正文并确保语义职责不同。
- Markdown 分隔符 `---`、`***`、`___` 不生成可见段落或分隔线。章节间距由章节标题的上边距承担；前一组件不要再叠加等量底边距，也不要插入空白 `section`、空 `p` 或仅含 `&nbsp;` 的占位块。

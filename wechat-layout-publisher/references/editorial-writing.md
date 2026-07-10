# Editorial Writing Rules

Use this before building the preview. The layout can look polished and still fail if the article reads like a sterile report.

## Contents

- Content type and news evidence gates
- Opening hook and human voice
- Paragraph density and depth

## Content Type Gate

Classify the article before writing:

- **News / event tracking**: recent dispute, launch, report, official response, community thread, media coverage.
- **Product / tool intro**: explains a tool, workflow, release, or usage.
- **Opinion commentary**: argues a point from known facts.
- **Knowledge explainer**: teaches a concept or mechanism.
- **Experience recap**: personal workflow, mistake, decision, or project review.
- **Narrative**: story-first writing.

If the article is news / event tracking, it must have an evidence image plan. Do not let SVG explainers or generated metaphor images replace public-source evidence.

### Conservative News Detection

Record `content_type`, `classification_confidence`, and `classification_signals` before planning visuals.

Treat the article as `news_event` when two or more of these signals appear, or when one signal is central to the article:

- A recent date, launch, ban, controversy, policy change, product change, official response, public incident, or developing event.
- A named company, person, institution, or platform did or announced something.
- The text cites or paraphrases an official page, social post, media report, paper, documentation, interview, or community thread.
- The reader must verify that a quote, announcement, screenshot, product state, or public reaction actually existed.
- The article uses time-sensitive language such as "today", "recently", "announced", "responded", "reported", "went viral", or "latest".

Use `mixed_news_commentary` when the article starts from a public event and then adds the author's opinion or experience. Commentary does not remove the evidence requirement.

When confidence is low but news signals exist, choose `mixed_news_commentary` instead of pure `opinion`. It is safer to collect evidence and later decide not to show it than to publish a news-like article with no evidence layer.

## News / Event Tracking Rules

When any of these are true, prioritize evidence screenshots:

- The article cites a media report, official response, product announcement, paper, documentation page, Reddit/X/community thread, or public website.
- The article describes a recent controversy, product change, account ban, policy change, release, or public debate.
- The reader needs to trust that the event actually happened.

Minimum expectation:

- Capture at least one public-source screenshot near the relevant paragraph for the final package.
- Prefer official response or official docs first, media report second, community original discussion third.
- For social-media-origin events, prefer the original verified/identifiable post over a media retelling when it is accessible.
- Do not use a search-results page, code-made quote card, recreated post, or generated image as evidence.
- If a source page cannot be captured because of login wall, network block, cookie wall, or security block, say so in the completion note.
- Use SVG/HTML diagrams only for mechanism explanation after the evidence layer exists.

## Opening Hook

Do not open like a neutral report. Open with human stakes first, then explain.

Preferred sequence:

1. A real feeling, real experience, or reader pain.
2. One plain sentence naming the conflict.
3. Then the professional explanation.

Good directions:

- A specific personal moment: "半个月被封了三个号以后，我对这件事的感觉变了。"
- A reader pain: "你以为只是账号风控，后来发现它可能在看你电脑这边的痕迹。"
- A concrete discomfort: "难受的不是封号，是你不知道它到底按什么给你贴标签。"

Avoid:

- "本文将分析..."
- "这件事不只是...而是..."
- "真正值得关注的是..."
- Starting with four abstract nouns before the reader knows why they should care.

## Human Voice Gate

Before preview, scan for AI-smelling patterns and rewrite them into plain speech.

Reduce:

- "不只是/不仅是/不仅仅是 ... 而是/也是 ..."
- "真正的问题是"
- "核心/关键/本质/格局/凸显/反映/至关重要"
- "更成熟的看法是"
- "这件事的重点不是"
- Stacked three-part abstractions.
- Too many bold "golden sentences".

Rewrite direction:

- Replace abstract nouns with scenes readers can feel.
- Explain a professional term with a plain sentence before using the term.
- Let some sentences be short and conversational.
- Do not end every paragraph by lifting the issue to "industry significance".

## Paragraph Density Gate

One paragraph should usually carry one job.

Split or rewrite if a paragraph combines three or more of:

- Event background.
- Technical mechanism.
- Platform motivation.
- User risk.
- Industry judgment.
- Moral conclusion.

For Chinese body paragraphs:

- Over 90-120 Chinese characters: inspect and usually split.
- Over 160 Chinese characters: split unless it is a deliberate narrative paragraph.
- If there are more than two abstract concepts in one paragraph, add a concrete example or split.

## Depth Without Sterility

The target is not casual fluff. Keep factual boundaries and technical depth, but let readers enter through lived experience.

Pattern:

```text
人能感到的事 -> 大白话解释 -> 证据/截图 -> 机制图 -> 判断
```

Do not start with:

```text
行业意义 -> 抽象机制 -> 风险框架 -> 用户情绪
```

#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node verify-article.mjs [--complete-package] [--content-mode rewrite|preserve] [--source-article <source>] <preview-or-fragment.html>");
  process.exit(2);
}

const args = process.argv.slice(2);
const completePackage = args.includes("--complete-package");
let sourceArticle = "";
let contentMode = "";
let file = "";
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--complete-package") continue;
  if (arg === "--content-mode") {
    contentMode = args[++index] || "";
    if (!new Set(["rewrite", "preserve"]).has(contentMode)) usage();
  } else if (arg === "--source-article") {
    sourceArticle = args[++index] || "";
    if (!sourceArticle) usage();
  } else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    process.exit(2);
  } else if (!file) file = arg;
  else usage();
}
if (!file) usage();
if (completePackage && !contentMode) {
  console.error("FAIL complete package requires --content-mode rewrite or preserve.");
  process.exit(1);
}
if (contentMode === "preserve" && !sourceArticle) {
  console.error("FAIL preserve mode requires --source-article.");
  process.exit(1);
}

function decodeHtmlEntities(value) {
  const named = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
  ]);
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

function visibleHtmlText(value) {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function visibleSourceText(value) {
  const withoutFrontmatter = value.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
  if (/<(?:p|h[1-6]|section|article|div|li|blockquote|table)\b/i.test(withoutFrontmatter)) {
    return visibleHtmlText(withoutFrontmatter);
  }
  return decodeHtmlEntities(
    withoutFrontmatter
      .replace(/!\[[^\]]*\]\([^\n)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
      .replace(/^\s*```[^\n]*$/gm, "")
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
      .replace(/^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
      .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, "")
      .replace(/[*_~`]([^\n]*?)[*_~`]/g, "$1"),
  );
}

function compactVisibleText(value) {
  return value.normalize("NFC").replace(/\s+/gu, "");
}

function approvedAddedNodes(value) {
  return [...value.matchAll(/<(h1|p|figcaption)\b([^>]*)\bdata-wlp-added\s*=\s*(?:"(title|subtitle|caption|source)"|'(title|subtitle|caption|source)'|(title|subtitle|caption|source))([^>]*)>([\s\S]*?)<\/\1>/gi)].map(
    (match) => ({
      full: match[0],
      tag: match[1].toLowerCase(),
      role: match[3] || match[4] || match[5],
      text: visibleHtmlText(match[7]).replace(/\s+/g, " ").trim(),
      index: match.index || 0,
    }),
  );
}

const raw = readFileSync(file, "utf8");
const marker = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
const body = marker ? marker[1] : raw;

const checks = [
  { name: "no <style> in article body", re: /<style[\s>]/i },
  { name: "no <script> in article body", re: /<script[\s>]/i },
  { name: "no class attribute in article body", re: /\sclass\s*=/i },
  { name: "no id attribute in article body", re: /\sid\s*=/i },
  { name: "no inline event handlers", re: /\son[a-z]+\s*=/i },
  { name: "no external stylesheet in article body", re: /<link[^>]+stylesheet/i },
  { name: "no iframe/object/embed/form/input", re: /<(iframe|object|embed|form|input)[\s>]/i },
  { name: "no picture/source/meta/base resource elements", re: /<(picture|source|meta|base)[\s>]/i },
  { name: "no alternate resource attributes", re: /\s(?:srcset|poster|background)\s*=/i },
  { name: "no hidden attribute", re: /\shidden(?:\s|=|>)/i },
  { name: "no javascript/vbscript URLs", re: /\s(?:href|src|xlink:href)\s*=\s*(["']?)\s*(?:javascript|vbscript)\s*:/i },
  { name: "no HTML data URLs", re: /\s(?:href|src|xlink:href)\s*=\s*(["']?)\s*data\s*:\s*text\/html/i },
  { name: "no CSS position in article body", re: /style\s*=\s*(["'])[\s\S]*?position\s*:/i },
  { name: "no transform/animation in article body", re: /style\s*=\s*(["'])[\s\S]*?(transform|animation|@media|@keyframes)\s*[:{]/i },
  { name: "no CSS url() or expression()", re: /style\s*=\s*(["'])[\s\S]*?(?:url\s*\(|expression\s*\()/i },
  { name: "no visually hidden content", re: /style\s*=\s*(["'])[\s\S]*?(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|font-size\s*:\s*0(?:\D|$))/i },
  {
    name: "no visible raw Markdown thematic separator",
    re: /<(p|div|span)\b[^>]*>\s*(?:<[^>]+>\s*)*(?:-{3,}|\*{3,}|_{3,})\s*(?:<\/[^>]+>\s*)*<\/\1>/i,
  },
];

let failed = 0;
for (const check of checks) {
  const match = body.match(check.re);
  if (!match) {
    console.log(`PASS ${check.name}`);
    continue;
  }
  failed++;
  const start = Math.max(0, match.index - 60);
  const end = Math.min(body.length, (match.index || 0) + 140);
  console.log(`FAIL ${check.name}`);
  console.log(body.slice(start, end).replace(/\s+/g, " ").trim());
}

const allowedTags = new Set([
  "section", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del",
  "span", "small", "sub", "sup", "br", "hr", "blockquote", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead",
  "tbody", "tfoot", "tr", "th", "td", "img", "a", "figure", "figcaption", "pre", "code", "svg", "g", "defs",
  "lineargradient", "radialgradient", "stop", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text",
  "tspan", "clippath",
]);
const unsupportedTags = [...new Set(
  [...body.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((tag) => !allowedTags.has(tag)),
)];
if (unsupportedTags.length) {
  failed++;
  console.log(`FAIL unsupported WeChat article tags: ${unsupportedTags.join(", ")}.`);
}

for (const svg of body.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi)) {
  const viewBox = svg[1].match(/\bviewBox\s*=\s*["']\s*[-+\d.]+\s+[-+\d.]+\s+([-+\d.]+)\s+([-+\d.]+)\s*["']/i);
  const viewBoxWidth = viewBox ? Number(viewBox[1]) : 0;
  if (viewBoxWidth < 600) continue;
  const tooSmall = [...svg[2].matchAll(/<text\b[^>]*\bfont-size\s*=\s*["']([\d.]+)(?:px)?["'][^>]*>/gi)]
    .map((match) => Number(match[1]))
    .filter((size) => Number.isFinite(size) && size < 22);
  if (tooSmall.length) {
    failed++;
    console.log(
      `FAIL inline SVG text is too small for a ${viewBoxWidth}px viewBox at phone width; minimum 22 SVG units, found ${Math.min(...tooSmall)}.`,
    );
  }
}

if (contentMode === "preserve") {
  const source = compactVisibleText(visibleSourceText(readFileSync(sourceArticle, "utf8")));
  const additions = approvedAddedNodes(body);
  const markerCount = (body.match(/\bdata-wlp-added\s*=/gi) || []).length;
  if (markerCount !== additions.length) {
    failed++;
    console.log("FAIL preserve mode data-wlp-added is allowed only on h1, p, or figcaption with title/subtitle/caption/source.");
  }
  const roleCounts = new Map();
  const firstImageIndex = body.search(/<img\b/i);
  for (const addition of additions) {
    roleCounts.set(addition.role, (roleCounts.get(addition.role) || 0) + 1);
    if ((addition.role === "title" && addition.tag !== "h1") || (addition.role === "subtitle" && addition.tag !== "p")) {
      failed++;
      console.log(`FAIL preserve mode approved ${addition.role} uses the wrong HTML element.`);
    }
    if ((addition.role === "title" || addition.role === "subtitle") && firstImageIndex >= 0 && addition.index > firstImageIndex) {
      failed++;
      console.log(`FAIL preserve mode approved ${addition.role} must appear before the first image.`);
    }
    if (addition.role === "caption" && !/^图注[：:]/.test(addition.text)) {
      failed++;
      console.log("FAIL preserve mode added captions must begin with 图注：.");
    }
    if (addition.role === "source" && !/^来源[：:]/.test(addition.text)) {
      failed++;
      console.log("FAIL preserve mode added source labels must begin with 来源：.");
    }
    const maxLength = addition.role === "title" ? 64 : addition.role === "subtitle" ? 100 : 200;
    if (!addition.text || addition.text.length > maxLength) {
      failed++;
      console.log(`FAIL preserve mode added ${addition.role} is empty or implausibly long.`);
    }
  }
  if ((roleCounts.get("title") || 0) > 1 || (roleCounts.get("subtitle") || 0) > 1) {
    failed++;
    console.log("FAIL preserve mode permits at most one approved added title and subtitle.");
  }
  let comparableBody = body;
  for (const addition of additions) comparableBody = comparableBody.replace(addition.full, " ");
  const output = compactVisibleText(visibleHtmlText(comparableBody));
  if (!source) {
    failed++;
    console.log("FAIL preserve mode could not extract visible source copy.");
  } else if (source !== output) {
    failed++;
    console.log("FAIL preserve mode changed, deleted, reordered, or added unapproved source copy.");
  } else {
    console.log(`PASS preserve mode exactly retained source copy; approved additions: ${additions.length}.`);
  }
}

if (completePackage) {
  const h1 = body.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  const firstImage = body.match(/<img\b[^>]*>/i);
  const paragraphMatches = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").trim(),
  );

  if (!h1 || h1.index === undefined) {
    failed++;
    console.log("FAIL complete package requires an HTML H1 title.");
  }
  if (!firstImage || firstImage.index === undefined) {
    failed++;
    console.log("FAIL complete package requires a hero/cover image after the title block.");
  }

  if (h1?.index !== undefined && firstImage?.index !== undefined) {
    const h1End = h1.index + h1[0].length;
    const subtitle = paragraphMatches.find(
      (paragraph) => paragraph.index !== undefined && paragraph.index >= h1End && paragraph.index < firstImage.index,
    );
    if (h1.index > firstImage.index) {
      failed++;
      console.log("FAIL complete package order must place H1 before the hero/cover image.");
    }
    if (!subtitle) {
      failed++;
      console.log("FAIL complete package requires a restrained subtitle paragraph between H1 and the hero/cover image.");
    }
    const imageEnd = firstImage.index + firstImage[0].length;
    const lead = paragraphMatches.find((paragraph) => {
      if (paragraph.index === undefined || paragraph.index <= imageEnd) return false;
      const tag = paragraph[0];
      const text = paragraph[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return !/font-size\s*:\s*1[012]px/i.test(tag) && !/^(图注|来源)[：:]/.test(text);
    });
    if (!lead) {
      failed++;
      console.log("FAIL complete package requires a lead paragraph after the hero/cover image.");
    }
  }

  if (sourceArticle) {
    const source = readFileSync(sourceArticle, "utf8");
    const genericHeading = /^(?:\s*#{1,6}\s*)?(写在最后|总结|结语)\s*$/gim;
    const sourceAllowsGenericHeading =
      genericHeading.test(source) ||
      /<(?:h[1-6]|p)\b[^>]*>\s*(?:<[^>]+>\s*)*(写在最后|总结|结语)\s*(?:<\/[^>]+>\s*)*<\/(?:h[1-6]|p)>/i.test(source);
    const outputGenericHeadings = [...body.matchAll(/<(h[2-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => match[2].replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim())
      .filter((text) => /^(写在最后|总结|结语)$/.test(text));
    if (outputGenericHeadings.length && !sourceAllowsGenericHeading) {
      failed++;
      console.log(
        `FAIL complete package added a generic closing heading not present in the source article: ${[...new Set(outputGenericHeadings)].join(", ")}.`,
      );
    }
  }
}

const imgs = [...body.matchAll(/<img\b[^>]*>/gi)];
for (const [tag] of imgs) {
  if (!/\ssrc\s*=/i.test(tag)) {
    failed++;
    console.log(`FAIL image missing src: ${tag}`);
  }
  if (!/\sstyle\s*=/i.test(tag)) {
    failed++;
    console.log(`FAIL image missing inline style: ${tag}`);
  }
}

const styled = [...body.matchAll(/<([a-z][a-z0-9]*)\b(?![^>]*\sstyle=)(?![^>]*\sxmlns=)[^>]*>/gi)]
  .map((m) => m[0])
  .filter((tag) => !/^<(br|svg|path|rect|circle|line|polyline|polygon|text|tspan|g|defs|linearGradient|stop|hr)\b/i.test(tag));

if (styled.length) {
  console.log("WARN some HTML tags have no inline style; this may be fine for SVG children but inspect if visible article layout depends on defaults:");
  for (const tag of styled.slice(0, 12)) console.log(`  ${tag}`);
}

if (failed) {
  console.error(`\nArticle verification failed: ${failed} issue(s).`);
  process.exit(1);
}

console.log(`\nArticle verification passed. Images: ${imgs.length}.`);

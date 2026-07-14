#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node verify-article.mjs [--complete-package] [--source-article <source>] <preview-or-fragment.html>");
  process.exit(2);
}

const args = process.argv.slice(2);
const completePackage = args.includes("--complete-package");
let sourceArticle = "";
let file = "";
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--complete-package") continue;
  if (arg === "--source-article") {
    sourceArticle = args[++index] || "";
    if (!sourceArticle) usage();
  } else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    process.exit(2);
  } else if (!file) file = arg;
  else usage();
}
if (!file) usage();

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
  { name: "no javascript/vbscript URLs", re: /\s(?:href|src|xlink:href)\s*=\s*(["']?)\s*(?:javascript|vbscript)\s*:/i },
  { name: "no HTML data URLs", re: /\s(?:href|src|xlink:href)\s*=\s*(["']?)\s*data\s*:\s*text\/html/i },
  { name: "no CSS position in article body", re: /style\s*=\s*(["'])[\s\S]*?position\s*:/i },
  { name: "no transform/animation in article body", re: /style\s*=\s*(["'])[\s\S]*?(transform|animation|@media|@keyframes)\s*[:{]/i },
  { name: "no CSS url() or expression()", re: /style\s*=\s*(["'])[\s\S]*?(?:url\s*\(|expression\s*\()/i },
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

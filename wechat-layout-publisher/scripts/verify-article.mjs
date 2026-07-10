#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node verify-article.mjs <preview-or-fragment.html>");
  process.exit(2);
}

const file = process.argv[2];
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

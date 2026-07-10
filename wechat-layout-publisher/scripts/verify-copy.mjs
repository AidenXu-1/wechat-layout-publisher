#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node verify-copy.mjs <article-preview-or-fragment.html|text.md>");
  process.exit(2);
}

const file = process.argv[2];
if (!file) usage();

const raw = readFileSync(file, "utf8");
const marker = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
const body = marker ? marker[1] : raw;

function stripHtml(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|section|blockquote|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ");
}

const text = stripHtml(body);
const lines = text
  .split(/\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const aiPatterns = [
  /不(?:只|仅|仅仅)是.+而是/,
  /不(?:只|仅|仅仅)是.+也是/,
  /不是.+而是/,
  /真正(?:的)?(?:问题|重点|核心|值得关注)/,
  /最核心的说法/,
  /更成熟的看法是/,
  /这件事的重点不是/,
  /至关重要/,
  /凸显|反映出|格局/,
];

let warnings = 0;
for (const [idx, line] of lines.entries()) {
  const cjkLength = (line.match(/[\u3400-\u9fff]/g) || []).length;
  if (cjkLength > 160) {
    warnings++;
    console.log(`WARN paragraph ${idx + 1}: ${cjkLength} CJK chars, almost certainly too dense.`);
    console.log(`  ${line.slice(0, 120)}${line.length > 120 ? "..." : ""}`);
  } else if (cjkLength > 120) {
    warnings++;
    console.log(`WARN paragraph ${idx + 1}: ${cjkLength} CJK chars, inspect for splitting.`);
  }
  for (const re of aiPatterns) {
    if (re.test(line)) {
      warnings++;
      console.log(`WARN AI-smell phrase in paragraph ${idx + 1}: ${re}`);
      console.log(`  ${line.slice(0, 120)}${line.length > 120 ? "..." : ""}`);
      break;
    }
  }
}

const boldCount = (body.match(/<strong\b|font-weight\s*:\s*(?:700|800|900)/gi) || []).length;
if (boldCount > 18) {
  warnings++;
  console.log(`WARN many bold/emphasis markers (${boldCount}). Check whether the article is becoming a wall of golden sentences.`);
}

if (!warnings) {
  console.log("Copy check passed: no obvious density or AI-smell warnings.");
} else {
  console.log(`\nCopy check completed with ${warnings} warning(s). Rewrite before final delivery when warnings match the actual prose.`);
}

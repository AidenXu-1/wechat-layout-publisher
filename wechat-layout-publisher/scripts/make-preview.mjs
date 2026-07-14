#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const templatePath = resolve(skillDir, "references", "copy-preview-template.html");

function usage() {
  console.error("Usage: node scripts/make-preview.mjs [--copy-ready] [--allow-remote] [--allow-data-uri] <article-fragment.html> <output-preview.html>");
  process.exit(1);
}

const copyReady = process.argv.includes("--copy-ready");
const allowRemote = process.argv.includes("--allow-remote");
const allowDataUri = process.argv.includes("--allow-data-uri");
const [inputArg, outputArg] = process.argv
  .slice(2)
  .filter((arg) => !["--copy-ready", "--allow-remote", "--allow-data-uri"].includes(arg));
if (!inputArg || !outputArg) usage();
if (!copyReady && (allowRemote || allowDataUri)) {
  console.error("--allow-remote and --allow-data-uri are valid only with --copy-ready.");
  process.exit(1);
}

const inputPath = resolve(process.cwd(), inputArg);
const outputPath = resolve(process.cwd(), outputArg);
const raw = readFileSync(inputPath, "utf8");
const template = readFileSync(templatePath, "utf8");

const markerMatch = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
const articleHtml = markerMatch ? markerMatch[1].trim() : raw.trim();

if (!articleHtml) {
  console.error("Article HTML is empty.");
  process.exit(1);
}

function runVerifier(script, verifierArgs) {
  const result = spawnSync(process.execPath, [resolve(scriptDir, script), ...verifierArgs], {
    cwd: scriptDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    console.error(output || `${script} failed.`);
    process.exit(1);
  }
}

if (copyReady) {
  runVerifier("verify-copy-ready.mjs", [
    ...(allowRemote ? ["--allow-remote"] : []),
    ...(allowDataUri ? ["--allow-data-uri"] : []),
    inputPath,
  ]);
} else {
  runVerifier("verify-article.mjs", [inputPath]);
}

const controls = copyReady
  ? `<div class="copy-bar">
    <button class="btn-copy" onclick="copyArticle()">复制到公众号正文</button>
    <button class="btn-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">回到顶部</button>
  </div>`
  : `<div class="local-note">本地预览：图片可能无法随正文复制，请使用发布脚本生成公众号复制版。</div>`;
const rendered = template
  .replace("{{ARTICLE_HTML}}", articleHtml)
  .replace("{{PREVIEW_LABEL}}", copyReady ? "公众号复制版" : "公众号本地预览")
  .replace("{{PREVIEW_CONTROLS}}", controls);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, "utf8");
console.log(outputPath);

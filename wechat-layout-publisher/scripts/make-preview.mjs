#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const templatePath = resolve(skillDir, "assets", "copy-preview-template.html");

function usage() {
  console.error("Usage: node scripts/make-preview.mjs <article-fragment.html> <output-preview.html>");
  console.error("Formal copy-ready previews must be produced by publish.ts after image-plan and visual-QA validation.");
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
if (cliArgs.some((arg) => arg.startsWith("--"))) usage();
const [inputArg, outputArg] = cliArgs;
if (!inputArg || !outputArg) usage();

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

runVerifier("verify-article.mjs", [inputPath]);

const controls = `<div class="local-note">本地预览：图片可能无法随正文复制，请使用发布脚本生成经过图片计划和视觉审查的正式复制版。</div>`;
const rendered = template
  .replace("{{ARTICLE_HTML}}", articleHtml)
  .replace("{{PREVIEW_LABEL}}", "公众号本地预览")
  .replace("{{PREVIEW_CONTROLS}}", controls);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, rendered, "utf8");
console.log(outputPath);

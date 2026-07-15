#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const skillFile = resolve(skillDir, "SKILL.md");
const raw = readFileSync(skillFile, "utf8");
const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter) throw new Error("SKILL.md has no YAML frontmatter.");

const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
if (!name || !description) throw new Error("SKILL.md frontmatter requires name and description.");
if (!/^[a-z0-9-]+$/.test(name) || name.length > 64) throw new Error(`Invalid skill name: ${name}`);
if (basename(skillDir) !== name) throw new Error(`Skill folder ${basename(skillDir)} does not match name ${name}.`);

for (const required of [
  "agents/openai.yaml",
  "scripts/package.json",
  "scripts/layout-qa.ts",
  "scripts/visual-qa.ts",
  "scripts/validate-image-plan.mjs",
  "references/image-placement.md",
  "references/qa-checklist.md",
  "references/upstream-handoff.md",
]) {
  if (!existsSync(resolve(skillDir, required))) throw new Error(`Missing required Skill file: ${required}`);
}

for (const marker of [
  "A. 杂乱资料：梳理并产出公众号定稿文案，再配图排版",
  "B. 初稿文案：检查优化内容细节并产出定稿，再配图排版",
  "C. 发布定稿：保持文案内容不变，只做配图、排版和格式规范",
  "A. 仅先产出可复制版文稿，便于查看和修改",
  "B. 完成全部制作和自检后，直接放入公众号草稿箱",
  "interaction_contract_version: 2",
  "content_choice: A | B | C",
  "choice_source: direct_user | upstream_user_confirmation",
  "entry_mode: skill_handoff",
  "target_capability: wechat_article_production",
  "destination: wechat_official_account",
  "handoff_version: 1",
  "任意上游 Skill",
  "只写正文",
  "input_stage: messy_materials",
  "delivery_mode: copy_ready",
  "draft_authorization: direct_request",
  "body_image_upload_authorization: copy_ready_request",
  "body_image_upload_authorization: draft_request",
  "post_preview_confirmation",
  "density_override_reason",
  "first_section_visual_anchor",
  "semantic_signature",
  "asset_dimensions",
  "crop_strategy: focused | full_context",
  "data-wlp-visual-block",
  "npm run verify-layout",
  "asset_sha256",
  "是否继续加入公众号草稿箱",
]) {
  if (!raw.includes(marker)) throw new Error(`SKILL.md is missing workflow-contract marker: ${marker}`);
}

const publishing = readFileSync(resolve(skillDir, "references/publishing.md"), "utf8");
for (const marker of [
  "--image-plan <image-plan.json>",
  "--confirm-no-unexplained-gaps",
  "--confirm-no-semantic-duplicates",
  "--confirm-stable-full-page-capture",
  "受保护下载器",
  "本地母版",
]) {
  if (!publishing.includes(marker)) throw new Error(`references/publishing.md is missing delivery marker: ${marker}`);
}

const openaiYaml = readFileSync(resolve(skillDir, "agents/openai.yaml"), "utf8");
if (!/allow_implicit_invocation:\s*true/.test(openaiYaml)) {
  throw new Error("agents/openai.yaml must allow implicit invocation for direct and upstream Skill triggers.");
}

console.log("Skill package metadata passed.");

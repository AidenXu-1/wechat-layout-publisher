#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const read = (file) => readFileSync(resolve(skillDir, file), "utf8");
const raw = read("SKILL.md");
const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter) throw new Error("SKILL.md has no YAML frontmatter.");

const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
if (!name || !description) throw new Error("SKILL.md frontmatter requires name and description.");
if (!/^[a-z0-9-]+$/.test(name) || name.length > 64) throw new Error(`Invalid skill name: ${name}`);
if (basename(skillDir) !== name) throw new Error(`Skill folder ${basename(skillDir)} does not match name ${name}.`);

const skillLines = raw.split(/\r?\n/).length;
const skillBytes = Buffer.byteLength(raw, "utf8");
if (skillLines > 140 || skillBytes > 12000) {
  throw new Error(`SKILL.md exceeds the lightweight runtime budget: ${skillLines} lines / ${skillBytes} bytes.`);
}

for (const required of [
  "agents/openai.yaml",
  "assets/copy-preview-template.html",
  "assets/image-plan.template.json",
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
  "choice_source: direct_user | upstream_user_confirmation",
  "entry_mode: direct | skill_handoff",
  "destination: wechat_official_account",
  "handoff_version: 1",
  "任意上游 Skill",
  "只要正文",
  "input_stage: messy_materials",
  "delivery_mode: copy_ready",
  "draft_authorization: direct_request",
  "body_image_upload_authorization: copy_ready_request",
  "body_image_upload_authorization: draft_request",
  "post_preview_confirmation",
  "--allow-legacy-editorial",
  "editorial_contract_version: 1",
  "editorial_plan",
  "voice_fingerprint",
  "revision_priorities",
  "assets/image-plan.template.json",
  "ARTICLE HTML START",
  "ARTICLE HTML END",
  "data-wlp-visual-id",
  "npm run verify-layout",
  "是否继续加入公众号草稿箱",
]) {
  if (!raw.includes(marker)) throw new Error(`SKILL.md is missing runtime marker: ${marker}`);
}

const publishing = read("references/publishing.md");
for (const marker of [
  "--image-plan <image-plan.json>",
  "--confirm-no-unexplained-gaps",
  "--confirm-no-semantic-duplicates",
  "--confirm-stable-full-page-capture",
  "--allow-legacy-editorial",
  "受保护下载器",
  "本地母版",
]) {
  if (!publishing.includes(marker)) throw new Error(`references/publishing.md is missing delivery marker: ${marker}`);
}

const editorial = read("references/editorial-writing.md");
for (const marker of ["杂乱资料成文流程", "读者追问", "叙事骨架", "证据参与叙事", "受控的粗粝感", "声音指纹", "定稿自检"]) {
  if (!editorial.includes(marker)) throw new Error(`references/editorial-writing.md is missing editorial marker: ${marker}`);
}

const contentPlanning = read("references/content-planning.md");
for (const marker of [
  '"editorial_contract_version": 1',
  '"editorial_plan"',
  '"narrative_spine"',
  '"evidence_sequence"',
  '"structure_mode"',
  '"voice_fingerprint"',
  '"revision_priorities"',
]) {
  if (!contentPlanning.includes(marker)) throw new Error(`references/content-planning.md is missing editorial-plan marker: ${marker}`);
}

const imagePlacement = read("references/image-placement.md");
for (const marker of [
  "assets/image-plan.template.json",
  "density_override_reason",
  "first_section_visual_anchor",
  "semantic_signature",
  "asset_dimensions",
  "crop_strategy: focused",
  "crop_strategy: full_context",
  "asset_sha256",
]) {
  if (!imagePlacement.includes(marker)) throw new Error(`references/image-placement.md is missing image-contract marker: ${marker}`);
}

const qaChecklist = read("references/qa-checklist.md");
for (const marker of ["npm run verify-layout", "npm run verify-copy-ready"]) {
  if (!qaChecklist.includes(marker)) throw new Error(`references/qa-checklist.md is missing QA marker: ${marker}`);
}

if (!read("references/components.md").includes("data-wlp-visual-block")) {
  throw new Error("references/components.md is missing the strong-visual marker contract.");
}

const planTemplate = JSON.parse(read("assets/image-plan.template.json"));
if (planTemplate.interaction_contract_version !== 2 || planTemplate.editorial_contract_version !== 1) {
  throw new Error("assets/image-plan.template.json must carry the current interaction and editorial contract versions.");
}

const packageJson = JSON.parse(read("scripts/package.json"));
if (packageJson.dependencies?.marked || existsSync(resolve(skillDir, "scripts/imagegen.ts"))) {
  throw new Error("Obsolete Markdown rendering or unused API image-generation runtime has returned to the Skill package.");
}

for (const file of [".env.example", "scripts/credentials.ts", "scripts/setup-credentials.ts", "references/publishing.md"]) {
  if (/OPENAI_API_KEY|OPENAI_IMAGE_MODEL/.test(read(file))) {
    throw new Error(`${file} contains unused OpenAI credentials; native image tools own generation.`);
  }
}

const openaiYaml = read("agents/openai.yaml");
if (!/allow_implicit_invocation:\s*true/.test(openaiYaml)) {
  throw new Error("agents/openai.yaml must allow implicit invocation for direct and upstream Skill triggers.");
}

console.log(`Skill package metadata passed. SKILL.md: ${skillLines} lines / ${skillBytes} bytes.`);

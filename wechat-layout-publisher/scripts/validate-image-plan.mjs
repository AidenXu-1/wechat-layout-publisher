#!/usr/bin/env node
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const args = process.argv.slice(2);
let stage = "final";
let allowEvidenceFailure = false;
let checkFiles = false;
let articleFile = "";
let file = "";
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--stage") stage = args[++index] || "";
  else if (arg === "--article") articleFile = args[++index] || "";
  else if (arg === "--allow-evidence-failure") allowEvidenceFailure = true;
  else if (arg === "--check-files") checkFiles = true;
  else if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    process.exit(2);
  } else if (!file) file = arg;
  else {
    console.error(`Unexpected positional argument: ${arg}`);
    process.exit(2);
  }
}

if (!file || !["plan", "final"].includes(stage)) {
  console.error("Usage: node validate-image-plan.mjs [--stage plan|final] [--article <article>] [--check-files] [--allow-evidence-failure] <image-plan.json>");
  process.exit(2);
}

let plan;
try {
  plan = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Invalid image plan JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const issues = [];
const warnings = [];
const contentTypes = new Set(["news_event", "mixed_news_commentary", "product_tool", "opinion", "knowledge", "experience", "narrative"]);
const sourceTypes = new Set(["user_asset", "evidence_screenshot", "generated_image", "coded_visual"]);
const roles = new Set(["hero", "evidence", "explainer", "data", "object", "divider"]);
const codedKinds = new Set(["process", "relationship", "timeline", "framework", "comparison", "data", "mechanism"]);
const newsTypes = new Set(["news_event", "mixed_news_commentary"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function detectPngOrJpeg(buffer) {
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return png || jpeg;
}

function validDataImage(value) {
  const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || match[2].length % 4 !== 0) return false;
  const buffer = Buffer.from(match[2], "base64");
  return (
    buffer.length > 0 &&
    buffer.toString("base64").replace(/=+$/, "") === match[2].replace(/=+$/, "") &&
    detectPngOrJpeg(buffer)
  );
}

function localImageIsValid(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return false;
  const fd = openSync(path, "r");
  try {
    const header = Buffer.alloc(16);
    const bytes = readSync(fd, header, 0, header.length, 0);
    return detectPngOrJpeg(header.subarray(0, bytes));
  } finally {
    closeSync(fd);
  }
}

function localCodedAssetIsValid(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return false;
  const extension = extname(path).toLowerCase();
  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") return localImageIsValid(path);
  if (extension !== ".svg" && extension !== ".html" && extension !== ".htm") return false;
  if (statSync(path).size > 2 * 1024 * 1024) return false;
  const raw = readFileSync(path, "utf8");
  if (extension === ".svg" && !/<svg[\s>]/i.test(raw)) return false;
  if (extension !== ".svg" && !/<(?:section|div|table|svg|p)[\s>]/i.test(raw)) return false;
  const resourceRefs = [...raw.matchAll(/\s(?:href|src|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(
    (match) => match[1] || match[2] || match[3] || "",
  );
  if (resourceRefs.some((value) => !(value.startsWith("#") || validDataImage(value)))) return false;
  return !(
    /<(?:script|style|iframe|object|embed|form|input|link)[\s>]/i.test(raw) ||
    /\s(?:class|id)\s*=/i.test(raw) ||
    /\son[a-z]+\s*=/i.test(raw) ||
    /style\s*=\s*(["'])[\s\S]*?(?:url\s*\(|expression\s*\(|position\s*:|animation\s*:|transform\s*:)/i.test(raw)
  );
}

function detectNewsSignals(raw) {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const rules = [
    ["public source or attribution", /(https?:\/\/|\bReddit\b|\bTwitter\b|\bX\.com\b|X\s*平台|微博|官方|官网|公告|声明|媒体|报道|论文|报告)/i],
    ["public event action", /(发布|宣布|回应|上线|下架|封禁|被封|争议|起诉|收购|融资|泄露|推出|暂停|恢复|爆料|热议|went\s+viral|announc|launch|release|respond|ban(?:ned)?|lawsuit|acqui)/i],
    ["time-sensitive wording", /(20\d{2}[\-\/.\u5e74]\d{1,2}(?:[\-\/.\u6708]\d{1,2}日?)?|近日|最近|今天|昨日|本周|最新|刚刚|today|yesterday|recently|latest|this\s+week)/i],
    ["reported quote or response", /(据.{0,12}(报道|消息|公告|声明)|表示|回应称|接受.{0,8}采访|according\s+to|reported\s+by|said\s+in\s+a\s+statement)/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

if (!contentTypes.has(plan.content_type)) issues.push(`Unknown content_type: ${String(plan.content_type)}`);
if (typeof plan.classification_confidence !== "number" || plan.classification_confidence < 0 || plan.classification_confidence > 1) {
  issues.push("classification_confidence must be a number from 0 to 1.");
}
if (!Array.isArray(plan.classification_signals) || !plan.classification_signals.some(nonEmpty)) {
  issues.push("classification_signals must record the semantic evidence used to classify the article.");
}
if (!new Set(["available", "unavailable"]).has(plan.image_generation_capability)) {
  issues.push("image_generation_capability must be available or unavailable.");
}
if (plan.image_generation_capability === "available" && !nonEmpty(plan.image_generation_tool)) {
  issues.push("image_generation_tool is required when image generation is available.");
}

if (articleFile) {
  if (!existsSync(articleFile)) issues.push(`Article file not found: ${articleFile}`);
  else {
    const detectedSignals = detectNewsSignals(readFileSync(articleFile, "utf8"));
    if (detectedSignals.length >= 2 && !newsTypes.has(plan.content_type)) {
      issues.push(`Article looks news-like but content_type=${plan.content_type}. Detected: ${detectedSignals.join(", ")}. Reclassify as news_event or mixed_news_commentary.`);
    }
  }
}

const suppliedAssets = Array.isArray(plan.supplied_assets) ? plan.supplied_assets : [];
const assetsById = new Map();
for (const [index, asset] of suppliedAssets.entries()) {
  const label = `supplied_assets[${index}]`;
  if (!nonEmpty(asset.id)) issues.push(`${label}.id is required.`);
  else if (assetsById.has(asset.id)) issues.push(`Duplicate supplied asset id: ${asset.id}`);
  else assetsById.set(asset.id, asset);
  if (!new Set(["image", "video"]).has(asset.kind)) issues.push(`${label}.kind must be image or video.`);
  if (!new Set(["relevant", "not_relevant", "unclear"]).has(asset.relevance)) issues.push(`${label}.relevance is required.`);
  if (!new Set(["use", "skip"]).has(asset.decision)) issues.push(`${label}.decision must be use or skip.`);
  if (asset.relevance === "relevant" && asset.decision === "skip" && !nonEmpty(asset.override_reason)) {
    issues.push(`${label} is relevant but skipped without override_reason.`);
  }
  if (!nonEmpty(asset.semantic_reason)) issues.push(`${label}.semantic_reason is required.`);
}

if (!Array.isArray(plan.visuals) || plan.visuals.length === 0) issues.push("visuals must contain at least one planned visual.");
const visuals = Array.isArray(plan.visuals) ? plan.visuals : [];
const orders = new Set();
const referencedAssets = new Set();

for (const [index, visual] of visuals.entries()) {
  const label = `visuals[${index}]`;
  const generatedFallback = visual.source_type === "coded_visual" && visual.fallback_for === "generated_image";
  if (!nonEmpty(visual.id)) issues.push(`${label}.id is required.`);
  if (!Number.isInteger(visual.order) || visual.order < 1) issues.push(`${label}.order must be a positive integer.`);
  else if (orders.has(visual.order)) issues.push(`Duplicate visual order: ${visual.order}`);
  else orders.add(visual.order);
  if (!sourceTypes.has(visual.source_type)) issues.push(`${label}.source_type must use one of the four material routes.`);
  if (!roles.has(visual.role)) issues.push(`${label}.role is invalid.`);
  if (!nonEmpty(visual.section) || !nonEmpty(visual.placement)) issues.push(`${label} needs section and placement.`);
  if (!nonEmpty(visual.semantic_reason)) issues.push(`${label}.semantic_reason must explain why this route fits the nearby text.`);
  if (stage === "final" && visual.status !== "ready" && visual.status !== "captured" && visual.status !== "attempt_failed") {
    issues.push(`${label}.status must be ready, captured, or attempt_failed at final stage.`);
  }

  if (visual.source_type === "user_asset") {
    if (!nonEmpty(visual.asset_ref) || !assetsById.has(visual.asset_ref)) issues.push(`${label}.asset_ref must match a supplied asset.`);
    else {
      referencedAssets.add(visual.asset_ref);
      const supplied = assetsById.get(visual.asset_ref);
      if (supplied.kind === "video" && !nonEmpty(visual.frame_timestamp)) {
        issues.push(`${label}.frame_timestamp is required when extracting a still from user video.`);
      }
    }
  }

  if (visual.source_type === "evidence_screenshot") {
    if (visual.role !== "evidence") issues.push(`${label} evidence_screenshot must use role=evidence.`);
    if (!nonEmpty(visual.source_url) || !/^https?:\/\//i.test(visual.source_url)) issues.push(`${label}.source_url must be an http(s) source.`);
    if (!new Set(["official", "primary_social", "reputable_media", "community"]).has(visual.source_tier)) {
      issues.push(`${label}.source_tier must identify the evidence authority.`);
    }
    if (visual.status === "attempt_failed" && !nonEmpty(visual.failure_reason)) issues.push(`${label}.failure_reason is required.`);
  }

  if (visual.source_type === "generated_image") {
    if (!nonEmpty(visual.prompt)) issues.push(`${label}.prompt is required for generated images.`);
    if (plan.image_generation_capability === "available") {
      if (!nonEmpty(visual.provider)) issues.push(`${label}.provider is required when image generation is available.`);
      if (plan.runtime === "codex" && !new Set(["imagegen", "codex-imagegen"]).has(visual.provider)) {
        issues.push(`${label} must use the Codex Image Gen tool because runtime=codex.`);
      }
    } else if (stage === "plan") {
      issues.push(`${label} cannot remain generated_image when this Agent has no image-generation capability. Create a coded_visual fallback with fallback_for=generated_image.`);
    } else if (visual.provider !== "external_user_supplied" || visual.user_decision !== "replace_externally") {
      issues.push(`${label} on an unavailable Agent must be an externally returned image with provider=external_user_supplied and user_decision=replace_externally.`);
    }
  }

  if (visual.source_type === "coded_visual") {
    if (generatedFallback) {
      if (plan.image_generation_capability !== "unavailable") issues.push(`${label} generated fallback is allowed only when image generation is unavailable.`);
      if (visual.role === "evidence") issues.push(`${label} generated fallback can never be evidence.`);
      if (visual.semantic_kind !== "editorial_fallback") issues.push(`${label}.semantic_kind must be editorial_fallback.`);
      if (!nonEmpty(visual.desired_generation_prompt)) issues.push(`${label}.desired_generation_prompt is required for external replacement.`);
      if (!nonEmpty(visual.fallback_reason)) issues.push(`${label}.fallback_reason is required.`);
      if (!new Set(["pending", "accept_current", "replace_externally"]).has(visual.user_decision)) {
        issues.push(`${label}.user_decision must be pending, accept_current, or replace_externally.`);
      }
      if (stage === "final" && visual.user_decision === "pending") issues.push(`${label} still needs the user's fallback decision.`);
      if (stage === "final" && visual.user_decision === "replace_externally") {
        issues.push(`${label} should be replaced by a generated_image item after the external image is returned.`);
      }
    } else {
      if (!new Set(["explainer", "data"]).has(visual.role)) issues.push(`${label} coded_visual is only for explainer or data roles.`);
      if (!codedKinds.has(visual.semantic_kind)) issues.push(`${label}.semantic_kind must be a structural visual kind.`);
    }
  }

  if (stage === "final" && visual.status !== "attempt_failed" && !nonEmpty(visual.asset_path)) {
    issues.push(`${label}.asset_path is required at final stage.`);
  }
  if (checkFiles && stage === "final" && visual.status !== "attempt_failed" && nonEmpty(visual.asset_path)) {
    if (/^https?:/i.test(visual.asset_path)) {
      issues.push(`${label}.asset_path must be a downloaded local PNG/JPEG for final verification, not a remote URL.`);
    } else if (/^data:/i.test(visual.asset_path)) {
      if (!validDataImage(visual.asset_path)) issues.push(`${label}.asset_path is not a valid PNG/JPEG data URI.`);
    } else {
      const resolvedPath = resolve(dirname(file), visual.asset_path);
      const valid = visual.source_type === "coded_visual" ? localCodedAssetIsValid(resolvedPath) : localImageIsValid(resolvedPath);
      if (!valid) {
        const expected = visual.source_type === "coded_visual" ? "safe PNG/JPEG/SVG/inline-HTML file" : "PNG/JPEG file";
        issues.push(`${label}.asset_path must be an existing ${expected}: ${visual.asset_path}`);
      }
    }
  }
}

const firstVisual = [...visuals].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
const firstIsGeneratedFallback = firstVisual?.source_type === "coded_visual" && firstVisual?.fallback_for === "generated_image";
if (firstVisual?.source_type === "coded_visual" && !firstIsGeneratedFallback) {
  issues.push("The first visual must not be a coded_visual; use a relevant user asset, evidence image, or generated editorial image.");
}

if (
  plan.image_generation_capability === "unavailable" &&
  visuals.some(
    (visual) =>
      visual.fallback_for === "generated_image" ||
      (visual.source_type === "generated_image" && visual.provider === "external_user_supplied"),
  )
) {
  if (!nonEmpty(plan.generation_capability_notice)) {
    issues.push("generation_capability_notice is required when a coded fallback replaces unavailable image generation.");
  }
}

for (const asset of suppliedAssets) {
  if (asset.relevance === "relevant" && asset.decision === "use" && !referencedAssets.has(asset.id)) {
    issues.push(`Relevant supplied asset ${asset.id} is marked use but is not referenced by any visual.`);
  }
}

if (newsTypes.has(plan.content_type)) {
  const evidence = visuals.filter((visual) => visual.source_type === "evidence_screenshot");
  if (!evidence.length) issues.push("News or mixed news commentary requires an evidence_screenshot route.");
  if (stage === "final" && !evidence.some((visual) => visual.status === "captured")) {
    const documentedFailures = evidence.length > 0 && evidence.every((visual) => visual.status === "attempt_failed" && nonEmpty(visual.failure_reason));
    if (allowEvidenceFailure && documentedFailures) warnings.push("No evidence screenshot was captured; documented failures were explicitly allowed.");
    else issues.push("Final news package requires at least one captured evidence screenshot. Use --allow-evidence-failure only for documented access failures.");
  }
}

for (const warning of warnings) console.log(`WARN ${warning}`);
if (issues.length) {
  for (const issue of issues) console.error(`FAIL ${issue}`);
  console.error(`\nImage plan validation failed: ${issues.length} issue(s).`);
  process.exit(1);
}
console.log(`Image plan passed (${stage}). Visuals: ${visuals.length}. Warnings: ${warnings.length}.`);

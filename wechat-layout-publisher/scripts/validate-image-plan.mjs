#!/usr/bin/env node
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import sharp from "sharp";

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
const contentModes = new Set(["rewrite", "preserve"]);
const entryModes = new Set(["direct", "skill_handoff"]);
const inputStages = new Set(["messy_materials", "draft_copy", "final_copy"]);
const deliveryModes = new Set(["copy_ready", "draft"]);
const draftAuthorizations = new Set(["none", "direct_request", "post_preview_confirmation"]);
const bodyImageUploadAuthorizations = new Set(["copy_ready_request", "draft_request", "post_preview_confirmation"]);
const choiceSources = new Set(["direct_user", "upstream_user_confirmation"]);
const sourceTypes = new Set(["user_asset", "evidence_screenshot", "generated_image", "coded_visual"]);
const roles = new Set(["hero", "evidence", "explainer", "data", "object", "divider"]);
const codedKinds = new Set(["process", "relationship", "timeline", "framework", "comparison", "data", "mechanism"]);
const newsTypes = new Set(["news_event", "mixed_news_commentary"]);
const headlineRatio = 900 / 383;
const evidenceFailureCodes = new Set(["http_error", "access_denied", "login_required", "network_error", "removed", "policy_blocked"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function semanticSignature(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(nonEmpty).map((item) => item.trim().toLowerCase()))];
}

function validDimensions(value) {
  return (
    value &&
    typeof value === "object" &&
    Number.isInteger(value.width) &&
    value.width > 0 &&
    Number.isInteger(value.height) &&
    value.height > 0
  );
}

function validDataSource(value) {
  return (
    nonEmpty(value) &&
    (/^https?:\/\//i.test(value.trim()) || /^sha256:[a-f0-9]{64}$/i.test(value.trim()) || /^user-provided:.+/i.test(value.trim()))
  );
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

async function visualDimensions(assetPath) {
  if (/^data:/i.test(assetPath)) {
    const match = assetPath.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) return undefined;
    const metadata = await sharp(Buffer.from(match[2], "base64")).metadata();
    return metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : undefined;
  }
  const resolvedPath = resolve(dirname(file), assetPath);
  const extension = extname(resolvedPath).toLowerCase();
  if (![".svg", ".html", ".htm"].includes(extension)) {
    const metadata = await sharp(resolvedPath).metadata();
    return metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : undefined;
  }
  if (extension === ".svg") {
    const raw = readFileSync(resolvedPath, "utf8");
    const viewBox = raw.match(/\bviewBox\s*=\s*["']\s*[-+\d.]+\s+[-+\d.]+\s+([-+\d.]+)\s+([-+\d.]+)\s*["']/i);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    const width = raw.match(/<svg\b[^>]*\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1];
    const height = raw.match(/<svg\b[^>]*\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };
  }
  return undefined;
}

function rasterBuffer(assetPath) {
  if (/^data:/i.test(assetPath)) {
    const match = assetPath.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
    return match ? Buffer.from(match[2], "base64") : undefined;
  }
  const resolvedPath = resolve(dirname(file), assetPath);
  return localImageIsValid(resolvedPath) ? readFileSync(resolvedPath) : undefined;
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
if (plan.interaction_contract_version !== 2) {
  issues.push("interaction_contract_version must be 2 so the current three-mode opening contract cannot silently regress.");
}
if (!new Set(["A", "B", "C"]).has(plan.content_choice)) {
  issues.push("content_choice must record A, B, or C from the three content-processing modes.");
}
if (!new Set(["A", "B"]).has(plan.delivery_choice)) {
  issues.push("delivery_choice must record A or B from the delivery modes.");
}
if (!choiceSources.has(plan.choice_source)) {
  issues.push("choice_source must be direct_user or upstream_user_confirmation.");
}
if (plan.destination !== "wechat_official_account") {
  issues.push("destination must be wechat_official_account for this Skill.");
}
if (!contentModes.has(plan.content_mode)) issues.push("content_mode must be rewrite or preserve.");
if (!entryModes.has(plan.entry_mode)) issues.push("entry_mode must be direct or skill_handoff.");
if (!inputStages.has(plan.input_stage)) issues.push("input_stage must be messy_materials, draft_copy, or final_copy.");
if (!deliveryModes.has(plan.delivery_mode)) issues.push("delivery_mode must be copy_ready or draft.");
if (!draftAuthorizations.has(plan.draft_authorization)) {
  issues.push("draft_authorization must be none, direct_request, or post_preview_confirmation.");
}
if (!bodyImageUploadAuthorizations.has(plan.body_image_upload_authorization)) {
  issues.push("body_image_upload_authorization must record copy_ready_request, draft_request, or post_preview_confirmation.");
}
if (plan.entry_mode === "skill_handoff" && !nonEmpty(plan.source_skill)) {
  issues.push("source_skill is required when entry_mode=skill_handoff.");
}
if (plan.entry_mode === "skill_handoff" && plan.handoff_version !== 1) {
  issues.push("handoff_version must be 1 when entry_mode=skill_handoff.");
}
if (plan.entry_mode === "direct" && plan.choice_source === "upstream_user_confirmation") {
  issues.push("entry_mode=direct cannot use choice_source=upstream_user_confirmation.");
}
const contentChoiceContract = {
  A: ["messy_materials", "rewrite"],
  B: ["draft_copy", "rewrite"],
  C: ["final_copy", "preserve"],
};
const selectedContentContract = contentChoiceContract[plan.content_choice];
if (
  selectedContentContract &&
  (plan.input_stage !== selectedContentContract[0] || plan.content_mode !== selectedContentContract[1])
) {
  issues.push(
    `content_choice=${plan.content_choice} must map to input_stage=${selectedContentContract[0]} and content_mode=${selectedContentContract[1]}.`,
  );
}
const deliveryChoiceContract = { A: "copy_ready", B: "draft" };
if (deliveryChoiceContract[plan.delivery_choice] && plan.delivery_mode !== deliveryChoiceContract[plan.delivery_choice]) {
  issues.push(`delivery_choice=${plan.delivery_choice} must map to delivery_mode=${deliveryChoiceContract[plan.delivery_choice]}.`);
}
if (new Set(["messy_materials", "draft_copy"]).has(plan.input_stage) && plan.content_mode !== "rewrite") {
  issues.push(`${plan.input_stage} must use content_mode=rewrite.`);
}
if (plan.input_stage === "final_copy" && plan.content_mode !== "preserve") {
  issues.push("final_copy must use content_mode=preserve.");
}
if (plan.delivery_mode === "copy_ready" && plan.draft_authorization !== "none") {
  issues.push("delivery_mode=copy_ready must use draft_authorization=none.");
}
if (plan.delivery_mode === "copy_ready" && plan.body_image_upload_authorization !== "copy_ready_request") {
  issues.push("delivery_mode=copy_ready requires body_image_upload_authorization=copy_ready_request.");
}
if (plan.delivery_mode === "draft" && !new Set(["direct_request", "post_preview_confirmation"]).has(plan.draft_authorization)) {
  issues.push("delivery_mode=draft requires explicit draft_authorization.");
}
if (
  plan.delivery_mode === "draft" &&
  !new Set(["draft_request", "post_preview_confirmation"]).has(plan.body_image_upload_authorization)
) {
  issues.push("delivery_mode=draft requires explicit body-image upload authorization.");
}
if (!nonEmpty(plan.runtime)) issues.push("runtime is required so provider checks cannot be bypassed.");
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
const firstSectionAnchor = plan.first_section_visual_anchor;
if (!firstSectionAnchor || typeof firstSectionAnchor !== "object") {
  issues.push("first_section_visual_anchor is required and must record present, skipped, or not_applicable.");
} else if (!new Set(["present", "skipped", "not_applicable"]).has(firstSectionAnchor.status)) {
  issues.push("first_section_visual_anchor.status must be present, skipped, or not_applicable.");
} else if (firstSectionAnchor.status === "present" && !nonEmpty(firstSectionAnchor.visual_id)) {
  issues.push("first_section_visual_anchor.visual_id is required when status=present.");
} else if (
  new Set(["skipped", "not_applicable"]).has(firstSectionAnchor.status) &&
  (!nonEmpty(firstSectionAnchor.skip_reason) || firstSectionAnchor.skip_reason.replace(/\s+/g, "").length < 12)
) {
  issues.push("Skipping the first-section visual anchor requires a concrete skip_reason of at least 12 characters.");
}

if (articleFile) {
  if (!existsSync(articleFile)) issues.push(`Article file not found: ${articleFile}`);
  else {
    const detectedSignals = detectNewsSignals(readFileSync(articleFile, "utf8"));
    const hasEventAction = detectedSignals.includes("public event action");
    const highConfidenceNews = hasEventAction && detectedSignals.length >= 3;
    if (highConfidenceNews && !newsTypes.has(plan.content_type)) {
      issues.push(`Article looks news-like but content_type=${plan.content_type}. Detected: ${detectedSignals.join(", ")}. Reclassify as news_event or mixed_news_commentary.`);
    } else if (hasEventAction && detectedSignals.length >= 2 && !newsTypes.has(plan.content_type)) {
      warnings.push(
        `Article contains some news-like wording but lacks enough combined evidence for forced reclassification: ${detectedSignals.join(", ")}. Review context manually.`,
      );
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
const visualIds = new Set();
const referencedAssets = new Set();

for (const [index, visual] of visuals.entries()) {
  const label = `visuals[${index}]`;
  const generatedFallback = visual.source_type === "coded_visual" && visual.fallback_for === "generated_image";
  if (!nonEmpty(visual.id)) issues.push(`${label}.id is required.`);
  else if (visualIds.has(visual.id)) issues.push(`Duplicate visual id: ${visual.id}`);
  else visualIds.add(visual.id);
  if (!Number.isInteger(visual.order) || visual.order < 1) issues.push(`${label}.order must be a positive integer.`);
  else if (orders.has(visual.order)) issues.push(`Duplicate visual order: ${visual.order}`);
  else orders.add(visual.order);
  if (!sourceTypes.has(visual.source_type)) issues.push(`${label}.source_type must use one of the four material routes.`);
  if (!roles.has(visual.role)) issues.push(`${label}.role is invalid.`);
  if (!nonEmpty(visual.section) || !nonEmpty(visual.placement)) issues.push(`${label} needs section and placement.`);
  if (!nonEmpty(visual.semantic_reason)) issues.push(`${label}.semantic_reason must explain why this route fits the nearby text.`);
  const signature = semanticSignature(visual.semantic_signature);
  if (visual.role !== "hero" && visual.status !== "attempt_failed" && (signature.length < 2 || signature.length > 12)) {
    issues.push(`${label}.semantic_signature must contain 2-12 distinct nearby labels, numbers, or step names for repetition checks.`);
  }
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
    if (!new Set(["focused", "full_context"]).has(visual.crop_strategy)) {
      issues.push(`${label}.crop_strategy must be focused or full_context.`);
    }
    if (stage === "final" && visual.status === "captured") {
      if (!nonEmpty(visual.captured_at) || !Number.isFinite(Date.parse(visual.captured_at))) {
        issues.push(`${label}.captured_at must record when the source screenshot was taken.`);
      }
      if (!/^sha256:[a-f0-9]{64}$/i.test(visual.asset_sha256 || "")) {
        issues.push(`${label}.asset_sha256 must bind the captured screenshot bytes as sha256:<64-hex>.`);
      }
    }
    if (visual.status === "attempt_failed") {
      if (!nonEmpty(visual.failure_reason)) issues.push(`${label}.failure_reason is required.`);
      if (!evidenceFailureCodes.has(visual.failure_code)) issues.push(`${label}.failure_code must use a structured access-failure code.`);
      if (!nonEmpty(visual.attempted_at) || !Number.isFinite(Date.parse(visual.attempted_at))) {
        issues.push(`${label}.attempted_at must record when evidence access failed.`);
      }
    }
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

  if (visual.role === "data" || visual.semantic_kind === "data") {
    if (!Array.isArray(visual.data_sources) || !visual.data_sources.length || !visual.data_sources.every(validDataSource)) {
      issues.push(
        `${label}.data_sources must use http(s) URLs, sha256:<64-hex>, or user-provided:<description> for every data source.`,
      );
    }
  }

  if (stage === "final" && visual.status !== "attempt_failed" && !nonEmpty(visual.asset_path)) {
    issues.push(`${label}.asset_path is required at final stage.`);
  }
  if (stage === "final" && visual.status !== "attempt_failed" && !validDimensions(visual.asset_dimensions)) {
    issues.push(`${label}.asset_dimensions must record positive integer width and height at final stage.`);
  }
  if (
    stage === "final" &&
    visual.source_type === "evidence_screenshot" &&
    validDimensions(visual.asset_dimensions) &&
    visual.asset_dimensions.height / visual.asset_dimensions.width > 1.55
  ) {
    if (visual.crop_strategy !== "full_context") {
      issues.push(`${label} remains a tall screenshot after focused cropping; crop to the key evidence area or mark full_context with a reason.`);
    }
    if (!nonEmpty(visual.full_context_reason) || visual.full_context_reason.replace(/\s+/g, "").length < 12) {
      issues.push(`${label}.full_context_reason is required for a tall evidence screenshot.`);
    }
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
      if (visual.source_type === "coded_visual" && valid) {
        const actualHash = `sha256:${createHash("sha256").update(readFileSync(resolvedPath)).digest("hex")}`;
        if (!/^sha256:[a-f0-9]{64}$/i.test(visual.asset_sha256 || "")) {
          issues.push(`${label}.asset_sha256 is required to bind coded visual bytes.`);
        } else if (visual.asset_sha256 !== actualHash) {
          issues.push(`${label}.asset_sha256 does not match the coded visual file.`);
        }
      }
    }
    const assetExtension = /^data:/i.test(visual.asset_path) ? "" : extname(visual.asset_path).toLowerCase();
    if (!new Set([".html", ".htm"]).has(assetExtension)) {
      try {
        const actualDimensions = await visualDimensions(visual.asset_path);
        if (
          actualDimensions &&
          validDimensions(visual.asset_dimensions) &&
          (actualDimensions.width !== visual.asset_dimensions.width || actualDimensions.height !== visual.asset_dimensions.height)
        ) {
          issues.push(
            `${label}.asset_dimensions does not match the final file; recorded ${visual.asset_dimensions.width}x${visual.asset_dimensions.height}, actual ${actualDimensions.width}x${actualDimensions.height}.`,
          );
        }
      } catch (error) {
        issues.push(`${label} dimensions could not be verified: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (visual.source_type === "evidence_screenshot" && visual.status === "captured") {
      try {
        const dimensions = await visualDimensions(visual.asset_path);
        if (!dimensions || dimensions.width < 320 || dimensions.height < 120) {
          issues.push(`${label} evidence screenshot is too small to be readable on a phone; require at least 320x120 source pixels.`);
        }
        const buffer = rasterBuffer(visual.asset_path);
        const actualHash = buffer ? `sha256:${createHash("sha256").update(buffer).digest("hex")}` : "";
        if (!actualHash || actualHash !== visual.asset_sha256) {
          issues.push(`${label}.asset_sha256 does not match the captured screenshot file.`);
        }
      } catch (error) {
        issues.push(`${label} evidence screenshot could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

const firstVisual = [...visuals].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
if (firstVisual?.source_type !== "generated_image") issues.push("The first visual must use source_type=generated_image.");
if (firstVisual?.role !== "hero") issues.push("The first visual must use role=hero.");
if (!nonEmpty(firstVisual?.title_text)) issues.push("The first visual must record the exact integrated article title in title_text.");
if (nonEmpty(firstVisual?.title_text) && !String(firstVisual?.prompt || "").includes(firstVisual.title_text)) {
  issues.push("The first visual prompt must include the exact title_text so the generation request is auditable.");
}
if (!/2\.35\s*:\s*1/i.test(String(firstVisual?.prompt || ""))) {
  issues.push("The first visual prompt must explicitly require the 2.35:1 article-hero ratio.");
}
if (stage === "final" && firstVisual?.status !== "ready") issues.push("The generated hero must have status=ready at final stage.");
if (
  stage === "final" &&
  checkFiles &&
  firstVisual?.status !== "attempt_failed" &&
  nonEmpty(firstVisual?.asset_path) &&
  !/^https?:/i.test(firstVisual.asset_path)
) {
  try {
    const dimensions = await visualDimensions(firstVisual.asset_path);
    if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.height <= 0) {
      warnings.push("The first visual dimensions could not be verified automatically; inspect its 2.35:1 composition manually.");
    } else {
      const ratio = dimensions.width / dimensions.height;
      if (dimensions.width < 900 || dimensions.height < 383) {
        issues.push(
          `The first visual is too small for stable WeChat delivery; require at least 900x383 source pixels, got ${dimensions.width}x${dimensions.height}.`,
        );
      }
      if (Math.abs(ratio - headlineRatio) / headlineRatio > 0.02) {
        issues.push(
          `The first visual must use the 2.35:1 article-hero ratio; got ${dimensions.width}x${dimensions.height} (${ratio.toFixed(2)}:1).`,
        );
      }
    }
  } catch (error) {
    issues.push(`Could not inspect first-visual dimensions: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const orderedVisuals = [...visuals].sort((a, b) => (a.order || 0) - (b.order || 0));
const bySection = new Map();
const reasonOwners = new Map();
for (const visual of orderedVisuals) {
  if (nonEmpty(visual.section)) {
    const key = visual.section.trim().toLowerCase();
    bySection.set(key, [...(bySection.get(key) || []), visual]);
  }
  if (nonEmpty(visual.semantic_reason)) {
    const key = visual.semantic_reason.trim().replace(/\s+/g, " ").toLowerCase();
    reasonOwners.set(key, [...(reasonOwners.get(key) || []), visual.id || `order ${visual.order}`]);
  }
}
for (const [section, items] of bySection) {
  if (items.length > 1) {
    const extrasWithoutReason = items.slice(1).filter((visual) => !nonEmpty(visual.density_override_reason));
    if (stage === "final" && extrasWithoutReason.length) {
      issues.push(
        `Reading unit "${section}" has ${items.length} visuals. Every visual after the first needs density_override_reason explaining its distinct job.`,
      );
    } else {
      warnings.push(
        `Reading unit "${section}" has ${items.length} visuals with explicit density exceptions. The exception only requests review; verify-layout must still approve spacing, weight, screenshot ratio, and semantic uniqueness.`,
      );
    }
  }
}
for (let index = 0; index < orderedVisuals.length - 1; index++) {
  const left = orderedVisuals[index];
  const right = orderedVisuals[index + 1];
  if (String(left.section || "").trim().toLowerCase() !== String(right.section || "").trim().toLowerCase()) continue;
  const leftSignature = semanticSignature(left.semantic_signature);
  const rightSignature = new Set(semanticSignature(right.semantic_signature));
  const overlap = leftSignature.filter((item) => rightSignature.has(item));
  if (overlap.length >= 2) {
    const message = `Adjacent visuals ${left.id} and ${right.id} repeat semantic_signature values: ${overlap.join(", ")}`;
    if (stage === "final") issues.push(message);
    else warnings.push(message);
  }
}
for (const [reason, owners] of reasonOwners) {
  if (owners.length > 1) {
    const message = `Visuals ${owners.join(", ")} repeat the same semantic reason: ${reason}`;
    if (stage === "final") issues.push(message);
    else warnings.push(message);
  }
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

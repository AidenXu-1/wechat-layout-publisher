import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { assertArticleLayout } from "./layout-qa.ts";

export interface VisualQaReceipt {
  schema_version: 2;
  article_sha256: string;
  image_plan_sha256: string;
  checked_width_px: number;
  viewport_screenshot: string;
  viewport_sha256: string;
  full_page_screenshot: string;
  full_page_sha256: string;
  first_screen_checked: true;
  full_page_checked: true;
  hero_title_exact: true;
  hero_text_integrated: true;
  hero_no_extra_text: true;
  no_horizontal_overflow: true;
  no_broken_images: true;
  all_visual_text_readable: true;
  image_density_balanced: true;
  visual_system_consistent: true;
  no_unexplained_vertical_gaps: true;
  no_raw_markdown_separators: true;
  first_section_visual_anchor_checked: true;
  no_adjacent_heavy_visual_blocks: true;
  no_consecutive_tall_screenshots: true;
  no_semantic_duplicate_visuals: true;
  full_page_capture_stable: true;
  status: "passed";
  unresolved_issues: [];
  reviewed_at: string;
}

export function extractArticleFragment(raw: string): string {
  const marker = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
  return (marker ? marker[1] : raw).trim();
}

export function articleSha256(articleHtml: string): string {
  return createHash("sha256").update(articleHtml.trim(), "utf8").digest("hex");
}

function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function receiptAssetPath(receiptPath: string, value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) {
    throw new Error(`${label} must be a relative PNG/JPEG path beside the visual QA receipt.`);
  }
  const root = resolve(dirname(receiptPath));
  const path = resolve(root, value);
  if (!isPathInside(path, root)) throw new Error(`${label} cannot escape the visual QA receipt directory.`);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

async function screenshotMetadata(path: string, label: string): Promise<{ width: number; height: number; entropy: number }> {
  const image = sharp(path);
  const metadata = await image.metadata();
  if (!new Set(["png", "jpeg"]).has(metadata.format || "") || !metadata.width || !metadata.height) {
    throw new Error(`${label} must be a readable PNG/JPEG screenshot.`);
  }
  const stats = await image.stats();
  return { width: metadata.width, height: metadata.height, entropy: stats.entropy };
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function screenshotScale(width: number, checkedWidth: number): number {
  for (const scale of [1, 2, 3]) {
    if (Math.abs(width - checkedWidth * scale) <= 2) return scale;
  }
  return 0;
}

export async function detectRepeatedVerticalTiling(path: string): Promise<boolean> {
  const metadata = await sharp(path).metadata();
  if (!metadata.width || !metadata.height || metadata.height < 1400) return false;
  const { data, info } = await sharp(path)
    .resize({ width: 48 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rowInk = Array.from({ length: info.height }, (_, y) => {
    let total = 0;
    for (let x = 0; x < info.width; x++) total += 255 - data[y * info.width + x];
    return total / info.width;
  });
  const minShift = Math.floor(info.height * 0.15);
  const maxShift = Math.floor(info.height * 0.45);
  for (let shift = minShift; shift <= maxShift; shift++) {
    let difference = 0;
    let comparedPixels = 0;
    let informativeRows = 0;
    for (let y = 0; y < info.height - shift; y += 2) {
      if (rowInk[y] < 2 || rowInk[y + shift] < 2) continue;
      informativeRows++;
      for (let x = 0; x < info.width; x += 2) {
        difference += Math.abs(data[y * info.width + x] - data[(y + shift) * info.width + x]);
        comparedPixels++;
      }
    }
    if (informativeRows < Math.max(40, Math.floor(info.height * 0.12)) || !comparedPixels) continue;
    if (difference / comparedPixels < 8) return true;
  }
  return false;
}

export async function validateVisualQaReceipt(
  receiptPath: string,
  articleHtml: string,
  imagePlanPath: string,
): Promise<VisualQaReceipt> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid visual QA receipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Visual QA receipt must be a JSON object.");
  const receipt = parsed as Partial<VisualQaReceipt>;
  if (receipt.schema_version !== 2) throw new Error("Visual QA receipt requires schema_version=2.");
  if (!Number.isInteger(receipt.checked_width_px) || receipt.checked_width_px! < 375 || receipt.checked_width_px! > 390) {
    throw new Error("Visual QA checked_width_px must be an integer from 375 to 390.");
  }
  if (receipt.article_sha256 !== articleSha256(articleHtml)) {
    throw new Error("Visual QA receipt does not match the current article HTML. Reopen the updated preview and review it again.");
  }
  if (receipt.image_plan_sha256 !== await fileSha256(imagePlanPath)) {
    throw new Error("Visual QA receipt does not match the current image plan. Review the final visual plan and article together again.");
  }
  if (receipt.first_screen_checked !== true || receipt.full_page_checked !== true || receipt.status !== "passed") {
    throw new Error("Visual QA receipt must confirm both the first screen and full page with status=passed.");
  }
  if (receipt.hero_title_exact !== true || receipt.hero_text_integrated !== true) {
    throw new Error("Visual QA receipt must confirm the hero uses the exact title and integrates it into the composition.");
  }
  if (
    receipt.hero_no_extra_text !== true ||
    receipt.no_horizontal_overflow !== true ||
    receipt.no_broken_images !== true ||
    receipt.all_visual_text_readable !== true ||
    receipt.image_density_balanced !== true ||
    receipt.visual_system_consistent !== true ||
    receipt.no_unexplained_vertical_gaps !== true ||
    receipt.no_raw_markdown_separators !== true ||
    receipt.first_section_visual_anchor_checked !== true ||
    receipt.no_adjacent_heavy_visual_blocks !== true ||
    receipt.no_consecutive_tall_screenshots !== true ||
    receipt.no_semantic_duplicate_visuals !== true ||
    receipt.full_page_capture_stable !== true
  ) {
    throw new Error(
      "Visual QA receipt must confirm clean hero text, readable visuals, stable full-page capture, no unexplained gaps, no raw separators, an early first-section anchor, and no heavy, tall, or semantically duplicated visual runs.",
    );
  }
  if (!Array.isArray(receipt.unresolved_issues) || receipt.unresolved_issues.length !== 0) {
    throw new Error("Visual QA receipt still contains unresolved issues.");
  }
  if (typeof receipt.reviewed_at !== "string" || !Number.isFinite(Date.parse(receipt.reviewed_at))) {
    throw new Error("Visual QA receipt requires a valid reviewed_at timestamp.");
  }

  const viewportPath = receiptAssetPath(receiptPath, receipt.viewport_screenshot, "viewport_screenshot");
  const fullPagePath = receiptAssetPath(receiptPath, receipt.full_page_screenshot, "full_page_screenshot");
  if (receipt.viewport_sha256 !== await fileSha256(viewportPath) || receipt.full_page_sha256 !== await fileSha256(fullPagePath)) {
    throw new Error("Visual QA screenshot hash does not match the reviewed artifact.");
  }
  const viewport = await screenshotMetadata(viewportPath, "viewport_screenshot");
  const fullPage = await screenshotMetadata(fullPagePath, "full_page_screenshot");
  if (viewport.entropy < 0.01 || fullPage.entropy < 0.01) {
    throw new Error("Visual QA screenshots appear blank or nearly uniform and cannot prove a real visual review.");
  }
  const scale = screenshotScale(viewport.width, receipt.checked_width_px!);
  if (!scale || screenshotScale(fullPage.width, receipt.checked_width_px!) !== scale) {
    throw new Error("Visual QA screenshots must match the declared mobile width at the same 1x, 2x, or 3x scale.");
  }
  if (viewport.height < 500 * scale) throw new Error("viewport_screenshot is too short to prove a useful first-screen review.");
  if (fullPage.height < viewport.height) throw new Error("full_page_screenshot must be at least as tall as the first-screen screenshot.");
  if (await detectRepeatedVerticalTiling(fullPagePath)) {
    throw new Error("full_page_screenshot appears to contain repeated vertical tiles. Use a stable segmented scroll capture and review the stitched result.");
  }
  await assertArticleLayout(articleHtml, imagePlanPath);
  return receipt as VisualQaReceipt;
}

interface CliArgs {
  article: string;
  imagePlan: string;
  viewport: string;
  fullPage: string;
  width: number;
  out: string;
  confirmed: boolean;
  heroTitleConfirmed: boolean;
  heroIntegrationConfirmed: boolean;
  heroCleanConfirmed: boolean;
  noOverflowConfirmed: boolean;
  noBrokenImagesConfirmed: boolean;
  visualTextReadableConfirmed: boolean;
  densityConfirmed: boolean;
  visualSystemConfirmed: boolean;
  noGapsConfirmed: boolean;
  noRawSeparatorsConfirmed: boolean;
  firstSectionAnchorConfirmed: boolean;
  noHeavyRunsConfirmed: boolean;
  noTallRunsConfirmed: boolean;
  noSemanticDuplicatesConfirmed: boolean;
  stableCaptureConfirmed: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    article: "",
    imagePlan: "",
    viewport: "",
    fullPage: "",
    width: 0,
    out: "",
    confirmed: false,
    heroTitleConfirmed: false,
    heroIntegrationConfirmed: false,
    heroCleanConfirmed: false,
    noOverflowConfirmed: false,
    noBrokenImagesConfirmed: false,
    visualTextReadableConfirmed: false,
    densityConfirmed: false,
    visualSystemConfirmed: false,
    noGapsConfirmed: false,
    noRawSeparatorsConfirmed: false,
    firstSectionAnchorConfirmed: false,
    noHeavyRunsConfirmed: false,
    noTallRunsConfirmed: false,
    noSemanticDuplicatesConfirmed: false,
    stableCaptureConfirmed: false,
  };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--article") args.article = value(arg, index++);
    else if (arg === "--image-plan") args.imagePlan = value(arg, index++);
    else if (arg === "--viewport-screenshot") args.viewport = value(arg, index++);
    else if (arg === "--full-page-screenshot") args.fullPage = value(arg, index++);
    else if (arg === "--width") args.width = Number(value(arg, index++));
    else if (arg === "--out") args.out = value(arg, index++);
    else if (arg === "--confirm-reviewed") args.confirmed = true;
    else if (arg === "--confirm-hero-title") args.heroTitleConfirmed = true;
    else if (arg === "--confirm-hero-integration") args.heroIntegrationConfirmed = true;
    else if (arg === "--confirm-hero-clean") args.heroCleanConfirmed = true;
    else if (arg === "--confirm-no-overflow") args.noOverflowConfirmed = true;
    else if (arg === "--confirm-no-broken-images") args.noBrokenImagesConfirmed = true;
    else if (arg === "--confirm-visual-text-readable") args.visualTextReadableConfirmed = true;
    else if (arg === "--confirm-density-balanced") args.densityConfirmed = true;
    else if (arg === "--confirm-visual-system") args.visualSystemConfirmed = true;
    else if (arg === "--confirm-no-unexplained-gaps") args.noGapsConfirmed = true;
    else if (arg === "--confirm-no-raw-separators") args.noRawSeparatorsConfirmed = true;
    else if (arg === "--confirm-first-section-anchor") args.firstSectionAnchorConfirmed = true;
    else if (arg === "--confirm-no-heavy-visual-runs") args.noHeavyRunsConfirmed = true;
    else if (arg === "--confirm-no-tall-screenshot-runs") args.noTallRunsConfirmed = true;
    else if (arg === "--confirm-no-semantic-duplicates") args.noSemanticDuplicatesConfirmed = true;
    else if (arg === "--confirm-stable-full-page-capture") args.stableCaptureConfirmed = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (
    !args.article ||
    !args.imagePlan ||
    !args.viewport ||
    !args.fullPage ||
    !args.out ||
    !args.confirmed ||
    !args.heroTitleConfirmed ||
    !args.heroIntegrationConfirmed ||
    !args.heroCleanConfirmed ||
    !args.noOverflowConfirmed ||
    !args.noBrokenImagesConfirmed ||
    !args.visualTextReadableConfirmed ||
    !args.densityConfirmed ||
    !args.visualSystemConfirmed ||
    !args.noGapsConfirmed ||
    !args.noRawSeparatorsConfirmed ||
    !args.firstSectionAnchorConfirmed ||
    !args.noHeavyRunsConfirmed ||
    !args.noTallRunsConfirmed ||
    !args.noSemanticDuplicatesConfirmed ||
    !args.stableCaptureConfirmed
  ) {
    throw new Error(
      "Usage: visual-qa.ts --article <article.html> --image-plan <image-plan.json> --viewport-screenshot <mobile.png> --full-page-screenshot <full.png> --width <375-390> --out <visual-qa.json> --confirm-reviewed --confirm-hero-title --confirm-hero-integration --confirm-hero-clean --confirm-no-overflow --confirm-no-broken-images --confirm-visual-text-readable --confirm-density-balanced --confirm-visual-system --confirm-no-unexplained-gaps --confirm-no-raw-separators --confirm-first-section-anchor --confirm-no-heavy-visual-runs --confirm-no-tall-screenshot-runs --confirm-no-semantic-duplicates --confirm-stable-full-page-capture",
    );
  }
  return args;
}

async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const articlePath = resolve(args.article);
  const imagePlanPath = resolve(args.imagePlan);
  const outPath = resolve(args.out);
  const root = dirname(outPath);
  await mkdir(root, { recursive: true });
  const relativeScreenshot = (value: string, label: string): string => {
    const path = resolve(value);
    const rel = relative(root, path);
    if (!isPathInside(path, root)) throw new Error(`${label} must be inside the visual QA receipt directory.`);
    return rel.split(sep).join("/");
  };
  const receipt: VisualQaReceipt = {
    schema_version: 2,
    article_sha256: articleSha256(extractArticleFragment(await readFile(articlePath, "utf8"))),
    image_plan_sha256: await fileSha256(imagePlanPath),
    checked_width_px: args.width,
    viewport_screenshot: relativeScreenshot(args.viewport, "viewport_screenshot"),
    viewport_sha256: await fileSha256(resolve(args.viewport)),
    full_page_screenshot: relativeScreenshot(args.fullPage, "full_page_screenshot"),
    full_page_sha256: await fileSha256(resolve(args.fullPage)),
    first_screen_checked: true,
    full_page_checked: true,
    hero_title_exact: true,
    hero_text_integrated: true,
    hero_no_extra_text: true,
    no_horizontal_overflow: true,
    no_broken_images: true,
    all_visual_text_readable: true,
    image_density_balanced: true,
    visual_system_consistent: true,
    no_unexplained_vertical_gaps: true,
    no_raw_markdown_separators: true,
    first_section_visual_anchor_checked: true,
    no_adjacent_heavy_visual_blocks: true,
    no_consecutive_tall_screenshots: true,
    no_semantic_duplicate_visuals: true,
    full_page_capture_stable: true,
    status: "passed",
    unresolved_issues: [],
    reviewed_at: new Date().toISOString(),
  };
  const temp = `${outPath}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await validateVisualQaReceipt(temp, extractArticleFragment(await readFile(articlePath, "utf8")), imagePlanPath);
    await rename(temp, outPath);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  console.log(outPath);
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

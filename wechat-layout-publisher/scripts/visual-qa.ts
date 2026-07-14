import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export interface VisualQaReceipt {
  schema_version: 1;
  article_sha256: string;
  checked_width_px: number;
  viewport_screenshot: string;
  viewport_sha256: string;
  full_page_screenshot: string;
  full_page_sha256: string;
  first_screen_checked: true;
  full_page_checked: true;
  hero_title_exact: true;
  hero_text_integrated: true;
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

async function screenshotMetadata(path: string, label: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(path).metadata();
  if (!new Set(["png", "jpeg"]).has(metadata.format || "") || !metadata.width || !metadata.height) {
    throw new Error(`${label} must be a readable PNG/JPEG screenshot.`);
  }
  return { width: metadata.width, height: metadata.height };
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

export async function validateVisualQaReceipt(receiptPath: string, articleHtml: string): Promise<VisualQaReceipt> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid visual QA receipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Visual QA receipt must be a JSON object.");
  const receipt = parsed as Partial<VisualQaReceipt>;
  if (receipt.schema_version !== 1) throw new Error("Visual QA receipt requires schema_version=1.");
  if (!Number.isInteger(receipt.checked_width_px) || receipt.checked_width_px! < 375 || receipt.checked_width_px! > 390) {
    throw new Error("Visual QA checked_width_px must be an integer from 375 to 390.");
  }
  if (receipt.article_sha256 !== articleSha256(articleHtml)) {
    throw new Error("Visual QA receipt does not match the current article HTML. Reopen the updated preview and review it again.");
  }
  if (receipt.first_screen_checked !== true || receipt.full_page_checked !== true || receipt.status !== "passed") {
    throw new Error("Visual QA receipt must confirm both the first screen and full page with status=passed.");
  }
  if (receipt.hero_title_exact !== true || receipt.hero_text_integrated !== true) {
    throw new Error("Visual QA receipt must confirm the hero uses the exact title and integrates it into the composition.");
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
  const scale = screenshotScale(viewport.width, receipt.checked_width_px!);
  if (!scale || screenshotScale(fullPage.width, receipt.checked_width_px!) !== scale) {
    throw new Error("Visual QA screenshots must match the declared mobile width at the same 1x, 2x, or 3x scale.");
  }
  if (viewport.height < 500 * scale) throw new Error("viewport_screenshot is too short to prove a useful first-screen review.");
  if (fullPage.height < viewport.height) throw new Error("full_page_screenshot must be at least as tall as the first-screen screenshot.");
  return receipt as VisualQaReceipt;
}

interface CliArgs {
  article: string;
  viewport: string;
  fullPage: string;
  width: number;
  out: string;
  confirmed: boolean;
  heroTitleConfirmed: boolean;
  heroIntegrationConfirmed: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    article: "",
    viewport: "",
    fullPage: "",
    width: 0,
    out: "",
    confirmed: false,
    heroTitleConfirmed: false,
    heroIntegrationConfirmed: false,
  };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--article") args.article = value(arg, index++);
    else if (arg === "--viewport-screenshot") args.viewport = value(arg, index++);
    else if (arg === "--full-page-screenshot") args.fullPage = value(arg, index++);
    else if (arg === "--width") args.width = Number(value(arg, index++));
    else if (arg === "--out") args.out = value(arg, index++);
    else if (arg === "--confirm-reviewed") args.confirmed = true;
    else if (arg === "--confirm-hero-title") args.heroTitleConfirmed = true;
    else if (arg === "--confirm-hero-integration") args.heroIntegrationConfirmed = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (
    !args.article ||
    !args.viewport ||
    !args.fullPage ||
    !args.out ||
    !args.confirmed ||
    !args.heroTitleConfirmed ||
    !args.heroIntegrationConfirmed
  ) {
    throw new Error(
      "Usage: visual-qa.ts --article <article.html> --viewport-screenshot <mobile.png> --full-page-screenshot <full.png> --width <375-390> --out <visual-qa.json> --confirm-reviewed --confirm-hero-title --confirm-hero-integration",
    );
  }
  return args;
}

async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const articlePath = resolve(args.article);
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
    schema_version: 1,
    article_sha256: articleSha256(extractArticleFragment(await readFile(articlePath, "utf8"))),
    checked_width_px: args.width,
    viewport_screenshot: relativeScreenshot(args.viewport, "viewport_screenshot"),
    viewport_sha256: await fileSha256(resolve(args.viewport)),
    full_page_screenshot: relativeScreenshot(args.fullPage, "full_page_screenshot"),
    full_page_sha256: await fileSha256(resolve(args.fullPage)),
    first_screen_checked: true,
    full_page_checked: true,
    hero_title_exact: true,
    hero_text_integrated: true,
    status: "passed",
    unresolved_issues: [],
    reviewed_at: new Date().toISOString(),
  };
  const temp = `${outPath}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await validateVisualQaReceipt(temp, extractArticleFragment(await readFile(articlePath, "utf8")));
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

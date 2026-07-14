import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { extractImageSrcs } from "./render.ts";
import { getAccessToken, uploadBodyImage, uploadCoverMaterial, addDraft } from "./wechat.ts";
import type { DraftArticle } from "./wechat.ts";
import { generateCover, coverPrompt } from "./imagegen.ts";
import { missingCredentialMessage, resolveRuntimeCredentials } from "./credentials.ts";
import type { RuntimeCredentials } from "./credentials.ts";
import { detectImageFormat } from "./image-utils.ts";
import { safeFetchBuffer } from "./safe-fetch.ts";
import { prepareHeadlineCover } from "./cover-image.ts";
import { validateVisualQaReceipt } from "./visual-qa.ts";

interface Args {
  input: string;
  title?: string;
  author?: string;
  digest?: string;
  cover?: string;
  genCover: boolean;
  sourceUrl?: string;
  noComment: boolean;
  model?: string;
  coverPrompt?: string;
  writeUploadedFragment?: string;
  writeCopyReady?: string;
  imagePlan?: string;
  sourceArticle?: string;
  allowEvidenceFailure: boolean;
  assetDirs: string[];
  prepareOnly: boolean;
  createDraft: boolean;
  uploadManifest?: string;
  visualQa?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    input: "",
    genCover: false,
    noComment: false,
    allowEvidenceFailure: false,
    assetDirs: [],
    prepareOnly: true,
    createDraft: false,
  };
  let prepareOnlyExplicit = false;
  let createDraftExplicit = false;
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--gen-cover") a.genCover = true;
    else if (t === "--prepare-only") {
      prepareOnlyExplicit = true;
      a.prepareOnly = true;
    }
    else if (t === "--create-draft") {
      createDraftExplicit = true;
      a.createDraft = true;
      a.prepareOnly = false;
    }
    else if (t === "--no-comment") a.noComment = true;
    else if (t === "--allow-evidence-failure") a.allowEvidenceFailure = true;
    else if (t === "--title") a.title = value(t, i++);
    else if (t === "--author") a.author = value(t, i++);
    else if (t === "--digest") a.digest = value(t, i++);
    else if (t === "--cover") a.cover = value(t, i++);
    else if (t === "--source-url") a.sourceUrl = value(t, i++);
    else if (t === "--model") a.model = value(t, i++);
    else if (t === "--cover-prompt") a.coverPrompt = value(t, i++);
    else if (t === "--write-uploaded-fragment") a.writeUploadedFragment = value(t, i++);
    else if (t === "--write-copy-ready") a.writeCopyReady = value(t, i++);
    else if (t === "--image-plan") a.imagePlan = value(t, i++);
    else if (t === "--source-article") a.sourceArticle = value(t, i++);
    else if (t === "--visual-qa") a.visualQa = value(t, i++);
    else if (t === "--asset-dir") a.assetDirs.push(value(t, i++));
    else if (t === "--upload-manifest") a.uploadManifest = value(t, i++);
    else if (t.startsWith("--")) throw new Error(`Unknown option: ${t}`);
    else if (!t.startsWith("--") && !a.input) a.input = t;
    else throw new Error(`Unexpected positional argument: ${t}`);
  }
  if (!a.input) {
    throw new Error(
      "Usage: publish.ts <article.html> --image-plan <image-plan.json> --visual-qa <visual-qa.json> --source-article <original.md> [--prepare-only | --create-draft] [--title ..] [--cover <path> | --gen-cover] [--asset-dir <allowed-dir>] [--upload-manifest <path>] [--cover-prompt ..] [--author ..] [--digest ..] [--no-comment] [--allow-evidence-failure] [--write-uploaded-fragment <path>] [--write-copy-ready <path>]",
    );
  }
  if (!a.imagePlan) throw new Error("--image-plan <image-plan.json> is required.");
  if (!a.visualQa) throw new Error("--visual-qa <visual-qa.json> is required before formal copy preparation or draft creation.");
  if (prepareOnlyExplicit && createDraftExplicit) throw new Error("Use either --prepare-only or --create-draft, not both.");
  if (a.cover && a.genCover) throw new Error("Use either --cover or --gen-cover, not both.");
  if (a.prepareOnly && (a.cover || a.genCover)) {
    throw new Error("--prepare-only does not create or upload a cover. Remove --cover/--gen-cover.");
  }
  if (a.prepareOnly && !a.writeUploadedFragment && !a.writeCopyReady) {
    throw new Error("--prepare-only requires --write-uploaded-fragment or --write-copy-ready (prefer both).");
  }
  return a;
}

export interface PublisherDeps {
  resolveCredentials(env: Record<string, string | undefined>): Promise<RuntimeCredentials>;
  getAccessToken(appId: string, appSecret: string): Promise<string>;
  uploadBodyImage(path: string, accessToken: string): Promise<string>;
  uploadCoverMaterial(path: string, accessToken: string): Promise<string>;
  addDraft(article: DraftArticle, accessToken: string): Promise<string>;
  validateWechatHostedImage(src: string): Promise<Buffer>;
  generateCover(
    prompt: string,
    apiKey: string,
    model: string,
    outPath: string,
    title?: string,
  ): Promise<string>;
  now(): string;
}

export interface PublishResult {
  mode: "prepare-only" | "draft";
  content: string;
  draftMediaId?: string;
  uploadedFragmentPath?: string;
  copyReadyPath?: string;
  uploadManifestPath: string;
}

function loadEnv(scriptDir: string): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const candidates = [join(process.cwd(), ".env"), resolve(scriptDir, "..", ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

interface Front {
  data: Record<string, string>;
  body: string;
}

function parseFrontmatter(raw: string): Front {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (kv) data[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: raw.slice(m[0].length) };
}

// Resolve any image src (local path, remote URL, or data URI) to a local file path.
function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertAllowedLocalFile(path: string, allowedRoots: string[]): string {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Image file not found or not a regular file: ${path}`);
  const real = realpathSync(path);
  if (!allowedRoots.some((root) => isPathInside(real, root))) {
    throw new Error(`Local image is outside the article or allowed asset directories: ${path}. Add --asset-dir <directory> explicitly.`);
  }
  return real;
}

async function validateLocalBodyImage(path: string): Promise<void> {
  if (statSync(path).size > 1024 * 1024) throw new Error("Body image exceeds WeChat's 1 MB limit.");
  const buffer = await readFile(path);
  const format = detectImageFormat(buffer);
  if (!format || (format.extension !== "png" && format.extension !== "jpg")) {
    throw new Error(`WeChat body images must be real PNG or JPEG files: ${path}`);
  }
}

async function resolveImageToFile(src: string, articleDir: string, tempDir: string, allowedRoots: string[]): Promise<string> {
  if (src.startsWith("data:image/")) {
    const m = src.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!m) throw new Error("Malformed data URI image");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 1024 * 1024) throw new Error("Body image data URI exceeds WeChat's 1 MB limit.");
    const format = detectImageFormat(buf);
    if (!format || (format.extension !== "png" && format.extension !== "jpg")) {
      throw new Error("WeChat body images must be real PNG or JPEG files.");
    }
    const path = join(tempDir, `body-image-${Math.random().toString(36).slice(2)}.${format.extension}`);
    await writeFile(path, buf);
    return path;
  }
  if (/^https?:\/\//.test(src)) {
    const downloaded = await safeFetchBuffer(src, {
      maxBytes: 1024 * 1024,
      timeoutMs: 20000,
      expectedContentTypePrefix: "image/",
      headers: { "User-Agent": "wechat-layout-publisher/1" },
    });
    const format = detectImageFormat(downloaded.buffer);
    if (!format || (format.extension !== "png" && format.extension !== "jpg")) {
      throw new Error(`Remote WeChat body image must be PNG or JPEG: ${new URL(src).hostname}`);
    }
    const path = join(tempDir, `body-image-${Math.random().toString(36).slice(2)}.${format.extension}`);
    await writeFile(path, downloaded.buffer);
    return path;
  }
  const local = assertAllowedLocalFile(isAbsolute(src) ? src : resolve(articleDir, src), allowedRoots);
  await validateLocalBodyImage(local);
  return local;
}

async function validateWechatHostedImage(src: string): Promise<Buffer> {
  const downloaded = await safeFetchBuffer(src, {
    maxBytes: 1024 * 1024,
    timeoutMs: 20000,
    expectedContentTypePrefix: "image/",
    headers: { "User-Agent": "wechat-layout-publisher/1" },
  });
  const format = detectImageFormat(downloaded.buffer);
  if (!format || (format.extension !== "png" && format.extension !== "jpg")) {
    throw new Error(`Existing WeChat-hosted body image is not a real PNG/JPEG: ${src}`);
  }
  return downloaded.buffer;
}

function isWechatHosted(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname.toLowerCase() === "mmbiz.qpic.cn" || url.hostname.toLowerCase() === "mmbiz.qlogo.cn")
    );
  } catch {
    return false;
  }
}

interface UploadManifestEntry {
  source: string;
  sha256: string;
  wechat_url: string;
  uploaded_at: string;
}

interface UploadManifest {
  schema_version: 1;
  uploads: UploadManifestEntry[];
}

function isManifestEntry(value: unknown): value is UploadManifestEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.source === "string" &&
    typeof entry.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(entry.sha256) &&
    typeof entry.wechat_url === "string" &&
    isWechatHosted(entry.wechat_url) &&
    typeof entry.uploaded_at === "string"
  );
}

async function loadUploadManifest(path: string): Promise<UploadManifest> {
  if (!existsSync(path)) return { schema_version: 1, uploads: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid upload manifest JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parsed as Partial<UploadManifest>;
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.uploads) || !manifest.uploads.every(isManifestEntry)) {
    throw new Error("Invalid upload manifest. Expected schema_version=1 and safe source/sha256/wechat_url/uploaded_at entries.");
  }
  return { schema_version: 1, uploads: manifest.uploads };
}

async function writeUploadManifestAtomic(path: string, manifest: UploadManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

interface PlannedVisual {
  id: string;
  order: number;
  source_type: string;
  status?: string;
  asset_path: string;
}

interface ArticleVisualMarker {
  id: string;
  tagName: string;
  tag: string;
  src?: string;
}

function attributeValue(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? match[1] || match[2] || match[3] || "" : undefined;
}

function articleVisualMarkers(html: string): ArticleVisualMarker[] {
  const markers: ArticleVisualMarker[] = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-wlp-visual-id\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi)) {
    const tag = match[0];
    markers.push({
      id: match[2] || match[3] || match[4] || "",
      tagName: match[1].toLowerCase(),
      tag,
      src: attributeValue(tag, "src"),
    });
  }
  return markers;
}

async function plannedVisuals(imagePlanPath: string): Promise<PlannedVisual[]> {
  const parsed = JSON.parse(await readFile(imagePlanPath, "utf8")) as {
    visuals?: Array<Partial<PlannedVisual>>;
  };
  return (parsed.visuals || [])
    .filter((visual) => visual.status !== "attempt_failed")
    .map((visual) => {
      if (
        typeof visual.id !== "string" ||
        !visual.id ||
        !Number.isInteger(visual.order) ||
        typeof visual.source_type !== "string" ||
        typeof visual.asset_path !== "string"
      ) {
        throw new Error("Final image plan contains a visual without id, order, source_type, or asset_path.");
      }
      return visual as PlannedVisual;
    })
    .sort((left, right) => left.order - right.order);
}

async function plannedRasterHash(imagePlanPath: string, visual: PlannedVisual): Promise<string | undefined> {
  let buffer: Buffer;
  if (visual.asset_path.startsWith("data:image/")) {
    const match = visual.asset_path.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) return undefined;
    buffer = Buffer.from(match[1], "base64");
  } else if (/^https?:/i.test(visual.asset_path)) {
    return undefined;
  } else {
    buffer = await readFile(resolve(dirname(imagePlanPath), visual.asset_path));
  }
  const format = detectImageFormat(buffer);
  if (!format || (format.extension !== "png" && format.extension !== "jpg")) return undefined;
  return createHash("sha256").update(buffer).digest("hex");
}

async function assertArticleImagesMatchPlan(
  imagePlanPath: string,
  html: string,
  bodyImageFiles: Map<string, string>,
): Promise<void> {
  const planned = await plannedVisuals(imagePlanPath);
  const markers = articleVisualMarkers(html);
  const unboundImages = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => !attributeValue(tag, "data-wlp-visual-id"));
  if (unboundImages.length) {
    throw new Error("Every article <img> must declare data-wlp-visual-id matching the final image plan.");
  }
  const plannedIds = planned.map((visual) => visual.id);
  const markerIds = markers.map((marker) => marker.id);
  if (plannedIds.length !== markerIds.length || plannedIds.some((id, index) => markerIds[index] !== id)) {
    throw new Error(
      `Article visual identity/order does not match the final image plan. Planned: ${plannedIds.join(", ") || "(none)"}; article: ${markerIds.join(", ") || "(none)"}.`,
    );
  }
  for (const [index, visual] of planned.entries()) {
    const marker = markers[index];
    const plannedHash = await plannedRasterHash(imagePlanPath, visual);
    if (!plannedHash) {
      if (visual.source_type !== "coded_visual") {
        throw new Error(`Final image plan visual ${visual.id} must resolve to a local/data PNG or JPEG for content binding.`);
      }
      continue;
    }
    if (marker.tagName !== "img" || !marker.src) {
      throw new Error(`Raster visual ${visual.id} must place data-wlp-visual-id on its actual <img> element.`);
    }
    const file = bodyImageFiles.get(marker.src);
    if (!file) throw new Error(`Could not resolve article image for visual ${visual.id}: ${shortSrcForLog(marker.src)}`);
    const actualHash = await sha256File(file);
    if (actualHash !== plannedHash) {
      throw new Error(`Article image for visual ${visual.id} does not match the asset registered in the final image plan.`);
    }
  }
}

function manifestSource(src: string, file: string, articleDir: string, sha256: string): string {
  if (src.startsWith("data:image/")) return `data:${sha256}`;
  if (/^https?:\/\//i.test(src)) return `url:${src}`;
  const rel = relative(articleDir, file);
  return isPathInside(file, articleDir) ? `file:${rel.split(sep).join("/")}` : `file:${file}`;
}

function upsertManifestEntry(manifest: UploadManifest, entry: UploadManifestEntry): void {
  manifest.uploads = manifest.uploads.filter((item) => item.source !== entry.source);
  manifest.uploads.push(entry);
}

function validateSourceUrl(value?: string): void {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid --source-url: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("--source-url must use http or https.");
  }
}

function runVerifier(scriptDir: string, script: string, file: string, showWarnings = false, options: string[] = []): void {
  const result = spawnSync(process.execPath, [resolve(scriptDir, script), ...options, file], {
    cwd: scriptDir,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (showWarnings && /WARN|warning/i.test(output)) console.log(output);
  if (result.status !== 0) {
    const reason = result.error?.message || output || `exit status ${String(result.status)}`;
    throw new Error(`Preflight ${script} failed.\n${reason}`);
  }
}

function shortSrcForLog(src: string): string {
  if (src.startsWith("data:image/")) {
    const semicolon = src.indexOf(";");
    const mediaType = semicolon > 5 ? src.slice(5, semicolon) : "image data";
    return `[${mediaType} data URI, ${src.length} chars]`;
  }
  return src.length > 120 ? `${src.slice(0, 117)}...` : src;
}

function replaceImageSrc(html: string, oldSrc: string, newSrc: string): string {
  return html.replace(
    /(<img\b[^>]*\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, prefix: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
      const current = doubleQuoted || singleQuoted || unquoted || "";
      return current === oldSrc ? `${prefix}"${newSrc}"` : match;
    },
  );
}

function nonCopyReadyImageSrcs(html: string): string[] {
  return extractImageSrcs(html).filter((src) => {
    if (src.startsWith("data:image/")) return false;
    if (/^https?:\/\//i.test(src)) return false;
    return true;
  });
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function renderCopyReadyPreview(template: string, html: string): string {
  const controls = `<div class="copy-bar">
    <button class="btn-copy" onclick="copyArticle()">复制到公众号正文</button>
    <button class="btn-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">回到顶部</button>
  </div>`;
  return template
    .replace("{{ARTICLE_HTML}}", html.trim())
    .replace("{{PREVIEW_LABEL}}", "公众号复制版")
    .replace("{{PREVIEW_CONTROLS}}", controls);
}

async function writeCopyReadyOutputs(html: string, args: Args, scriptDir: string): Promise<void> {
  const bad = nonCopyReadyImageSrcs(html);
  if (bad.length) {
    throw new Error(
      "Cannot write WeChat copy-ready output because article still has local/non-web image src values: " +
        bad.join(", "),
    );
  }

  if (args.writeUploadedFragment) {
    const out = resolve(process.cwd(), args.writeUploadedFragment);
    await writeTextFile(out, `<!-- ARTICLE HTML START -->\n${html.trim()}\n<!-- ARTICLE HTML END -->\n`);
    console.log(`▶ Wrote uploaded-image fragment: ${out}`);
  }

  if (args.writeCopyReady) {
    const out = resolve(process.cwd(), args.writeCopyReady);
    const template = await readFile(resolve(scriptDir, "..", "references", "copy-preview-template.html"), "utf8");
    await writeTextFile(out, renderCopyReadyPreview(template, html));
    console.log(`▶ Wrote WeChat copy-ready preview: ${out}`);
  }
}

// For hand-written .html input: pull out the article content.
function extractArticleHtml(raw: string): string {
  const m = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
  if (m) return m[1].trim();
  if (/<html[\s>]/i.test(raw)) {
    throw new Error(
      "HTML file looks like a full document. Wrap the article content in\n" +
        "<!-- ARTICLE HTML START --> ... <!-- ARTICLE HTML END --> markers.",
    );
  }
  return raw.trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string): string {
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h ? stripTags(h[1]) : "";
}

function htmlDigest(html: string): string {
  return stripTags(html).slice(0, 120);
}

const defaultDeps: PublisherDeps = {
  resolveCredentials: resolveRuntimeCredentials,
  getAccessToken,
  uploadBodyImage,
  uploadCoverMaterial,
  addDraft,
  validateWechatHostedImage,
  generateCover,
  now: () => new Date().toISOString(),
};

export async function runPublish(argv: string[], overrides: Partial<PublisherDeps> = {}): Promise<PublishResult> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const deps: PublisherDeps = { ...defaultDeps, ...overrides };
  const args = parseArgs(argv);
  const inputPath = resolve(process.cwd(), args.input);
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  validateSourceUrl(args.sourceUrl);
  const tempDir = await mkdtemp(join(tmpdir(), "wechat-layout-publish-"));
  try {
    const articleDir = dirname(inputPath);
    const isHtml = /\.html?$/i.test(inputPath);
    if (!isHtml) {
      throw new Error(
        "Formal copy preparation and draft creation require component HTML. Markdown rendering is limited to local working previews; create and review the final HTML first.",
      );
    }
    if (!args.sourceArticle) {
      throw new Error("--source-article <original article> is required when publishing generated HTML.");
    }
    const imagePlanPath = resolve(process.cwd(), args.imagePlan!);
    if (!existsSync(imagePlanPath)) throw new Error(`Image plan not found: ${imagePlanPath}`);
    let contentMode = "";
    try {
      const imagePlan = JSON.parse(readFileSync(imagePlanPath, "utf8")) as { content_mode?: unknown };
      if (imagePlan.content_mode === "rewrite" || imagePlan.content_mode === "preserve") contentMode = imagePlan.content_mode;
    } catch (error) {
      throw new Error(`Invalid image plan JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!contentMode) throw new Error("image-plan.json must record content_mode as rewrite or preserve.");
    const sourceArticlePath = resolve(process.cwd(), args.sourceArticle || args.input);
    if (!existsSync(sourceArticlePath)) throw new Error(`Source article not found: ${sourceArticlePath}`);
    const allowedRoots = [articleDir, ...args.assetDirs.map((dir) => resolve(process.cwd(), dir))].map((dir) => {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Allowed asset directory not found: ${dir}`);
      return realpathSync(dir);
    });
    const raw = await readFile(inputPath, "utf8");
    const { data: fm, body } = parseFrontmatter(raw);

    let html = extractArticleHtml(body);
    console.log("▶ Using hand-written HTML article (component layout)...");

    const title = args.title || fm.title || htmlTitle(html);
    if (!title) throw new Error("No title found. Pass --title or add a frontmatter title.");
    const author = args.author || fm.author || "";
    const digest = args.digest || fm.description || fm.summary || fm.digest || htmlDigest(html);

    const preflightPath = join(tempDir, "article-preflight.html");
    await writeFile(preflightPath, html, "utf8");
    runVerifier(scriptDir, "verify-article.mjs", preflightPath, false, [
      "--complete-package",
      "--content-mode",
      contentMode,
      "--source-article",
      sourceArticlePath,
    ]);
    runVerifier(scriptDir, "verify-copy.mjs", preflightPath, true, contentMode === "rewrite" ? ["--strict"] : []);
    runVerifier(scriptDir, "validate-image-plan.mjs", imagePlanPath, true, [
      "--stage",
      "final",
      "--article",
      sourceArticlePath,
      "--check-files",
      ...(args.allowEvidenceFailure ? ["--allow-evidence-failure"] : []),
    ]);
    await validateVisualQaReceipt(resolve(process.cwd(), args.visualQa!), html);
    console.log("▶ Visual QA receipt matches the current article and includes mobile first-screen/full-page screenshots.");

    let coverPath = "";
    if (!args.prepareOnly) {
      coverPath = args.cover ? assertAllowedLocalFile(resolve(process.cwd(), args.cover), allowedRoots) : "";
      if (!coverPath && fm.cover) {
        const candidate = resolve(articleDir, fm.cover);
        if (existsSync(candidate)) coverPath = assertAllowedLocalFile(candidate, allowedRoots);
      }
      if (!coverPath && !args.genCover) {
        throw new Error("A cover image is required for draft mode. Pass --cover <path> or --gen-cover.");
      }
    }

    const manifestPath = resolve(args.uploadManifest || join(articleDir, "wechat-upload-manifest.json"));
    const manifest = await loadUploadManifest(manifestPath);
    const bodyImageFiles = new Map<string, string>();
    const allSrcs = [...new Set(extractImageSrcs(html))];
    const wechatHostedSrcs = allSrcs.filter(isWechatHosted);
    const srcs = allSrcs.filter((src) => !isWechatHosted(src));
    for (const src of srcs) {
      if (!/^https?:\/\//i.test(src)) {
        bodyImageFiles.set(src, await resolveImageToFile(src, articleDir, tempDir, allowedRoots));
      }
    }

    if (coverPath) {
      const preparedCover = join(tempDir, "wechat-headline-cover.jpg");
      await prepareHeadlineCover(coverPath, preparedCover);
      coverPath = preparedCover;
      console.log(`▶ 2.35:1 cover preflight passed: ${coverPath}`);
    }

    const env = loadEnv(scriptDir);
    const credentials = await deps.resolveCredentials(env);
    const requireWechatCredentials = (): { appId: string; appSecret: string } => {
      const appId = credentials.wechatAppId;
      const appSecret = credentials.wechatAppSecret;
      if (!appId || !appSecret) {
        const missing = [!appId && "WECHAT_APP_ID", !appSecret && "WECHAT_APP_SECRET"].filter(Boolean) as string[];
        throw new Error(missingCredentialMessage(missing));
      }
      return { appId, appSecret };
    };
    let wechatCredentials = args.prepareOnly ? undefined : requireWechatCredentials();

    if (!coverPath && args.genCover) {
      const key = credentials.openaiApiKey;
      if (!key) throw new Error(missingCredentialMessage(["OPENAI_API_KEY"]) + " It is required only when using --gen-cover.");
      console.log("▶ Generating and cropping 2.35:1 cover image via OpenAI...");
      const semanticDirection = args.coverPrompt || fm.cover_prompt || "";
      coverPath = await deps.generateCover(
        coverPrompt(title, semanticDirection),
        key,
        args.model || credentials.openaiImageModel || "gpt-image-2",
        join(tempDir, "wechat-headline-cover.jpg"),
        title,
      );
      console.log(`  ✓ 2.35:1 cover prepared: ${coverPath}`);
    }

    await mapWithConcurrency(
      srcs.filter((src) => /^https?:\/\//i.test(src)),
      4,
      async (src) => {
        bodyImageFiles.set(src, await resolveImageToFile(src, articleDir, tempDir, allowedRoots));
      },
    );
    await mapWithConcurrency(wechatHostedSrcs, 4, async (src) => {
      const buffer = await deps.validateWechatHostedImage(src);
      const format = detectImageFormat(buffer);
      if (!format || (format.extension !== "png" && format.extension !== "jpg")) {
        throw new Error(`Existing WeChat-hosted body image is not a real PNG/JPEG: ${src}`);
      }
      const path = join(tempDir, `wechat-hosted-${Math.random().toString(36).slice(2)}.${format.extension}`);
      await writeFile(path, buffer);
      bodyImageFiles.set(src, path);
    });

    await assertArticleImagesMatchPlan(imagePlanPath, html, bodyImageFiles);

    console.log(`▶ Title: ${title}`);
    const pendingUploads: Array<{ src: string; file: string; sha256: string; source: string }> = [];
    for (const src of srcs) {
      const file = bodyImageFiles.get(src)!;
      const sha256 = await sha256File(file);
      const source = manifestSource(src, file, articleDir, sha256);
      const cached = manifest.uploads.find((entry) => entry.source === source && entry.sha256 === sha256);
      if (cached) {
        try {
          await deps.validateWechatHostedImage(cached.wechat_url);
          html = replaceImageSrc(html, src, cached.wechat_url);
          console.log(`  ↻ reused ${shortSrcForLog(src)} → ${cached.wechat_url}`);
          continue;
        } catch {
          console.log(`  ! cached WeChat URL is unavailable; re-uploading ${shortSrcForLog(src)}`);
        }
      }
      pendingUploads.push({ src, file, sha256, source });
    }

    let token = "";
    if (pendingUploads.length || !args.prepareOnly) {
      wechatCredentials ||= requireWechatCredentials();
      console.log("▶ Fetching WeChat access token...");
      token = await deps.getAccessToken(wechatCredentials.appId, wechatCredentials.appSecret);
    }

    if (pendingUploads.length) console.log(`▶ Uploading ${pendingUploads.length} inline image(s) to WeChat...`);
    const uploadedByHash = new Map<string, string>();
    for (const item of pendingUploads) {
      let url = uploadedByHash.get(item.sha256);
      if (!url) {
        url = await deps.uploadBodyImage(item.file, token);
        if (!isWechatHosted(url)) throw new Error(`WeChat uploadimg returned a non-WeChat URL: ${url}`);
        uploadedByHash.set(item.sha256, url);
      }
      html = replaceImageSrc(html, item.src, url);
      upsertManifestEntry(manifest, {
        source: item.source,
        sha256: item.sha256,
        wechat_url: url,
        uploaded_at: deps.now(),
      });
      await writeUploadManifestAtomic(manifestPath, manifest);
      console.log(`  ✓ ${shortSrcForLog(item.src)} → ${url}`);
    }

    const copyReadyPath = join(tempDir, "article-copy-ready.html");
    await writeFile(copyReadyPath, html, "utf8");
    runVerifier(scriptDir, "verify-copy-ready.mjs", copyReadyPath);

    if (args.writeUploadedFragment || args.writeCopyReady) {
      await writeCopyReadyOutputs(html, args, scriptDir);
    }

    const resultBase = {
      content: html,
      uploadedFragmentPath: args.writeUploadedFragment ? resolve(process.cwd(), args.writeUploadedFragment) : undefined,
      copyReadyPath: args.writeCopyReady ? resolve(process.cwd(), args.writeCopyReady) : undefined,
      uploadManifestPath: manifestPath,
    };

    if (args.prepareOnly) {
      console.log("\n✅ 正文图片已准备，可复制；未创建草稿。");
      return { mode: "prepare-only", ...resultBase };
    }

    console.log("▶ Uploading cover to WeChat material library...");
    const thumbMediaId = await deps.uploadCoverMaterial(coverPath, token);

    console.log("▶ Creating draft...");
    const draftId = await deps.addDraft(
      {
        title,
        author,
        digest,
        content: html,
        thumbMediaId,
        contentSourceUrl: args.sourceUrl,
        needOpenComment: args.noComment ? 0 : 1,
      },
      token,
    );

    console.log("\n✅ Draft created in WeChat Official Account draft box");
    console.log(`   Title:    ${title}`);
    console.log(`   Author:   ${author || "(none)"}`);
    console.log(`   Digest:   ${digest}`);
    console.log(`   draft media_id: ${draftId}`);
    if (args.writeUploadedFragment) console.log(`   uploaded fragment: ${resolve(process.cwd(), args.writeUploadedFragment)}`);
    if (args.writeCopyReady) console.log(`   copy-ready preview: ${resolve(process.cwd(), args.writeCopyReady)}`);
    console.log("   Open https://mp.weixin.qq.com → 内容管理 → 草稿箱 to preview & publish.");
    return { mode: "draft", draftMediaId: draftId, ...resultBase };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  runPublish(process.argv.slice(2)).catch((err) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

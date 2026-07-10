import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderArticle, extractImageSrcs } from "./render.ts";
import { getAccessToken, uploadBodyImage, uploadCoverMaterial, addDraft } from "./wechat.ts";
import { generateCover, coverPrompt } from "./imagegen.ts";
import { missingCredentialMessage, resolveRuntimeCredentials } from "./credentials.ts";
import { detectImageFormat } from "./image-utils.ts";
import { safeFetchBuffer } from "./safe-fetch.ts";
import { prepareHeadlineCover } from "./cover-image.ts";

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
}

function parseArgs(argv: string[]): Args {
  const a: Args = { input: "", genCover: false, noComment: false, allowEvidenceFailure: false, assetDirs: [] };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--gen-cover") a.genCover = true;
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
    else if (t === "--asset-dir") a.assetDirs.push(value(t, i++));
    else if (t.startsWith("--")) throw new Error(`Unknown option: ${t}`);
    else if (!t.startsWith("--") && !a.input) a.input = t;
    else throw new Error(`Unexpected positional argument: ${t}`);
  }
  if (!a.input) {
    throw new Error(
      "Usage: publish.ts <article.html|article.md> --image-plan <image-plan.json> [--source-article <original.md>] [--title ..] [--cover <path> | --gen-cover] [--asset-dir <allowed-dir>] [--cover-prompt ..] [--author ..] [--digest ..] [--no-comment] [--allow-evidence-failure] [--write-uploaded-fragment <path>] [--write-copy-ready <path>]",
    );
  }
  if (!a.imagePlan) throw new Error("--image-plan <image-plan.json> is required for draft publishing.");
  if (a.cover && a.genCover) throw new Error("Use either --cover or --gen-cover, not both.");
  return a;
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

function autoTitle(body: string): string {
  const h = body.match(/^#{1,3}\s+(.+)$/m);
  return h ? h[1].trim() : "";
}

function autoDigest(body: string): string {
  const plain = body
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 120);
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

async function validateWechatHostedImage(src: string): Promise<void> {
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

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(process.cwd(), args.input);
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  validateSourceUrl(args.sourceUrl);
  const tempDir = await mkdtemp(join(tmpdir(), "wechat-layout-publish-"));
  try {
    const articleDir = dirname(inputPath);
    const isHtml = /\.html?$/i.test(inputPath);
    if (isHtml && !args.sourceArticle) {
      throw new Error("--source-article <original article> is required when publishing generated HTML.");
    }
    const imagePlanPath = resolve(process.cwd(), args.imagePlan!);
    if (!existsSync(imagePlanPath)) throw new Error(`Image plan not found: ${imagePlanPath}`);
    const sourceArticlePath = resolve(process.cwd(), args.sourceArticle || args.input);
    if (!existsSync(sourceArticlePath)) throw new Error(`Source article not found: ${sourceArticlePath}`);
    const allowedRoots = [articleDir, ...args.assetDirs.map((dir) => resolve(process.cwd(), dir))].map((dir) => {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Allowed asset directory not found: ${dir}`);
      return realpathSync(dir);
    });
    const raw = await readFile(inputPath, "utf8");
    const { data: fm, body } = parseFrontmatter(raw);

    let html: string;
    if (isHtml) {
      html = extractArticleHtml(body);
      console.log("▶ Using hand-written HTML article (component layout)...");
    } else {
      html = renderArticle(body);
      console.log("▶ Rendering markdown → WeChat-compliant HTML (fallback theme)...");
    }

    const title = args.title || fm.title || (isHtml ? htmlTitle(html) : autoTitle(body));
    if (!title) throw new Error("No title found. Pass --title or add a frontmatter title.");
    const author = args.author || fm.author || "";
    const digest =
      args.digest || fm.description || fm.summary || fm.digest || (isHtml ? htmlDigest(html) : autoDigest(body));

    const preflightPath = join(tempDir, "article-preflight.html");
    await writeFile(preflightPath, html, "utf8");
    runVerifier(scriptDir, "verify-article.mjs", preflightPath);
    runVerifier(scriptDir, "verify-copy.mjs", preflightPath, true);
    runVerifier(scriptDir, "validate-image-plan.mjs", imagePlanPath, true, [
      "--stage",
      "final",
      "--article",
      sourceArticlePath,
      "--check-files",
      ...(args.allowEvidenceFailure ? ["--allow-evidence-failure"] : []),
    ]);

    let coverPath = args.cover ? assertAllowedLocalFile(resolve(process.cwd(), args.cover), allowedRoots) : "";
    if (!coverPath && fm.cover) {
      const candidate = resolve(articleDir, fm.cover);
      if (existsSync(candidate)) coverPath = assertAllowedLocalFile(candidate, allowedRoots);
    }
    if (!coverPath && !args.genCover) {
      throw new Error("A cover image is required. Pass --cover <path> or --gen-cover.");
    }

    const bodyImageFiles = new Map<string, string>();
    const allSrcs = [...new Set(extractImageSrcs(html))];
    const wechatHostedSrcs = allSrcs.filter(isWechatHosted);
    for (const src of wechatHostedSrcs) await validateWechatHostedImage(src);
    const srcs = allSrcs.filter((src) => !isWechatHosted(src));
    for (const src of srcs) {
      bodyImageFiles.set(src, await resolveImageToFile(src, articleDir, tempDir, allowedRoots));
    }

    if (coverPath) {
      const preparedCover = join(tempDir, "wechat-headline-cover.jpg");
      await prepareHeadlineCover(coverPath, preparedCover);
      coverPath = preparedCover;
      console.log(`▶ 2.35:1 cover preflight passed: ${coverPath}`);
    }

    const env = loadEnv(scriptDir);
    const credentials = await resolveRuntimeCredentials(env);

    if (!coverPath && args.genCover) {
      const key = credentials.openaiApiKey;
      if (!key) throw new Error(missingCredentialMessage(["OPENAI_API_KEY"]) + " It is required only when using --gen-cover.");
      console.log("▶ Generating and cropping 2.35:1 cover image via OpenAI...");
      const semanticDirection = args.coverPrompt || fm.cover_prompt || "";
      coverPath = await generateCover(
        coverPrompt(title, semanticDirection),
        key,
        args.model || credentials.openaiImageModel || "gpt-image-2",
        join(tempDir, "wechat-headline-cover.jpg"),
      );
      console.log(`  ✓ 2.35:1 cover prepared: ${coverPath}`);
    }

    const appId = credentials.wechatAppId;
    const appSecret = credentials.wechatAppSecret;
    if (!appId || !appSecret) {
      const missing = [!appId && "WECHAT_APP_ID", !appSecret && "WECHAT_APP_SECRET"].filter(Boolean) as string[];
      throw new Error(missingCredentialMessage(missing));
    }

    console.log(`▶ Title: ${title}`);
    console.log("▶ Fetching WeChat access token...");
    const token = await getAccessToken(appId, appSecret);

    if (srcs.length) console.log(`▶ Uploading ${srcs.length} inline image(s) to WeChat...`);
    for (const src of srcs) {
      const file = bodyImageFiles.get(src)!;
      const url = await uploadBodyImage(file, token);
      html = replaceImageSrc(html, src, url);
      console.log(`  ✓ ${shortSrcForLog(src)} → ${url}`);
    }

    const copyReadyPath = join(tempDir, "article-copy-ready.html");
    await writeFile(copyReadyPath, html, "utf8");
    runVerifier(scriptDir, "verify-copy-ready.mjs", copyReadyPath);

    console.log("▶ Uploading cover to WeChat material library...");
    const thumbMediaId = await uploadCoverMaterial(coverPath, token);

    console.log("▶ Creating draft...");
    const draftId = await addDraft(
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

    if (args.writeUploadedFragment || args.writeCopyReady) {
      await writeCopyReadyOutputs(html, args, scriptDir);
    }

    console.log("\n✅ Draft created in WeChat Official Account draft box");
    console.log(`   Title:    ${title}`);
    console.log(`   Author:   ${author || "(none)"}`);
    console.log(`   Digest:   ${digest}`);
    console.log(`   draft media_id: ${draftId}`);
    if (args.writeUploadedFragment) console.log(`   uploaded fragment: ${resolve(process.cwd(), args.writeUploadedFragment)}`);
    if (args.writeCopyReady) console.log(`   copy-ready preview: ${resolve(process.cwd(), args.writeCopyReady)}`);
    console.log("   Open https://mp.weixin.qq.com → 内容管理 → 草稿箱 to preview & publish.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

#!/usr/bin/env -S npx tsx
/**
 * Convert a local or remote image into a base64 data URI for copy-preview mode.
 *
 * Cross-platform behavior:
 * - Downloads/reads and validates common image formats with Node APIs.
 * - On macOS, tries `sips` to downsize/compress oversized images.
 * - On Windows/Linux without an image compressor, fails clearly if the image is too large.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { detectImageFormat } from "./image-utils.ts";
import { safeFetchBuffer } from "./safe-fetch.ts";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function die(msg: string): never {
  throw new Error(msg);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let src = "";
  let maxKb = 980;
  let maxPx = 1080;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--max-kb") maxKb = Number(args[++i]);
    else if (a === "--max-px") maxPx = Number(args[++i]);
    else if (a.startsWith("--")) die(`未知参数: ${a}`);
    else if (!src) src = a;
  }
  if (!src) die("用法: npx tsx img2base64.ts <图片URL或本地路径> [--max-kb 980] [--max-px 1080]");
  if (!Number.isFinite(maxKb) || maxKb <= 0) die("--max-kb 必须是正数");
  if (!Number.isFinite(maxPx) || maxPx <= 0) die("--max-px 必须是正数");
  return { src, maxKb, maxPx };
}

function sizeKb(path: string): number {
  return statSync(path).size / 1024;
}

async function fetchToFile(src: string, dir: string): Promise<string> {
  const out = join(dir, `input-${basename(src).replace(/[^\w.-]+/g, "-") || "image"}`);
  if (existsSync(src)) {
    await copyFile(src, out);
    return out;
  }

  if (!/^https?:\/\//i.test(src)) die(`既不是有效 URL 也不是存在的本地路径: ${src}`);
  process.stderr.write(`↓ 下载 ${src}\n`);
  const downloaded = await safeFetchBuffer(src, {
    maxBytes: 20 * 1024 * 1024,
    timeoutMs: 20000,
    headers: { "User-Agent": BROWSER_UA },
    expectedContentTypePrefix: "image/",
  });
  writeFileSync(out, downloaded.buffer);
  return out;
}

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tryMacCompress(input: string, dir: string, maxKb: number, maxPx: number): string | undefined {
  if (process.platform !== "darwin" || !commandExists("sips")) return undefined;
  const jpg = join(dir, "compressed.jpg");
  for (const q of [85, 72, 60, 48, 35]) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(q), "-Z", String(maxPx), input, "--out", jpg]);
    process.stderr.write(`  压缩 q=${q} → ${sizeKb(jpg).toFixed(0)}KB\n`);
    if (sizeKb(jpg) <= maxKb) return jpg;
  }
  return undefined;
}

async function main() {
  const { src, maxKb, maxPx } = parseArgs();
  const dir = mkdtempSync(join(tmpdir(), "img2b64-"));
  try {
    let finalPath = await fetchToFile(src, dir);

    let buf = readFileSync(finalPath);
    const format = detectImageFormat(buf);
    if (!format) die("抓到的不是 PNG/JPEG/GIF/WebP 图片，可能是反爬网页或无效文件。换一张真实图片直链。");
    let mime = format.mime;
    process.stderr.write(`✓ 是图片: ${mime}, ${sizeKb(finalPath).toFixed(0)}KB\n`);

    if (sizeKb(finalPath) > maxKb) {
      const compressed = tryMacCompress(finalPath, dir, maxKb, maxPx);
      if (compressed) {
        finalPath = compressed;
        mime = "image/jpeg";
      }
    }

    if (sizeKb(finalPath) > maxKb) {
      die(
        `图片 ${sizeKb(finalPath).toFixed(0)}KB > ${maxKb}KB。` +
          "请换更小图片，或先用本机图片工具压缩后再运行。macOS 会自动尝试用 sips 压缩，Windows/Linux 默认不引入重型图片压缩依赖。",
      );
    }

    buf = readFileSync(finalPath);
    const b64 = buf.toString("base64");
    process.stderr.write(`✓ 完成: ${mime}, base64 长度 ${(b64.length / 1024).toFixed(0)}KB\n`);
    process.stdout.write(`data:${mime};base64,${b64}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

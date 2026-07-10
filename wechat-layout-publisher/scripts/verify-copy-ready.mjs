#!/usr/bin/env node
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node verify-copy-ready.mjs [--allow-remote] [--allow-data-uri] <preview-or-fragment.html>");
  process.exit(2);
}

const allowRemote = process.argv.includes("--allow-remote");
const allowDataUri = process.argv.includes("--allow-data-uri");
const file = process.argv.slice(2).find((arg) => arg !== "--allow-remote" && arg !== "--allow-data-uri");
if (!file) usage();

function isWechatHosted(src) {
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

function validDataImage(src) {
  const match = src.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || match[2].length % 4 !== 0) return false;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) return false;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return match[1].toLowerCase() === "png" ? png : jpeg;
}

const raw = readFileSync(file, "utf8");
const marker = raw.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
const body = marker ? marker[1] : raw;
const imgs = [...body.matchAll(/<img\b[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)].map(
  (m) => m[1] || m[2] || m[3] || "",
);

let failed = 0;
let warned = 0;
for (const src of imgs) {
  if (isWechatHosted(src)) {
    console.log(`PASS WeChat-hosted image: ${src.slice(0, 80)}${src.length > 80 ? "..." : ""}`);
    continue;
  }
  if (/^https?:\/\//i.test(src)) {
    if (allowRemote) {
      warned++;
      console.log(`WARN remote http(s) image allowed by --allow-remote. Test paste behavior or upload via publish.ts: ${src.slice(0, 100)}${src.length > 100 ? "..." : ""}`);
      continue;
    }
    failed++;
    console.log(`FAIL remote http(s) image is not WeChat-hosted. Upload via publish.ts or rerun with --allow-remote only after manual paste verification: ${src.slice(0, 100)}${src.length > 100 ? "..." : ""}`);
    continue;
  }
  if (/^data:image\//i.test(src)) {
    if (!validDataImage(src)) {
      failed++;
      console.log("FAIL malformed or unsupported data URI image.");
    } else if (allowDataUri) {
      warned++;
      console.log("WARN valid data URI allowed by --allow-data-uri. Use only after a real WeChat paste test.");
    } else {
      failed++;
      console.log("FAIL data URI image is not proven WeChat-copy-ready. Upload it to WeChat or use --allow-data-uri only after a real paste test.");
    }
    continue;
  }
  failed++;
  console.log(`FAIL local/non-web image src will disappear after paste: ${src}`);
}

if (failed) {
  console.error(`\nCopy-ready verification failed: ${failed} image(s) are not confirmed WeChat-copy-ready.`);
  process.exit(1);
}

console.log(`\nCopy-ready verification passed. Images: ${imgs.length}. Warnings: ${warned}.`);

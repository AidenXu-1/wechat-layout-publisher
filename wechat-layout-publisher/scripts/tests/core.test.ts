import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { prepareHeadlineCover, HEADLINE_COVER_HEIGHT, HEADLINE_COVER_WIDTH } from "../cover-image.ts";
import { detectImageFormat } from "../image-utils.ts";
import { assertSafeRemoteUrl, isBlockedIp } from "../safe-fetch.ts";
import { landscapeSize } from "../imagegen.ts";

const scriptDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("private and reserved network targets are blocked", async () => {
  for (const value of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "198.18.0.1",
    "::1",
    "fc00::1",
    "::ffff:7f00:1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2001:2::1",
    "2002:7f00:1::",
  ]) {
    assert.equal(isBlockedIp(value), true, value);
  }
  await assert.rejects(() => assertSafeRemoteUrl("http://127.0.0.1/image.png"), /private|reserved/i);
  await assert.rejects(() => assertSafeRemoteUrl("http://localhost/image.png"), /private|local/i);
  await assert.rejects(() => assertSafeRemoteUrl("https://user:pass@example.com/image.png"), /credentials/i);
  assert.equal(isBlockedIp("64:ff9b::808:808"), false);
  assert.equal(isBlockedIp("2002:0808:0808::"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("OpenAI image model sizes stay inside documented enums", () => {
  assert.equal(landscapeSize("gpt-image-2"), "1536x1024");
  assert.equal(landscapeSize("gpt-image-1.5"), "1536x1024");
  assert.equal(landscapeSize("dall-e-3"), "1792x1024");
  assert.equal(landscapeSize("dall-e-2"), "1024x1024");
  assert.throws(() => landscapeSize("unknown-image-model"), /Unsupported/);
});

async function writeValidPlan(dir: string, assetName: string): Promise<string> {
  const plan = join(dir, "image-plan.json");
  await writeFile(
    plan,
    JSON.stringify({
      image_generation_capability: "available",
      image_generation_tool: "test-image-tool",
      content_type: "opinion",
      classification_confidence: 0.9,
      classification_signals: ["non-news test article"],
      supplied_assets: [],
      visuals: [
        {
          id: "hero",
          order: 1,
          section: "lead",
          placement: "after introduction",
          role: "hero",
          source_type: "generated_image",
          semantic_reason: "test editorial image",
          prompt: "text-free editorial image",
          provider: "test-image-tool",
          status: "ready",
          asset_path: assetName,
        },
      ],
    }),
    "utf8",
  );
  return plan;
}

test("image format detection uses file bytes", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#ffffff" },
  }).png().toBuffer();
  assert.deepEqual(detectImageFormat(png), { extension: "png", mime: "image/png" });
  assert.equal(detectImageFormat(Buffer.from("not an image")), undefined);
});

test("headline cover is always cropped to 900x383", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-cover-test-"));
  try {
    const input = join(dir, "input.png");
    const output = join(dir, "cover.jpg");
    await sharp({
      create: { width: 1536, height: 1024, channels: 3, background: "#d68163" },
    }).png().toFile(input);
    await prepareHeadlineCover(input, output);
    const metadata = await sharp(await readFile(output)).metadata();
    assert.equal(metadata.width, HEADLINE_COVER_WIDTH);
    assert.equal(metadata.height, HEADLINE_COVER_HEIGHT);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unsafe article fails before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-preflight-test-"));
  try {
    const article = join(dir, "unsafe.html");
    const imagePlan = join(dir, "image-plan.json");
    await writeFile(article, '<p style="margin:0" onclick="alert(1)">unsafe</p>', "utf8");
    await writeFile(imagePlan, "{}", "utf8");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(scriptDir, "publish.ts"),
        article,
        "--title",
        "Unsafe test",
        "--image-plan",
        imagePlan,
        "--source-article",
        article,
        "--cover",
        join(dir, "missing.jpg"),
      ],
      { cwd: scriptDir, encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /Preflight verify-article\.mjs failed/);
    assert.doesNotMatch(output, /Fetching WeChat access token/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated HTML cannot omit the original source article", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-source-article-test-"));
  try {
    const article = join(dir, "article.html");
    const imagePlan = join(dir, "image-plan.json");
    await writeFile(article, '<section style="margin:0"><p style="margin:0">rewritten summary</p></section>', "utf8");
    await writeFile(imagePlan, "{}", "utf8");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Source gate", "--image-plan", imagePlan, "--cover", join(dir, "missing.png")],
      { cwd: scriptDir, encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /--source-article.*required/i);
    assert.doesNotMatch(output, /Fetching WeChat access token/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("draft publishing requires and enforces the final image plan before credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-plan-preflight-test-"));
  try {
    const article = join(dir, "article.html");
    const cover = join(dir, "cover.png");
    const badPlan = join(dir, "bad-plan.json");
    await writeFile(article, '<section style="margin:0"><p style="margin:0">2026年7月10日，某公司推出新功能。</p></section>', "utf8");
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#ffffff" } }).png().toFile(cover);
    await writeFile(
      badPlan,
      JSON.stringify({
        image_generation_capability: "available",
        image_generation_tool: "test-image-tool",
        content_type: "opinion",
        classification_confidence: 0.9,
        classification_signals: ["incorrect opinion classification"],
        supplied_assets: [],
        visuals: [
          {
            id: "hero",
            order: 1,
            section: "lead",
            placement: "after introduction",
            role: "hero",
            source_type: "generated_image",
            semantic_reason: "test image",
            prompt: "test image",
            provider: "test-image-tool",
            status: "ready",
            asset_path: "cover.png"
          }
        ]
      }),
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Plan preflight", "--image-plan", badPlan, "--source-article", article, "--cover", cover],
      { cwd: scriptDir, encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /Preflight validate-image-plan\.mjs failed/);
    assert.match(output, /looks news-like/i);
    assert.doesNotMatch(output, /Fetching WeChat access token/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("all body images fail local preflight before credentials or WeChat requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-image-preflight-test-"));
  try {
    const article = join(dir, "article.html");
    const badImage = join(dir, "bad.png");
    const cover = join(dir, "cover.png");
    await writeFile(article, '<section style="margin:0"><p style="margin:0">hello</p><img src="bad.png" style="width:100%" /></section>', "utf8");
    await writeFile(badImage, "not an image", "utf8");
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#ffffff" } }).png().toFile(cover);
    const imagePlan = await writeValidPlan(dir, "cover.png");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Preflight", "--image-plan", imagePlan, "--source-article", article, "--cover", cover],
      { cwd: scriptDir, encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /must be real PNG or JPEG/i);
    assert.doesNotMatch(output, /Fetching WeChat access token/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("article paths cannot escape allowed asset directories", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-asset-boundary-test-"));
  try {
    const articleDir = join(dir, "article");
    await mkdir(articleDir);
    const article = join(articleDir, "article.html");
    const outside = join(dir, "outside.png");
    const cover = join(articleDir, "cover.png");
    await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ffffff" } }).png().toFile(outside);
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#ffffff" } }).png().toFile(cover);
    await writeFile(article, '<section style="margin:0"><img src="../outside.png" style="width:100%" /></section>', "utf8");
    const imagePlan = await writeValidPlan(articleDir, "cover.png");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Boundary", "--image-plan", imagePlan, "--source-article", article, "--cover", cover],
      { cwd: scriptDir, encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /outside the article or allowed asset directories/i);
    assert.doesNotMatch(output, /Fetching WeChat access token/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { coverPrompt, landscapeSize } from "../imagegen.ts";
import { runPublish } from "../publish.ts";
import type { PublisherDeps } from "../publish.ts";
import { articleSha256, extractArticleFragment } from "../visual-qa.ts";
import type { DraftArticle } from "../wechat.ts";

const scriptDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = resolve(scriptDir, "..");

function completeArticle(imageSrc: string, body = "这里是导语，帮读者进入正文。"): string {
  return `<section style="margin:0;padding:20px;">
  <h1 style="margin:0 0 12px;font-size:22px;">一个完整的测试标题</h1>
  <p style="margin:0 0 18px;font-size:13px;color:#888888;">一句克制的副标题</p>
  <section style="margin:0 0 20px;"><img data-wlp-visual-id="hero" src="${imageSrc}" style="display:block;width:100%;height:auto;" /></section>
  <section style="margin:0 0 18px;"><p style="margin:0;font-size:15px;line-height:1.8;">${body}</p></section>
</section>`;
}

interface MockCalls {
  token: number;
  body: string[];
  cover: string[];
  drafts: DraftArticle[];
  validated: string[];
}

function publisherMock(invalidUrls = new Set<string>()): {
  calls: MockCalls;
  deps: Partial<PublisherDeps>;
  hostedContent: Map<string, Buffer>;
} {
  const calls: MockCalls = { token: 0, body: [], cover: [], drafts: [], validated: [] };
  const hostedContent = new Map<string, Buffer>();
  const deps: Partial<PublisherDeps> = {
    resolveCredentials: async () => ({ wechatAppId: "test-app", wechatAppSecret: "test-secret" }),
    getAccessToken: async () => {
      calls.token++;
      return "test-token";
    },
    uploadBodyImage: async (path) => {
      calls.body.push(path);
      const url = `https://mmbiz.qpic.cn/mock/body-${calls.body.length}.png`;
      hostedContent.set(url, await readFile(path));
      return url;
    },
    uploadCoverMaterial: async (path) => {
      calls.cover.push(path);
      return "mock-cover-media-id";
    },
    addDraft: async (article) => {
      calls.drafts.push(article);
      return "mock-draft-media-id";
    },
    validateWechatHostedImage: async (src) => {
      calls.validated.push(src);
      if (invalidUrls.has(src)) throw new Error("mock URL expired");
      const buffer = hostedContent.get(src);
      if (!buffer) throw new Error(`mock hosted image bytes missing for ${src}`);
      return buffer;
    },
    now: () => "2026-07-14T00:00:00.000Z",
  };
  return { calls, deps, hostedContent };
}

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

async function writeValidPlan(
  dir: string,
  assetName: string,
  extraAssetNames: string[] = [],
  contentMode: "rewrite" | "preserve" = "rewrite",
): Promise<string> {
  const plan = join(dir, "image-plan.json");
  const visuals = [
    {
      id: "hero",
      order: 1,
      section: "lead",
      placement: "after introduction",
      role: "hero",
      source_type: "generated_image",
      semantic_reason: "test editorial image",
      title_text: "一个完整的测试标题",
      prompt: "2.35:1 editorial hero with the exact title integrated into the composition",
      provider: "test-image-tool",
      status: "ready",
      asset_path: assetName,
    },
    ...(await Promise.all(extraAssetNames.map(async (name, index) => ({
      id: `evidence-${index + 1}`,
      order: index + 2,
      section: `evidence-${index + 1}`,
      placement: "after supported claim",
      role: "evidence",
      source_type: "evidence_screenshot",
      semantic_reason: `proves test claim ${index + 1}`,
      source_url: `https://example.com/evidence-${index + 1}`,
      source_tier: "official",
      status: "captured",
      captured_at: "2026-07-14T00:00:00.000Z",
      asset_sha256: `sha256:${createHash("sha256").update(await readFile(join(dir, name))).digest("hex")}`,
      asset_path: name,
    })))),
  ];
  await writeFile(
    plan,
    JSON.stringify({
      runtime: "test-agent",
      content_mode: contentMode,
      image_generation_capability: "available",
      image_generation_tool: "test-image-tool",
      content_type: "opinion",
      classification_confidence: 0.9,
      classification_signals: ["non-news test article"],
      supplied_assets: [],
      visuals,
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

test("image plans require content mode, runtime, data provenance, and emit density review warnings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-plan-contract-test-"));
  try {
    const planPath = join(dir, "image-plan.json");
    const plan = {
      image_generation_capability: "available",
      image_generation_tool: "test-image-tool",
      content_type: "knowledge",
      classification_confidence: 0.9,
      classification_signals: ["data-backed explanation"],
      supplied_assets: [],
      visuals: [
        {
          id: "hero",
          order: 1,
          section: "lead",
          placement: "after subtitle",
          role: "hero",
          source_type: "generated_image",
          semantic_reason: "sets the explanatory frame",
          title_text: "一个完整的测试标题",
          prompt: "2.35:1 editorial hero with the exact title integrated into the composition",
          provider: "test-image-tool",
          status: "ready",
          asset_path: "hero.png",
        },
        {
          id: "data",
          order: 2,
          section: "lead",
          placement: "after data paragraph",
          role: "data",
          source_type: "coded_visual",
          semantic_kind: "data",
          semantic_reason: "sets the explanatory frame",
          status: "ready",
          asset_path: "data.svg",
        },
      ],
    };
    const run = () =>
      spawnSync(process.execPath, [resolve(scriptDir, "validate-image-plan.mjs"), "--stage", "final", planPath], {
        cwd: scriptDir,
        encoding: "utf8",
      });

    await writeFile(planPath, JSON.stringify(plan), "utf8");
    let result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /runtime is required/i);
    assert.match(`${result.stdout}${result.stderr}`, /content_mode must be rewrite or preserve/i);

    (plan as typeof plan & { runtime: string }).runtime = "test-agent";
    (plan as typeof plan & { content_mode: string }).content_mode = "rewrite";
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /data_sources/i);

    (plan.visuals[1] as typeof plan.visuals[1] & { data_sources: string[] }).data_sources = ["invented-source"];
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /http\(s\) URLs/i);

    (plan.visuals[1] as typeof plan.visuals[1] & { data_sources: string[] }).data_sources = ["https://example.com/data"];
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /Reading unit "lead" has 2 visuals/i);
    assert.match(`${result.stdout}${result.stderr}`, /repeat the same semantic reason/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("captured evidence requires provenance hash and phone-readable dimensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-evidence-readable-test-"));
  try {
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#efe6d9" } }).png().toFile(join(dir, "hero.png"));
    await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } }).png().toFile(join(dir, "evidence.png"));
    const planPath = await writeValidPlan(dir, "hero.png", ["evidence.png"]);
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.content_type = "news_event";
    plan.classification_signals = ["official announcement"];
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    const run = (allowFailure = false) => spawnSync(process.execPath, [
      resolve(scriptDir, "validate-image-plan.mjs"),
      "--stage",
      "final",
      "--check-files",
      ...(allowFailure ? ["--allow-evidence-failure"] : []),
      planPath,
    ], { cwd: scriptDir, encoding: "utf8" });
    const tiny = run();
    assert.notEqual(tiny.status, 0);
    assert.match(`${tiny.stdout}${tiny.stderr}`, /too small to be readable/i);

    await sharp({ create: { width: 640, height: 360, channels: 3, background: "#ffffff" } }).png().toFile(join(dir, "evidence.png"));
    plan.visuals[1].asset_sha256 = `sha256:${createHash("sha256").update(await readFile(join(dir, "evidence.png"))).digest("hex")}`;
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    const readable = run();
    assert.equal(readable.status, 0, `${readable.stdout}${readable.stderr}`);

    plan.visuals[1].status = "attempt_failed";
    plan.visuals[1].failure_reason = "source required login";
    delete plan.visuals[1].asset_path;
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    const unstructuredFailure = run(true);
    assert.notEqual(unstructuredFailure.status, 0);
    assert.match(`${unstructuredFailure.stdout}${unstructuredFailure.stderr}`, /failure_code|attempted_at/i);
    plan.visuals[1].failure_code = "login_required";
    plan.visuals[1].attempted_at = "2026-07-14T00:00:00.000Z";
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    const documentedFailure = run(true);
    assert.equal(documentedFailure.status, 0, `${documentedFailure.stdout}${documentedFailure.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the first visual must be a ready 2.35:1 generated hero with an integrated title record", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-generated-hero-gate-test-"));
  try {
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#efe6d9" } }).png().toFile(join(dir, "hero.png"));
    const planPath = await writeValidPlan(dir, "hero.png");
    const run = () => spawnSync(process.execPath, [
      resolve(scriptDir, "validate-image-plan.mjs"),
      "--stage",
      "final",
      "--check-files",
      planPath,
    ], { cwd: scriptDir, encoding: "utf8" });

    let result = run();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

    const plan = JSON.parse(await readFile(planPath, "utf8"));
    delete plan.visuals[0].title_text;
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /title_text/i);

    plan.visuals[0].title_text = "一个完整的测试标题";
    plan.visuals[0].source_type = "user_asset";
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /first visual must use source_type=generated_image/i);

    plan.visuals[0].source_type = "generated_image";
    plan.visuals[0].status = "captured";
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /generated hero must have status=ready/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unsafe article fails before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-preflight-test-"));
  try {
    const article = join(dir, "unsafe.html");
    const imagePlan = join(dir, "image-plan.json");
    await writeFile(article, completeArticle("https://mmbiz.qpic.cn/mock/hero.png").replace("<section style=\"margin:0;padding:20px;\">", '<section style="margin:0;padding:20px;" onclick="alert(1)">'), "utf8");
    await writeFile(imagePlan, JSON.stringify({ content_mode: "rewrite" }), "utf8");
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
        "--create-draft",
        "--visual-qa",
        join(dir, "unused-visual-qa.json"),
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
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Source gate", "--image-plan", imagePlan, "--create-draft", "--visual-qa", join(dir, "unused-visual-qa.json"), "--cover", join(dir, "missing.png")],
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
    await writeFile(article, completeArticle("cover.png", "2026年7月10日，某公司推出新功能。"), "utf8");
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#ffffff" } }).png().toFile(cover);
    await writeFile(
      badPlan,
      JSON.stringify({
        content_mode: "rewrite",
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
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Plan preflight", "--image-plan", badPlan, "--source-article", article, "--create-draft", "--visual-qa", join(dir, "unused-visual-qa.json"), "--cover", cover],
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
    await writeFile(article, completeArticle("bad.png"), "utf8");
    await writeFile(badImage, "not an image", "utf8");
    await sharp({ create: { width: 900, height: 383, channels: 3, background: "#ffffff" } }).png().toFile(cover);
    const imagePlan = await writeValidPlan(dir, "cover.png");
    const visualQa = await writeVisualQa(dir, article);
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Preflight", "--image-plan", imagePlan, "--source-article", article, "--create-draft", "--visual-qa", visualQa, "--cover", cover],
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
    await writeFile(article, completeArticle("../outside.png"), "utf8");
    const imagePlan = await writeValidPlan(articleDir, "cover.png");
    const visualQa = await writeVisualQa(articleDir, article);
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(scriptDir, "publish.ts"), article, "--title", "Boundary", "--image-plan", imagePlan, "--source-article", article, "--create-draft", "--visual-qa", visualQa, "--cover", cover],
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

async function writeVisualQa(dir: string, article: string, suffix = ""): Promise<string> {
  const viewportName = `qa-viewport${suffix}.png`;
  const fullPageName = `qa-full-page${suffix}.png`;
  const receipt = join(dir, `visual-qa${suffix}.json`);
  const viewportPath = join(dir, viewportName);
  const fullPagePath = join(dir, fullPageName);
  await sharp({ create: { width: 390, height: 760, channels: 3, background: "#ffffff" } }).png().toFile(viewportPath);
  await sharp({ create: { width: 390, height: 1800, channels: 3, background: "#ffffff" } }).png().toFile(fullPagePath);
  const html = extractArticleFragment(await readFile(article, "utf8"));
  await writeFile(
    receipt,
    JSON.stringify({
      schema_version: 1,
      article_sha256: articleSha256(html),
      checked_width_px: 390,
      viewport_screenshot: viewportName,
      viewport_sha256: createHash("sha256").update(await readFile(viewportPath)).digest("hex"),
      full_page_screenshot: fullPageName,
      full_page_sha256: createHash("sha256").update(await readFile(fullPagePath)).digest("hex"),
      first_screen_checked: true,
      full_page_checked: true,
      hero_title_exact: true,
      hero_text_integrated: true,
      status: "passed",
      unresolved_issues: [],
      reviewed_at: "2026-07-14T00:00:00.000Z",
    }),
    "utf8",
  );
  return receipt;
}

async function writePublishFixture(dir: string, withSecondImage = false) {
  const hero = join(dir, "hero.png");
  const evidence = join(dir, "evidence.png");
  const cover = join(dir, "cover.png");
  await sharp({ create: { width: 900, height: 383, channels: 3, background: "#efe6d9" } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383"><text x="70" y="205" font-size="42" font-weight="700" fill="#252525">一个完整的测试标题</text><circle cx="760" cy="190" r="92" fill="#d68163"/></svg>`) }])
    .png()
    .toFile(hero);
  if (withSecondImage) {
    await sharp({ create: { width: 320, height: 240, channels: 3, background: "#8f9b83" } }).png().toFile(evidence);
  }
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#f4eee5" } }).png().toFile(cover);
  const extra = withSecondImage
    ? '<section style="margin:18px 0;"><img data-wlp-visual-id="evidence-1" src="evidence.png" style="display:block;width:100%;height:auto;" /></section>'
    : "";
  const article = join(dir, "article.html");
  await writeFile(article, `${completeArticle("hero.png")}\n${extra}`, "utf8");
  const source = join(dir, "source.html");
  await writeFile(source, await readFile(article, "utf8"), "utf8");
  const imagePlan = await writeValidPlan(dir, "hero.png", withSecondImage ? ["evidence.png"] : []);
  const visualQa = await writeVisualQa(dir, article);
  return { article, source, imagePlan, hero, evidence, cover, visualQa };
}

test("prepare-only uploads body images and writes verified copy outputs without creating a draft", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-prepare-only-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const fragment = join(dir, "prepared-fragment.html");
    const preview = join(dir, "copy-ready-preview.html");
    const manifest = join(dir, "upload-manifest.json");
    const { calls, deps } = publisherMock();
    const result = await runPublish(
      [
        fixture.article,
        "--prepare-only",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        fixture.visualQa,
        "--upload-manifest",
        manifest,
        "--write-uploaded-fragment",
        fragment,
        "--write-copy-ready",
        preview,
      ],
      deps,
    );

    assert.equal(result.mode, "prepare-only");
    assert.equal(calls.body.length, 1);
    assert.equal(calls.cover.length, 0);
    assert.equal(calls.drafts.length, 0);
    assert.equal(calls.token, 1);
    const fragmentHtml = await readFile(fragment, "utf8");
    const previewHtml = await readFile(preview, "utf8");
    assert.match(fragmentHtml, /ARTICLE HTML START/);
    assert.match(fragmentHtml, /https:\/\/mmbiz\.qpic\.cn\/mock\/body-1\.png/);
    assert.doesNotMatch(fragmentHtml, /btn-copy|copyArticle|复制到公众号正文|回到顶部/);
    assert.match(previewHtml, /btn-copy/);
    assert.match(previewHtml, /公众号复制版/);
    const verify = spawnSync(process.execPath, [resolve(scriptDir, "verify-copy-ready.mjs"), preview], {
      cwd: scriptDir,
      encoding: "utf8",
    });
    assert.equal(verify.status, 0, `${verify.stdout}${verify.stderr}`);
    const stored = JSON.parse(await readFile(manifest, "utf8"));
    assert.deepEqual(Object.keys(stored).sort(), ["schema_version", "uploads"]);
    assert.deepEqual(Object.keys(stored.uploads[0]).sort(), ["sha256", "source", "uploaded_at", "wechat_url"]);
    assert.doesNotMatch(JSON.stringify(stored), /test-app|test-secret|token/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("omitting a delivery-mode flag defaults safely to copy preparation, never draft creation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-safe-default-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const { calls, deps } = publisherMock();
    const result = await runPublish(
      [
        fixture.article,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        fixture.visualQa,
        "--write-uploaded-fragment",
        join(dir, "prepared.html"),
      ],
      deps,
    );
    assert.equal(result.mode, "prepare-only");
    assert.equal(calls.body.length, 1);
    assert.equal(calls.cover.length, 0);
    assert.equal(calls.drafts.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Markdown cannot bypass component HTML and visual review into formal delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-markdown-formal-gate-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const markdown = join(dir, "article.md");
    await writeFile(markdown, "# 标题\n\n副标题\n\n正文。", "utf8");
    const { calls, deps } = publisherMock();
    await assert.rejects(
      () => runPublish([
        markdown,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        markdown,
        "--visual-qa",
        fixture.visualQa,
        "--write-uploaded-fragment",
        join(dir, "prepared.html"),
      ], deps),
      /require component HTML/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing or stale visual QA evidence stops before every WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-visual-qa-gate-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const { calls, deps } = publisherMock();
    await assert.rejects(
      () => runPublish([
        fixture.article,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--write-uploaded-fragment",
        join(dir, "missing-qa.html"),
      ], deps),
      /--visual-qa/i,
    );
    await writeFile(fixture.article, completeArticle("hero.png", "视觉审查之后正文又被修改。"), "utf8");
    await assert.rejects(
      () => runPublish([
        fixture.article,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        fixture.visualQa,
        "--write-uploaded-fragment",
        join(dir, "stale-qa.html"),
      ], deps),
      /does not match the current article HTML/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("visual QA recorder validates screenshot artifacts and binds the current article hash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-visual-qa-recorder-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const out = join(dir, "recorded-visual-qa.json");
    const baseArgs = [
      "--import",
      "tsx",
      resolve(scriptDir, "visual-qa.ts"),
      "--article",
      fixture.article,
      "--viewport-screenshot",
      join(dir, "qa-viewport.png"),
      "--full-page-screenshot",
      join(dir, "qa-full-page.png"),
      "--width",
      "390",
      "--out",
      out,
      "--confirm-reviewed",
    ];
    const missingHeroReview = spawnSync(process.execPath, baseArgs, { cwd: scriptDir, encoding: "utf8" });
    assert.notEqual(missingHeroReview.status, 0);
    assert.match(`${missingHeroReview.stdout}${missingHeroReview.stderr}`, /confirm-hero-title/i);
    const result = spawnSync(
      process.execPath,
      [
        ...baseArgs,
        "--confirm-hero-title",
        "--confirm-hero-integration",
      ],
      { cwd: scriptDir, encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const receipt = JSON.parse(await readFile(out, "utf8"));
    assert.equal(receipt.article_sha256, articleSha256(extractArticleFragment(await readFile(fixture.article, "utf8"))));
    assert.equal(receipt.status, "passed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("formal delivery rejects a generated hero whose title record differs from the H1", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-hero-title-binding-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const plan = JSON.parse(await readFile(fixture.imagePlan, "utf8"));
    plan.visuals[0].title_text = "不一致的标题";
    await writeFile(fixture.imagePlan, JSON.stringify(plan), "utf8");
    const { calls, deps } = publisherMock();
    await assert.rejects(
      () => runPublish([
        fixture.article,
        "--prepare-only",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        fixture.visualQa,
        "--write-uploaded-fragment",
        join(dir, "prepared.html"),
      ], deps),
      /title_text exactly matches the article H1/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("draft mode reuses a prepared fragment and sends only article HTML to draft/add", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-prepared-draft-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const preparedBody = completeArticle("https://mmbiz.qpic.cn/mock/prepared.png");
    const prepared = join(dir, "prepared.html");
    await writeFile(prepared, `<!-- ARTICLE HTML START -->\n${preparedBody}\n<!-- ARTICLE HTML END -->\n`, "utf8");
    const visualQa = await writeVisualQa(dir, prepared, "-prepared");
    const { calls, deps, hostedContent } = publisherMock();
    hostedContent.set("https://mmbiz.qpic.cn/mock/prepared.png", await readFile(fixture.hero));
    const result = await runPublish(
      [
        prepared,
        "--create-draft",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        visualQa,
        "--cover",
        fixture.cover,
        "--upload-manifest",
        join(dir, "upload-manifest.json"),
      ],
      deps,
    );

    assert.equal(result.mode, "draft");
    assert.equal(result.draftMediaId, "mock-draft-media-id");
    assert.equal(calls.body.length, 0);
    assert.equal(calls.cover.length, 1);
    assert.equal(calls.drafts.length, 1);
    assert.equal(calls.drafts[0].content, preparedBody);
    assert.doesNotMatch(calls.drafts[0].content, /ARTICLE HTML|btn-copy|copyArticle|回到顶部|<script/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("direct draft mode uploads local body images once, then uploads the cover and creates a draft", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-direct-draft-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const { calls, deps } = publisherMock();
    await runPublish(
      [
        fixture.article,
        "--create-draft",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        fixture.visualQa,
        "--cover",
        fixture.cover,
        "--upload-manifest",
        join(dir, "upload-manifest.json"),
      ],
      deps,
    );
    assert.equal(calls.body.length, 1);
    assert.equal(calls.cover.length, 1);
    assert.equal(calls.drafts.length, 1);
    assert.match(calls.drafts[0].content, /https:\/\/mmbiz\.qpic\.cn\/mock\/body-1\.png/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("upload manifest reuses unchanged images, uploads only changed images, and replaces expired URLs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-manifest-reuse-test-"));
  try {
    const fixture = await writePublishFixture(dir, true);
    const manifest = join(dir, "upload-manifest.json");
    const output = join(dir, "prepared.html");
    const invalidUrls = new Set<string>();
    const { calls, deps } = publisherMock(invalidUrls);
    const args = [
      fixture.article,
      "--prepare-only",
      "--image-plan",
      fixture.imagePlan,
      "--source-article",
      fixture.source,
      "--visual-qa",
      fixture.visualQa,
      "--upload-manifest",
      manifest,
      "--write-uploaded-fragment",
      output,
    ];

    await runPublish(args, deps);
    assert.equal(calls.body.length, 2);

    await writeFile(fixture.article, `${completeArticle("hero.png", "只改了正文文字。")}\n<section style="margin:18px 0;"><img data-wlp-visual-id="evidence-1" src="evidence.png" style="display:block;width:100%;height:auto;" /></section>`, "utf8");
    args[args.indexOf("--visual-qa") + 1] = await writeVisualQa(dir, fixture.article, "-text-change");
    await runPublish(args, deps);
    assert.equal(calls.body.length, 2, "text changes must not re-upload body images");

    await sharp({ create: { width: 320, height: 240, channels: 3, background: "#252525" } }).png().toFile(fixture.evidence);
    const changedPlan = JSON.parse(await readFile(fixture.imagePlan, "utf8"));
    changedPlan.visuals[1].asset_sha256 = `sha256:${createHash("sha256").update(await readFile(fixture.evidence)).digest("hex")}`;
    await writeFile(fixture.imagePlan, JSON.stringify(changedPlan), "utf8");
    await runPublish(args, deps);
    assert.equal(calls.body.length, 3, "changing one of two images must upload only that image");

    invalidUrls.add("https://mmbiz.qpic.cn/mock/body-3.png");
    await runPublish(args, deps);
    assert.equal(calls.body.length, 4, "an expired manifest URL must be replaced safely");
    const currentManifest = await readFile(manifest, "utf8");
    assert.match(currentManifest, /body-4\.png/);
    assert.doesNotMatch(currentManifest, /body-3\.png/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing credentials stop before any WeChat transport call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-missing-credentials-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const { calls, deps } = publisherMock();
    deps.resolveCredentials = async () => ({});
    await assert.rejects(
      () =>
        runPublish(
          [
            fixture.article,
            "--prepare-only",
            "--image-plan",
            fixture.imagePlan,
            "--source-article",
            fixture.source,
            "--visual-qa",
            fixture.visualQa,
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /Missing WECHAT_APP_ID \/ WECHAT_APP_SECRET/,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preserve mode rejects rewritten source copy before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-preserve-publish-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const plan = JSON.parse(await readFile(fixture.imagePlan, "utf8"));
    plan.content_mode = "preserve";
    await writeFile(fixture.imagePlan, JSON.stringify(plan), "utf8");
    await writeFile(fixture.source, completeArticle("hero.png", "这是必须原样保留的正文。"), "utf8");
    const { calls, deps } = publisherMock();

    await assert.rejects(
      () =>
        runPublish(
          [
            fixture.article,
            "--prepare-only",
            "--image-plan",
            fixture.imagePlan,
            "--source-article",
            fixture.source,
            "--visual-qa",
            fixture.visualQa,
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /preserve mode changed, deleted, reordered, or added unapproved/i,
    );
    assert.equal(calls.token, 0);
    assert.equal(calls.body.length, 0);
    assert.equal(calls.cover.length, 0);
    assert.equal(calls.drafts.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publish rejects plan/body image drift in both directions before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-plan-body-binding-test-"));
  try {
    const fixture = await writePublishFixture(dir, true);
    const plan = JSON.parse(await readFile(fixture.imagePlan, "utf8"));
    plan.visuals = plan.visuals.slice(0, 1);
    await writeFile(fixture.imagePlan, JSON.stringify(plan), "utf8");
    const { calls, deps } = publisherMock();
    await assert.rejects(
      () =>
        runPublish(
          [
            fixture.article,
            "--prepare-only",
            "--image-plan",
            fixture.imagePlan,
            "--source-article",
            fixture.source,
            "--visual-qa",
            fixture.visualQa,
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /visual identity\/order does not match/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });

    await writeFile(fixture.article, completeArticle("hero.png"), "utf8");
    plan.visuals.push({
      id: "unused-evidence",
      order: 2,
      section: "evidence",
      placement: "after supported claim",
      role: "evidence",
      source_type: "evidence_screenshot",
      semantic_reason: "proves a claim",
      source_url: "https://example.com/evidence",
      source_tier: "official",
      status: "captured",
      captured_at: "2026-07-14T00:00:00.000Z",
      asset_sha256: `sha256:${createHash("sha256").update(await readFile(fixture.evidence)).digest("hex")}`,
      asset_path: "evidence.png",
    });
    await writeFile(fixture.imagePlan, JSON.stringify(plan), "utf8");
    const updatedVisualQa = await writeVisualQa(dir, fixture.article, "-unused-plan");
    await assert.rejects(
      () =>
        runPublish(
          [
            fixture.article,
            "--prepare-only",
            "--image-plan",
            fixture.imagePlan,
            "--source-article",
            fixture.source,
            "--visual-qa",
            updatedVisualQa,
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /visual identity\/order does not match/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("complete-package first visual must be 2.35:1 before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-hero-ratio-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    await sharp({ create: { width: 900, height: 506, channels: 3, background: "#d68163" } }).png().toFile(fixture.hero);
    const { calls, deps } = publisherMock();
    await assert.rejects(
      () =>
        runPublish(
          [
            fixture.article,
            "--prepare-only",
            "--image-plan",
            fixture.imagePlan,
            "--source-article",
            fixture.source,
            "--visual-qa",
            fixture.visualQa,
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /first visual must use the 2\.35:1 article-hero ratio/i,
    );
    assert.deepEqual(calls, { token: 0, body: [], cover: [], drafts: [], validated: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prepare-only with already hosted body images needs no WeChat credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-hosted-prepare-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const hostedArticle = join(dir, "hosted.html");
    await writeFile(hostedArticle, completeArticle("https://mmbiz.qpic.cn/mock/already-hosted.png"), "utf8");
    const visualQa = await writeVisualQa(dir, hostedArticle, "-hosted");
    const { calls, deps, hostedContent } = publisherMock();
    hostedContent.set("https://mmbiz.qpic.cn/mock/already-hosted.png", await readFile(fixture.hero));
    deps.resolveCredentials = async () => ({});
    const result = await runPublish(
      [
        hostedArticle,
        "--prepare-only",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        visualQa,
        "--write-uploaded-fragment",
        join(dir, "prepared.html"),
      ],
      deps,
    );
    assert.equal(result.mode, "prepare-only");
    assert.equal(calls.token, 0);
    assert.equal(calls.body.length, 0);
    assert.equal(calls.cover.length, 0);
    assert.equal(calls.drafts.length, 0);
    assert.deepEqual(calls.validated, ["https://mmbiz.qpic.cn/mock/already-hosted.png"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a WeChat-hosted image must still match the planned visual bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-hosted-binding-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const hostedUrl = "https://mmbiz.qpic.cn/mock/wrong-hosted.png";
    const hostedArticle = join(dir, "hosted-wrong.html");
    await writeFile(hostedArticle, completeArticle(hostedUrl), "utf8");
    const visualQa = await writeVisualQa(dir, hostedArticle, "-hosted-wrong");
    const { calls, deps, hostedContent } = publisherMock();
    hostedContent.set(hostedUrl, await sharp({ create: { width: 900, height: 383, channels: 3, background: "#111111" } }).png().toBuffer());
    await assert.rejects(
      () => runPublish([
        hostedArticle,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
        "--visual-qa",
        visualQa,
        "--write-uploaded-fragment",
        join(dir, "prepared.html"),
      ], deps),
      /does not match the asset registered in the final image plan/i,
    );
    assert.equal(calls.token, 0);
    assert.equal(calls.body.length, 0);
    assert.equal(calls.cover.length, 0);
    assert.equal(calls.drafts.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("complete-package verification enforces H1, subtitle, hero, and lead order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-complete-package-test-"));
  try {
    const valid = join(dir, "valid.html");
    await writeFile(valid, completeArticle("hero.png"), "utf8");
    const source = join(dir, "source.md");
    await writeFile(source, "# 原始标题\n\n正文结论。", "utf8");
    const run = (file: string, sourceFile?: string, contentMode: "rewrite" | "preserve" = "rewrite") =>
      spawnSync(process.execPath, [
        resolve(scriptDir, "verify-article.mjs"),
        "--complete-package",
        "--content-mode",
        contentMode,
        ...(sourceFile ? ["--source-article", sourceFile] : []),
        file,
      ], {
        cwd: scriptDir,
        encoding: "utf8",
      });
    assert.equal(run(valid).status, 0);

    const missingH1 = join(dir, "missing-h1.html");
    await writeFile(missingH1, completeArticle("hero.png").replace(/<h1[\s\S]*?<\/h1>/i, ""), "utf8");
    assert.notEqual(run(missingH1).status, 0);

    const missingSubtitle = join(dir, "missing-subtitle.html");
    await writeFile(
      missingSubtitle,
      completeArticle("hero.png").replace(/<p style="margin:0 0 18px;font-size:13px;[\s\S]*?<\/p>/i, ""),
      "utf8",
    );
    assert.notEqual(run(missingSubtitle).status, 0);

    const wrongOrder = join(dir, "wrong-order.html");
    await writeFile(
      wrongOrder,
      '<section style="margin:0;"><img src="hero.png" style="width:100%;" /><h1 style="margin:0;">标题</h1><p style="margin:0;font-size:13px;">副标题</p><p style="margin:0;font-size:15px;">导语</p></section>',
      "utf8",
    );
    assert.notEqual(run(wrongOrder).status, 0);

    const genericClosing = join(dir, "generic-closing.html");
    await writeFile(
      genericClosing,
      `${completeArticle("hero.png")}<h2 style="margin:0;">写在最后</h2><p style="margin:0;">收束。</p>`,
      "utf8",
    );
    assert.notEqual(run(genericClosing, source).status, 0);

    const sourceWithGeneric = join(dir, "source-with-generic.md");
    await writeFile(sourceWithGeneric, "# 原始标题\n\n## 写在最后\n\n收束。", "utf8");
    assert.equal(run(genericClosing, sourceWithGeneric).status, 0);

    const preservedSource = join(dir, "preserved-source.md");
    await writeFile(
      preservedSource,
      "# 一个完整的测试标题\n\n一句克制的副标题\n\n这里是导语，帮读者进入正文。",
      "utf8",
    );
    const preservedWithCaption = join(dir, "preserved-with-caption.html");
    await writeFile(
      preservedWithCaption,
      completeArticle("hero.png").replace(
        "</section>\n  <section style=\"margin:0 0 18px;\">",
        "</section><p data-wlp-added=\"caption\" style=\"margin:0;font-size:12px;\">图注：语义配图</p>\n  <section style=\"margin:0 0 18px;\">",
      ),
      "utf8",
    );
    const preservePass = run(preservedWithCaption, preservedSource, "preserve");
    assert.equal(preservePass.status, 0, `${preservePass.stdout}${preservePass.stderr}`);
    assert.match(`${preservePass.stdout}${preservePass.stderr}`, /exactly retained source copy/i);

    const rewrittenCopy = join(dir, "rewritten-copy.html");
    await writeFile(rewrittenCopy, completeArticle("hero.png", "这是经过改写的导语。"), "utf8");
    const preserveFail = run(rewrittenCopy, preservedSource, "preserve");
    assert.notEqual(preserveFail.status, 0);
    assert.match(`${preserveFail.stdout}${preserveFail.stderr}`, /preserve mode changed, deleted, reordered, or added unapproved/i);
    assert.equal(run(rewrittenCopy, preservedSource, "rewrite").status, 0);

    const unapprovedExtra = join(dir, "unapproved-extra.html");
    await writeFile(
      unapprovedExtra,
      completeArticle("hero.png").replace(
        "</section>\n  <section style=\"margin:0 0 18px;\">",
        "</section><p style=\"margin:0;\">这是原文没有的新观点。</p>\n  <section style=\"margin:0 0 18px;\">",
      ),
      "utf8",
    );
    assert.notEqual(run(unapprovedExtra, preservedSource, "preserve").status, 0);

    const hiddenSource = join(dir, "hidden-source.html");
    await writeFile(
      hiddenSource,
      completeArticle("hero.png", "这是完全改写的新正文。") + '<p style="display:none;">这里是导语，帮读者进入正文。</p>',
      "utf8",
    );
    const hiddenResult = run(hiddenSource, preservedSource, "preserve");
    assert.notEqual(hiddenResult.status, 0);
    assert.match(`${hiddenResult.stdout}${hiddenResult.stderr}`, /no visually hidden content/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("only verified copy-ready previews expose copy controls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-preview-state-test-"));
  try {
    const local = join(dir, "local.html");
    const fileUrl = join(dir, "file-url.html");
    const remote = join(dir, "remote.html");
    const hosted = join(dir, "hosted.html");
    await writeFile(local, completeArticle("hero.png"), "utf8");
    await writeFile(fileUrl, completeArticle("file:///tmp/hero.png"), "utf8");
    await writeFile(remote, completeArticle("https://example.com/hero.png"), "utf8");
    await writeFile(hosted, completeArticle("https://mmbiz.qpic.cn/mock/hero.png"), "utf8");
    for (const file of [local, fileUrl, remote]) {
      const verify = spawnSync(process.execPath, [resolve(scriptDir, "verify-copy-ready.mjs"), file], {
        cwd: scriptDir,
        encoding: "utf8",
      });
      assert.notEqual(verify.status, 0);
    }

    const localPreview = join(dir, "local-preview.html");
    const copyPreview = join(dir, "copy-preview.html");
    assert.equal(
      spawnSync(process.execPath, [resolve(scriptDir, "make-preview.mjs"), local, localPreview], { cwd: scriptDir }).status,
      0,
    );
    assert.equal(
      spawnSync(process.execPath, [resolve(scriptDir, "make-preview.mjs"), "--copy-ready", hosted, copyPreview], {
        cwd: scriptDir,
      }).status,
      0,
    );
    assert.doesNotMatch(await readFile(localPreview, "utf8"), /<button class="btn-copy"/);
    assert.match(await readFile(localPreview, "utf8"), /本地预览/);
    assert.match(await readFile(copyPreview, "utf8"), /<button class="btn-copy"/);

    const scripted = join(dir, "scripted.html");
    const srcset = join(dir, "srcset.html");
    await writeFile(scripted, `${completeArticle("https://mmbiz.qpic.cn/mock/hero.png")}<script>alert(1)</script>`, "utf8");
    await writeFile(
      srcset,
      completeArticle("https://mmbiz.qpic.cn/mock/hero.png").replace(
        'src="https://mmbiz.qpic.cn/mock/hero.png"',
        'src="https://mmbiz.qpic.cn/mock/hero.png" srcset="https://evil.example/other.png 2x"',
      ),
      "utf8",
    );
    for (const unsafe of [scripted, srcset]) {
      const result = spawnSync(process.execPath, [resolve(scriptDir, "make-preview.mjs"), "--copy-ready", unsafe, join(dir, `${unsafe === scripted ? "scripted" : "srcset"}-preview.html`)], {
        cwd: scriptDir,
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rewrite delivery treats copy-density and AI-smell warnings as blocking", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-copy-strict-test-"));
  try {
    const article = join(dir, "article.html");
    await writeFile(article, completeArticle("hero.png", "这不是一个普通问题，而是一个真正核心的问题。"), "utf8");
    const advisory = spawnSync(process.execPath, [resolve(scriptDir, "verify-copy.mjs"), article], { cwd: scriptDir });
    const strict = spawnSync(process.execPath, [resolve(scriptDir, "verify-copy.mjs"), "--strict", article], { cwd: scriptDir });
    assert.equal(advisory.status, 0);
    assert.notEqual(strict.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated hero prompt requires the exact title inside the composition", () => {
  const prompt = coverPrompt("真实标题进入安静构图区", "信任裂缝的编辑隐喻");
  assert.match(prompt, /真实标题进入安静构图区/);
  assert.match(prompt, /exact title once/i);
  assert.match(prompt, /2\.35:1/);
  assert.match(prompt, /white sticker|black mask/i);
  assert.doesNotMatch(prompt, /No text, letters/i);
});

test("default closing component does not inject a generic heading", async () => {
  const components = await readFile(resolve(skillDir, "references", "components.md"), "utf8");
  assert.doesNotMatch(components, />\s*(写在最后|总结|结语)\s*</);
});

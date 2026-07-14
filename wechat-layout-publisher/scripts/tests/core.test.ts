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
import { runPublish } from "../publish.ts";
import type { PublisherDeps } from "../publish.ts";
import type { DraftArticle } from "../wechat.ts";

const scriptDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = resolve(scriptDir, "..");

function completeArticle(imageSrc: string, body = "这里是导语，帮读者进入正文。"): string {
  return `<section style="margin:0;padding:20px;">
  <h1 style="margin:0 0 12px;font-size:22px;">一个完整的测试标题</h1>
  <p style="margin:0 0 18px;font-size:13px;color:#888888;">一句克制的副标题</p>
  <section style="margin:0 0 20px;"><img src="${imageSrc}" style="display:block;width:100%;height:auto;" /></section>
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

function publisherMock(invalidUrls = new Set<string>()): { calls: MockCalls; deps: Partial<PublisherDeps> } {
  const calls: MockCalls = { token: 0, body: [], cover: [], drafts: [], validated: [] };
  const deps: Partial<PublisherDeps> = {
    resolveCredentials: async () => ({ wechatAppId: "test-app", wechatAppSecret: "test-secret" }),
    getAccessToken: async () => {
      calls.token++;
      return "test-token";
    },
    uploadBodyImage: async (path) => {
      calls.body.push(path);
      return `https://mmbiz.qpic.cn/mock/body-${calls.body.length}.png`;
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
    },
    now: () => "2026-07-14T00:00:00.000Z",
  };
  return { calls, deps };
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

async function writeValidPlan(dir: string, assetName: string, extraAssetNames: string[] = []): Promise<string> {
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
      prompt: "text-free editorial image",
      provider: "test-image-tool",
      status: "ready",
      asset_path: assetName,
    },
    ...extraAssetNames.map((name, index) => ({
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
      asset_path: name,
    })),
  ];
  await writeFile(
    plan,
    JSON.stringify({
      runtime: "test-agent",
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

test("image plans require runtime, data provenance, and emit density review warnings", async () => {
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
          prompt: "text-free editorial image",
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

    (plan as typeof plan & { runtime: string }).runtime = "test-agent";
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

test("unsafe article fails before any WeChat request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-preflight-test-"));
  try {
    const article = join(dir, "unsafe.html");
    const imagePlan = join(dir, "image-plan.json");
    await writeFile(article, completeArticle("https://mmbiz.qpic.cn/mock/hero.png").replace("<section style=\"margin:0;padding:20px;\">", '<section style="margin:0;padding:20px;" onclick="alert(1)">'), "utf8");
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
    await writeFile(article, completeArticle("cover.png", "2026年7月10日，某公司推出新功能。"), "utf8");
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
    await writeFile(article, completeArticle("bad.png"), "utf8");
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
    await writeFile(article, completeArticle("../outside.png"), "utf8");
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

async function writePublishFixture(dir: string, withSecondImage = false) {
  const hero = join(dir, "hero.png");
  const evidence = join(dir, "evidence.png");
  const cover = join(dir, "cover.png");
  await sharp({ create: { width: 900, height: 383, channels: 3, background: "#d68163" } }).png().toFile(hero);
  if (withSecondImage) {
    await sharp({ create: { width: 320, height: 240, channels: 3, background: "#8f9b83" } }).png().toFile(evidence);
  }
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#f4eee5" } }).png().toFile(cover);
  const extra = withSecondImage
    ? '<section style="margin:18px 0;"><img src="evidence.png" style="display:block;width:100%;height:auto;" /></section>'
    : "";
  const article = join(dir, "article.html");
  await writeFile(article, `${completeArticle("hero.png")}\n${extra}`, "utf8");
  const source = join(dir, "source.html");
  await writeFile(source, await readFile(article, "utf8"), "utf8");
  const imagePlan = await writeValidPlan(dir, "hero.png", withSecondImage ? ["evidence.png"] : []);
  return { article, source, imagePlan, hero, evidence, cover };
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

test("draft mode reuses a prepared fragment and sends only article HTML to draft/add", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-prepared-draft-test-"));
  try {
    const fixture = await writePublishFixture(dir);
    const preparedBody = completeArticle("https://mmbiz.qpic.cn/mock/prepared.png");
    const prepared = join(dir, "prepared.html");
    await writeFile(prepared, `<!-- ARTICLE HTML START -->\n${preparedBody}\n<!-- ARTICLE HTML END -->\n`, "utf8");
    const { calls, deps } = publisherMock();
    const result = await runPublish(
      [
        prepared,
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
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
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
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
      "--upload-manifest",
      manifest,
      "--write-uploaded-fragment",
      output,
    ];

    await runPublish(args, deps);
    assert.equal(calls.body.length, 2);

    await writeFile(fixture.article, `${completeArticle("hero.png", "只改了正文文字。")}\n<section style="margin:18px 0;"><img src="evidence.png" style="display:block;width:100%;height:auto;" /></section>`, "utf8");
    await runPublish(args, deps);
    assert.equal(calls.body.length, 2, "text changes must not re-upload body images");

    await sharp({ create: { width: 320, height: 240, channels: 3, background: "#252525" } }).png().toFile(fixture.evidence);
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
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /not registered in the final image plan/i,
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
      asset_path: "evidence.png",
    });
    await writeFile(fixture.imagePlan, JSON.stringify(plan), "utf8");
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
            "--write-uploaded-fragment",
            join(dir, "prepared.html"),
          ],
          deps,
        ),
      /raster visuals that are not placed in the article body/i,
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
    const { calls, deps } = publisherMock();
    deps.resolveCredentials = async () => ({});
    const result = await runPublish(
      [
        hostedArticle,
        "--prepare-only",
        "--image-plan",
        fixture.imagePlan,
        "--source-article",
        fixture.source,
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

test("complete-package verification enforces H1, subtitle, hero, and lead order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-complete-package-test-"));
  try {
    const valid = join(dir, "valid.html");
    await writeFile(valid, completeArticle("hero.png"), "utf8");
    const source = join(dir, "source.md");
    await writeFile(source, "# 原始标题\n\n正文结论。", "utf8");
    const run = (file: string, sourceFile?: string) =>
      spawnSync(process.execPath, [
        resolve(scriptDir, "verify-article.mjs"),
        "--complete-package",
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated cover title composition stays at 900x383", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wechat-cover-title-test-"));
  try {
    const input = join(dir, "input.png");
    const plain = join(dir, "plain.jpg");
    const titled = join(dir, "titled.jpg");
    await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#efe6d9" } }).png().toFile(input);
    await prepareHeadlineCover(input, plain);
    await prepareHeadlineCover(input, titled, { title: "真实标题进入安静构图区" });
    const titledMetadata = await sharp(titled).metadata();
    assert.equal(titledMetadata.width, 900);
    assert.equal(titledMetadata.height, 383);
    assert.notDeepEqual(await readFile(plain), await readFile(titled));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("default closing component does not inject a generic heading", async () => {
  const components = await readFile(resolve(skillDir, "references", "components.md"), "utf8");
  assert.doesNotMatch(components, />\s*(写在最后|总结|结语)\s*</);
});

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "wechat-layout-validate-"));

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd: scriptDir,
    encoding: "utf8",
  });
  if (result.status !== expectedStatus) {
    console.error(`Command failed: node ${args.join(" ")}`);
    console.error(`Expected status ${expectedStatus}, got ${result.status}`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
}

try {
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=",
    "base64",
  );
  await sharp({ create: { width: 900, height: 383, channels: 3, background: "#efe6d9" } }).png().toFile(join(tmp, "hero.png"));
  await sharp({ create: { width: 640, height: 360, channels: 3, background: "#ffffff" } }).png().toFile(join(tmp, "evidence.png"));
  await sharp({ create: { width: 900, height: 383, channels: 3, background: "#d68163" } })
    .png()
    .toFile(join(tmp, "external-hero.png"));
  writeFileSync(
    join(tmp, "process.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect x="1" y="1" width="98" height="38" fill="#f7f2ea"/><text x="10" y="24" font-size="12">Step</text></svg>',
  );
  writeFileSync(join(tmp, "unsafe-process.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  writeFileSync(
    join(tmp, "external-process.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="//evil.example/a.png"/><image href="ftp://evil.example/b.png"/></svg>',
  );

  const safe = join(tmp, "safe.html");
  writeFileSync(
    safe,
    '<section style="margin:0;"><p style="margin:0;">ok</p><img src="https://mmbiz.qpic.cn/test.png" style="width:100%;display:block;" /></section>',
  );
  run(["verify-article.mjs", safe]);
  run(["verify-copy-ready.mjs", safe]);

  const localPreview = join(tmp, "local-preview.html");
  run(["make-preview.mjs", safe, localPreview]);
  const localPreviewHtml = readFileSync(localPreview, "utf8");
  if (localPreviewHtml.includes('<button class="btn-copy"') || !localPreviewHtml.includes("本地预览") || localPreviewHtml.includes("{{PREVIEW_")) {
    throw new Error("Local preview must be labeled local-only and must not expose the copy-to-WeChat button.");
  }

  run(["make-preview.mjs", "--copy-ready", safe, join(tmp, "forbidden-copy-preview.html")], 1);

  const fakeWechat = join(tmp, "fake-wechat.html");
  writeFileSync(fakeWechat, '<img src="https://mmbiz.qpic.cn.evil.example/test.png" style="width:100%;display:block;" />');
  run(["verify-copy-ready.mjs", fakeWechat], 1);

  const dataCopy = join(tmp, "data-copy.html");
  writeFileSync(dataCopy, `<img src="data:image/png;base64,${tinyPng.toString("base64")}" style="width:100%;display:block;" />`);
  run(["verify-copy-ready.mjs", dataCopy], 1);
  run(["verify-copy-ready.mjs", "--allow-data-uri", dataCopy]);

  const invalidDataCopy = join(tmp, "invalid-data-copy.html");
  writeFileSync(invalidDataCopy, '<img src="data:image/png;base64,NOT-BASE64" style="width:100%;display:block;" />');
  run(["verify-copy-ready.mjs", "--allow-data-uri", invalidDataCopy], 1);

  const unsafeArticle = join(tmp, "unsafe-article.html");
  writeFileSync(unsafeArticle, '<p style="margin:0;" onclick="alert(1)"><a href="javascript:alert(1)">bad</a></p>');
  run(["verify-article.mjs", unsafeArticle], 1);

  const unsafeCopy = join(tmp, "unsafe-copy.html");
  writeFileSync(unsafeCopy, '<img src="images/local.png" style="width:100%;display:block;" />');
  run(["verify-copy-ready.mjs", unsafeCopy], 1);

  const remoteCopy = join(tmp, "remote-copy.html");
  writeFileSync(remoteCopy, '<img src="https://example.com/a.png" style="width:100%;display:block;" />');
  run(["verify-copy-ready.mjs", remoteCopy], 1);
  run(["verify-copy-ready.mjs", "--allow-remote", remoteCopy]);
  run(["extract-video-frame.mjs", "--help"]);

  const newsPlan = join(tmp, "news-plan.json");
  writeFileSync(
    newsPlan,
    JSON.stringify({
      interaction_contract_version: 2,
      content_choice: "B",
      delivery_choice: "A",
      choice_source: "direct_user",
      runtime: "codex",
      destination: "wechat_official_account",
      entry_mode: "direct",
      input_stage: "draft_copy",
      content_mode: "rewrite",
      delivery_mode: "copy_ready",
      draft_authorization: "none",
      body_image_upload_authorization: "copy_ready_request",
      image_generation_capability: "available",
      image_generation_tool: "imagegen",
      content_type: "news_event",
      classification_confidence: 0.9,
      classification_signals: ["recent company announcement with official source"],
      first_section_visual_anchor: {
        status: "not_applicable",
        skip_reason: "快速验证短文没有二级正文标题，因此无需首节视觉锚点",
      },
      supplied_assets: [],
      visuals: [
        {
          id: "hero",
          order: 1,
          section: "lead",
          placement: "after subtitle",
          role: "hero",
          source_type: "generated_image",
          semantic_reason: "editorial metaphor for the event tension",
          title_text: "事件测试标题",
          prompt: "2.35:1 editorial metaphor with the exact title 事件测试标题 integrated",
          provider: "imagegen",
          status: "ready",
          asset_path: "hero.png",
          asset_dimensions: { width: 900, height: 383 },
        },
        {
          id: "evidence",
          order: 2,
          section: "event",
          placement: "after event claim",
          role: "evidence",
          source_type: "evidence_screenshot",
          semantic_reason: "proves the official announcement exists",
          semantic_signature: ["official announcement", "event evidence"],
          source_url: "https://example.com/official",
          source_tier: "official",
          crop_strategy: "focused",
          status: "captured",
          captured_at: "2026-07-14T00:00:00.000Z",
          asset_sha256: `sha256:${createHash("sha256").update(readFileSync(join(tmp, "evidence.png"))).digest("hex")}`,
          asset_path: "evidence.png",
          asset_dimensions: { width: 640, height: 360 },
        },
      ],
    }),
  );
  run(["validate-image-plan.mjs", "--stage", "final", newsPlan]);
  run(["validate-image-plan.mjs", "--stage", "final", "--check-files", newsPlan]);

  const codedPlan = join(tmp, "coded-plan.json");
  const coded = JSON.parse(readFileSync(newsPlan, "utf8"));
  coded.content_type = "knowledge";
  coded.classification_signals = ["structural tutorial"];
  coded.visuals = [
    coded.visuals[0],
    {
      id: "process",
      order: 2,
      section: "method",
      placement: "after steps",
      role: "explainer",
      source_type: "coded_visual",
      semantic_kind: "process",
      semantic_reason: "shows the sequence precisely",
      semantic_signature: ["first step", "second step"],
      status: "ready",
      asset_path: "process.svg",
      asset_sha256: `sha256:${createHash("sha256").update(readFileSync(join(tmp, "process.svg"))).digest("hex")}`,
      asset_dimensions: { width: 100, height: 40 },
    },
  ];
  writeFileSync(codedPlan, JSON.stringify(coded));
  run(["validate-image-plan.mjs", "--stage", "final", "--check-files", codedPlan]);
  coded.visuals[1].asset_path = "unsafe-process.svg";
  writeFileSync(codedPlan, JSON.stringify(coded));
  run(["validate-image-plan.mjs", "--stage", "final", "--check-files", codedPlan], 1);
  coded.visuals[1].asset_path = "external-process.svg";
  writeFileSync(codedPlan, JSON.stringify(coded));
  run(["validate-image-plan.mjs", "--stage", "final", "--check-files", codedPlan], 1);

  const directoryAssetPlan = join(tmp, "directory-asset-plan.json");
  const directoryAsset = JSON.parse(readFileSync(newsPlan, "utf8"));
  directoryAsset.visuals[1].asset_path = ".";
  writeFileSync(directoryAssetPlan, JSON.stringify(directoryAsset));
  run(["validate-image-plan.mjs", "--stage", "final", "--check-files", directoryAssetPlan], 1);

  const badNewsPlan = join(tmp, "bad-news-plan.json");
  writeFileSync(
    badNewsPlan,
    JSON.stringify({
      runtime: "codex",
      destination: "wechat_official_account",
      entry_mode: "direct",
      input_stage: "draft_copy",
      content_mode: "rewrite",
      delivery_mode: "copy_ready",
      draft_authorization: "none",
      body_image_upload_authorization: "copy_ready_request",
      image_generation_capability: "available",
      image_generation_tool: "imagegen",
      content_type: "news_event",
      classification_confidence: 0.8,
      classification_signals: ["recent public controversy"],
      supplied_assets: [],
      visuals: [
        {
          id: "diagram",
          order: 1,
          section: "event",
          placement: "after lead",
          role: "explainer",
          source_type: "coded_visual",
          semantic_kind: "process",
          semantic_reason: "summarizes the event process",
          status: "ready",
          asset_path: "images/process.svg",
        },
      ],
    }),
  );
  run(["validate-image-plan.mjs", "--stage", "final", badNewsPlan], 1);

  const badProviderPlan = join(tmp, "bad-provider-plan.json");
  const badProvider = JSON.parse(readFileSync(newsPlan, "utf8"));
  badProvider.visuals[0].provider = "coded-svg";
  writeFileSync(badProviderPlan, JSON.stringify(badProvider));
  run(["validate-image-plan.mjs", "--stage", "final", badProviderPlan], 1);

  const skippedUserAssetPlan = join(tmp, "skipped-user-asset-plan.json");
  writeFileSync(
    skippedUserAssetPlan,
    JSON.stringify({
      runtime: "codex",
      destination: "wechat_official_account",
      entry_mode: "direct",
      input_stage: "draft_copy",
      content_mode: "rewrite",
      delivery_mode: "copy_ready",
      draft_authorization: "none",
      body_image_upload_authorization: "copy_ready_request",
      image_generation_capability: "available",
      image_generation_tool: "imagegen",
      content_type: "experience",
      classification_confidence: 0.9,
      classification_signals: ["first-person project recap"],
      supplied_assets: [
        {
          id: "user-image",
          kind: "image",
          relevance: "relevant",
          decision: "skip",
          semantic_reason: "shows the exact project result",
        },
      ],
      visuals: [
        {
          id: "hero",
          order: 1,
          section: "lead",
          placement: "after subtitle",
          role: "hero",
          source_type: "generated_image",
          semantic_reason: "sets the project mood",
          title_text: "项目复盘测试标题",
          prompt: "2.35:1 editorial project still life with the exact title 项目复盘测试标题 integrated",
          provider: "imagegen",
          status: "ready",
          asset_path: "images/hero.jpg",
        },
      ],
    }),
  );
  run(["validate-image-plan.mjs", "--stage", "final", skippedUserAssetPlan], 1);

  const newsLikeArticle = join(tmp, "news-like.md");
  writeFileSync(
    newsLikeArticle,
    "2026年7月10日，某公司官方宣布上线新产品。据媒体报道，公告见 https://example.com/announcement 。",
  );
  const misclassifiedPlan = join(tmp, "misclassified-plan.json");
  const misclassified = JSON.parse(readFileSync(skippedUserAssetPlan, "utf8"));
  misclassified.supplied_assets = [];
  misclassified.content_type = "opinion";
  writeFileSync(misclassifiedPlan, JSON.stringify(misclassified));
  run(["validate-image-plan.mjs", "--stage", "plan", "--article", newsLikeArticle, misclassifiedPlan], 1);

  const fallbackPlan = join(tmp, "fallback-plan.json");
  const fallback = {
    interaction_contract_version: 2,
    content_choice: "C",
    delivery_choice: "A",
    choice_source: "direct_user",
    runtime: "generic-agent",
    destination: "wechat_official_account",
    entry_mode: "direct",
    input_stage: "final_copy",
    content_mode: "preserve",
    delivery_mode: "copy_ready",
    draft_authorization: "none",
    body_image_upload_authorization: "copy_ready_request",
    image_generation_capability: "unavailable",
    generation_capability_notice: "This Agent cannot generate bitmap images. A coded preview is ready for user choice.",
    content_type: "opinion",
    classification_confidence: 0.9,
    classification_signals: ["conceptual opinion essay"],
    first_section_visual_anchor: {
      status: "not_applicable",
      skip_reason: "快速验证短文没有二级正文标题，因此无需首节视觉锚点",
    },
    supplied_assets: [],
    visuals: [
      {
        id: "hero-fallback",
        order: 1,
        section: "lead",
        placement: "after subtitle",
        role: "hero",
        source_type: "coded_visual",
        semantic_kind: "editorial_fallback",
        fallback_for: "generated_image",
        semantic_reason: "temporary visual metaphor while bitmap generation is unavailable",
        desired_generation_prompt: "premium editorial metaphor, warm paper, no text",
        fallback_reason: "the current Agent has no image-generation tool",
        user_decision: "pending",
        status: "planned",
      },
    ],
  };
  writeFileSync(fallbackPlan, JSON.stringify(fallback));
  run(["validate-image-plan.mjs", "--stage", "plan", fallbackPlan], 1);
  run(["validate-image-plan.mjs", "--stage", "final", fallbackPlan], 1);

  fallback.visuals[0].user_decision = "accept_current";
  fallback.visuals[0].status = "ready";
  fallback.visuals[0].asset_path = "hero.png";
  writeFileSync(fallbackPlan, JSON.stringify(fallback));
  run(["validate-image-plan.mjs", "--stage", "final", fallbackPlan], 1);

  const unavailableGeneratedPlan = join(tmp, "unavailable-generated-plan.json");
  const unavailableGenerated = JSON.parse(JSON.stringify(fallback));
  unavailableGenerated.visuals[0] = {
    id: "hero",
    order: 1,
    section: "lead",
    placement: "after subtitle",
    role: "hero",
    source_type: "generated_image",
    semantic_reason: "desired editorial metaphor",
    title_text: "外部生成的测试标题",
    prompt: "2.35:1 editorial metaphor with the exact title 外部生成的测试标题 integrated",
    provider: "unavailable",
    status: "planned",
  };
  writeFileSync(unavailableGeneratedPlan, JSON.stringify(unavailableGenerated));
  run(["validate-image-plan.mjs", "--stage", "plan", unavailableGeneratedPlan], 1);

  unavailableGenerated.visuals[0].provider = "external_user_supplied";
  unavailableGenerated.visuals[0].user_decision = "replace_externally";
  unavailableGenerated.visuals[0].status = "ready";
  unavailableGenerated.visuals[0].asset_path = "external-hero.png";
  unavailableGenerated.visuals[0].asset_dimensions = { width: 900, height: 383 };
  writeFileSync(unavailableGeneratedPlan, JSON.stringify(unavailableGenerated));
  run(["validate-image-plan.mjs", "--stage", "final", unavailableGeneratedPlan]);

  console.log("quick-validate passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

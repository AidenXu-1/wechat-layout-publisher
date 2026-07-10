import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareHeadlineCover } from "./cover-image.ts";
import { safeFetchBuffer } from "./safe-fetch.ts";

const IMAGES_URL = "https://api.openai.com/v1/images/generations";

export interface GenOpts {
  model?: string;
  size?: string;
  quality?: string;
  outPath?: string;
}

// Keep request dimensions inside each model family's documented enum.
export function landscapeSize(model: string): string {
  if (model.startsWith("gpt-image-")) return "1536x1024";
  if (model.startsWith("dall-e-3")) return "1792x1024";
  if (model.startsWith("dall-e-2")) return "1024x1024";
  throw new Error(`Unsupported OpenAI image model: ${model}`);
}

// Generate an image via OpenAI and save it as a file. Returns the file path.
export async function generateImage(prompt: string, apiKey: string, opts: GenOpts = {}): Promise<string> {
  const model = opts.model || "gpt-image-2";
  const isDalle = model.startsWith("dall-e");
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: opts.size || landscapeSize(model),
  };
  if (opts.quality) body.quality = opts.quality;
  else if (model.startsWith("gpt-image-")) body.quality = "high";
  if (isDalle) body.response_format = "b64_json";

  let data: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const parsed = (await res.json()) as typeof data;
      if (!res.ok) {
        const message = parsed?.error?.message || `HTTP ${res.status}`;
        if ((res.status === 429 || res.status >= 500) && attempt < 3) {
          lastErr = new Error(message);
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          continue;
        }
        throw new Error(message);
      }
      data = parsed;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!data) throw new Error(`OpenAI image request failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  if (data.error) throw new Error(`OpenAI image generation failed: ${data.error.message}`);
  const item = data.data?.[0];
  if (!item) throw new Error("OpenAI image response missing data");

  let buf: Buffer;
  if (item.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const downloaded = await safeFetchBuffer(item.url, {
      maxBytes: 50 * 1024 * 1024,
      timeoutMs: 30000,
      expectedContentTypePrefix: "image/",
    });
    buf = downloaded.buffer;
  } else {
    throw new Error("OpenAI image response missing b64_json and url");
  }

  const path = opts.outPath || join(tmpdir(), `wechat-img-${Date.now()}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return path;
}

// Backwards-compatible cover helper used by publish.ts.
export async function generateCover(
  prompt: string,
  apiKey: string,
  model = "gpt-image-2",
  outPath = join(tmpdir(), `wechat-headline-cover-${Date.now()}.jpg`),
): Promise<string> {
  const rawPath = await generateImage(prompt, apiKey, { model });
  try {
    return await prepareHeadlineCover(rawPath, outPath);
  } finally {
    await rm(rawPath, { force: true });
  }
}

// Build a cover prompt from the article title. Aims for a clean, text-free editorial image.
export function coverPrompt(title: string, semanticDirection = ""): string {
  return [
    `Create an editorial metaphor image for a WeChat article titled "${title}".`,
    semanticDirection ? `Semantic direction: ${semanticDirection}.` : "Express the article's central tension through one clear visual metaphor.",
    "The source image will be center-cropped into a 2.35:1 banner. Keep every important subject inside the central horizontal band and away from the top and bottom edges.",
    "Warm paper, refined ink, muted brick and restrained sage accents; tactile editorial photography or illustration; confident negative space; one visual idea only.",
    "No text, letters, logos, fake interface, fake code, collage, decorative blobs, or random gradient.",
  ].join(" ");
}

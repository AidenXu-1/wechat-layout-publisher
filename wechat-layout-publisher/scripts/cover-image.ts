import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

export const HEADLINE_COVER_WIDTH = 900;
export const HEADLINE_COVER_HEIGHT = 383;

export interface HeadlineCoverOptions {
  title?: string;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

function titleLines(title: string): string[] {
  const characters = Array.from(title.trim().replace(/\s+/g, " "));
  const maxChars = characters.length > 26 ? 13 : characters.length > 18 ? 11 : 9;
  const maxLength = maxChars * 3;
  const clipped = characters.length > maxLength ? [...characters.slice(0, maxLength - 1), "…"] : characters;
  const lines: string[] = [];
  for (let index = 0; index < clipped.length; index += maxChars) {
    lines.push(clipped.slice(index, index + maxChars).join("").trim());
  }
  return lines.filter(Boolean);
}

function titleOverlay(title: string): Buffer {
  const lines = titleLines(title);
  const fontSize = lines.length >= 3 ? 35 : lines.some((line) => Array.from(line).length > 10) ? 39 : 44;
  const lineHeight = Math.round(fontSize * 1.28);
  const totalHeight = lineHeight * lines.length;
  const firstBaseline = Math.round((HEADLINE_COVER_HEIGHT - totalHeight) / 2 + fontSize);
  const tspans = lines
    .map((line, index) => `<tspan x="104" y="${firstBaseline + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${HEADLINE_COVER_WIDTH}" height="${HEADLINE_COVER_HEIGHT}">
      <defs>
        <linearGradient id="quiet-wash" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#fbf8f3" stop-opacity="0.9"/>
          <stop offset="0.68" stop-color="#fbf8f3" stop-opacity="0.58"/>
          <stop offset="1" stop-color="#fbf8f3" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="610" height="383" fill="url(#quiet-wash)"/>
      <rect x="74" y="${Math.max(76, firstBaseline - fontSize)}" width="5" height="${Math.min(132, totalHeight)}" rx="2.5" fill="#d68163"/>
      <text fill="#252525" font-size="${fontSize}" font-weight="800" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">${tspans}</text>
    </svg>
  `);
}

export async function prepareHeadlineCover(
  inputPath: string,
  outputPath: string,
  options: HeadlineCoverOptions = {},
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  let pipeline = sharp(inputPath)
    .rotate()
    .resize(HEADLINE_COVER_WIDTH, HEADLINE_COVER_HEIGHT, {
      fit: "cover",
      position: "centre",
    });
  if (options.title?.trim()) {
    pipeline = pipeline.composite([{ input: titleOverlay(options.title), top: 0, left: 0 }]);
  }
  await pipeline
    .jpeg({ quality: 91, mozjpeg: true })
    .toFile(outputPath);
  return outputPath;
}

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

export const HEADLINE_COVER_WIDTH = 900;
export const HEADLINE_COVER_HEIGHT = 383;

export async function prepareHeadlineCover(inputPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(inputPath)
    .rotate()
    .resize(HEADLINE_COVER_WIDTH, HEADLINE_COVER_HEIGHT, {
      fit: "cover",
      position: "centre",
    })
    .jpeg({ quality: 91, mozjpeg: true })
    .toFile(outputPath);
  return outputPath;
}

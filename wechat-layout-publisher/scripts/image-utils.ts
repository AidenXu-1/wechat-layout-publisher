export interface ImageFormat {
  extension: "png" | "jpg" | "gif" | "webp";
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

export function detectImageFormat(buf: Buffer): ImageFormat | undefined {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mime: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  const gif = buf.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return { extension: "gif", mime: "image/gif" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mime: "image/webp" };
  }
  return undefined;
}

export function requireImageFormat(buf: Buffer, label: string): ImageFormat {
  const format = detectImageFormat(buf);
  if (!format) throw new Error(`${label} is not a supported PNG, JPEG, GIF, or WebP image.`);
  return format;
}

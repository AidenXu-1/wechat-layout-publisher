#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function usage(exitCode = 0) {
  const message = [
    "Usage: node extract-video-frame.mjs <video> --time <HH:MM:SS[.ms]|seconds> --out <frame.jpg|frame.png>",
    "Example: node extract-video-frame.mjs interview.mp4 --time 00:01:42 --out images/interview-01m42s.jpg",
  ].join("\n");
  (exitCode ? console.error : console.log)(message);
  process.exit(exitCode);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) usage(0);
  const input = args.find((arg) => !arg.startsWith("--"));
  const timeIndex = args.indexOf("--time");
  const outIndex = args.indexOf("--out");
  const timestamp = timeIndex >= 0 ? args[timeIndex + 1] : "";
  const output = outIndex >= 0 ? args[outIndex + 1] : "";
  if (!input || !timestamp || !output) usage(2);
  if (!/^(?:\d+(?:\.\d+)?|\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)$/.test(timestamp)) {
    throw new Error("Invalid timestamp. Use seconds or HH:MM:SS[.ms].");
  }

  const inputPath = resolve(process.cwd(), input);
  const outputPath = resolve(process.cwd(), output);
  if (!existsSync(inputPath)) throw new Error(`Video file not found: ${inputPath}`);
  if (!new Set([".jpg", ".jpeg", ".png"]).has(extname(outputPath).toLowerCase())) {
    throw new Error("Output must be .jpg, .jpeg, or .png.");
  }

  const version = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (version.error || version.status !== 0) {
    throw new Error(
      "ffmpeg is required to extract video frames. macOS: `brew install ffmpeg`. Windows: `winget install Gyan.FFmpeg`, then reopen the terminal.",
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-ss", timestamp, "-i", inputPath, "-frames:v", "1", "-q:v", "2", "-y", outputPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !existsSync(outputPath)) {
    rmSync(outputPath, { force: true });
    throw new Error(`Video frame extraction failed: ${(result.stderr || result.error?.message || "unknown ffmpeg error").trim()}`);
  }
  console.log(outputPath);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

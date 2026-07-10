#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const skillFile = resolve(skillDir, "SKILL.md");
const raw = readFileSync(skillFile, "utf8");
const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter) throw new Error("SKILL.md has no YAML frontmatter.");

const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
if (!name || !description) throw new Error("SKILL.md frontmatter requires name and description.");
if (!/^[a-z0-9-]+$/.test(name) || name.length > 64) throw new Error(`Invalid skill name: ${name}`);
if (basename(skillDir) !== name) throw new Error(`Skill folder ${basename(skillDir)} does not match name ${name}.`);

for (const required of [
  "agents/openai.yaml",
  "scripts/package.json",
  "scripts/validate-image-plan.mjs",
  "references/image-placement.md",
  "references/qa-checklist.md",
]) {
  if (!existsSync(resolve(skillDir, required))) throw new Error(`Missing required Skill file: ${required}`);
}

console.log("Skill package metadata passed.");

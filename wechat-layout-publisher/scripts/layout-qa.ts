import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type VisualWeight = "light" | "medium" | "heavy";

interface AssetDimensions {
  width: number;
  height: number;
}

interface PlannedVisual {
  id?: unknown;
  role?: unknown;
  section?: unknown;
  source_type?: unknown;
  semantic_kind?: unknown;
  semantic_signature?: unknown;
  asset_dimensions?: unknown;
}

interface AnchorPlan {
  status?: unknown;
  visual_id?: unknown;
  skip_reason?: unknown;
}

interface ImagePlan {
  first_section_visual_anchor?: AnchorPlan;
  visuals?: PlannedVisual[];
}

interface HtmlNode {
  tag: string;
  openTag: string;
  start: number;
  contentStart: number;
  closeStart: number;
  end: number;
  parent?: HtmlNode;
  children: HtmlNode[];
}

interface VisualBlock {
  start: number;
  end: number;
  sectionIndex: number;
  id?: string;
  kind: string;
  text: string;
  signatures: string[];
  role?: string;
  weight: VisualWeight;
  tallScreenshot: boolean;
}

export interface LayoutIssue {
  code:
    | "raw_markdown_separator"
    | "unexplained_vertical_gap"
    | "missing_first_section_anchor"
    | "late_first_section_anchor"
    | "anchor_plan_mismatch"
    | "adjacent_heavy_visual_blocks"
    | "consecutive_tall_screenshots"
    | "semantic_duplicate_visuals";
  message: string;
}

export interface LayoutReport {
  issues: LayoutIssue[];
  visual_blocks: number;
  heavy_visual_blocks: number;
  tall_screenshots: number;
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const CARD_KINDS = new Set(["data", "process", "steps", "quote", "table", "matrix", "screenshot", "image", "coded", "framework"]);

function attributeValue(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? match[1] || match[2] || match[3] || "" : undefined;
}

function parseHtml(raw: string): HtmlNode {
  const root: HtmlNode = {
    tag: "root",
    openTag: "",
    start: 0,
    contentStart: 0,
    closeStart: raw.length,
    end: raw.length,
    children: [],
  };
  const stack: HtmlNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  for (const match of raw.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index || 0;
    if (token.startsWith("<!--")) continue;
    const closing = token.match(/^<\/\s*([a-zA-Z0-9:-]+)/);
    if (closing) {
      const tag = closing[1].toLowerCase();
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tag !== tag) continue;
        const node = stack[index];
        node.closeStart = start;
        node.end = start + token.length;
        stack.length = index;
        break;
      }
      continue;
    }
    const opening = token.match(/^<\s*([a-zA-Z0-9:-]+)/);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const parent = stack[stack.length - 1];
    const node: HtmlNode = {
      tag,
      openTag: token,
      start,
      contentStart: start + token.length,
      closeStart: start + token.length,
      end: start + token.length,
      parent,
      children: [],
    };
    parent.children.push(node);
    if (!VOID_TAGS.has(tag) && !/\/>\s*$/.test(token)) stack.push(node);
  }
  for (let index = 1; index < stack.length; index++) {
    stack[index].closeStart = raw.length;
    stack[index].end = raw.length;
  }
  return root;
}

function flatten(node: HtmlNode): HtmlNode[] {
  return node.children.flatMap((child) => [child, ...flatten(child)]);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    });
}

function visibleText(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function nodeText(raw: string, node: HtmlNode): string {
  if (VOID_TAGS.has(node.tag)) return attributeValue(node.openTag, "alt") || "";
  return visibleText(raw.slice(node.contentStart, node.closeStart));
}

function styleMap(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const declaration of (attributeValue(tag, "style") || "").split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    result.set(declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim().toLowerCase());
  }
  return result;
}

function px(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/(-?\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : 0;
}

function paddingVertical(styles: Map<string, string>): number {
  if (styles.has("padding-top") || styles.has("padding-bottom")) {
    return px(styles.get("padding-top")) + px(styles.get("padding-bottom"));
  }
  const values = (styles.get("padding") || "").split(/\s+/).map(px);
  if (values.length === 1) return values[0] * 2;
  if (values.length >= 2) return values[0] * 2;
  return 0;
}

function hasColoredBackground(styles: Map<string, string>): boolean {
  const background = styles.get("background") || styles.get("background-color") || "";
  if (!background || /^(?:none|transparent|#fff(?:fff)?|white)$/.test(background.replace(/\s+/g, ""))) return false;
  return true;
}

function isCardLike(raw: string, node: HtmlNode): boolean {
  if (!new Set(["section", "div", "blockquote", "table", "ol", "ul"]).has(node.tag)) return false;
  if (node.tag === "blockquote" || node.tag === "table") return true;
  const styles = styleMap(node.openTag);
  const content = nodeText(raw, node);
  const itemCount = (raw.slice(node.contentStart, node.closeStart).match(/<li\b/gi) || []).length;
  return (
    (hasColoredBackground(styles) && paddingVertical(styles) >= 16 && (content.length >= 24 || itemCount >= 3)) ||
    (px(styles.get("border-left-width")) >= 2 && paddingVertical(styles) >= 16 && content.length >= 24) ||
    (/border-left\s*:\s*[^;]*\b(?:2|3|4|5|6)px/i.test(attributeValue(node.openTag, "style") || "") && content.length >= 24)
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && normalize(item).length >= 2))];
}

function dimensions(value: unknown): AssetDimensions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!Number.isFinite(record.width) || !Number.isFinite(record.height)) return undefined;
  const width = Number(record.width);
  const height = Number(record.height);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function markerIds(node: HtmlNode): string[] {
  const ids: string[] = [];
  const own = attributeValue(node.openTag, "data-wlp-visual-id");
  if (own) ids.push(own);
  for (const child of node.children) ids.push(...markerIds(child));
  return ids;
}

function visualWrapper(node: HtmlNode): HtmlNode {
  let current = node;
  while (current.parent && new Set(["section", "div", "figure"]).has(current.parent.tag)) {
    const parent = current.parent;
    if (markerIds(parent).length !== 1) break;
    current = parent;
  }
  return current;
}

function sectionIndexAt(position: number, headings: HtmlNode[]): number {
  let index = 0;
  for (const heading of headings) {
    if (heading.start >= position) break;
    index++;
  }
  return index;
}

function plannedVisualMap(plan: ImagePlan): Map<string, PlannedVisual> {
  const map = new Map<string, PlannedVisual>();
  for (const visual of Array.isArray(plan.visuals) ? plan.visuals : []) {
    if (typeof visual.id === "string" && visual.id) map.set(visual.id, visual);
  }
  return map;
}

function classifyWeight(raw: string, node: HtmlNode, visual?: PlannedVisual): { weight: VisualWeight; tallScreenshot: boolean } {
  const size = dimensions(visual?.asset_dimensions);
  const displayedHeight = size ? 390 * size.height / size.width : 0;
  const tallScreenshot = visual?.source_type === "evidence_screenshot" && Boolean(size && size.height / size.width > 1.55);
  if (tallScreenshot || displayedHeight >= 260) return { weight: "heavy", tallScreenshot };
  if (displayedHeight >= 170) return { weight: "medium", tallScreenshot };
  const fragment = raw.slice(node.contentStart, node.closeStart);
  const text = nodeText(raw, node);
  const rows = (fragment.match(/<(?:li|tr)\b/gi) || []).length;
  if (rows >= 4 || text.length >= 70 || visual?.semantic_kind === "process" || visual?.semantic_kind === "data") {
    return { weight: "heavy", tallScreenshot };
  }
  if (node.tag === "table" || node.tag === "blockquote" || text.length >= 30) return { weight: "medium", tallScreenshot };
  return { weight: "light", tallScreenshot };
}

function buildVisualBlocks(raw: string, root: HtmlNode, plan: ImagePlan): VisualBlock[] {
  const nodes = flatten(root);
  const headings = nodes.filter((node) => node.tag === "h2");
  const planned = plannedVisualMap(plan);
  const selected = new Map<number, VisualBlock>();

  for (const node of nodes) {
    const id = attributeValue(node.openTag, "data-wlp-visual-id");
    if (!id) continue;
    const wrapper = visualWrapper(node);
    const visual = planned.get(id);
    const declaredKind = attributeValue(wrapper.openTag, "data-wlp-visual-block");
    const kind = declaredKind || String(visual?.source_type === "evidence_screenshot" ? "screenshot" : visual?.semantic_kind || "image");
    const classification = classifyWeight(raw, wrapper, visual);
    selected.set(wrapper.start, {
      start: wrapper.start,
      end: wrapper.end,
      sectionIndex: sectionIndexAt(wrapper.start, headings),
      id,
      kind,
      text: nodeText(raw, wrapper),
      signatures: stringList(visual?.semantic_signature),
      role: typeof visual?.role === "string" ? visual.role : undefined,
      weight: classification.weight,
      tallScreenshot: classification.tallScreenshot,
    });
  }

  for (const node of nodes) {
    if (markerIds(node).length || !isCardLike(raw, node)) continue;
    if (node.parent && isCardLike(raw, node.parent) && !markerIds(node.parent).length) continue;
    const declaredKind = attributeValue(node.openTag, "data-wlp-visual-block");
    const kind = declaredKind && CARD_KINDS.has(declaredKind) ? declaredKind : node.tag === "ol" || node.tag === "ul" ? "steps" : node.tag;
    const classification = classifyWeight(raw, node);
    selected.set(node.start, {
      start: node.start,
      end: node.end,
      sectionIndex: sectionIndexAt(node.start, headings),
      kind,
      text: nodeText(raw, node),
      signatures: [],
      weight: classification.weight,
      tallScreenshot: false,
    });
  }

  return [...selected.values()].sort((left, right) => left.start - right.start);
}

function substantiveBetween(raw: string, left: VisualBlock, right: VisualBlock): { characters: number; paragraphs: number; text: string } {
  const fragment = raw.slice(left.end, right.start)
    .replace(/<p\b[^>]*\bdata-wlp-added\s*=\s*["'](?:caption|source)["'][^>]*>[\s\S]*?<\/p>/gi, " ")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, " ");
  const text = visibleText(fragment).replace(/(?:---|\*\s*\*\s*\*|_\s*_\s*_)/g, "");
  const characters = normalize(text).length;
  const paragraphs = [...fragment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalize(visibleText(match[1])).length)
    .filter((length) => length >= 24).length;
  return { characters, paragraphs, text };
}

function sharedNumbers(left: string, right: string): number {
  const a = new Set(left.match(/\d+(?:\.\d+)?/g) || []);
  const b = new Set(right.match(/\d+(?:\.\d+)?/g) || []);
  return [...a].filter((value) => b.has(value)).length;
}

function sharedLatinLabels(left: string, right: string): number {
  const tokens = (value: string) => new Set((value.toLowerCase().match(/[a-z][a-z0-9.+/-]{1,}/g) || []).filter((token) => !new Set(["https", "http", "www", "com", "png", "jpg"]).has(token)));
  const a = tokens(left);
  const b = tokens(right);
  return [...a].filter((value) => b.has(value)).length;
}

function signatureHits(signatures: string[], other: string): number {
  const normalizedOther = normalize(other);
  return signatures.filter((signature) => normalizedOther.includes(normalize(signature))).length;
}

function looksSemanticallyDuplicate(left: VisualBlock, right: VisualBlock): boolean {
  const leftSearch = `${left.text} ${left.signatures.join(" ")}`;
  const rightSearch = `${right.text} ${right.signatures.join(" ")}`;
  const hits = Math.max(signatureHits(left.signatures, rightSearch), signatureHits(right.signatures, leftSearch));
  if (hits >= 2) return true;
  const numbers = sharedNumbers(leftSearch, rightSearch);
  const labels = sharedLatinLabels(leftSearch, rightSearch);
  return numbers >= 2 || (numbers >= 1 && labels >= 1);
}

function rawSeparatorIssues(raw: string, nodes: HtmlNode[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const node of nodes) {
    if (!new Set(["p", "div", "section", "span"]).has(node.tag)) continue;
    const text = nodeText(raw, node).replace(/\s+/g, "");
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) {
      issues.push({
        code: "raw_markdown_separator",
        message: `Raw Markdown thematic separator ${JSON.stringify(text)} is visible in the formal article. Remove it or convert it to one compact structural boundary.`,
      });
      continue;
    }
    if (text || markerIds(node).length || /<(?:img|svg|table|hr|br)\b/i.test(raw.slice(node.contentStart, node.closeStart))) continue;
    const styles = styleMap(node.openTag);
    const reservedHeight = px(styles.get("height")) + px(styles.get("min-height")) + paddingVertical(styles);
    if (reservedHeight >= 24) {
      issues.push({
        code: "unexplained_vertical_gap",
        message: `Empty <${node.tag}> reserves ${reservedHeight}px or more vertical space without semantic content.`,
      });
    }
  }
  return issues;
}

function anchorIssues(raw: string, nodes: HtmlNode[], blocks: VisualBlock[], plan: ImagePlan): LayoutIssue[] {
  const headings = nodes.filter((node) => node.tag === "h2");
  const anchor = plan.first_section_visual_anchor;
  if (!headings.length) {
    if (anchor?.status === "present") {
      return [{ code: "anchor_plan_mismatch", message: "image-plan marks a first-section visual anchor as present, but the article has no H2 body section." }];
    }
    return [];
  }
  if (anchor?.status === "skipped") {
    return typeof anchor.skip_reason === "string" && normalize(anchor.skip_reason).length >= 12
      ? []
      : [{ code: "missing_first_section_anchor", message: "Skipping the first body-section visual anchor requires a concrete skip_reason." }];
  }
  const firstHeading = headings[0];
  const nextHeading = headings[1];
  const firstSectionBlocks = blocks.filter(
    (block) => block.id && block.start > firstHeading.end && (!nextHeading || block.start < nextHeading.start),
  );
  const first = firstSectionBlocks[0];
  if (!first) {
    return [{ code: "missing_first_section_anchor", message: "The first H2 body section needs an early semantic visual anchor or an explicit skip reason in image-plan.json." }];
  }
  if (typeof anchor?.visual_id !== "string" || anchor.visual_id !== first.id) {
    return [{ code: "anchor_plan_mismatch", message: `first_section_visual_anchor.visual_id must match the first planned visual in that section (${first.id}).` }];
  }
  const fragment = raw.slice(firstHeading.end, first.start);
  const characters = normalize(visibleText(fragment)).length;
  const paragraphs = [...fragment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalize(visibleText(match[1])).length)
    .filter((length) => length >= 24).length;
  if (characters > 240 || paragraphs > 2) {
    return [{
      code: "late_first_section_anchor",
      message: `The first body-section visual anchor appears after ${characters} substantive characters and ${paragraphs} paragraphs; place it after the heading or first paragraph.`,
    }];
  }
  return [];
}

export async function inspectArticleLayout(articleHtml: string, imagePlanPath: string): Promise<LayoutReport> {
  const marker = articleHtml.match(/<!--\s*ARTICLE HTML START\s*-->([\s\S]*?)<!--\s*ARTICLE HTML END\s*-->/i);
  const raw = (marker ? marker[1] : articleHtml).trim();
  const plan = JSON.parse(await readFile(imagePlanPath, "utf8")) as ImagePlan;
  const root = parseHtml(raw);
  const nodes = flatten(root);
  const blocks = buildVisualBlocks(raw, root, plan).filter((block) => block.role !== "hero");
  const issues = [...rawSeparatorIssues(raw, nodes), ...anchorIssues(raw, nodes, blocks, plan)];

  for (let index = 0; index < blocks.length - 1; index++) {
    const left = blocks[index];
    const right = blocks[index + 1];
    if (left.sectionIndex !== right.sectionIndex) continue;
    const between = substantiveBetween(raw, left, right);
    if (between.characters <= 280 && looksSemanticallyDuplicate(left, right)) {
      issues.push({
        code: "semantic_duplicate_visuals",
        message: `Strong visual blocks ${left.id || left.kind} and ${right.id || right.kind} repeat the same nearby numbers, labels, or steps. Keep one primary visual expression.`,
      });
    }
    if (left.weight === "heavy" && right.weight === "heavy" && (between.characters < 120 || between.paragraphs < 2)) {
      issues.push({
        code: "adjacent_heavy_visual_blocks",
        message: `Heavy visual blocks ${left.id || left.kind} and ${right.id || right.kind} have only ${between.characters} substantive characters and ${between.paragraphs} paragraphs between them.`,
      });
    }
    if (left.tallScreenshot && right.tallScreenshot && (between.characters < 220 || between.paragraphs < 3)) {
      issues.push({
        code: "consecutive_tall_screenshots",
        message: `Tall evidence screenshots ${left.id || "first"} and ${right.id || "second"} are concentrated in one reading unit without enough explanatory distance.`,
      });
    }
  }

  return {
    issues,
    visual_blocks: blocks.length,
    heavy_visual_blocks: blocks.filter((block) => block.weight === "heavy").length,
    tall_screenshots: blocks.filter((block) => block.tallScreenshot).length,
  };
}

export async function assertArticleLayout(articleHtml: string, imagePlanPath: string): Promise<LayoutReport> {
  const report = await inspectArticleLayout(articleHtml, imagePlanPath);
  if (report.issues.length) {
    const details = report.issues.map((issue) => `FAIL [${issue.code}] ${issue.message}`).join("\n");
    throw new Error(`Article layout verification failed: ${report.issues.length} issue(s).\n${details}`);
  }
  return report;
}

interface CliArgs {
  article: string;
  imagePlan: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { article: "", imagePlan: "" };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--article") args.article = value(arg, index++);
    else if (arg === "--image-plan") args.imagePlan = value(arg, index++);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!args.article || !args.imagePlan) {
    throw new Error("Usage: layout-qa.ts --article <article.html> --image-plan <image-plan.json>");
  }
  return args;
}

async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const report = await assertArticleLayout(await readFile(resolve(args.article), "utf8"), resolve(args.imagePlan));
  console.log(`Article layout passed. Strong visual blocks: ${report.visual_blocks}; heavy: ${report.heavy_visual_blocks}; tall screenshots: ${report.tall_screenshots}.`);
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

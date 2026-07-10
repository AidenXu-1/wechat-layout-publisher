import { marked } from "marked";

const ACCENT = "#d68163";

const S = {
  container: `margin:0 auto;padding:22px 20px 34px;max-width:677px;background:#fff;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;letter-spacing:0;word-break:break-word;`,
  h1: `margin:0 0 14px;text-align:center;font-size:22px;font-weight:800;color:#252525;line-height:1.35;letter-spacing:0;`,
  h2: `margin:28px 0 12px;padding:0 0 0 12px;border-left:3px solid ${ACCENT};font-size:18px;font-weight:800;color:#252525;line-height:1.45;letter-spacing:0;`,
  h3: `margin:20px 0 10px;font-size:16px;font-weight:800;color:#252525;line-height:1.45;letter-spacing:0;`,
  h4: `margin:18px 0 8px;font-size:15px;font-weight:800;color:#252525;line-height:1.45;letter-spacing:0;`,
  p: `margin:0 0 16px;font-size:15px;color:#333333;line-height:1.85;letter-spacing:0;`,
  blockquote: `margin:18px 0 24px;padding:18px 18px;background:#fbf8f3;border-left:3px solid ${ACCENT};border-radius:4px;color:#333333;font-size:15px;line-height:1.8;`,
  list: `margin:0 0 18px;padding-left:24px;color:#333333;`,
  li: `margin:6px 0;font-size:15px;line-height:1.8;`,
  a: `color:${ACCENT};text-decoration:none;`,
  strong: `font-weight:800;color:#252525;`,
  em: `font-style:italic;`,
  codeInline: `background:#f8f5ef;color:#9b5a2e;padding:2px 5px;border-radius:3px;font-size:13px;font-family:Menlo,Consolas,monospace;`,
  pre: `margin:18px 0 24px;padding:14px 16px;background:#fbf8f3;border:1px solid #e7dfd3;border-radius:4px;overflow-x:auto;font-size:13px;line-height:1.7;`,
  codeBlock: `background:none;color:#333333;padding:0;font-family:Menlo,Consolas,monospace;`,
  img: `display:block;max-width:100%;margin:18px auto 10px;border-radius:4px;`,
  hr: `border:none;border-top:1px solid #e7dfd3;margin:24px 0;`,
  table: `border-collapse:collapse;width:100%;margin:18px 0 24px;font-size:13px;`,
  cell: `border:1px solid #e7dfd3;padding:8px 10px;`,
  th: `border:1px solid #e7dfd3;padding:8px 10px;background:#fbf8f3;font-weight:800;color:#252525;`,
};

// Turn plain semantic HTML from marked into WeChat-compliant inline-styled HTML.
// WeChat strips <style>/<link>/class/id — every style must live on a style attribute.
function applyTheme(html: string): string {
  let out = html;
  // code blocks first (must run before inline <code>)
  out = out.replace(/<pre><code[^>]*>/g, `<pre style="${S.pre}"><code style="${S.codeBlock}">`);
  out = out.replace(/<code>/g, `<code style="${S.codeInline}">`);
  out = out.replace(/<h1>/g, `<h1 style="${S.h1}">`);
  out = out.replace(/<h2>/g, `<h2 style="${S.h2}">`);
  out = out.replace(/<h3>/g, `<h3 style="${S.h3}">`);
  out = out.replace(/<h([456])>/g, `<h$1 style="${S.h4}">`);
  out = out.replace(/<p>/g, `<p style="${S.p}">`);
  out = out.replace(/<blockquote>/g, `<blockquote style="${S.blockquote}">`);
  out = out.replace(/<ul>/g, `<ul style="${S.list}">`);
  out = out.replace(/<ol>/g, `<ol style="${S.list}">`);
  out = out.replace(/<li>/g, `<li style="${S.li}">`);
  out = out.replace(/<strong>/g, `<strong style="${S.strong}">`);
  out = out.replace(/<em>/g, `<em style="${S.em}">`);
  out = out.replace(/<hr\s*\/?>/g, `<hr style="${S.hr}">`);
  out = out.replace(/<table>/g, `<table style="${S.table}">`);
  out = out.replace(/<th>/g, `<th style="${S.th}">`);
  out = out.replace(/<td>/g, `<td style="${S.cell}">`);
  out = out.replace(/<a /g, `<a style="${S.a}" `);
  out = out.replace(/<img /g, `<img style="${S.img}" `);
  return out;
}

export function renderArticle(markdown: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  const body = marked.parse(markdown, { async: false }) as string;
  return `<section style="${S.container}">${applyTheme(body)}</section>`;
}

// Extract image src values from rendered HTML (used to find local files to upload).
export function extractImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<img\b[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) srcs.push(m[1] || m[2] || m[3]);
  return srcs;
}

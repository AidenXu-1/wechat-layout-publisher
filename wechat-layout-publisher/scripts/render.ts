// Extract image src values from hand-written article HTML.
export function extractImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<img\b[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) srcs.push(match[1] || match[2] || match[3]);
  return srcs;
}

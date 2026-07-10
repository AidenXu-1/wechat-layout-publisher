import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  expectedContentTypePrefix?: string;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string;
  finalUrl: string;
}

interface ResolvedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function blockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function blockedIpv6(address: string): boolean {
  const ip = address.toLowerCase().split("%")[0];
  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip) || ip.startsWith("ff")) return true;
  if (ip.startsWith("2001:db8:")) return true;
  if (/^2001:(?:0*:|0*2:|0*1[0-9a-f]:)/.test(ip)) return true;
  // Translation prefixes can embed private IPv4 targets in an apparently public IPv6 literal.
  if (ip.startsWith("64:ff9b:1:")) return true;

  const expanded = expandIpv6(ip);
  if (!expanded) return true;
  const isMapped = expanded.slice(0, 5).every((part) => part === 0) && expanded[5] === 0xffff;
  const isCompatible = expanded.slice(0, 6).every((part) => part === 0);
  if (isMapped || isCompatible) {
    const ipv4 = `${expanded[6] >> 8}.${expanded[6] & 0xff}.${expanded[7] >> 8}.${expanded[7] & 0xff}`;
    return blockedIpv4(ipv4);
  }
  const isWellKnownNat64 = expanded[0] === 0x64 && expanded[1] === 0xff9b && expanded.slice(2, 6).every((part) => part === 0);
  if (isWellKnownNat64) {
    const ipv4 = `${expanded[6] >> 8}.${expanded[6] & 0xff}.${expanded[7] >> 8}.${expanded[7] & 0xff}`;
    return blockedIpv4(ipv4);
  }
  if (expanded[0] === 0x2002) {
    const ipv4 = `${expanded[1] >> 8}.${expanded[1] & 0xff}.${expanded[2] >> 8}.${expanded[2] & 0xff}`;
    return blockedIpv4(ipv4);
  }
  // At present, ordinary public unicast IPv6 is allocated from 2000::/3.
  return (expanded[0] & 0xe000) !== 0x2000;
}

function expandIpv6(address: string): number[] | undefined {
  let normalized = address;
  const dotted = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
    normalized = normalized.slice(0, -dotted[1].length) + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  if ((normalized.match(/::/g) || []).length > 1) return undefined;
  const [leftRaw, rightRaw] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw === undefined || rightRaw === "" ? [] : rightRaw.split(":");
  const missing = rightRaw === undefined ? 0 : 8 - left.length - right.length;
  if (missing < 1 && rightRaw !== undefined) return undefined;
  const parts = rightRaw === undefined ? left : [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return undefined;
  return parts.map((part) => Number.parseInt(part, 16));
}

export function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedIpv4(address);
  if (family === 6) return blockedIpv6(address);
  return true;
}

async function resolveSafeRemoteUrl(raw: string): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid remote URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Only http(s) image URLs are allowed: ${raw}`);
  if (url.username || url.password) throw new Error(`Remote image URLs must not contain credentials: ${raw}`);

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literalFamily = isIP(host);
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!literalFamily && !host.includes("."))
  ) {
    throw new Error(`Private or local image host is not allowed: ${host || raw}`);
  }

  if (literalFamily) {
    if (isBlockedIp(host)) throw new Error(`Private or reserved image address is not allowed: ${host}`);
    return { url, address: host, family: literalFamily === 4 ? 4 : 6 };
  }

  let resolved: { address: string; family: number }[];
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`Could not resolve remote image host ${host}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!resolved.length || resolved.some(({ address, family }) => (family !== 4 && family !== 6) || isBlockedIp(address))) {
    throw new Error(`Remote image host resolves to a private or reserved address: ${host}`);
  }
  const first = resolved[0];
  return { url, address: first.address, family: first.family === 4 ? 4 : 6 };
}

export async function assertSafeRemoteUrl(raw: string): Promise<URL> {
  return (await resolveSafeRemoteUrl(raw)).url;
}

interface RequestResult {
  status: number;
  location?: string;
  contentType: string;
  buffer: Buffer;
}

function requestPinned(target: ResolvedTarget, options: SafeFetchOptions): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (lookupOptions.all) callback(null, [{ address: target.address, family: target.family }]);
      else callback(null, target.address, target.family);
    };
    const req = transport(
      target.url,
      {
        method: "GET",
        headers: options.headers,
        lookup: pinnedLookup,
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        const contentType = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();

        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, buffer: Buffer.alloc(0) });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Remote download failed: HTTP ${status} from ${target.url.hostname}.`));
          return;
        }
        if (options.expectedContentTypePrefix && contentType && !contentType.startsWith(options.expectedContentTypePrefix)) {
          res.resume();
          reject(new Error(`Remote file has unexpected content type ${contentType}.`));
          return;
        }

        const declared = Number(res.headers["content-length"] || 0);
        if (declared > options.maxBytes) {
          res.resume();
          reject(new Error(`Remote file is too large (${declared} bytes > ${options.maxBytes} bytes).`));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let exceeded = false;
        res.on("data", (chunk: Buffer) => {
          if (exceeded) return;
          total += chunk.length;
          if (total > options.maxBytes) {
            exceeded = true;
            req.destroy(new Error(`Remote file exceeded the ${options.maxBytes}-byte download limit.`));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        res.on("end", () => {
          if (!exceeded) resolve({ status, location, contentType, buffer: Buffer.concat(chunks, total) });
        });
        res.on("aborted", () => reject(new Error(`Remote download was interrupted: ${target.url.hostname}`)));
      },
    );
    req.setTimeout(options.timeoutMs ?? 15000, () => {
      req.destroy(new Error(`Remote download timed out after ${options.timeoutMs ?? 15000} ms.`));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetchBuffer(raw: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 4;
  let current = raw;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const target = await resolveSafeRemoteUrl(current);
    const response = await requestPinned(target, options);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) throw new Error(`Remote image redirect from ${target.url.hostname} has no Location header.`);
      current = new URL(response.location, target.url).toString();
      continue;
    }
    return {
      buffer: response.buffer,
      contentType: response.contentType,
      finalUrl: target.url.toString(),
    };
  }
  throw new Error(`Remote image exceeded ${maxRedirects} redirects.`);
}

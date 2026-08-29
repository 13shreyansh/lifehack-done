import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_500_000;
const MAX_REDIRECTS = 4;

export class SafeFetchError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "invalid_url"
      | "private_network"
      | "timeout"
      | "unreachable"
      | "blocked"
      | "unsupported_content",
    readonly status?: number,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export async function normalizeAndValidatePublicUrl(rawUrl: string) {
  const candidate = rawUrl.trim().match(/^https?:\/\//i) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SafeFetchError("Enter a complete public website address.", "invalid_url");
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new SafeFetchError("Only public HTTP or HTTPS merchant websites are supported.", "invalid_url");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new SafeFetchError("Private and local network addresses cannot be imported.", "private_network");
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError("The website address could not be resolved.", "unreachable");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => (family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)))
  ) {
    throw new SafeFetchError("Private and local network addresses cannot be imported.", "private_network");
  }

  url.hash = "";
  return url;
}

export type SafeTextResponse = {
  url: URL;
  status: number;
  contentType: string;
  text: string;
};

async function readLimitedBody(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError("The page is too large to import safely.", "unsupported_content");
    }
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

export async function safeFetchText(
  initialUrl: URL,
  options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {},
): Promise<SafeTextResponse> {
  let currentUrl = await normalizeAndValidatePublicUrl(initialUrl.toString());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
          "accept-language": "en-SG,en;q=0.9",
          "user-agent": "DONE-LifeHack-Importer/1.0 (independent hackathon prototype)",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new SafeFetchError("The website took too long to respond.", "timeout");
      }
      throw new SafeFetchError("The website could not be reached from the importer.", "unreachable");
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new SafeFetchError("The website redirected too many times.", "unreachable", response.status);
      }
      currentUrl = await normalizeAndValidatePublicUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new SafeFetchError("The website declined automated access.", "blocked", response.status);
    }
    if (!response.ok) {
      throw new SafeFetchError(`The website returned HTTP ${response.status}.`, "unreachable", response.status);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/(html|xml|json|text\/plain)/.test(contentType)) {
      throw new SafeFetchError("The website returned a format this importer cannot read.", "unsupported_content", response.status);
    }

    return {
      url: currentUrl,
      status: response.status,
      contentType,
      text: await readLimitedBody(response, maxBytes),
    };
  }

  throw new SafeFetchError("The website could not be imported.", "unreachable");
}

import type { NextRequest } from "next/server";
import { normalizeWebsite } from "@/lib/server/merchant";
import { guard } from "@/lib/server/session";

// GET /api/logo/<domain> — a service's logo (its favicon), e.g. /api/logo/netflix.com.
// The server fetches it so the browser never tells a third party which services you pay for. Only a
// bare domain name is accepted and it only goes to the favicon services below, so this is not an open proxy.

const SOURCES = [
  (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];
// Raster only: an SVG served from our own origin could carry script.
const IMAGE_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 256 * 1024;

type Logo = { body: ArrayBuffer; type: string };
// Per-instance cache; the browser caches for a week on top of this.
const cache = new Map<string, Promise<Logo | null>>();
const MAX_CACHED = 500;

/** The body, or null if it's empty or larger than MAX_BYTES (stops reading as soon as it is). */
async function readCapped(res: Response): Promise<ArrayBuffer | null> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES || !res.body) {
    await res.body?.cancel();
    return null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!size) return null;
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function fetchLogo(domain: string): Promise<Logo | null> {
  for (const source of SOURCES) {
    try {
      // Misses come back as non-OK (Google: 404 with a generic globe) or non-image (DuckDuckGo: empty text/plain).
      const res = await fetch(source(domain), { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!res.ok || !IMAGE_TYPES.has(type)) {
        await res.body?.cancel();
        continue;
      }
      const body = await readCapped(res);
      if (body) return { body, type };
    } catch {
      // Timeout or network error: try the next source.
    }
  }
  return null;
}

function getLogo(domain: string): Promise<Logo | null> {
  let logo = cache.get(domain);
  if (!logo) {
    if (cache.size >= MAX_CACHED) cache.clear();
    const pending = fetchLogo(domain);
    cache.set(domain, pending);
    // Don't pin a miss (it may be a transient upstream failure), but leave a newer entry alone.
    void pending.then((l) => {
      if (!l && cache.get(domain) === pending) cache.delete(domain);
    });
    logo = pending;
  }
  return logo;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const requested = (await params).domain;
  const domain = normalizeWebsite(requested) === requested ? requested : null;
  const logo = domain ? await getLogo(domain) : null;
  const headers = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" };
  if (!logo) return new Response(null, { status: 404, headers: { ...headers, "Cache-Control": "private, max-age=3600" } });
  return new Response(logo.body, {
    headers: { ...headers, "Content-Type": logo.type, "Cache-Control": "private, max-age=604800, stale-while-revalidate=2592000" },
  });
}

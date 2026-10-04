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

async function fetchLogo(domain: string): Promise<Logo | null> {
  for (const source of SOURCES) {
    try {
      const res = await fetch(source(domain), { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!res.ok || !IMAGE_TYPES.has(type)) continue;
      const body = await res.arrayBuffer();
      if (body.byteLength > 0 && body.byteLength <= MAX_BYTES) return { body, type };
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
    logo = fetchLogo(domain);
    cache.set(domain, logo);
    // Don't pin a miss: it may be a transient upstream failure.
    void logo.then((l) => l ?? cache.delete(domain));
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

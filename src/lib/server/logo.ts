// Fetching small logo images server side, for the /api/logo routes: the browser never tells a third
// party which services you pay for or what you hold. Callers only ever pass URLs they built
// themselves from a validated key, so this is not an open proxy.

// Raster only: an SVG served from our own origin could carry script.
const IMAGE_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 256 * 1024;

export type Logo = { body: ArrayBuffer; type: string };
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

/** The first of `urls` that answers with a raster image. */
async function fetchFirst(urls: readonly string[]): Promise<Logo | null> {
  for (const url of urls) {
    try {
      // Misses come back as non-OK (Google: 404 with a generic globe; S3: 403) or non-image (DuckDuckGo: empty text/plain).
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

/** The logo for `key`, from the first of `urls` that has one; cached per key. */
export function getLogo(key: string, urls: readonly string[]): Promise<Logo | null> {
  let logo = cache.get(key);
  if (!logo) {
    if (cache.size >= MAX_CACHED) cache.clear();
    const pending = fetchFirst(urls);
    cache.set(key, pending);
    // Don't pin a miss (it may be a transient upstream failure), but leave a newer entry alone.
    void pending.then((l) => {
      if (!l && cache.get(key) === pending) cache.delete(key);
    });
    logo = pending;
  }
  return logo;
}

/** The image response, or a 404 the browser may cache for an hour. */
export function logoResponse(logo: Logo | null): Response {
  const headers = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" };
  if (!logo) return new Response(null, { status: 404, headers: { ...headers, "Cache-Control": "private, max-age=3600" } });
  return new Response(logo.body, {
    headers: { ...headers, "Content-Type": logo.type, "Cache-Control": "private, max-age=604800, stale-while-revalidate=2592000" },
  });
}

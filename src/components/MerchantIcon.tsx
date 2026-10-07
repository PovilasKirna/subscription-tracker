"use client";

import { type CSSProperties, useState } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-5 rounded-[5px] text-[9px]",
  md: "size-7 rounded-md text-[11px]",
  lg: "size-10 rounded-lg text-sm",
} as const;

/** Up to two letters: the first of each of the first two words, else the first two characters. */
function initials(name: string): string {
  const [first = "?", second] = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/**
 * Whether a logo needs a light backdrop to stay visible: only a dark, colourless glyph on a
 * transparent background (a black logo would vanish in dark mode). Logos that fill their square or
 * bring their own shape, and coloured glyphs like Spotify's, look right on any background.
 */
function needsBackdrop(img: HTMLImageElement): boolean {
  const n = 16;
  const ctx = Object.assign(document.createElement("canvas"), { width: n, height: n }).getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, n, n);
  const px = ctx.getImageData(0, 0, n, n).data;
  let opaque = 0;
  let lum = 0;
  let sat = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const [r, g, b] = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sat += Math.max(r, g, b) - Math.min(r, g, b);
    opaque++;
  }
  const transparent = 1 - opaque / (n * n);
  return opaque > 0 && transparent > 0.25 && lum / opaque < 0.35 && sat / opaque < 0.15;
}

// Per logo URL, so a logo that's already been measured doesn't flash when a row re-mounts.
const backdropCache = new Map<string, boolean>();

/**
 * The service's logo (its website's favicon, served by /api/logo), otherwise — or if the logo can't
 * be loaded — its initials. Decorative: the name is always shown next to it.
 */
export function MerchantIcon({
  name,
  website,
  logo,
  size = "md",
  className,
  style,
}: {
  name: string;
  /** Domain the logo comes from (`website` on subscriptions and transactions); null = initials. */
  website: string | null;
  /** A logo URL to use instead of the website's favicon (e.g. /api/logo/ticker/… for an investment). */
  logo?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** For placing the icon (the renewals calendar positions its logos absolutely). */
  style?: CSSProperties;
}) {
  const src = logo ?? (website !== null ? `/api/logo/${encodeURIComponent(website)}` : null);
  const [failed, setFailed] = useState<string | null>(null);
  // Per instance and only after load, so server and client render the same placeholder first.
  const [measured, setMeasured] = useState<{ src: string; backdrop: boolean } | null>(null);
  const showLogo = src !== null && failed !== src;
  const backdrop = measured?.src === src ? measured.backdrop : undefined;
  const measure = (img: HTMLImageElement) => {
    if (!src || measured?.src === src) return;
    let result = backdropCache.get(src);
    if (result === undefined) {
      result = needsBackdrop(img);
      backdropCache.set(src, result);
    }
    setMeasured({ src, backdrop: result });
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none",
        !showLogo
          ? "bg-muted text-muted-foreground ring-1 ring-border"
          : backdrop === undefined
            ? "bg-muted" // placeholder until the logo has loaded and been measured
            : backdrop && "bg-white ring-1 ring-border",
        SIZES[size],
        className,
      )}
      style={style}
    >
      {showLogo ? (
        // biome-ignore lint/performance/noImgElement: a tiny same-origin icon; next/image's optimizer would request it without the session cookie.
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          // A cached image can finish loading before hydration attaches onLoad, so check on mount too.
          ref={(img) => {
            if (img?.complete && img.naturalWidth) measure(img);
          }}
          onLoad={(e) => measure(e.currentTarget)}
          onError={() => setFailed(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

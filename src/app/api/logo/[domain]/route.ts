import type { NextRequest } from "next/server";
import { getLogo, logoResponse } from "@/lib/server/logo";
import { normalizeWebsite } from "@/lib/server/merchant";
import { guard } from "@/lib/server/session";

// GET /api/logo/<domain> — a service's logo (its favicon), e.g. /api/logo/netflix.com.
// Only a bare domain name is accepted and it only goes to the favicon services below.

const SOURCES = [
  (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const requested = (await params).domain;
  const domain = normalizeWebsite(requested) === requested ? requested : null;
  if (!domain) return logoResponse(null);
  return logoResponse(
    await getLogo(
      domain,
      SOURCES.map((s) => s(domain)),
    ),
  );
}

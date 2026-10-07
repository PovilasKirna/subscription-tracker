import type { NextRequest } from "next/server";
import { getLogo, logoResponse } from "@/lib/server/logo";
import { guard } from "@/lib/server/session";

// GET /api/logo/ticker/<ticker> — an instrument's logo by its Trading 212 ticker, e.g.
// /api/logo/ticker/AAPL_US_EQ or /api/logo/ticker/VUAAm_EQ: the same images the Trading 212 app shows.
// Only a ticker-shaped name is accepted and it only goes to Trading 212's logo bucket.

const TICKER = /^[A-Za-z0-9._-]{1,40}$/;
const source = (ticker: string) => `https://trading212equities.s3.eu-central-1.amazonaws.com/${encodeURIComponent(ticker)}.png`;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { ticker } = await params;
  return logoResponse(TICKER.test(ticker) ? await getLogo(`t212:${ticker}`, [source(ticker)]) : null);
}

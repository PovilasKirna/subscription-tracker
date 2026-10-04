import { type NextRequest, NextResponse } from "next/server";
import { loadTransactionParams } from "@/lib/search-params";
import { getTransactions } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  // Same nuqs parsers as the page: invalid or unknown values fall back to defaults.
  return NextResponse.json(await getTransactions(loadTransactionParams(req.nextUrl.searchParams)));
}

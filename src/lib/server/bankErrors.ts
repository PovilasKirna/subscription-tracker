import { NextResponse } from "next/server";
import { BankApiError } from "./enableBanking";

/** Turn Enable Banking failures into readable JSON errors instead of opaque 500s. */
export function bankErrorResponse(e: unknown): NextResponse {
  if (!(e instanceof BankApiError)) throw e;
  const inactive = /not active/i.test(e.message);
  const message = inactive
    ? "Your Enable Banking application isn't active yet. In the Enable Banking control panel, click “Activate by linking accounts” and link your Revolut account."
    : e.message;
  return NextResponse.json({ error: message, code: e.code }, { status: e.status >= 500 ? 502 : e.status });
}

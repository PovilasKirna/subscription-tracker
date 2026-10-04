import { type NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { getMailer, mailStatus } from "@/lib/server/mail";
import { renderNotificationEmail } from "@/lib/server/mail/templates";
import { guard } from "@/lib/server/session";

const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

// POST /api/mail/test { to } — sends a test email so the provider/domain setup can be checked.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const mailer = getMailer();
  if (!mailer) return NextResponse.json({ error: mailStatus().problem }, { status: 503 });
  const { to } = (await req.json().catch(() => ({}))) as { to?: unknown };
  const recipient = typeof to === "string" ? to.trim() : "";
  if (!EMAIL.test(recipient) || recipient.length > 254)
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = await renderNotificationEmail({
    title: "Test email from Subscriptions",
    body: "Email notifications work. Reminders and summaries you turn on will arrive at this address.",
    url: "/",
    appUrl: config.appUrl || req.nextUrl.origin,
  });
  try {
    await mailer.send({ to: recipient, ...email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sending failed." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

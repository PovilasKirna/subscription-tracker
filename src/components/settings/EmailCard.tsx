"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, CircleAlertIcon, Loader2Icon, MailIcon, SendIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mailStatusQuery } from "@/lib/query/options";
import type { MailProvider } from "@/lib/types";

// Settings → Notifications → Email: which provider the server uses, the sender, the recipient,
// a test email, and how to verify a sending domain with Resend. The recipient is a stored setting:
// the page passes the saved value in (it may arrive after mount) and how to save a new one. Until
// the settings store is wired in, there is no save action and the address only serves the test.

const PROVIDER_LABEL: Record<MailProvider, string> = { resend: "Resend", smtp: "SMTP" };
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCard({
  recipient = "",
  onSaveRecipient,
}: {
  /** The saved recipient address ("" when none). */
  recipient?: string;
  /** Stores a new recipient; without it the card can only send test emails. */
  onSaveRecipient?: (to: string) => Promise<unknown>;
}) {
  const status = useQuery(mailStatusQuery());
  const [to, setTo] = useState(recipient);
  // Follow the saved value when it loads or changes elsewhere (an unsaved edit is replaced).
  const [savedRecipient, setSavedRecipient] = useState(recipient);
  if (recipient !== savedRecipient) {
    setSavedRecipient(recipient);
    setTo(recipient);
  }
  const inputId = useId();
  const save = useMutation({
    mutationFn: (value: string) => onSaveRecipient?.(value) ?? Promise.resolve(),
    onSuccess: (_, value) => toast.success(value ? "Recipient saved" : "Recipient removed"),
    onError: (e) => toast.error("Couldn't save the recipient", { description: e.message }),
  });
  const test = useMutation({
    mutationFn: (recipient: string) => api("/api/mail/test", { method: "POST", body: JSON.stringify({ to: recipient }) }),
    onSuccess: (_, recipient) => toast.success("Test email sent", { description: `Check ${recipient} (and its spam folder).` }),
    onError: (e) => toast.error("Couldn't send the test email", { description: e.message }),
  });

  const s = status.data;
  const valid = LOOKS_LIKE_EMAIL.test(to.trim());
  const changed = to.trim() !== recipient;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" /> Email
        </CardTitle>
        <CardDescription>Reminders and summaries by email, sent through Resend or any SMTP server.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {status.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : status.error ? (
          <p className="text-destructive">{status.error.message}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>
                {s?.provider ? (
                  <Badge variant="secondary">{PROVIDER_LABEL[s.provider]}</Badge>
                ) : (
                  <span className="text-muted-foreground">Not set up</span>
                )}
              </dd>
              <dt className="text-muted-foreground">From</dt>
              <dd className="min-w-0 truncate">{s?.from ?? <span className="text-muted-foreground">Not set</span>}</dd>
            </dl>
            {s?.problem && (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-warning)" }} />
                {s.problem}
              </div>
            )}

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) test.mutate(to.trim());
              }}
            >
              <Label htmlFor={inputId}>Send notifications to</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={inputId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="min-w-56 flex-1"
                />
                <Button type="submit" variant="outline" disabled={!s?.ready || !valid || test.isPending}>
                  {test.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send test email
                </Button>
                {onSaveRecipient && (
                  <Button
                    type="button"
                    disabled={!changed || (to.trim() !== "" && !valid) || save.isPending}
                    onClick={() => save.mutate(to.trim())}
                  >
                    {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Save
                  </Button>
                )}
              </div>
            </form>

            {s?.provider !== "smtp" && <ResendSteps open={!s?.provider} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ResendSteps({ open }: { open: boolean }) {
  return (
    <details open={open} className="group rounded-lg border p-3">
      <summary className="cursor-pointer font-medium outline-none select-none focus-visible:underline">
        Set up Resend with your own domain
      </summary>
      <ol className="mt-2 ml-5 list-decimal space-y-1.5 text-muted-foreground">
        <li>
          Create a free account at{" "}
          <a className="underline hover:text-foreground" href="https://resend.com/domains" target="_blank" rel="noreferrer">
            resend.com
          </a>{" "}
          and add your domain under <b className="text-foreground">Domains</b>.
        </li>
        <li>
          Resend lists a few DNS records: a <code className="text-xs">TXT</code> record for DKIM (
          <code className="text-xs">resend._domainkey</code>), and an <code className="text-xs">MX</code> and a{" "}
          <code className="text-xs">TXT</code> (SPF) record on the <code className="text-xs">send</code> subdomain. Add each one at your DNS
          host, e.g. in Hostinger under <b className="text-foreground">Domains → DNS / Nameservers → DNS records</b>.
        </li>
        <li>
          Click <b className="text-foreground">Verify</b> in Resend. DNS changes usually show up within minutes, but can take a few hours.
        </li>
        <li>
          Create an API key with sending access and set <code className="text-xs">RESEND_API_KEY</code>, plus{" "}
          <code className="text-xs">MAIL_FROM</code> as an address on that domain (e.g.{" "}
          <code className="text-xs">Subscriptions &lt;notifications@your-domain&gt;</code>). Restart or redeploy, then send a test email.
        </li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        Prefer another provider? Set <code className="text-xs">SMTP_URL</code> instead (e.g.{" "}
        <code className="text-xs">smtps://user:pass@smtp.example.com:465</code>).
      </p>
    </details>
  );
}

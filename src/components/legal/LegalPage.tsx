import Link from "next/link";
import type { ReactNode } from "react";
import { fullDate } from "@/lib/format";
import { site } from "@/lib/site";

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 md:py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {site.name}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {fullDate(site.legalUpdated)}</p>
      <div className="mt-6 text-[15px] leading-relaxed text-[var(--text-secondary)]">{intro}</div>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
      <footer className="mt-12 flex gap-4 border-t pt-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </footer>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-[var(--text-secondary)] [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}

export function Contact() {
  return site.contactEmail ? (
    <a className="underline" href={`mailto:${site.contactEmail}`}>
      {site.contactEmail}
    </a>
  ) : (
    <a className="underline" href={site.contactFallbackUrl}>
      the contact details at {site.contactFallbackUrl.replace("https://", "")}
    </a>
  );
}

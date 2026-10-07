"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections";

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/** Section list beside the content from `lg` up (below that, the app sidebar plus this rail would squeeze the content). Phones use `SettingsIndex` on /settings and a back link instead. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-17 flex flex-col gap-1">
        {SETTINGS_SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11",
                  focusRing,
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The /settings landing list: every section with its one-line description. Phones arrive here from the tab bar. */
export function SettingsIndex() {
  return (
    <nav aria-label="Settings sections">
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {SETTINGS_SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                focusRing,
                "flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2",
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-[12.5px] leading-snug text-muted-foreground">{description}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Settings" page title: the sticky bar from `md` up; on phones the top bar names the page instead. */
export function SettingsHeader() {
  return <PageHeader title="Settings" />;
}

/** Title block at the top of one settings section, with a way back to the section list on phones. */
export function SectionHeader({ href }: { href: string }) {
  const section = SETTINGS_SECTIONS.find((s) => s.href === href);
  if (!section) return null;
  return (
    <div className="mb-4">
      <Link
        href="/settings"
        className={cn(
          "-ml-1.5 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg pr-2 pl-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden",
          focusRing,
        )}
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        Settings
      </Link>
      <h2 className="text-lg font-semibold tracking-tight">{section.label}</h2>
      <p className="text-sm text-muted-foreground">{section.description}</p>
    </div>
  );
}

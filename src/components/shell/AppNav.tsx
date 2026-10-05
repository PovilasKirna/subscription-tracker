"use client";

import { LayoutDashboardIcon, ListIcon, RepeatIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HoardMark } from "./HoardMark";

// `railHref` is where the desktop rail goes: Settings opens its first section there, while phones get the section list.
const LINKS = [
  { href: "/", railHref: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/subscriptions", railHref: "/subscriptions", label: "Subscriptions", icon: RepeatIcon },
  { href: "/transactions", railHref: "/transactions", label: "Transactions", icon: ListIcon },
  { href: "/settings", railHref: SETTINGS_SECTIONS[0].href, label: "Settings", icon: SettingsIcon },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/**
 * The app shell's navigation. From `md` up it's a left rail; on phones it splits into a compact
 * top bar (brand and bell) and a fixed bottom tab bar, so nothing ever scrolls sideways.
 */
export function AppNav() {
  const pathname = usePathname();
  return (
    <>
      {/* Phones: brand on the left, bell on the right. Never scrolls. */}
      <header className="sticky top-0 z-30 border-b bg-card pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-12 items-center justify-between gap-2 pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="flex items-center gap-2.5 font-semibold">
            <HoardMark className="size-7" />
            <span>{site.name}</span>
          </div>
          <NotificationBell />
        </div>
      </header>

      {/* Desktop and tablet: the left rail. */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:bg-card md:py-5 md:pr-3 md:pl-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="mb-5 flex items-center gap-2.5 px-2 font-semibold">
          <HoardMark className="size-7" />
          <span>{site.name}</span>
          <NotificationBell className="-my-1 ml-auto" />
        </div>
        <nav aria-label="Primary">
          <ul className="flex flex-col gap-1">
            {LINKS.map(({ href, railHref, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={railHref}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring pointer-coarse:min-h-11",
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
        <div className="mt-auto flex gap-3 px-2.5 pt-1 text-xs text-muted-foreground">
          <Link
            href="/privacy"
            className="rounded py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="rounded py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            Terms
          </Link>
        </div>
      </aside>

      {/* Phones: the tab bar, fixed to the bottom edge and clear of the home indicator. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring",
                    active && "font-medium text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-14 place-items-center rounded-full transition-colors group-hover:text-foreground",
                      active && "bg-muted text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="max-w-full truncate leading-4">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

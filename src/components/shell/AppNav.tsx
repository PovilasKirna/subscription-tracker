"use client";

import { LayoutDashboardIcon, ListIcon, RepeatIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HoardMark } from "./HoardMark";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/subscriptions", label: "Subscriptions", icon: RepeatIcon },
  { href: "/transactions", label: "Transactions", icon: ListIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 z-20 flex items-center gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:h-dvh md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-5">
      <div className="mr-2 flex items-center gap-2.5 px-2 font-semibold md:mr-0 md:mb-5 md:pr-0">
        <HoardMark className="size-7" />
        <span className="hidden md:inline">{site.name}</span>
        {/* Desktop: beside the app name at the top of the sidebar. */}
        <NotificationBell className="-my-1 ml-auto hidden md:inline-flex" />
      </div>
      <nav className="flex gap-1 md:flex-col">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted font-medium text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className={cn(href === "/settings" && "hidden sm:inline")}>{label}</span>
            </Link>
          );
        })}
      </nav>
      {/* Phones: pinned to the right end of the top bar, even when the links scroll. */}
      <div className="sticky -right-3 -mr-3 ml-auto bg-card pr-3 pl-2 md:hidden">
        <NotificationBell />
      </div>
      <div className="hidden gap-3 px-2.5 pt-1 text-xs text-muted-foreground md:mt-auto md:flex">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </div>
    </aside>
  );
}

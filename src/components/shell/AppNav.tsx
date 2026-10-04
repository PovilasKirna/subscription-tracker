"use client";

import { DatabaseIcon, LayoutDashboardIcon, ListIcon, LogOutIcon, RepeatIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/subscriptions", label: "Subscriptions", icon: RepeatIcon },
  { href: "/transactions", label: "Transactions", icon: ListIcon },
  { href: "/data", label: "Data & sync", icon: DatabaseIcon },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };
  return (
    <aside className="sticky top-0 z-20 flex items-center gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:h-dvh md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-5">
      <div className="mr-2 flex items-center gap-2.5 px-2 font-semibold md:mr-0 md:mb-5">
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--series-1)] text-white">
          <RepeatIcon className="size-4" />
        </span>
        <span className="hidden md:inline">Subscriptions</span>
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
              <span className={cn(href === "/data" && "hidden sm:inline")}>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1 md:mt-auto md:ml-0 md:flex-col md:items-stretch">
        <ThemeToggle />
        <div className="hidden gap-3 px-2.5 pt-1 text-xs text-muted-foreground md:flex">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
        <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={logout}>
          <LogOutIcon />
          <span className="hidden md:inline">Log out</span>
        </Button>
      </div>
    </aside>
  );
}

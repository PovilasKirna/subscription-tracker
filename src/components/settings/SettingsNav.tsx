"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections";

/** Section list: a column beside the content on desktop, a scrollable row of pills on phones. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:sticky md:top-7 md:flex-col">
        {SETTINGS_SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Title block at the top of one settings section. */
export function SectionHeader({ href }: { href: string }) {
  const section = SETTINGS_SECTIONS.find((s) => s.href === href);
  if (!section) return null;
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{section.label}</h2>
      <p className="text-sm text-muted-foreground">{section.description}</p>
    </div>
  );
}

"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
const ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };
const LABEL = { system: "System theme", light: "Light theme", dark: "Dark theme" };

export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const Icon = ICON[current] ?? MonitorIcon;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start text-muted-foreground"
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[current]} — switch to ${next}`}
    >
      <Icon />
      <span className="hidden md:inline">{LABEL[current]}</span>
    </Button>
  );
}

"use client";

import { Loader2Icon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

export function AppearanceCard() {
  const { theme = "system", setTheme } = useTheme();
  // The stored theme is only known in the browser; render "System" until then to match the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>System follows your device's light or dark setting.</CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          variant="outline"
          value={[mounted ? theme : "system"]}
          onValueChange={(v: string[]) => v[0] && setTheme(v[0])}
          aria-label="Theme"
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} className="gap-1.5 px-3">
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

export function SignOutCard() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const logout = async () => {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      setPending(false);
      toast.error("Couldn't log out — check your connection and try again.");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session</CardTitle>
        <CardDescription>Log out of this browser. Your data stays on the server.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={logout} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}

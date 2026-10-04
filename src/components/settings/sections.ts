import { DatabaseIcon, type LucideIcon, UserIcon } from "lucide-react";

export type SettingsSection = { href: string; label: string; description: string; icon: LucideIcon };

/** The Settings sub-nav, in order; `/settings` opens the first one. Add new sections here. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    href: "/settings/data",
    label: "Data & sync",
    description: "Bank connections, statement imports and backups.",
    icon: DatabaseIcon,
  },
  {
    href: "/settings/account",
    label: "Account",
    description: "Appearance and signing out.",
    icon: UserIcon,
  },
];

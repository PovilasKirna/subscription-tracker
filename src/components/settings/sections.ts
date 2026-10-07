import { BellIcon, DatabaseIcon, GlobeIcon, HandCoinsIcon, type LucideIcon, ShapesIcon, UserIcon } from "lucide-react";

export type SettingsSection = { href: string; label: string; description: string; icon: LucideIcon };

/** The Settings sub-nav, in order; `/settings` opens the first one. Add new sections here. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    href: "/settings/data",
    label: "Data & sync",
    description: "Bank and Trading 212 connections, statement imports and backups.",
    icon: DatabaseIcon,
  },
  {
    href: "/settings/categories",
    label: "Categories",
    description: "The spending categories payments are sorted into, and what each one counts as.",
    icon: ShapesIcon,
  },
  {
    href: "/settings/reimbursements",
    label: "Reimbursements",
    description: "Where money for your subscriptions comes back from, and whether you have to ask for it.",
    icon: HandCoinsIcon,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "What you're told about, how, and the scheduler that sends it.",
    icon: BellIcon,
  },
  {
    href: "/settings/general",
    label: "General",
    description: "Your time zone and when reminders and summaries arrive.",
    icon: GlobeIcon,
  },
  {
    href: "/settings/account",
    label: "Account",
    description: "Appearance and signing out.",
    icon: UserIcon,
  },
];

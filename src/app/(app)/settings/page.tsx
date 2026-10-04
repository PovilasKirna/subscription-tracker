import { redirect } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";

export default function SettingsPage() {
  redirect(SETTINGS_SECTIONS[0].href);
}

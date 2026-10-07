import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  BriefcaseIcon,
  CarIcon,
  CircleDollarSignIcon,
  ClapperboardIcon,
  HeartPulseIcon,
  HomeIcon,
  type LucideIcon,
  PlaneIcon,
  ReceiptIcon,
  RepeatIcon,
  SendIcon,
  ShapesIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  UndoIcon,
  UtensilsIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { cn } from "@/lib/utils";

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  groceries: ShoppingBasketIcon,
  restaurants: UtensilsIcon,
  transport: CarIcon,
  shopping: ShoppingBagIcon,
  subscriptions: RepeatIcon,
  entertainment: ClapperboardIcon,
  bills: ZapIcon,
  housing: HomeIcon,
  health: HeartPulseIcon,
  travel: PlaneIcon,
  cash: BanknoteIcon,
  transfers: SendIcon,
  fees: ReceiptIcon,
  general: ShapesIcon,
  refunds: UndoIcon,
  salary: BriefcaseIcon,
  income: CircleDollarSignIcon,
  internal: ArrowLeftRightIcon,
};

/** A category's icon in a round, neutral chip (identity comes from the icon and label, not colour). */
export function CategoryIcon({ id, size = "md", className }: { id: CategoryId; size?: "sm" | "md"; className?: string }) {
  const Icon = CATEGORY_ICON[id] ?? WalletIcon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[var(--text-secondary)]",
        size === "sm" ? "size-6 [&_svg]:size-3.5" : "size-9 [&_svg]:size-4",
        className,
      )}
      title={CATEGORIES[id]?.label}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

"use client";

import {
  ArrowLeftRightIcon,
  BabyIcon,
  BanknoteIcon,
  BeerIcon,
  BikeIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BusIcon,
  CarIcon,
  CircleDollarSignIcon,
  ClapperboardIcon,
  CoffeeIcon,
  CoinsIcon,
  CreditCardIcon,
  DumbbellIcon,
  FuelIcon,
  Gamepad2Icon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  HandHeartIcon,
  HeartPulseIcon,
  HomeIcon,
  LandmarkIcon,
  LaptopIcon,
  type LucideIcon,
  MusicIcon,
  PartyPopperIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PillIcon,
  PlaneIcon,
  ReceiptIcon,
  RepeatIcon,
  ScissorsIcon,
  SendIcon,
  ShapesIcon,
  ShieldIcon,
  ShirtIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  ShoppingCartIcon,
  SirenIcon,
  SmartphoneIcon,
  SparklesIcon,
  TagIcon,
  TrainFrontIcon,
  TreePalmIcon,
  TrendingUpIcon,
  UmbrellaIcon,
  UndoIcon,
  UtensilsIcon,
  WalletIcon,
  WifiIcon,
  WineIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { seriesColor } from "@/charts/palette";
import type { CategoryIconName, CategoryId } from "@/lib/categories";
import { useCategories } from "@/lib/query/useCategories";
import { cn } from "@/lib/utils";

/** The curated icons a category can have (see CATEGORY_ICON_NAMES for the order shown). */
export const CATEGORY_ICONS: Record<CategoryIconName, LucideIcon> = {
  "piggy-bank": PiggyBankIcon,
  landmark: LandmarkIcon,
  wallet: WalletIcon,
  coins: CoinsIcon,
  banknote: BanknoteIcon,
  "credit-card": CreditCardIcon,
  "hand-coins": HandCoinsIcon,
  "trending-up": TrendingUpIcon,
  "circle-dollar-sign": CircleDollarSignIcon,
  briefcase: BriefcaseIcon,
  receipt: ReceiptIcon,
  send: SendIcon,
  "arrow-left-right": ArrowLeftRightIcon,
  repeat: RepeatIcon,
  undo: UndoIcon,
  siren: SirenIcon,
  umbrella: UmbrellaIcon,
  shield: ShieldIcon,
  "shopping-basket": ShoppingBasketIcon,
  "shopping-cart": ShoppingCartIcon,
  "shopping-bag": ShoppingBagIcon,
  shirt: ShirtIcon,
  gift: GiftIcon,
  tag: TagIcon,
  utensils: UtensilsIcon,
  coffee: CoffeeIcon,
  beer: BeerIcon,
  wine: WineIcon,
  car: CarIcon,
  bus: BusIcon,
  train: TrainFrontIcon,
  fuel: FuelIcon,
  bike: BikeIcon,
  plane: PlaneIcon,
  "tree-palm": TreePalmIcon,
  home: HomeIcon,
  zap: ZapIcon,
  wifi: WifiIcon,
  smartphone: SmartphoneIcon,
  laptop: LaptopIcon,
  wrench: WrenchIcon,
  "heart-pulse": HeartPulseIcon,
  pill: PillIcon,
  dumbbell: DumbbellIcon,
  scissors: ScissorsIcon,
  "graduation-cap": GraduationCapIcon,
  "book-open": BookOpenIcon,
  baby: BabyIcon,
  "paw-print": PawPrintIcon,
  "hand-heart": HandHeartIcon,
  "party-popper": PartyPopperIcon,
  clapperboard: ClapperboardIcon,
  music: MusicIcon,
  gamepad: Gamepad2Icon,
  sparkles: SparklesIcon,
  shapes: ShapesIcon,
};

/** A category colour (palette slot) for marks: bars, swatches. null = the neutral muted grey. */
export const categoryColor = (color: number | null) => (color ? seriesColor(color) : "var(--text-muted)");

/** A tinted chip: the colour as a wash, the icon in it darkened towards the text colour for contrast. */
const chipStyle = (color: number | null): CSSProperties | undefined =>
  color
    ? {
        background: `color-mix(in oklab, ${seriesColor(color)} 16%, transparent)`,
        color: `color-mix(in oklab, ${seriesColor(color)} 80%, var(--foreground))`,
      }
    : undefined;

/** An icon in a round chip: tinted with the category's colour, or neutral without one. */
export function CategoryGlyph({
  icon,
  color,
  label,
  size = "md",
  className,
}: {
  icon: CategoryIconName;
  color: number | null;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[icon] ?? WalletIcon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[var(--text-secondary)]",
        size === "sm" ? "size-6 [&_svg]:size-3.5" : "size-9 [&_svg]:size-4",
        className,
      )}
      style={chipStyle(color)}
      title={label}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

/** A category's icon in its chip (identity comes from the icon and label; the colour, where it has one, is extra). */
export function CategoryIcon({ id, size = "md", className }: { id: CategoryId; size?: "sm" | "md"; className?: string }) {
  const c = useCategories().of(id);
  return <CategoryGlyph icon={c.icon} color={c.color} label={c.label} size={size} className={className} />;
}

/** Just the icon of a category, for menus and buttons. */
export function CategoryIconOnly({ id, className }: { id: CategoryId; className?: string }) {
  const Icon = CATEGORY_ICONS[useCategories().of(id).icon] ?? WalletIcon;
  return <Icon className={className} />;
}

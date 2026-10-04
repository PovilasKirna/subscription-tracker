import { CircleCheckIcon, CircleDashedIcon, CircleSlashIcon, ClockAlertIcon, EyeOffIcon } from "lucide-react";
import { type RowStatus, STATUS_LABEL } from "./shared";

// Status colours are reserved and always paired with an icon + label (never colour alone).
const STATUS = {
  active: { icon: CircleCheckIcon, color: "var(--status-good)" },
  late: { icon: ClockAlertIcon, color: "var(--status-warning)" },
  inactive: { icon: CircleDashedIcon, color: "var(--text-muted)" },
  cancelled: { icon: CircleSlashIcon, color: "var(--text-muted)" },
  ignored: { icon: EyeOffIcon, color: "var(--text-muted)" },
} satisfies Record<RowStatus, unknown>;

export function StatusBadge({ status }: { status: RowStatus }) {
  const { icon: Icon, color } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-muted-foreground">
      <Icon className="size-3.5" style={{ color }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

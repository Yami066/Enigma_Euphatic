import { useApp, type AssetStatus } from "../../context/AppContext";

interface Props {
  status: AssetStatus;
  label?: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, label, showIcon = true }: Props) {
  const { t } = useApp();

  let cls = "badge-neutral";
  let defaultLabel = t("badge.neutral", "Not Initiated");
  let dotColor = "#4F3F38";

  if (status === "on-track") {
    cls = "badge-on-track";
    defaultLabel = t("badge.onTrack", "On Track");
    dotColor = "#2E3D1F";
  } else if (status === "attention") {
    cls = "badge-attention";
    defaultLabel = t("badge.attention", "Attention Needed");
    dotColor = "#4F3F38";
  } else if (status === "overdue") {
    cls = "badge-overdue";
    defaultLabel = t("badge.overdue", "Overdue (Penal Interest)");
    dotColor = "#FFFFFF";
  }

  return (
    <span className={cls}>
      {showIcon && (
        <span
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {label || defaultLabel}
    </span>
  );
}

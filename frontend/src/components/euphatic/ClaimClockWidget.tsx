import { useMemo } from "react";
import { AlertCircle, Clock, FileDown, ShieldAlert } from "lucide-react";
import { type Asset, useApp } from "../../context/AppContext";
import { StatusBadge } from "./StatusBadge";

interface Props {
  asset: Asset;
  onPreviewPack?: () => void;
  onDelayNotice?: () => void;
}

export function ClaimClockWidget({ asset, onPreviewPack, onDelayNotice }: Props) {
  const { showToast } = useApp();
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  const totalDays = asset.deadlineDays || 15;
  const daysRemaining = asset.daysRemaining;
  const isOverdue = daysRemaining < 0;
  const overdueDays = Math.abs(daysRemaining);

  // Calculate percentage for SVG ring
  const progressRatio = useMemo(() => {
    if (isOverdue) return 1;
    const elapsed = Math.max(0, totalDays - daysRemaining);
    return Math.min(1, elapsed / totalDays);
  }, [totalDays, daysRemaining, isOverdue]);

  const strokeDashoffset = circumference - progressRatio * circumference;

  // Penal interest calculation under RBI para 33: Bank Rate (6.5%) + 4.0% = 10.5%
  const penalRate = 0.105;
  const accruedPenalInterest = useMemo(() => {
    if (!isOverdue || !asset.amount) return 0;
    const dailyInterest = (asset.amount * penalRate) / 365;
    return Math.round(dailyInterest * overdueDays);
  }, [isOverdue, asset.amount, overdueDays]);

  let ringColor = "#B7C497"; // Sage (on-track)
  if (asset.status === "attention") {
    ringColor = "#FFB077"; // Peach
  } else if (isOverdue || asset.status === "overdue") {
    ringColor = "#AA4342"; // Brick
  }

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="app-card flex flex-col justify-between transition-all">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-mono text-xs font-bold text-[#6B6358]">
              {asset.accountNumber ? `A/C ••••${asset.accountNumber.slice(-4)}` : "ASSET"}
            </span>
            <h3 className="text-lg font-semibold text-[#4F3F38]">{asset.institution}</h3>
            <p className="text-xs text-[#6B6358]">{asset.routeTitle}</p>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        <div className="my-5 flex items-center gap-5">
          {/* Circular Countdown SVG Ring */}
          <div className="relative flex size-24 shrink-0 items-center justify-center">
            <svg className="size-24 -rotate-90 transform" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r={radius}
                className="stroke-[#EDE9E2]"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                stroke={ringColor}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {isOverdue ? (
                <>
                  <span className="font-mono text-lg font-bold text-[#AA4342]">+{overdueDays}d</span>
                  <span className="text-[10px] font-semibold text-[#AA4342] uppercase">OVERDUE</span>
                </>
              ) : (
                <>
                  <span className="font-mono text-xl font-bold text-[#4F3F38]">{daysRemaining}d</span>
                  <span className="text-[10px] text-[#6B6358] uppercase">REMAINING</span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-[#4F3F38]">
              {asset.amount > 0 ? formatInr(asset.amount) : "Locker Contents"}
            </div>
            <div className="text-xs text-[#6B6358]">
              Statutory Window: <span className="font-semibold text-[#4F3F38]">{totalDays} calendar days</span>
            </div>
            {asset.docsCompleteDate && (
              <div className="text-xs text-[#6B6358]">
                Paperwork verified: <span className="font-mono font-medium text-[#4F3F38]">{asset.docsCompleteDate}</span>
              </div>
            )}
            {isOverdue && (
              <div className="inline-flex items-center gap-1 rounded bg-[#fff0f0] px-2 py-0.5 text-xs font-semibold text-[#AA4342]">
                <AlertCircle className="size-3.5" />
                RBI Para 33 Interest: {formatInr(accruedPenalInterest)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 border-t border-[#EDE9E2] pt-4">
        <button
          type="button"
          onClick={onPreviewPack}
          className="btn-primary-sm flex-1 text-xs"
        >
          <FileDown className="size-3.5" />
          Claim Pack PDF
        </button>

        {isOverdue ? (
          <button
            type="button"
            onClick={onDelayNotice}
            className="btn-destructive-sm flex-1 text-xs"
          >
            <ShieldAlert className="size-3.5" />
            Demand Notice
          </button>
        ) : (
          <button
            type="button"
            onClick={() => showToast(`Claim progress logged for ${asset.institution}`)}
            className="btn-secondary-sm flex-1 text-xs"
          >
            <Clock className="size-3.5" />
            Update Status
          </button>
        )}
      </div>
    </div>
  );
}

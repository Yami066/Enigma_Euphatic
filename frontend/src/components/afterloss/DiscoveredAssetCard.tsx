import { CheckCircle2, ChevronRight, FileSearch, Mail, Sparkles, X } from "lucide-react";
import { type Asset } from "../../context/AppContext";

interface Props {
  asset: Partial<Asset>;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function DiscoveredAssetCard({ asset, onConfirm, onDismiss }: Props) {
  const confidence = asset.confidence ?? 90;

  const sourceMeta = {
    statement_ocr: { label: "Bank Statement OCR", icon: FileSearch, color: "#4F3F38" },
    gmail_scan: { label: "Gmail Scan Match", icon: Mail, color: "#4F3F38" },
    udgam_search: { label: "RBI UDGAM Search", icon: Sparkles, color: "#4F3F38" },
    manual: { label: "Manual Entry", icon: CheckCircle2, color: "#4F3F38" },
  }[asset.discoveredVia || "statement_ocr"];

  const SourceIcon = sourceMeta.icon;

  const formatInr = (val?: number) =>
    val ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val) : "Discovered Record";

  return (
    <div className="app-card border-l-4 border-l-[#FFB077] transition-all hover:shadow-[0_4px_12px_rgba(79,63,56,0.12)]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F3EC] px-2.5 py-0.5 text-[11px] font-semibold text-[#8A7F76]">
              <SourceIcon className="size-3" />
              {sourceMeta.label}
            </span>
            <span className="rounded-full bg-[#B7C497]/30 px-2 py-0.5 text-[11px] font-semibold text-[#2E3D1F]">
              {confidence}% match confidence
            </span>
          </div>

          <h4 className="text-base font-semibold text-[#4F3F38]">{asset.institution}</h4>
          <p className="font-mono text-xs text-[#8A7F76]">
            Account: {asset.accountNumber ? `••••${asset.accountNumber.slice(-4)}` : "Verified in Narration"}
          </p>
          <div className="pt-1 text-sm font-bold text-[#4F3F38]">
            {formatInr(asset.amount)}
          </div>
          {asset.rbiCitation && (
            <p className="text-xs text-[#8A7F76] italic">
              Proposed Route: {asset.routeTitle || "Simplified Bank Settlement"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:self-center">
          <button
            type="button"
            onClick={onDismiss}
            className="btn-secondary-sm text-xs text-[#8A7F76]"
            title="Dismiss lead"
          >
            <X className="size-3.5" />
            Dismiss
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary-sm text-xs"
          >
            <CheckCircle2 className="size-3.5" />
            Add to Claims
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Download, ExternalLink, FileCheck, FileDown, FileText, Printer, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { useApp, type Asset } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function PaperworkPage() {
  const { caseData, setActiveClaimPackModal, showToast } = useApp();

  const handleDownloadAll = () => {
    showToast("Compiling master PDF bundle for all estate accounts...");
  };

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
              <FileCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#4F3F38]">Official RBI Claim Packs & Forms</h2>
              <p className="text-xs text-[#6B6358]">
                Fully filled statutory claim dossiers, NOC affidavits, and demand letters generated to official RBI specifications.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadAll}
            className="btn-primary-sm text-xs"
          >
            <Download className="size-3.5" />
            Download Complete Estate Bundle (.ZIP)
          </button>
        </div>
      </div>

      {/* Grid of Claims */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {caseData.assets.map((asset) => (
          <div key={asset.assetId} className="app-card flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-[#6B6358]">
                    {asset.accountNumber ? `••••${asset.accountNumber.slice(-4)}` : "SAFE DEPOSIT"}
                  </span>
                  <h3 className="text-base font-bold text-[#4F3F38]">{asset.institution}</h3>
                  <p className="text-xs text-[#6B6358]">{asset.routeTitle}</p>
                </div>
                <span className="font-mono text-sm font-bold text-[#4F3F38]">
                  {asset.amount > 0 ? formatInr(asset.amount) : "Locker Box"}
                </span>
              </div>

              <div className="mt-4 rounded-lg bg-[#F5F3EC]/60 p-3 text-xs text-[#6B6358] space-y-1">
                <div>
                  Claimant: <strong className="text-[#4F3F38]">{caseData.claimant.fullName}</strong>
                </div>
                <div>
                  Target Branch: <span className="text-[#4F3F38]">{asset.branch || "Branch Manager"}</span>
                </div>
                <div>
                  Included Forms: <span className="font-semibold text-[#4F3F38]">Annex I-A/B, Annex I-C, Annex I-D</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[#EDE9E2] pt-4">
              <button
                type="button"
                onClick={() => setActiveClaimPackModal(asset)}
                className="btn-primary-sm flex-1 text-xs"
              >
                <FileDown className="size-3.5" />
                View & Download PDF Pack
              </button>

              {asset.status === "overdue" && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveClaimPackModal(asset);
                    showToast("Opening RBI Para 33 demand letter.");
                  }}
                  className="btn-destructive-sm text-xs"
                >
                  <ShieldAlert className="size-3.5" />
                  Para 33 Demand Letter
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legal Reference Callout */}
      <CitationBlock
        citation="RBI Master Directions 2025: Standardised claim forms must be made available free of charge by all scheduled commercial banks. Banks cannot mandate submission of any forms other than the prescribed Annexures."
        source="RBI Directions 2025 para 29"
      />
    </div>
  );
}

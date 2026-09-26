import { useState } from "react";
import { Check, ChevronRight, FileText, Info, Landmark, Plus, Scale, ShieldCheck } from "lucide-react";
import { useApp, type Asset } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function AssetRoutingPage() {
  const { caseData, updateAsset, setActiveClaimPackModal, showToast } = useApp();
  const [selectedAssetId, setSelectedAssetId] = useState<string>(caseData.assets[0]?.assetId || "");

  const selectedAsset = caseData.assets.find((a) => a.assetId === selectedAssetId) || caseData.assets[0];

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Scale className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Legal Route Engine & RBI Rules</h2>
            <p className="text-xs text-[#8A7F76]">
              Every account is dynamically evaluated under RBI Directions 2025 to determine whether a registered nominee, simplified board limit, or full indemnity applies.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: List of Assets */}
        <div className="space-y-2 lg:col-span-5">
          <span className="text-xs font-semibold text-[#8A7F76] uppercase tracking-wider">
            Select Account to Inspect Route:
          </span>
          <div className="space-y-2">
            {caseData.assets.map((asset) => {
              const isSelected = asset.assetId === selectedAsset?.assetId;
              return (
                <div
                  key={asset.assetId}
                  onClick={() => setSelectedAssetId(asset.assetId)}
                  className={`app-card cursor-pointer p-4 transition-all ${
                    isSelected
                      ? "border-[#4F3F38] bg-[#F5F3EC]/40 shadow-[0_2px_8px_rgba(79,63,56,0.12)]"
                      : "hover:border-[#ACA986]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-[#4F3F38]">{asset.institution}</h4>
                      <p className="font-mono text-xs text-[#8A7F76]">
                        {asset.accountNumber ? `••••${asset.accountNumber.slice(-4)}` : "Verified Box"}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#4F3F38]">
                      {asset.amount > 0 ? formatInr(asset.amount) : "Locker"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="rounded bg-white px-2 py-0.5 font-medium text-[#4F3F38] border border-[#EDE9E2]">
                      {asset.routeCode}
                    </span>
                    <span className="capitalize text-[#8A7F76]">Nomination: {asset.nomination}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Deep Route Breakdown */}
        {selectedAsset && (
          <div className="app-card space-y-6 lg:col-span-7">
            <div className="border-b border-[#EDE9E2] pb-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#B7C497]/40 px-2.5 py-0.5 text-xs font-semibold text-[#2E3D1F]">
                  STATUTORY ROUTE CLASSIFICATION
                </span>
                <span className="font-mono text-xs text-[#8A7F76]">{selectedAsset.routeCode}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-[#4F3F38]">
                {selectedAsset.routeTitle}
              </h3>
              <p className="text-xs text-[#8A7F76]">
                Institution: <strong className="text-[#4F3F38]">{selectedAsset.institution}</strong> • Value:{" "}
                <strong className="font-mono text-[#4F3F38]">
                  {selectedAsset.amount > 0 ? formatInr(selectedAsset.amount) : "Safe Custody"}
                </strong>
              </p>
            </div>

            {/* Statutory Legal Citation */}
            <div>
              <label className="app-label">Governing Statutory Rule</label>
              <CitationBlock
                citation={selectedAsset.rbiCitation}
                source="Reserve Bank of India Master Directions on Deceased Depositors"
              />
            </div>

            {/* Required Paperwork Checklist */}
            <div>
              <label className="app-label">Prescribed Annexures & Checklist</label>
              <div className="space-y-2">
                {[
                  {
                    title: selectedAsset.nomination === "nominee" ? "Annex I-A Claim Form" : "Annex I-B Claim Form",
                    desc: selectedAsset.nomination === "nominee" ? "Application by registered nominee" : "Application by all surviving legal heirs",
                    ready: true,
                  },
                  {
                    title: "Annex I-C Declaration / Family Tree Affidavit",
                    desc: "Solemn declaration of surviving Class-I legal heirs",
                    ready: true,
                  },
                  {
                    title: "Annex I-D Relinquishment & No Objection (NOC)",
                    desc: "Signed by non-claiming heirs allowing single claimant payout",
                    ready: selectedAsset.nomination !== "nominee",
                  },
                  {
                    title: "Attested Death Certificate & KYC",
                    desc: "Municipal death certificate copy + PAN + Aadhaar of claimant",
                    ready: true,
                  },
                ]
                  .filter((x) => x.ready)
                  .map((doc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-[#EDE9E2] bg-[#FFFDFB] p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <Check className="size-4 text-[#B7C497]" />
                        <div>
                          <span className="font-semibold text-[#4F3F38]">{doc.title}</span>
                          <p className="text-[11px] text-[#8A7F76]">{doc.desc}</p>
                        </div>
                      </div>
                      <span className="rounded bg-[#F5F3EC] px-2 py-0.5 text-[10px] font-semibold text-[#4F3F38]">
                        AUTO-GENERATED
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Threshold & Guarantee note */}
            <div className="rounded-[8px] bg-[#F5F3EC] p-4 text-xs text-[#8A7F76]">
              <div className="flex items-center gap-2 font-semibold text-[#4F3F38]">
                <ShieldCheck className="size-4 text-[#B7C497]" />
                15-Day Protection Guarantee
              </div>
              <p className="mt-1 leading-relaxed">
                Under Paragraph 31, once you submit this packet with acknowledgement, the bank cannot delay past 15 days or request any external legal heir certificates not listed above.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveClaimPackModal(selectedAsset)}
                className="btn-primary"
              >
                <FileText className="size-4" />
                Generate Official Pack for this Route
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

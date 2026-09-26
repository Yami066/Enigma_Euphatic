import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Compass,
  FileCheck,
  FileDown,
  FileSearch,
  Filter,
  Landmark,
  Plus,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useApp, type Asset } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";
import { ClaimClockWidget } from "../../components/euphatic/ClaimClockWidget";
import { StatusBadge } from "../../components/euphatic/StatusBadge";

export function DashboardPage() {
  const { caseData, setCurrentView, setActiveClaimPackModal, showToast, loadMockData, startFreshCase } = useApp();
  const [filterType, setFilterType] = useState<string>("all");

  const totalValue = useMemo(() => {
    return caseData.assets.reduce((sum, a) => sum + (a.amount || 0), 0);
  }, [caseData.assets]);

  const onTrackCount = useMemo(() => {
    return caseData.assets.filter((a) => a.status === "on-track").length;
  }, [caseData.assets]);

  const attentionCount = useMemo(() => {
    return caseData.assets.filter((a) => a.status === "attention").length;
  }, [caseData.assets]);

  const overdueCount = useMemo(() => {
    return caseData.assets.filter((a) => a.status === "overdue").length;
  }, [caseData.assets]);

  const filteredAssets = useMemo(() => {
    if (filterType === "all") return caseData.assets;
    if (filterType === "bank") return caseData.assets.filter((a) => a.assetType === "bank_deposit" || a.assetType === "term_deposit" || a.assetType === "locker");
    if (filterType === "investments") return caseData.assets.filter((a) => a.assetType === "shares" || a.assetType === "mutual_fund" || a.assetType === "pension" || a.assetType === "life_insurance");
    if (filterType === "overdue") return caseData.assets.filter((a) => a.status === "overdue");
    return caseData.assets;
  }, [caseData.assets, filterType]);

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8">
      {/* Case Header Banner with Left Accent Strip border-l-4 border-l-[#FFB077] */}
      <div className="app-card border-l-4 border-l-[#FFB077] bg-white">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#6B6358]">
                ESTATE SETTLEMENT #{caseData.caseId}
              </span>
              <span className="rounded-full bg-[#B7C497]/30 px-2 py-0.5 text-[11px] font-semibold text-[#2E3D1F]">
                Active Jurisdiction: {caseData.deceased.placeOfDeath}
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-[#4F3F38]">
              {caseData.deceased.fullName || "Fresh Estate (No Deceased Configured)"}
            </h2>
            <p className="mt-0.5 text-xs text-[#6B6358]">
              Claimant: <strong className="text-[#4F3F38]">{caseData.claimant.fullName || "Not Specified"}</strong>
              {caseData.deceased.deathCertNo ? ` • Death Cert: ${caseData.deceased.deathCertNo}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadMockData}
              className="btn-secondary-sm text-xs"
              title="Load pre-filled sample estate with SBI/HDFC accounts to test features"
            >
              <Sparkles className="size-3.5 text-[#FFB077]" />
              Load Sample Mock Data
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("intake")}
              className="btn-secondary-sm text-xs"
            >
              <Compass className="size-3.5" />
              Intake Wizard
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("docDiscovery")}
              className="btn-primary-sm text-xs"
            >
              <FileSearch className="size-3.5" />
              Scan Documents
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="app-card p-5">
          <span className="text-xs text-[#6B6358]">Total Portfolio Value</span>
          <div className="mt-1 text-2xl font-bold text-[#4F3F38]">{formatInr(totalValue)}</div>
          <span className="text-[11px] text-[#6B6358]">{caseData.assets.length} identified accounts</span>
        </div>

        <div className="app-card p-5">
          <span className="text-xs text-[#6B6358]">Statutory On Track</span>
          <div className="mt-1 text-2xl font-bold text-[#2E3D1F]">{onTrackCount}</div>
          <span className="text-[11px] text-[#6B6358]">Within 15/30-day window</span>
        </div>

        <div className="app-card p-5">
          <span className="text-xs text-[#6B6358]">Attention Needed</span>
          <div className="mt-1 text-2xl font-bold text-[#FFB077]">{attentionCount}</div>
          <span className="text-[11px] text-[#6B6358]">Deadline expiring soon</span>
        </div>

        <div className="app-card p-5">
          <span className="text-xs text-[#6B6358]">Delayed / Overdue</span>
          <div className="mt-1 text-2xl font-bold text-[#AA4342]">{overdueCount}</div>
          <span className="text-[11px] text-[#AA4342] font-semibold">Penal Interest Due</span>
        </div>
      </div>

      {/* Active Statutory Clocks (Section 8) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">Active Statutory Clocks</h3>
            <p className="text-xs text-[#6B6358]">
              Real-time countdowns under RBI Directions 2025 para 31 (15-day settlement deadline).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCurrentView("followup")}
            className="text-xs font-semibold text-[#4F3F38] hover:text-[#FFB077]"
          >
            View Penal Interest Calculator →
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {caseData.assets
            .filter((a) => a.docsCompleteDate)
            .map((asset) => (
              <ClaimClockWidget
                key={asset.assetId}
                asset={asset}
                onPreviewPack={() => setActiveClaimPackModal(asset)}
                onDelayNotice={() => {
                  setActiveClaimPackModal(asset);
                  showToast(`Opening RBI Para 33 demand notice for ${asset.institution}.`);
                }}
              />
            ))}
        </div>
      </section>

      {/* Legal Reference Callout */}
      <CitationBlock
        citation="Para 31 of RBI Master Directions 2025 requires settlement within 15 calendar days from the receipt of complete documentation. Para 33 mandates automatic penal interest at Bank Rate (6.5%) + 4.0% p.a. from day 16 until disbursement."
        source="RBI Master Directions 2025 Para 31, 33"
      />

      {/* Assets & Claims Table */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">All Estate Accounts & Holdings</h3>
            <p className="text-xs text-[#6B6358]">
              Complete ledger of verified and auto-discovered assets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[#EDE9E2] bg-white p-1 text-xs">
              {[
                { id: "all", label: "All" },
                { id: "bank", label: "Banks & Lockers" },
                { id: "investments", label: "Investments & PF" },
                { id: "overdue", label: "Overdue" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                    filterType === f.id ? "bg-[#4F3F38] text-white" : "text-[#6B6358] hover:text-[#4F3F38]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrentView("routing")}
              className="btn-primary-sm text-xs"
            >
              <Plus className="size-3.5" />
              Add Account
            </button>
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="app-card text-center py-12 px-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F5F3EC] text-[#4F3F38]">
              <Sparkles className="size-6 text-[#FFB077]" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#4F3F38]">No Assets or Claims in This Estate Yet</h3>
            <p className="mx-auto mt-2 max-w-md text-xs text-[#6B6358] leading-relaxed">
              This account has a clean workspace. You can start entering your family's estate details, discover accounts via document OCR, or load sample mock data to explore.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentView("intake")}
                className="btn-primary-sm text-xs"
              >
                <Compass className="size-3.5" />
                Start Guided Estate Intake
              </button>
              <button
                type="button"
                onClick={() => setCurrentView("docDiscovery")}
                className="btn-secondary-sm text-xs"
              >
                <FileSearch className="size-3.5" />
                Scan Documents
              </button>
              <button
                type="button"
                onClick={loadMockData}
                className="btn-secondary-sm text-xs"
              >
                <Sparkles className="size-3.5 text-[#FFB077]" />
                Load Sample Mock Data
              </button>
            </div>
          </div>
        ) : (
          <div className="app-card overflow-x-auto p-0">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EDE9E2] bg-[#F5F3EC]/50 font-semibold text-[#6B6358]">
                  <th className="px-5 py-3.5">Institution & Account</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Statutory Route</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE9E2]">
                {filteredAssets.map((asset) => (
                  <tr key={asset.assetId} className="hover:bg-[#F5F3EC]/30">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#4F3F38]">{asset.institution}</div>
                      <div className="font-mono text-[11px] text-[#6B6358]">
                        {asset.accountNumber ? `••••${asset.accountNumber.slice(-4)}` : "Verified in Statement"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-[#6B6358]">
                      <span className="capitalize">{asset.assetType.replace("_", " ")}</span>
                    </td>

                    <td className="px-5 py-4 font-mono font-semibold text-[#4F3F38]">
                      {asset.amount > 0 ? formatInr(asset.amount) : "Locker Box"}
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-[#4F3F38]">{asset.routeTitle}</div>
                      <div className="text-[11px] text-[#6B6358]">
                        Nomination: <strong className="capitalize text-[#4F3F38]">{asset.nomination}</strong>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={asset.status} />
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveClaimPackModal(asset)}
                        className="btn-secondary-sm text-xs"
                      >
                        <FileDown className="size-3" />
                        Claim Pack
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

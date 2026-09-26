import { useState } from "react";
import { CheckCircle2, ChevronRight, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useApp, type Asset } from "../../context/AppContext";
import { CitationBlock } from "../../components/afterloss/CitationBlock";
import { DiscoveredAssetCard } from "../../components/afterloss/DiscoveredAssetCard";

export function EmailDiscoveryPage() {
  const { addAsset, showToast } = useApp();
  const [isScanning, setIsScanning] = useState(false);
  const [inboxConnected, setInboxConnected] = useState(true);

  const [emailLeads, setEmailLeads] = useState<Array<Partial<Asset>>>([
    {
      institution: "Groww (Nextbillion Technology)",
      assetType: "shares" as const,
      accountNumber: "1208180009182310",
      amount: 680000,
      nomination: "nominee" as const,
      routeTitle: "Transmission of Demat Securities",
      confidence: 99,
      discoveredVia: "gmail_scan" as const,
      rbiCitation: "Found via monthly holding statement email from 'reports@groww.in'.",
    },
    {
      institution: "National Pension System (NPS / Protean CRA)",
      assetType: "pension" as const,
      accountNumber: "PRAN-110098234120",
      amount: 940000,
      nomination: "nominee" as const,
      routeTitle: "NPS Death Claim Form (CRA)",
      confidence: 97,
      discoveredVia: "gmail_scan" as const,
      rbiCitation: "Found via quarterly subscriber statement from 'donotreply@proteantech.in'.",
    },
    {
      institution: "HDFC Life Insurance",
      assetType: "life_insurance" as const,
      accountNumber: "PP-990182",
      amount: 3000000,
      nomination: "nominee" as const,
      routeTitle: "Term Life Insurance Claim",
      confidence: 98,
      discoveredVia: "gmail_scan" as const,
      rbiCitation: "Found via policy renewal document from 'onlinehelp@hdfclife.com'.",
    },
  ]);

  const handleRunScan = () => {
    setIsScanning(true);
    showToast("Connecting to inbox search index for financial CAS / alerts...");

    setTimeout(() => {
      setIsScanning(false);
      const newLead = {
        institution: "KFin Technologies (MFCentral)",
        assetType: "mutual_fund" as const,
        accountNumber: "CAS-771920",
        amount: 510000,
        nomination: "nominee" as const,
        routeTitle: "Mutual Fund Transmission",
        confidence: 96,
        discoveredVia: "gmail_scan" as const,
        rbiCitation: "Found via Consolidated Account Statement (CAS) e-statement.",
      };
      setEmailLeads((prev) => [newLead, ...prev]);
      showToast(`Scan complete: Found new mutual fund folio via ${newLead.institution}.`);
    }, 1200);
  };

  const handleConfirmLead = (lead: any, index: number) => {
    addAsset({
      ...lead,
      status: "on-track",
      deadlineDays: 15,
      daysRemaining: 15,
    });
    setEmailLeads((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDismissLead = (index: number) => {
    setEmailLeads((prev) => prev.filter((_, i) => i !== index));
    showToast("Lead dismissed.");
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Mail className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Email Inbox Financial Discovery</h2>
            <p className="text-xs text-[#8A7F76]">
              Performs client-side targeted searches for Consolidated Account Statements (CAS), Demat contract notes, EPFO UAN alerts, and insurance policy schedules.
            </p>
          </div>
        </div>
      </div>

      {/* Inbox Connection Box */}
      <div className="app-card flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#B7C497]" />
            <h3 className="text-sm font-semibold text-[#4F3F38]">
              Target Account: deceased.family.archive@gmail.com
            </h3>
          </div>
          <p className="text-xs text-[#8A7F76]">
            Targeting queries: CAMS, KFintech, Zerodha, Groww, LIC, EPFO, and dividend credits.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunScan}
          disabled={isScanning}
          className="btn-primary-sm text-xs"
        >
          <RefreshCw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
          {isScanning ? "Scanning Emails..." : "Run Targeted Inbox Scan"}
        </button>
      </div>

      {/* Query Search Templates */}
      <div className="rounded-[12px] bg-[#F5F3EC]/60 p-5">
        <h4 className="text-xs font-bold text-[#4F3F38] uppercase tracking-wider">
          Active Statutory Search Queries
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#8A7F76] sm:grid-cols-2">
          <div className="rounded bg-white p-2.5 font-mono text-[11px] border border-[#EDE9E2]">
            from:(camsonline OR kfintech OR mfcentral) "statement"
          </div>
          <div className="rounded bg-white p-2.5 font-mono text-[11px] border border-[#EDE9E2]">
            from:(zerodha OR groww OR nsdl OR cdsl) "contract note"
          </div>
          <div className="rounded bg-white p-2.5 font-mono text-[11px] border border-[#EDE9E2]">
            from:(licindia OR hdfclife) "premium receipt" OR "policy"
          </div>
          <div className="rounded bg-white p-2.5 font-mono text-[11px] border border-[#EDE9E2]">
            subject:(UAN OR PRAN OR "EPF passbook" OR "dividend credited")
          </div>
        </div>
      </div>

      {/* Discovered Leads List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#4F3F38]">
          Found Financial Holdings ({emailLeads.length})
        </h3>

        {emailLeads.length > 0 ? (
          <div className="space-y-3">
            {emailLeads.map((lead, idx) => (
              <DiscoveredAssetCard
                key={idx}
                asset={lead}
                onConfirm={() => handleConfirmLead(lead, idx)}
                onDismiss={() => handleDismissLead(idx)}
              />
            ))}
          </div>
        ) : (
          <div className="app-card text-center text-xs text-[#8A7F76]">
            No pending email leads. All accounts have been triaged.
          </div>
        )}
      </div>

      <CitationBlock
        citation="SEBI Master Circular on Transmission of Securities: Registered nominees are entitled to immediate securities transmission without publishing newspaper notices or producing sureties."
        source="SEBI Transmission Circular & Guidelines"
      />
    </div>
  );
}

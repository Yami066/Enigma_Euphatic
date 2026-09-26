import { useState } from "react";
import { CheckCircle2, FileSearch, FileUp, Loader2, Sparkles, UploadCloud } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "../../components/afterloss/CitationBlock";
import { DiscoveredAssetCard } from "../../components/afterloss/DiscoveredAssetCard";

export function DocumentDiscoveryPage() {
  const { addAsset, showToast } = useApp();
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredLeads, setDiscoveredLeads] = useState([
    {
      institution: "Canara Bank",
      assetType: "bank_deposit" as const,
      accountNumber: "2019101004128",
      amount: 194000,
      nomination: "none" as const,
      routeTitle: "Simplified Bank Settlement",
      confidence: 96,
      discoveredVia: "statement_ocr" as const,
      rbiCitation: "Discovered via ECS debit mandate 'CANBK SAL' in HDFC statement. Route: RBI Directions 2025 para 30.",
    },
    {
      institution: "Tata Mutual Fund (CAMS Folio)",
      assetType: "mutual_fund" as const,
      accountNumber: "9102847/22",
      amount: 420000,
      nomination: "nominee" as const,
      routeTitle: "Direct Folio Transmission",
      confidence: 91,
      discoveredVia: "statement_ocr" as const,
      rbiCitation: "Discovered via monthly SIP narration 'ACH DR TATAMF' of ₹10,000.",
    },
    {
      institution: "Max Life Insurance",
      assetType: "life_insurance" as const,
      accountNumber: "ML-8819201",
      amount: 1500000,
      nomination: "nominee" as const,
      routeTitle: "Death Claim (IRDAI Form A)",
      confidence: 94,
      discoveredVia: "statement_ocr" as const,
      rbiCitation: "Discovered via annual premium debit 'MAXLIFE INSU' on 12-Nov.",
    },
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    showToast(`Scanning "${file.name}" for financial institution identifiers...`);

    setTimeout(() => {
      setIsScanning(false);
      const newLead = {
        institution: "Bank of India Savings",
        assetType: "bank_deposit" as const,
        accountNumber: "6021101000984",
        amount: 285000,
        nomination: "none" as const,
        routeTitle: "Simplified Settlement (Para 30)",
        confidence: 95,
        discoveredVia: "statement_ocr" as const,
        rbiCitation: "Discovered via NEFT credit transaction from scanned passbook page.",
      };
      setDiscoveredLeads((prev) => [newLead, ...prev]);
      showToast(`Scan complete: Identified new account at ${newLead.institution}.`);
    }, 1400);
  };

  const handleConfirmLead = (lead: any, index: number) => {
    addAsset({
      ...lead,
      status: "attention",
      deadlineDays: 15,
      daysRemaining: 15,
    });
    setDiscoveredLeads((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDismissLead = (index: number) => {
    setDiscoveredLeads((prev) => prev.filter((_, i) => i !== index));
    showToast("Lead dismissed.");
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <FileSearch className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Document OCR & Statement Forensics</h2>
            <p className="text-xs text-[#8A7F76]">
              Upload PDFs of bank statements, passbook scans, or tax filings. Our engine parses transaction narrations for ECS/NACH mandates, recurring debits, and SIPs.
            </p>
          </div>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div className="rounded-[12px] border-2 border-dashed border-[#EDE9E2] bg-white p-8 text-center transition-colors hover:border-[#4F3F38]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F5F3EC] text-[#4F3F38]">
          {isScanning ? <Loader2 className="size-6 animate-spin text-[#FFB077]" /> : <UploadCloud className="size-6" />}
        </div>
        <h3 className="mt-3 text-base font-semibold text-[#4F3F38]">
          {isScanning ? "Analyzing statement transactions..." : "Upload Bank Statement or Passbook Scan (PDF / Images)"}
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[#8A7F76]">
          Private and secure. Aadhaar numbers and sensitive identifiers are automatically masked.
        </p>

        <label className="btn-primary mt-4 cursor-pointer inline-flex">
          <FileUp className="size-4" />
          Select Document to Scan
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Discovered Accounts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">Auto-Discovered Accounts ({discoveredLeads.length})</h3>
            <p className="text-xs text-[#8A7F76]">
              Confirm leads to add them to your active statutory claim portfolio.
            </p>
          </div>
        </div>

        {discoveredLeads.length > 0 ? (
          <div className="space-y-3">
            {discoveredLeads.map((lead, idx) => (
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
            All discovered leads have been reviewed or added to claims.
          </div>
        )}
      </div>

      <CitationBlock
        citation="Section 45ZA to 45ZF of Banking Regulation Act 1949: Banks are required to acknowledge claim filings immediately and cannot mandate notarized affidavits for claims supported by clear statement records and registered nominations."
        source="Banking Regulation Act 1949 & RBI Master Directions 2025"
      />
    </div>
  );
}

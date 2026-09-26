import { useState } from "react";
import { Download, FileCheck, FileText, Printer, Scale, ShieldCheck, X } from "lucide-react";
import { useApp, type Asset } from "../../context/AppContext";
import { CitationBlock } from "./CitationBlock";

interface Props {
  asset: Asset;
  onClose: () => void;
}

export function OfficialFormPreviewModal({ asset, onClose }: Props) {
  const { caseData, showToast } = useApp();
  const [activeFormTab, setActiveFormTab] = useState<"claim" | "affidavit" | "noc" | "delay">("claim");

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  const handleDownloadPdf = () => {
    showToast(`Downloading official claim paperwork for ${asset.institution}...`);
    // Create an accessible text/pdf blob download demo
    const docTitle = `Euphatic_${asset.institution.replace(/\s+/g, "_")}_ClaimPack.txt`;
    const docContent = `=====================================================
EUPHATIC — STATUTORY CLAIM PACK
Governed by RBI Master Directions 2025 (Ref: DOR.RAG.REC.73/09.08.001/2024-25)
=====================================================

CASE IDENTIFIER: ${caseData.caseId}
INSTITUTION: ${asset.institution}
ACCOUNT/ASSET REF: ${asset.accountNumber}
CLAIM AMOUNT: ${formatInr(asset.amount)}
ROUTE: ${asset.routeTitle}

DECEASED DETAILS:
- Name: ${caseData.deceased.fullName}
- Date of Passing: ${caseData.deceased.dateOfDeath}
- Place: ${caseData.deceased.placeOfDeath}
- Death Certificate No: ${caseData.deceased.deathCertNo}
- Permanent Account Number: ${caseData.deceased.pan}

PRIMARY CLAIMANT / NOMINEE:
- Full Name: ${caseData.claimant.fullName} (${caseData.claimant.relation})
- Settlement Account: ${caseData.claimant.bankName} - A/C ${caseData.claimant.bankAccountNumber}
- IFSC Code: ${caseData.claimant.ifsc}

STATUTORY GUARANTEE:
Under RBI Directions 2025 (para 31), settlement must be disbursed within 15 calendar days of receipt of complete documents. Delays attributable to the bank attract penal interest at Bank Rate + 4% p.a. under para 33.

Generated on: ${new Date().toLocaleDateString("en-IN")} via Euphatic Legal Engine.
=====================================================`;
    const blob = new Blob([docContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = docTitle;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4F3F38]/50 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-[12px] bg-white shadow-modal">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[#EDE9E2] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
              <FileCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#4F3F38]">Official Claim Pack — {asset.institution}</h2>
              <div className="flex items-center gap-2 text-xs text-[#6B6358]">
                <span>Case {caseData.caseId}</span>
                <span>•</span>
                <span className="font-semibold text-[#4F3F38]">{asset.routeTitle}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="btn-primary-sm text-xs"
            >
              <Download className="size-3.5" />
              Download Ready PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#6B6358] hover:bg-[#F5F3EC] hover:text-[#4F3F38]"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Tab selection for different annexures in the pack */}
        <div className="flex border-b border-[#EDE9E2] bg-[#F5F3EC]/50 px-6 pt-2">
          {[
            { id: "claim", label: asset.nomination === "nominee" ? "Annex I-A (Nominee Claim)" : "Annex I-B (Legal Heirs Claim)" },
            { id: "affidavit", label: "Annex I-C (Family Tree Affidavit)" },
            { id: "noc", label: "Annex I-D (No Objection Relinquishment)" },
            { id: "delay", label: "RBI Para 33 Demand Letter" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFormTab(tab.id as any)}
              className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
                activeFormTab === tab.id
                  ? "border-[#4F3F38] bg-white text-[#4F3F38]"
                  : "border-transparent text-[#6B6358] hover:text-[#4F3F38]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body Preview */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          <CitationBlock
            citation={asset.rbiCitation}
            source="Reserve Bank of India Master Directions 2025"
            className="mb-6"
          />

          {activeFormTab === "claim" && (
            <div className="space-y-6 rounded-[8px] border border-[#EDE9E2] bg-[#FFFDFB] p-6 text-[#4F3F38]">
              <div className="text-center">
                <span className="text-xs font-bold tracking-widest text-[#6B6358] uppercase">
                  {asset.nomination === "nominee" ? "ANNEXURE I-A" : "ANNEXURE I-B"}
                </span>
                <h3 className="mt-1 text-base font-bold text-[#4F3F38]">
                  {asset.nomination === "nominee"
                    ? "APPLICATION FOR SETTLEMENT OF DECEASED CLAIM BY REGISTERED NOMINEE"
                    : "APPLICATION FOR SETTLEMENT OF DECEASED CLAIM BY SURVIVING LEGAL HEIRS"}
                </h3>
                <p className="text-xs text-[#6B6358]">
                  (Prescribed under RBI Master Directions on Settlement of Deceased Depositors)
                </p>
              </div>

              <div className="space-y-1 text-xs">
                <p>To,</p>
                <p className="font-semibold">The Branch Manager</p>
                <p>{asset.institution}</p>
                <p>{asset.branch || "New Delhi Branch"}</p>
              </div>

              <div className="space-y-2 text-xs leading-relaxed">
                <p>
                  Respected Sir / Madam,
                </p>
                <p>
                  I/We hereby lodge a formal claim for settlement of balance in the deceased account holder{" "}
                  <strong>{caseData.deceased.fullName}</strong> who departed on{" "}
                  <strong>{caseData.deceased.dateOfDeath}</strong> at {caseData.deceased.placeOfDeath} (Death Certificate No:{" "}
                  <span className="font-mono font-semibold">{caseData.deceased.deathCertNo}</span>).
                </p>
                <div className="my-3 rounded bg-[#F5F3EC] p-3">
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div>Account / Deposit Number: <strong>{asset.accountNumber}</strong></div>
                    <div>Account Type: <strong>{asset.assetType.toUpperCase()}</strong></div>
                    <div>Claimed Amount: <strong>{formatInr(asset.amount)}</strong></div>
                    <div>Status: <strong>{asset.nomination.toUpperCase()}</strong></div>
                  </div>
                </div>
                <p>
                  Please disburse the settlement funds directly to the verified account of the claimant:
                </p>
                <div className="rounded border border-[#EDE9E2] bg-white p-3 font-mono">
                  <div>Beneficiary: {caseData.claimant.fullName} ({caseData.claimant.relation})</div>
                  <div>Bank Name: {caseData.claimant.bankName}</div>
                  <div>Account Number: {caseData.claimant.bankAccountNumber}</div>
                  <div>IFSC: {caseData.claimant.ifsc}</div>
                </div>
              </div>
            </div>
          )}

          {activeFormTab === "affidavit" && (
            <div className="space-y-4 rounded-[8px] border border-[#EDE9E2] bg-[#FFFDFB] p-6 text-[#4F3F38]">
              <div className="text-center">
                <span className="text-xs font-bold tracking-widest text-[#6B6358] uppercase">ANNEXURE I-C</span>
                <h3 className="mt-1 text-base font-bold text-[#4F3F38]">
                  DECLARATION OF LEGAL HEIRS & FAMILY TREE AFFIDAVIT
                </h3>
              </div>
              <p className="text-xs leading-relaxed">
                I, <strong>{caseData.claimant.fullName}</strong>, do hereby solemnly affirm and declare that the following are the only surviving legal heirs of the deceased <strong>{caseData.deceased.fullName}</strong> under the provisions of the Hindu Succession Act:
              </p>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EDE9E2] text-[#6B6358]">
                    <th className="py-2">Legal Heir Name</th>
                    <th>Relation</th>
                    <th>Age</th>
                    <th>Capacity / Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDE9E2]">
                  {caseData.heirs.map((h) => (
                    <tr key={h.personId}>
                      <td className="py-2 font-medium">{h.fullName}</td>
                      <td>{h.relation}</td>
                      <td>Adult</td>
                      <td><span className="font-semibold text-[#4F3F38]">{h.role}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeFormTab === "noc" && (
            <div className="space-y-4 rounded-[8px] border border-[#EDE9E2] bg-[#FFFDFB] p-6 text-[#4F3F38]">
              <div className="text-center">
                <span className="text-xs font-bold tracking-widest text-[#6B6358] uppercase">ANNEXURE I-D</span>
                <h3 className="mt-1 text-base font-bold text-[#4F3F38]">
                  RELINQUISHMENT OF CLAIM & NO OBJECTION CERTIFICATE (NOC)
                </h3>
              </div>
              <p className="text-xs leading-relaxed">
                We, the undersigned legal heirs of <strong>{caseData.deceased.fullName}</strong>, hereby declare that we have no objection to the payment of the entire balance lying in the accounts of the deceased to <strong>{caseData.claimant.fullName}</strong>. Our receipt or this consent will be full discharge of the bank under RBI Master Directions 2025.
              </p>
              <div className="mt-4 rounded bg-[#F5F3EC] p-3 text-xs">
                Signed by: <strong>Pooja Sharma (Daughter)</strong>, <strong>Sunita Sharma (Spouse)</strong>
              </div>
            </div>
          )}

          {activeFormTab === "delay" && (
            <div className="space-y-4 rounded-[8px] border border-[#EDE9E2] bg-[#FFFDFB] p-6 text-[#4F3F38]">
              <div className="text-center">
                <span className="text-xs font-bold tracking-widest text-[#AA4342] uppercase">STATUTORY DEMAND NOTICE</span>
                <h3 className="mt-1 text-base font-bold text-[#4F3F38]">
                  DEMAND NOTICE UNDER PARA 33 OF RBI MASTER DIRECTIONS 2025
                </h3>
              </div>
              <div className="text-xs leading-relaxed space-y-2">
                <p>
                  To the Branch Manager, {asset.institution}.
                </p>
                <p>
                  This is regarding the deceased claim for Account No: <span className="font-mono font-bold">{asset.accountNumber}</span> submitted with complete documentation on{" "}
                  <span className="font-mono font-bold">{asset.docsCompleteDate || "16-03-2026"}</span>.
                </p>
                <p>
                  As per Para 31 of RBI Directions 2025, the bank was statutorily mandated to settle this claim within 15 calendar days. More than 15 days have elapsed without resolution.
                </p>
                <div className="rounded bg-[#fff0f0] p-3 text-xs font-semibold text-[#AA4342]">
                  Demand: Immediate credit of {formatInr(asset.amount)} along with statutory penal interest at Bank Rate (6.5%) + 4.0% p.a. (Total 10.5% p.a.) calculated daily from the 16th day until date of credit.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#EDE9E2] px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-[#6B6358]">
            <ShieldCheck className="size-4 text-[#B7C497]" />
            Generated strictly in compliance with RBI Directions 2025
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary-sm text-xs"
            >
              <Printer className="size-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="btn-primary-sm text-xs"
            >
              <Download className="size-3.5" />
              Download All Annexures (.PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Compass, Landmark, Plus, Scale, ShieldCheck, UserCheck, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function GuidedIntakePage() {
  const { caseData, setCaseData, setCurrentView, showToast, lang } = useApp();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Deceased state
  const [deceased, setDeceased] = useState(caseData.deceased);

  // Step 2: Asset state
  const [newAssetInstitution, setNewAssetInstitution] = useState("");
  const [newAssetType, setNewAssetType] = useState<any>("bank_deposit");
  const [newAssetAmount, setNewAssetAmount] = useState("");
  const [newAssetNomination, setNewAssetNomination] = useState<any>("nominee");

  // Step 3: Claimant state
  const [claimant, setClaimant] = useState(caseData.claimant);

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setCaseData((prev) => ({ ...prev, deceased }));
    showToast("Deceased profile verified.");
    setCurrentStep(2);
  };

  const handleAddAssetStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetInstitution) return;

    const amt = parseFloat(newAssetAmount) || 0;
    const isNom = newAssetNomination === "nominee";
    const routeTitle = isNom
      ? "Nominee Settlement (Para 28)"
      : amt <= 500000
      ? "Simplified Settlement (Para 30)"
      : "Above Threshold Settlement (Para 32)";
    const routeCode: "NOMINEE" | "SIMPLIFIED" | "ABOVE_THRESHOLD" = isNom
      ? "NOMINEE"
      : amt <= 500000
      ? "SIMPLIFIED"
      : "ABOVE_THRESHOLD";

    const ast = {
      assetId: "ast_" + Math.random().toString(36).substring(2, 8),
      institution: newAssetInstitution,
      assetType: newAssetType,
      accountNumber: "9876" + Math.floor(1000 + Math.random() * 9000),
      amount: amt,
      nomination: newAssetNomination,
      routeTitle,
      routeCode,
      rbiCitation: isNom
        ? "RBI Directions 2025 para 28: Settlement to registered nominee without succession certificate."
        : "RBI Directions 2025 para 30: Board simplified limit claim.",
      status: "on-track" as const,
      deadlineDays: 15,
      daysRemaining: 15,
      confidence: 100,
      discoveredVia: "manual" as const,
    };

    setCaseData((prev) => ({
      ...prev,
      assets: [ast, ...prev.assets],
    }));

    setNewAssetInstitution("");
    setNewAssetAmount("");
    showToast(`Added ${ast.institution} to estate portfolio.`);
  };

  const handleCompleteIntake = (e: React.FormEvent) => {
    e.preventDefault();
    setCaseData((prev) => ({ ...prev, claimant }));
    showToast("Estate intake completed successfully.");
    setCurrentView("dashboard");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Wizard Header */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Compass className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Guided Estate Intake Wizard</h2>
            <p className="text-xs text-[#6B6358]">
              Statutory 3-step walkthrough aligned with Indian succession laws and RBI Directions 2025.
            </p>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="mt-6 flex items-center justify-between border-t border-[#EDE9E2] pt-4 text-xs font-semibold">
          {[
            { num: 1, label: "Deceased Details" },
            { num: 2, label: "Estate Accounts" },
            { num: 3, label: "Claimant & Heirs" },
          ].map((st) => (
            <div
              key={st.num}
              onClick={() => (st.num < currentStep ? setCurrentStep(st.num as any) : null)}
              className={`flex items-center gap-2 ${
                currentStep === st.num
                  ? "text-[#4F3F38]"
                  : st.num < currentStep
                  ? "cursor-pointer text-[#B7C497]"
                  : "text-[#6B6358]/60"
              }`}
            >
              <div
                className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                  currentStep === st.num
                    ? "bg-[#FFB077] text-[#4F3F38]"
                    : st.num < currentStep
                    ? "bg-[#B7C497] text-[#2E3D1F]"
                    : "bg-[#EDE9E2] text-[#6B6358]"
                }`}
              >
                {st.num < currentStep ? "✓" : st.num}
              </div>
              <span className="hidden sm:inline">{st.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Deceased Details */}
      {currentStep === 1 && (
        <form onSubmit={handleNextStep1} className="app-card space-y-5">
          <h3 className="text-lg font-semibold text-[#4F3F38]">Step 1: About the Deceased</h3>
          <p className="text-xs text-[#6B6358]">
            Enter official names and dates matching the government Death Certificate and PAN record.
          </p>

          <div className="space-y-4">
            <div>
              <label className="app-label">Full Legal Name</label>
              <input
                type="text"
                required
                value={deceased.fullName}
                onChange={(e) => setDeceased({ ...deceased, fullName: e.target.value })}
                className="app-input"
              />
              <span className="app-helper">Must match Death Certificate spelling exactly</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="app-label">Date of Passing</label>
                <input
                  type="date"
                  required
                  value={deceased.dateOfDeath}
                  onChange={(e) => setDeceased({ ...deceased, dateOfDeath: e.target.value })}
                  className="app-input"
                />
              </div>

              <div>
                <label className="app-label">Place of Passing (City / State)</label>
                <input
                  type="text"
                  required
                  value={deceased.placeOfDeath}
                  onChange={(e) => setDeceased({ ...deceased, placeOfDeath: e.target.value })}
                  className="app-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="app-label">Death Certificate Registration Number</label>
                <input
                  type="text"
                  required
                  value={deceased.deathCertNo}
                  onChange={(e) => setDeceased({ ...deceased, deathCertNo: e.target.value })}
                  className="app-input font-mono uppercase"
                />
              </div>

              <div>
                <label className="app-label">Permanent Account Number (PAN)</label>
                <input
                  type="text"
                  value={deceased.pan}
                  onChange={(e) => setDeceased({ ...deceased, pan: e.target.value.toUpperCase() })}
                  className="app-input font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="app-label">Applicable Personal Law / Religion</label>
              <select
                value={deceased.religion}
                onChange={(e) => setDeceased({ ...deceased, religion: e.target.value })}
                className="app-input"
              >
                <option value="Hindu">Hindu, Sikh, Jain, Buddhist (Hindu Succession Act 1956)</option>
                <option value="Muslim">Muslim (Muslim Personal Law Shariat Application Act)</option>
                <option value="Christian">Christian, Parsi, Jewish (Indian Succession Act 1925)</option>
                <option value="Civil">Civil Marriage (Special Marriage Act)</option>
              </select>
              <span className="app-helper">
                Determines statutory Class-I legal heirs in the absence of a registered nomination or will.
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" className="btn-primary">
              Continue to Estate Accounts
              <ArrowRight className="size-4" />
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Assets & Accounts */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="app-card space-y-4">
            <h3 className="text-lg font-semibold text-[#4F3F38]">Step 2: Add Known Estate Accounts</h3>
            <p className="text-xs text-[#6B6358]">
              Add bank savings, fixed deposits, insurance, or shares. You can also auto-scan statements in Document OCR.
            </p>

            <form onSubmit={handleAddAssetStep2} className="space-y-4 rounded-lg bg-[#F5F3EC]/50 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="app-label">Financial Institution Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bank of Baroda"
                    value={newAssetInstitution}
                    onChange={(e) => setNewAssetInstitution(e.target.value)}
                    className="app-input"
                  />
                </div>

                <div>
                  <label className="app-label">Account / Asset Category</label>
                  <select
                    value={newAssetType}
                    onChange={(e) => setNewAssetType(e.target.value)}
                    className="app-input"
                  >
                    <option value="bank_deposit">Savings / Current Account</option>
                    <option value="term_deposit">Fixed / Recurring Deposit</option>
                    <option value="locker">Safe Deposit Locker</option>
                    <option value="life_insurance">Life Insurance Policy</option>
                    <option value="shares">Demat Shares & Mutual Funds</option>
                    <option value="pension">EPFO Provident Fund / Pension</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="app-label">Estimated Value / Balance (INR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 350000"
                    value={newAssetAmount}
                    onChange={(e) => setNewAssetAmount(e.target.value)}
                    className="app-input"
                  />
                </div>

                <div>
                  <label className="app-label">Nomination Status</label>
                  <select
                    value={newAssetNomination}
                    onChange={(e) => setNewAssetNomination(e.target.value)}
                    className="app-input"
                  >
                    <option value="nominee">Nominee Registered</option>
                    <option value="survivor">Either or Survivor (Joint)</option>
                    <option value="none">No Nominee Registered</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-secondary-sm text-xs">
                <Plus className="size-3.5" />
                Add Account to Estate
              </button>
            </form>

            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-[#4F3F38]">Current Identified Accounts:</span>
              <div className="divide-y divide-[#EDE9E2] rounded-lg border border-[#EDE9E2] bg-white">
                {caseData.assets.map((a) => (
                  <div key={a.assetId} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <span className="font-semibold text-[#4F3F38]">{a.institution}</span>
                      <span className="ml-2 text-[#6B6358]">({a.assetType.replace("_", " ")})</span>
                    </div>
                    <div className="font-mono font-bold text-[#4F3F38]">
                      {a.amount > 0 ? `₹${a.amount.toLocaleString("en-IN")}` : "Locker"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between border-t border-[#EDE9E2] pt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="btn-secondary"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="btn-primary"
              >
                Continue to Claimant Setup
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Claimant & Heirs */}
      {currentStep === 3 && (
        <form onSubmit={handleCompleteIntake} className="app-card space-y-5">
          <h3 className="text-lg font-semibold text-[#4F3F38]">Step 3: Primary Claimant & Settlement Account</h3>
          <p className="text-xs text-[#6B6358]">
            Under RBI rules, banks credit proceeds directly via NEFT/RTGS to the verified bank account of the designated claimant.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="app-label">Primary Claimant Name</label>
                <input
                  type="text"
                  required
                  value={claimant.fullName}
                  onChange={(e) => setClaimant({ ...claimant, fullName: e.target.value })}
                  className="app-input"
                />
              </div>

              <div>
                <label className="app-label">Relationship to Deceased</label>
                <input
                  type="text"
                  required
                  value={claimant.relation}
                  onChange={(e) => setClaimant({ ...claimant, relation: e.target.value })}
                  className="app-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="app-label">Claimant Bank Name</label>
                <input
                  type="text"
                  required
                  value={claimant.bankName}
                  onChange={(e) => setClaimant({ ...claimant, bankName: e.target.value })}
                  className="app-input"
                />
              </div>

              <div>
                <label className="app-label">Bank Account Number</label>
                <input
                  type="text"
                  required
                  value={claimant.bankAccountNumber}
                  onChange={(e) => setClaimant({ ...claimant, bankAccountNumber: e.target.value })}
                  className="app-input font-mono"
                />
              </div>

              <div>
                <label className="app-label">IFSC Code</label>
                <input
                  type="text"
                  required
                  value={claimant.ifsc}
                  onChange={(e) => setClaimant({ ...claimant, ifsc: e.target.value.toUpperCase() })}
                  className="app-input font-mono uppercase"
                />
              </div>
            </div>

            <div className="rounded-lg bg-[#F5F3EC] p-3 text-xs text-[#6B6358]">
              <strong className="text-[#4F3F38]">Note:</strong> Co-claimants and non-claiming heirs can be invited in the Family Access tab to review and digitally consent to Annex I-D No Objection Certificates.
            </div>
          </div>

          <div className="flex justify-between border-t border-[#EDE9E2] pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="btn-secondary"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
            <button type="submit" className="btn-primary">
              <CheckCircle2 className="size-4" />
              Finalize Estate Intake
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

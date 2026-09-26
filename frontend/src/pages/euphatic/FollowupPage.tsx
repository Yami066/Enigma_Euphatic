import { useState } from "react";
import { AlertCircle, Calculator, Clock, FileDown, Flame, Scale, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function FollowupPage() {
  const { caseData, setActiveClaimPackModal, showToast } = useApp();

  // Interactive Penal Interest Calculator state
  const [calcAmount, setCalcAmount] = useState<number>(320000);
  const [calcDaysDelayed, setCalcDaysDelayed] = useState<number>(19);
  const [bankRate, setBankRate] = useState<number>(6.5);
  const penalSpread = 4.0; // RBI para 33 spread: +4%
  const effectiveRate = bankRate + penalSpread; // e.g. 10.5%

  const dailyInterest = (calcAmount * (effectiveRate / 100)) / 365;
  const accruedPenalInterest = Math.round(dailyInterest * calcDaysDelayed);

  const formatInr = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Clock className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Statutory Follow-Up & Penal Interest</h2>
            <p className="text-xs text-[#6B6358]">
              Real-time monitoring of the mandatory 15-day settlement window under RBI Directions 2025. If banks delay, penal interest at Bank Rate + 4% p.a. accrues automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Penal Interest Calculator */}
      <div className="app-card space-y-6">
        <div className="flex items-center justify-between border-b border-[#EDE9E2] pb-4">
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-[#FFB077]" />
            <h3 className="text-lg font-bold text-[#4F3F38]">
              RBI Para 33 Statutory Delay Penalty Calculator
            </h3>
          </div>
          <span className="rounded-full bg-[#B7C497]/30 px-3 py-1 font-mono text-xs font-bold text-[#2E3D1F]">
            Bank Rate + 4.0% p.a. ({effectiveRate}% p.a.)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <label className="app-label">Claim Principal Amount (INR)</label>
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(parseFloat(e.target.value) || 0)}
              className="app-input font-mono font-semibold"
            />
            <span className="app-helper">Total funds due in the deceased account</span>
          </div>

          <div>
            <label className="app-label">Days Delayed Beyond 15-Day Limit</label>
            <input
              type="number"
              value={calcDaysDelayed}
              onChange={(e) => setCalcDaysDelayed(parseInt(e.target.value, 10) || 0)}
              className="app-input font-mono font-semibold text-[#AA4342]"
            />
            <span className="app-helper">Days elapsed starting from Day 16</span>
          </div>

          <div>
            <label className="app-label">Current RBI Bank Rate (%)</label>
            <input
              type="number"
              step="0.25"
              value={bankRate}
              onChange={(e) => setBankRate(parseFloat(e.target.value) || 6.5)}
              className="app-input font-mono"
            />
            <span className="app-helper">Current policy rate: 6.50%</span>
          </div>
        </div>

        {/* Calculation Result Callout */}
        <div className="flex flex-col justify-between gap-4 rounded-[10px] bg-[#F5F3EC] p-5 sm:flex-row sm:items-center">
          <div>
            <span className="text-xs font-semibold text-[#6B6358] uppercase tracking-wider">
              Statutory Compensation Payable by Bank:
            </span>
            <div className="text-3xl font-bold text-[#AA4342]">
              {formatInr(accruedPenalInterest)}
            </div>
            <span className="text-xs text-[#6B6358]">
              Accumulating at {formatInr(dailyInterest)} per day of continued delay.
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const overdueAst = caseData.assets.find((a) => a.status === "overdue") || caseData.assets[0];
              setActiveClaimPackModal(overdueAst);
            }}
            className="btn-destructive text-xs"
          >
            <ShieldAlert className="size-4" />
            Generate Statutory Demand Notice
          </button>
        </div>
      </div>

      {/* Escalation & Ombudsman Protocol */}
      <div className="app-card space-y-4">
        <h3 className="text-lg font-bold text-[#4F3F38]">Escalation to Banking Ombudsman (RBI-IOS)</h3>
        <p className="text-xs text-[#6B6358]">
          If the bank does not resolve the claim within 30 days of receiving your formal complaint, you are entitled to file a complaint with the Reserve Bank - Integrated Ombudsman Scheme.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[#EDE9E2] bg-[#FFFDFB] p-4 text-xs">
            <span className="font-semibold text-[#4F3F38]">Step 1: Branch Demand Letter</span>
            <p className="mt-1 text-[#6B6358]">
              Issue the formal notice under Para 33 citing exact calculated interest.
            </p>
          </div>
          <div className="rounded-lg border border-[#EDE9E2] bg-[#FFFDFB] p-4 text-xs">
            <span className="font-semibold text-[#4F3F38]">Step 2: RBI CMS Escalation</span>
            <p className="mt-1 text-[#6B6358]">
              Upload the pre-drafted complaint to cms.rbi.org.in for automated regulatory intervention.
            </p>
          </div>
        </div>
      </div>

      <CitationBlock
        citation="Clause 10 of RBI Integrated Ombudsman Scheme 2021: Non-adherence to the RBI directives on deceased depositor accounts and refusal to pay penal interest constitutes a valid ground for awarding compensation up to ₹20 Lakhs plus harassment damages."
        source="Reserve Bank - Integrated Ombudsman Scheme 2021 Clause 10"
      />
    </div>
  );
}

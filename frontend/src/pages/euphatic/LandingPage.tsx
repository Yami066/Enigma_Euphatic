import { ArrowRight, CheckCircle2, Clock, FileCheck, FileSearch, HelpCircle, Lock, Mail, Scale, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function LandingPage() {
  const {
    setCurrentView,
    setAuthModalOpen,
    setAssistantOpen,
    lang,
    setLang,
    currentUser,
    logoutUser,
    loadMockData,
    startFreshCase,
  } = useApp();

  return (
    <div className="-mx-4 -my-6 space-y-16 md:-mx-8 md:-my-7">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[#EDE9E2] bg-gradient-to-b from-[#F5F3EC]/80 to-[#FFFDFB] px-6 py-16 sm:px-12 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          {/* Compliance Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ACA986]/40 bg-[#FFFDFB] px-4 py-1.5 shadow-sm">
            <ShieldCheck className="size-4 text-[#B7C497]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#4F3F38]">
              Compliant with RBI Directions 2025
            </span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-[#4F3F38] sm:text-5xl md:leading-[1.15]">
            {lang === "hi"
              ? "अपनों के जाने के बाद, उनकी संपत्ति पर आपका कानूनी अधिकार बिना किसी झिझक के।"
              : "Claim what they left behind with authoritative legal precision."}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-[#6B6358] sm:text-lg">
            {lang === "hi"
              ? "बैंक खाते, सावधि जमा, बीमा, पीएफ और शेयर। 15-दिवसीय वैधानिक समय-सीमा और भारतीय रिज़र्व बैंक के नियमों के तहत संरचित दावा समाधान।"
              : "Bank accounts, fixed deposits, life insurance, EPF, and Demat shares. Fully mapped to the 15-day statutory settlement mandate under RBI Master Directions 2025."}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setCurrentView("dashboard")}
              className="btn-primary"
            >
              Enter Active Workspace
              <ArrowRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentView("intake")}
              className="btn-secondary"
            >
              Start New Estate Intake
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-[#6B6358]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-[#B7C497]" />
              No Succession Certificate Required for Nominees
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-[#B7C497]" />
              Bank Rate + 4% Statutory Delay Penalty
            </span>
          </div>
        </div>
      </section>

      {/* Account Access & Workspace Options Section */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Card 1: User Account */}
          <div className="app-card relative flex flex-col justify-between border-t-4 border-t-[#4F3F38] bg-white shadow-soft">
            <div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#F5F3EC] px-3 py-1 text-xs font-semibold text-[#4F3F38]">
                <ShieldCheck className="size-3.5 text-[#B7C497]" />
                Private Legal Vault
              </div>
              <h3 className="text-xl font-bold text-[#4F3F38]">
                {currentUser ? `Welcome Back, ${currentUser}` : "Sign In or Register"}
              </h3>
              <p className="mt-2 text-sm text-[#6B6358] leading-relaxed">
                {currentUser
                  ? "Your estate workspace is currently active. All your nominees, bank accounts, and statutory claim packs are saved under your private account."
                  : "Create an account or log in to securely save your family's deceased records, Class-I legal heirs, and 15-day bank claim timelines in your private vault."}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentView("dashboard")}
                    className="btn-primary flex-1 text-xs"
                  >
                    Open My Workspace
                    <ArrowRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      startFreshCase();
                      setCurrentView("intake");
                    }}
                    className="btn-secondary text-xs"
                  >
                    Start Clean Intake
                  </button>
                  <button
                    type="button"
                    onClick={logoutUser}
                    className="rounded-[8px] border border-[#EDE9E2] px-3 py-2 text-xs font-semibold text-[#6B6358] hover:bg-[#F5F3EC] transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="btn-primary flex-1 text-xs"
                  >
                    <Lock className="size-3.5" />
                    Sign In / Create Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      startFreshCase();
                      setCurrentView("intake");
                    }}
                    className="btn-secondary text-xs"
                  >
                    Start Clean Intake
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Card 2: Interactive Mock Data Demo */}
          <div className="app-card relative flex flex-col justify-between border-t-4 border-t-[#FFB077] bg-gradient-to-br from-[#FFFDFB] to-[#F5F3EC]/50 shadow-soft">
            <div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#FFB077]/15 px-3 py-1 text-xs font-semibold text-[#4F3F38]">
                <Sparkles className="size-3.5 text-[#FFB077]" />
                Explore Without Sign Up
              </div>
              <h3 className="text-xl font-bold text-[#4F3F38]">
                Explore with Sample Mock Data
              </h3>
              <p className="mt-2 text-sm text-[#6B6358] leading-relaxed">
                Test the platform immediately with a pre-configured sample estate:
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-[#6B6358]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-[#B7C497] shrink-0" />
                  <span><strong>Late Rameshwar Prasad Sharma</strong> (Delhi, Hindu Law)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-[#B7C497] shrink-0" />
                  <span><strong>₹24.15 Lakhs Total</strong>: SBI FD, HDFC Savings, Groww Demat</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-[#B7C497] shrink-0" />
                  <span>Active 15-day claim clocks & generated Annexure I-A/B/C/D packs</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  loadMockData();
                  setCurrentView("dashboard");
                }}
                className="btn-primary flex-1 text-xs"
              >
                Load Sample Mock Data & Open Workspace
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Statutory Pillar Highlights */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="app-card border-l-4 border-l-[#FFB077]">
            <div className="mb-4 flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
              <FileSearch className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">Automated Asset Discovery</h3>
            <p className="mt-2 text-sm text-[#6B6358]">
              Bank statement narration parsing, Gmail financial scan, and direct UDGAM portal search to uncover dormant deposits and unknown policies.
            </p>
          </div>

          <div className="app-card border-l-4 border-l-[#B7C497]">
            <div className="mb-4 flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#B7C497]">
              <Scale className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">Statutory Legal Routing</h3>
            <p className="mt-2 text-sm text-[#6B6358]">
              Classifies each asset under precise RBI routes: Registered Nominee, Simplified Board Threshold (up to ₹5L), or Above Threshold Indemnity.
            </p>
          </div>

          <div className="app-card border-l-4 border-l-[#ACA986]">
            <div className="mb-4 flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#ACA986]">
              <Clock className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-[#4F3F38]">15-Day Statutory Clock</h3>
            <p className="mt-2 text-sm text-[#6B6358]">
              Automatic countdown once paperwork is submitted. Generates RBI Para 33 demand letters and Ombudsman escalation drafts if banks delay.
            </p>
          </div>
        </div>
      </section>

      {/* Legal Reference Callout */}
      <section className="mx-auto max-w-4xl px-6">
        <CitationBlock
          citation="Under Reserve Bank of India Master Directions 2025 (DOR.RAG.REC.73/09.08.001/2024-25) Para 31: Banks shall settle claims in respect of deceased depositors within 15 calendar days from receipt of all requisite documents. Where delay is attributable to the bank, interest at Bank Rate plus 4% p.a. is payable without requiring any application from the claimant."
          source="Reserve Bank of India Master Direction on Deceased Depositors 2025"
        />
      </section>

      {/* Feature Showcase Grid */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="rounded-[12px] bg-[#F5F3EC] p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold text-[#4F3F38] sm:text-3xl">
            Everything your family needs in one calm, secure space.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#6B6358]">
            Ready to generate Annex I-A, Annex I-B, Annex I-C affidavits, and Annex I-D No Objection Certificates in minutes.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setCurrentView("dashboard")}
              className="btn-primary"
            >
              Open Case Dashboard
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="btn-secondary"
            >
              Consult Legal AI
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

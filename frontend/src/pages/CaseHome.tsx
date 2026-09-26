import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BellRing, Check, ChevronDown, CircleDot, ListChecks } from "lucide-react";
import { useCase } from "../lib/case";
import { rupees } from "../lib/api";
import { Button, Card } from "../components/ui";
import { nextSetupStep, STEPS, stepDone } from "./SetupPage";

export default function CaseHome() {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { view } = useCase();
  const tot = view.totals;
  const next = nextSetupStep(view);
  const doneCount = STEPS.filter((step) => stepDone(view, step.id)).length;
  const nextStep = STEPS.find((step) => step.id === next);
  const actions = view.nextActions ?? [];
  const urgentIndex = actions.findIndex((action: any) => action.kind === "answer");
  const primary =
    urgentIndex >= 0
      ? actions[urgentIndex]
      : next
        ? {
            kind: "setup",
            text: `Continue with ${nextStep?.en}.`,
            textHi: `${nextStep?.hi} की जानकारी पूरी करें।`,
          }
        : actions[0] ?? {
            kind: "claims",
            text: "Review your claims and follow-up dates.",
            textHi: "अपने दावों और अगली तारीखों की समीक्षा करें।",
          };
  const remainingActions = actions.filter((action: any, index: number) => {
    if (urgentIndex >= 0) return index !== urgentIndex;
    if (!next) return index !== 0;
    return !(next === "family" && action.kind === "people");
  });

  const go = (action: any) => {
    const target =
      action.kind === "setup"
        ? `setup/${next}`
        : action.kind === "claims"
          ? "claims"
          : action.kind === "leads" || action.kind === "find"
            ? "setup/discover"
            : action.kind === "people"
              ? "setup/family"
              : action.assetId
                ? `claims/${action.assetId}`
                : "claims";
    nav(target);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">{hi ? "आज" : "Today"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t("home.hello", "One step at a time.")}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          {hi ? `${view.case.deceasedName} के केस में अभी सबसे उपयोगी अगला काम।` : `The most useful next step for ${view.case.deceasedName}'s case.`}
        </p>
      </header>

      <Card tone={primary.kind === "answer" ? "amber" : "brand"} className="p-5 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              primary.kind === "answer" ? "bg-amber-100 text-amber-800" : "bg-brand-100 text-brand-800"
            }`}
          >
            {primary.kind === "answer" ? <BellRing className="size-5" /> : <ArrowRight className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{hi ? "अगला काम" : "Next step"}</p>
            <h2 className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{hi ? primary.textHi || primary.text : primary.text}</h2>
            <Button className="mt-4 w-full sm:w-auto" onClick={() => go(primary)}>
              {primary.kind === "answer" ? (hi ? "जवाब दें" : "Answer now") : hi ? "जारी रखें" : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <ListChecks className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{t("home.setup", "Getting everything ready")}</h2>
              <span className="shrink-0 text-sm font-semibold text-brand-800">{doneCount}/{STEPS.length}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{t("home.setupProgress", "{{done}} of {{total}} steps done", { done: doneCount, total: STEPS.length })}</p>
          </div>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-stone-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={STEPS.length}
          aria-valuenow={doneCount}
          aria-label={t("home.setup", "Getting everything ready")}
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
        </div>
        <details className="group border-t border-line pt-1">
          <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg py-2 text-sm font-medium text-brand-800 [&::-webkit-details-marker]:hidden">
            <span>{hi ? "सभी सेटअप कदम देखें" : "View all setup steps"}</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-1 grid gap-1 sm:grid-cols-2">
            {STEPS.map((step, index) => {
              const complete = stepDone(view, step.id);
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => nav(`setup/${step.id}`)}
                    className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-stone-50"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        complete
                          ? "bg-brand-600 text-white"
                          : step.id === next
                            ? "bg-brand-100 text-brand-800 ring-1 ring-brand-200"
                            : "bg-stone-100 text-soft"
                      }`}
                    >
                      {complete ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className={complete ? "text-muted" : "font-medium"}>{hi ? step.hi : step.en}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </details>
      </Card>

      <section aria-labelledby="case-status-heading">
        <h2 id="case-status-heading" className="mb-3 text-lg font-semibold">
          {hi ? "केस की स्थिति" : "Case status"}
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line lg:grid-cols-4">
          <StatusCell
            label={t("home.found", "Possible assets")}
            value={view.leads.length}
            sub={t("home.new", "{{n}} to review", { n: tot.leadsNew })}
            onClick={() => nav("find")}
          />
          <StatusCell
            label={t("home.claims", "Claims")}
            value={tot.assets}
            sub={t("home.running", "{{n}} with a clock running", { n: tot.claimsRunning })}
            onClick={() => nav("claims")}
          />
          <StatusCell label={t("home.received", "Received")} value={rupees(tot.received) || "₹0"} />
          <StatusCell
            label={t("home.comp", "Compensation due")}
            value={rupees(tot.compensation) || "₹0"}
            sub={t("home.compSub", "Bank Rate + 4% (para 33)")}
          />
        </div>
      </section>

      {remainingActions.length > 0 && (
        <section aria-labelledby="other-actions-heading">
          <h2 id="other-actions-heading" className="mb-3 text-lg font-semibold">
            {hi ? "इसके बाद" : "After that"}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {remainingActions.map((action: any, index: number) => (
              <button
                type="button"
                key={`${action.kind}-${action.assetId ?? index}`}
                onClick={() => go(action)}
                className="focus-ring flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-stone-50 sm:px-5"
              >
                {action.kind === "answer" ? (
                  <BellRing className="size-5 shrink-0 text-amber-700" />
                ) : (
                  <CircleDot className="size-5 shrink-0 text-brand-700" />
                )}
                <span className="min-w-0 flex-1 text-sm font-medium sm:text-[15px]">{hi ? action.textHi || action.text : action.text}</span>
                <ArrowRight className="size-4 shrink-0 text-soft" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
        <details className="group">
          <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden sm:px-5">
            <div>
              <h2 className="font-semibold">{hi ? "हाल की गतिविधि" : "Recent activity"}</h2>
              <p className="text-xs text-soft">
                {view.events.length > 0
                  ? hi
                    ? `${Math.min(view.events.length, 14)} हाल की घटनाएं`
                    : `${Math.min(view.events.length, 14)} recent events`
                  : hi
                    ? "अभी कोई गतिविधि नहीं"
                    : "No activity yet"}
              </p>
            </div>
            <ChevronDown className="size-5 text-soft transition-transform group-open:rotate-180" />
          </summary>
          {view.events.length > 0 && (
            <ol className="mx-4 mb-5 space-y-4 border-l-2 border-brand-100 pl-5 sm:mx-5">
              {view.events.slice(0, 14).map((event: any) => (
                <li key={event.at + event.text} className="relative">
                  <span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-brand-600 ring-4 ring-white" />
                  <p className="text-sm">{hi ? event.textHi || event.text : event.text}</p>
                  <p className="mt-0.5 text-xs text-soft">
                    {new Date(event.at).toLocaleString(hi ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </details>
      </section>

      <p className="px-1 text-xs leading-5 text-soft">
        {t("home.sub", "Here's where things stand for {{name}}. Every rule we apply shows the RBI paragraph it comes from.", {
          name: view.case.deceasedName,
        })}
      </p>
    </div>
  );
}

function StatusCell({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: string; onClick?: () => void }) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-soft">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-4 text-muted">{sub}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="focus-ring min-h-28 bg-white p-3 text-left hover:bg-stone-50 sm:p-4">
      {content}
    </button>
  ) : (
    <div className="min-h-28 bg-white p-3 sm:p-4">{content}</div>
  );
}

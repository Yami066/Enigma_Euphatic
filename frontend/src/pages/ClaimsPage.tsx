import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Plus, Scale } from "lucide-react";
import { rupees } from "../lib/api";
import { ASSET_TYPES, STATUS, useCase } from "../lib/case";
import { fmtDate } from "../lib/format";
import { Button, Card, Chip, Empty } from "../components/ui";
import { BANKISH, LIABILITIES } from "./SetupPage";

function docsProgress(a: any, uploaded: Set<string>) {
  const docs: any[] = a.route?.documents ?? [];
  const forms: string[] = a.route?.forms ?? [];
  const have = a.docsHave ?? {};
  const ready = docs.filter(
    (d) => have[d.id] || (d.form && forms.includes(d.form) && BANKISH.includes(a.assetType)) || (d.id === "death_certificate" && uploaded.has("death_certificate")),
  ).length;
  return { ready, total: docs.length };
}

export default function ClaimsPage() {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { view } = useCase();
  const assets = view.assets as any[];
  const uploaded = new Set((view.documents as any[]).map((d) => d.kind));
  const claims = assets.filter((a) => a.include !== false && !LIABILITIES.includes(a.assetType));
  const owed = assets.filter((a) => a.include !== false && LIABILITIES.includes(a.assetType));
  const skipped = assets.filter((a) => a.include === false);
  const total = claims.reduce((s, a) => s + Number(a.amount || 0), 0);

  const row = (a: any) => {
    const st = STATUS[a.status] ?? STATUS.draft;
    const p = docsProgress(a, uploaded);
    return (
      <li key={a.assetId}>
        <button onClick={() => nav(a.assetId)} className="focus-ring w-full rounded-2xl text-left">
          <Card className="flex items-center gap-3 transition hover:ring-brand-200">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{a.institution || (hi ? ASSET_TYPES[a.assetType]?.hi : ASSET_TYPES[a.assetType]?.en)}</p>
                <Chip tone={st.tone}>{hi ? st.hi : st.en}</Chip>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {hi ? ASSET_TYPES[a.assetType]?.hi : ASSET_TYPES[a.assetType]?.en}
                {a.amount ? ` · ${rupees(a.amount)}` : ""}
                {a.route?.title ? ` · ${hi ? a.route.title.hi : a.route.title.en}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                {p.total > 0 && (
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="h-1.5 w-16 rounded-full bg-stone-200">
                      <span className="block h-1.5 rounded-full bg-brand-600" style={{ width: `${(p.ready / p.total) * 100}%` }} />
                    </span>
                    {t("plan.docsReady", "{{n}} of {{total}} ready", { n: p.ready, total: p.total })}
                  </span>
                )}
                {a.clock?.dueDate && <span className="whitespace-nowrap text-brand-800">{t("claims.due", "Bank must settle by {{d}}", { d: fmtDate(a.clock.dueDate, hi) })}</span>}
                {a.submittedOn && !a.receivedOn && <span className="text-brand-800">{t("plan.submittedOn", "Submitted on {{d}}.", { d: fmtDate(a.submittedOn, hi) })}</span>}
                {a.receivedOn && <span className="text-green-800">✓ {t("plan.receivedShort", "Received")}</span>}
              </div>
            </div>
            <ChevronRight className="size-5 text-soft" />
          </Card>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("plan.title", "Your claim plan")}</h1>
          <p className="text-sm text-muted">{t("plan.sub", "One plan per asset: documents, forms filled on the official format, where to go, and a tracker.")}</p>
        </div>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => nav("../setup/investments")}>
          {t("plan.addMore", "Add something")}
        </Button>
      </div>
      {claims.length + owed.length === 0 ? (
        <Empty
          icon={<Scale className="size-8" />}
          title={t("claims.emptyTitle", "No claims yet")}
          text={t("plan.emptyText", "Add their bank accounts and investments, then choose what to claim.")}
          action={<Button onClick={() => nav("../setup")}>{t("plan.goSetup", "Continue setup")}</Button>}
        />
      ) : (
        <>
          {total > 0 && (
            <Card tone="brand" className="flex items-center justify-between">
              <p className="text-sm text-brand-900">{t("plan.total", "{{n}} claims, approx. value", { n: claims.length })}</p>
              <p className="text-xl font-semibold text-brand-900">{rupees(total)}</p>
            </Card>
          )}
          <ul className="space-y-2">{claims.map(row)}</ul>
          {owed.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">{t("choose.owed", "Things they owed (to inform, not pay from your pocket)")}</h2>
              <ul className="space-y-2">{owed.map(row)}</ul>
            </section>
          )}
          {skipped.length > 0 && (
            <details className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <summary className="cursor-pointer text-sm font-medium text-muted">{t("plan.skipped", "Not claiming ({{n}})", { n: skipped.length })}</summary>
              <ul className="mt-2 space-y-2">{skipped.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

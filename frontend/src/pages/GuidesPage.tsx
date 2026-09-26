import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, Clock, ExternalLink, IndianRupee, Landmark, MessageCircleQuestion } from "lucide-react";
import { useCase } from "../lib/case";
import { config } from "../lib/config";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";

let cached: any = null;
export async function loadGuides(): Promise<any> {
  if (cached) return cached;
  const r = await fetch(`${config.apiUrl}/guides`);
  if (!r.ok) throw new Error("Couldn't load the guides. Please try again.");
  cached = await r.json();
  return cached;
}

export function useGuides() {
  const [data, setData] = useState<any>(cached);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!cached) loadGuides().then(setData).catch(setError);
  }, []);
  return { data, error };
}

export const ORDER = ["death_certificate", "legal_heir_certificate", "succession_certificate", "probate", "stamp_paper", "notary", "indemnity_bond", "affidavit", "noc_heirs", "claimant_kyc", "bank_proof", "uan", "cml", "policy_document", "medical_records", "fir_postmortem"];

export default function GuidesPage() {
  const { guideId } = useParams();
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { data, error } = useGuides();
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner label={t("loading", "Loading…")} />;
  if (guideId && data.guides[guideId]) return <Guide id={guideId} g={data.guides[guideId]} />;
  const L = (x: any) => (hi ? x?.hi : x?.en);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("guides.title", "Missing a document?")}</h1>
        <p className="text-sm text-muted">{t("guides.sub", "Who issues each one, where to apply, what to bring, how long it takes and what it costs. With links to the official source.")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.filter((k) => data.guides[k]).map((k) => (
          <Link key={k} to={k} className="focus-ring rounded-2xl">
            <Card className="h-full space-y-1 transition hover:ring-brand-200">
              <p className="flex items-center gap-2 font-semibold">
                <BookOpen className="size-4 text-brand-700" /> {L(data.guides[k].title)}
              </p>
              <p className="line-clamp-2 text-sm text-muted">{L(data.guides[k].what)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Guide({ id, g }: { id: string; g: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { caseId, view } = useCase();
  const L = (x: any) => (hi ? x?.hi : x?.en);
  const state = view.case.deceasedState || t("guides.myState", "my state");
  const askAi = g.askAi ? L(g.askAi).replace("{state}", state) : null;
  return (
    <div className="space-y-5">
      <button className="focus-ring inline-flex items-center gap-1 text-sm font-medium text-brand-700" onClick={() => nav(`/cases/${caseId}/guides`)}>
        <ArrowLeft className="size-4" /> {t("guides.all", "All guides")}
      </button>
      <div>
        <h1 className="text-2xl font-semibold">{L(g.title)}</h1>
        <p className="mt-1 text-[15px] text-muted">{L(g.what)}</p>
      </div>
      <Card className="space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <Landmark className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>
            <span className="font-semibold">{t("guides.issuer", "Who issues it")}: </span>
            {L(g.issuer)}
          </span>
        </p>
        <p className="flex items-start gap-2 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>
            <span className="font-semibold">{t("guides.time", "How long")}: </span>
            {L(g.time)}
          </span>
        </p>
        <p className="flex items-start gap-2 text-sm">
          <IndianRupee className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>
            <span className="font-semibold">{t("guides.cost", "Cost")}: </span>
            {L(g.cost)}
          </span>
        </p>
      </Card>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("guides.steps", "Steps")}</h2>
        <ol className="space-y-2">
          {(g.steps || []).map((s: any, i: number) => (
            <li key={i} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{i + 1}</span>
              <span className="text-sm">{L(s)}</span>
            </li>
          ))}
        </ol>
      </section>
      {askAi && (
        <Card tone="brand" className="space-y-2">
          <p className="text-sm">{t("guides.askText", "Rates differ by state and change over time. Ask the assistant; it searches official sources and shows them.")}</p>
          <Button variant="secondary" icon={<MessageCircleQuestion className="size-4" />} onClick={() => nav(`/cases/${caseId}/ask?mode=web&q=${encodeURIComponent(askAi)}`)}>
            {askAi}
          </Button>
        </Card>
      )}
      {g.links?.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">{t("guides.sources", "Official sources")}</h2>
          {g.links.map((l: any) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-brand-700 hover:underline">
              <ExternalLink className="size-4" /> {l.label}
            </a>
          ))}
        </section>
      )}
      <p className="text-xs text-soft">{t("guides.disclaimer", "General guidance from official sources, not legal advice. Offices can ask for more.")} ({id})</p>
    </div>
  );
}

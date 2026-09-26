import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, ArrowLeft, BellRing, BookOpen, CalendarCheck, CheckCircle2, Circle, ExternalLink, FileDown, FileText, Hourglass,
  Landmark, MapPin, MessageCircleQuestion, PenLine, Printer, Scale, Stamp, UserRoundCheck,
} from "lucide-react";
import { api, rupees, uploadDocument } from "../lib/api";
import { ASSET_TYPES, STATUS, useCase } from "../lib/case";
import { fmtDate, fmtDateTime } from "../lib/format";
import { todayIso } from "../lib/validate";
import { AssetForm, categoryFor } from "../components/AssetForm";
import { Button, Card, Chip, Citation, ErrorNote, Field, inputCls, Toggle } from "../components/ui";

const BANKISH = ["bank_deposit", "term_deposit", "locker", "safe_custody"];
// RBI routes whose document list includes Annex I-D (no objection) when some heirs are not claiming.
const ID_ROUTES = ["WILL", "SIMPLIFIED", "ABOVE_THRESHOLD", "LOCKER_SIMPLIFIED"];

const owns = (value: any, key: string) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

function peopleForClaim(a: any, people: any[]) {
  const byId = new Map(people.map((person) => [person.personId, person]));
  const nomineeClaim = a.nomination === "nominee";
  const primaryKey = nomineeClaim ? "nomineePersonIds" : "claimantPersonIds";
  const fallbackPrimary = nomineeClaim
    ? people.filter((person) => person.isNominee)
    : people.filter((person) => person.isClaimant);
  const alternatePrimary = nomineeClaim
    ? people.filter((person) => person.isClaimant)
    : people.filter((person) => person.isNominee);
  const primary = owns(a, primaryKey)
    ? (a[primaryKey] ?? []).map((id: string) => byId.get(id)).filter(Boolean)
    : fallbackPrimary.length ? fallbackPrimary : alternatePrimary;
  const nonClaimants = owns(a, "nonClaimantPersonIds")
    ? (a.nonClaimantPersonIds ?? []).map((id: string) => byId.get(id)).filter(Boolean)
    : people.filter((person) => person.isNonClaimantHeir);
  const declarant = owns(a, "declarantPersonId")
    ? byId.get(a.declarantPersonId)
    : people.find((person) => person.isDeclarant);
  return { nomineeClaim, primary, nonClaimants, declarant };
}

export default function ClaimDetail() {
  const { assetId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { view } = useCase();
  const [editing, setEditing] = useState(false);
  const a = (view.assets as any[]).find((x) => x.assetId === assetId);
  if (!a) return <p className="text-muted">{t("claims.notFound", "This claim no longer exists.")}</p>;
  const r = a.route ?? {};
  const st = STATUS[a.status] ?? STATUS.draft;
  const bank = BANKISH.includes(a.assetType);
  const liability = ["loan", "credit_card"].includes(a.assetType);

  return (
    <div className="space-y-5">
      <Link to=".." relative="path" className="inline-flex items-center gap-1 text-sm text-brand-700">
        <ArrowLeft className="size-4" /> {t("nav.plan", "Claim plan")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-soft">{hi ? ASSET_TYPES[a.assetType]?.hi : ASSET_TYPES[a.assetType]?.en}</p>
          <h1 className="text-2xl font-semibold">{a.institution || t("claims.untitled", "Untitled asset")}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone={st.tone}>{hi ? st.hi : st.en}</Chip>
            {a.amount ? <Chip>{rupees(a.amount)}</Chip> : null}
            {a.bankType && <Chip>{a.bankType === "cooperative" ? t("q.coop", "Co-operative bank") : t("q.commercial", "Commercial bank")}</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`../../ask?asset=${a.assetId}`} relative="path">
            <Button variant="soft" icon={<MessageCircleQuestion className="size-4" />}>
              {t("claim.explain", "Explain in simple words")}
            </Button>
          </Link>
          {!bank && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("claim.editDetails", "Edit details")}
            </Button>
          )}
        </div>
      </div>

      {r.route === "NEEDS_INFO" ? (
        <Questions a={a} />
      ) : (
        <ol className="space-y-4">
          <PlanStep n={1} title={t("plan.s1", "What applies to you")}>
            {bank ? <RouteCard a={a} /> : <Playbook a={a} />}
          </PlanStep>
          <PlanStep n={2} title={t("plan.s2", "Documents")}>
            <DocsChecklist a={a} />
          </PlanStep>
          {r.automation !== "stop" && (
            <PlanStep n={3} title={liability ? t("plan.s3l", "Letter, filled for you") : t("plan.s3", "Forms, filled for you")}>
              <div className="space-y-3">
                <ClaimPeopleCard a={a} />
                <PackCard a={a} />
              </div>
            </PlanStep>
          )}
          <PlanStep n={4} title={t("plan.s4", "Sign, stamp and submit")}>
            <SubmitGuide a={a} />
          </PlanStep>
          <PlanStep n={5} title={t("plan.s5", "Track it")}>
            {bank ? a.clock ? <Clock a={a} /> : r.automation !== "stop" ? <SubmitCard a={a} /> : null : <TrackOther a={a} />}
          </PlanStep>
        </ol>
      )}
      {bank && <Facts a={a} />}
      <AssetForm category={editing ? categoryFor(a) : null} asset={a} onClose={() => setEditing(false)} />
    </div>
  );
}

function PlanStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-800">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">{n}</span>
        {title}
      </p>
      {children}
    </li>
  );
}

function Playbook({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const r = a.route;
  return (
    <Card className="space-y-3">
      <p className="text-lg font-semibold leading-snug">{hi ? r.title.hi : r.title.en}</p>
      <ol className="space-y-2">
        {(r.steps?.length ? r.steps : r.checklist ?? []).map((c: any, i: number) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{i + 1}</span>
            <span>{hi ? c.hi || c.en : c.en}</span>
          </li>
        ))}
      </ol>
      {r.timeline && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">⏱ {hi ? r.timeline.hi || r.timeline.en : r.timeline.en}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {(r.sources ?? []).map((src: any) => (
          <a key={src.url} className="inline-flex items-center gap-1 text-sm text-brand-700 underline" href={src.url} target="_blank" rel="noreferrer">
            {src.label} <ExternalLink className="size-3.5" />
          </a>
        ))}
        {!r.verified && <Chip tone="amber">{t("claim.guidance", "Guidance: confirm with the institution")}</Chip>}
      </div>
    </Card>
  );
}

function DocsChecklist({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const r = a.route ?? {};
  const forms: string[] = r.forms ?? [];
  const [have, setHave] = useState<Record<string, boolean>>(a.docsHave ?? {});
  const [error, setError] = useState<unknown>(null);
  const docs: any[] = r.documents ?? [];
  const uploaded = new Set((view.documents as any[]).filter((d) => d.status !== "pending").map((d) => d.kind));
  const currentPack = (view.documents as any[]).some((d) => d.docId === a.packDocId && d.kind === "pack" && d.status !== "stale");
  const managedForm = (d: any) => (d.form && forms.includes(d.form) && BANKISH.includes(a.assetType)) || (!BANKISH.includes(a.assetType) && d.id === "claim_letter");
  const generated = (d: any) => managedForm(d) && currentPack;
  const autoHave = (d: any) => generated(d) || (d.id === "death_certificate" && uploaded.has("death_certificate"));
  const ready = docs.filter((d) => have[d.id] || autoHave(d)).length;

  async function toggle(id: string) {
    const next = { ...have, [id]: !have[id] };
    setHave(next);
    try {
      await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, { docsHave: next });
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("plan.docsReady", "{{n}} of {{total}} ready", { n: ready, total: docs.length })}</p>
        <div className="h-2 w-28 rounded-full bg-stone-200">
          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${docs.length ? (ready / docs.length) * 100 : 0}%` }} />
        </div>
      </div>
      <ul className="space-y-2">
        {docs.map((d) => {
          const filled = generated(d);
          const appCreates = managedForm(d);
          const got = have[d.id] || autoHave(d);
          return (
            <li key={d.id} className="flex items-start gap-2.5 rounded-xl p-2 text-sm hover:bg-stone-50">
              <button
                type="button"
                className="focus-ring mt-0.5 shrink-0 rounded-full"
                onClick={() => !appCreates && toggle(d.id)}
                aria-pressed={got}
                aria-label={t("plan.iHaveIt", "I have it")}
                disabled={appCreates}
              >
                {got ? <CheckCircle2 className="size-5 text-brand-700" /> : <Circle className="size-5 text-stone-400" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className={got ? "text-muted" : ""}>{hi ? d.hi || d.en : d.en}</span>
                <span className="mt-1 flex flex-wrap gap-2">
                  {filled ? (
                    <Chip tone="brand">{t("claim.inPack", "Prepared in current pack")}</Chip>
                  ) : appCreates ? (
                    <Chip tone="amber">{t("claim.makePackFirst", "Create the claim pack below")}</Chip>
                  ) : d.at_branch ? (
                    <Chip>{t("claim.atBranch", "At the branch")}</Chip>
                  ) : d.guide && !got ? (
                    <Link to={`../../guides/${d.guide}`} relative="path" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 underline">
                      <BookOpen className="size-3.5" /> {t("plan.howToGet", "How to get it")}
                    </Link>
                  ) : null}
                  {d.form && !appCreates && <Chip tone="blue">{t("plan.officialForm", "Official form: {{f}}", { f: d.form })}</Chip>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} />
    </Card>
  );
}

function SubmitGuide({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { caseId, view } = useCase();
  const r = a.route ?? {};
  const bank = BANKISH.includes(a.assetType);
  const claimPeople = peopleForClaim(a, view.people as any[]);
  const claimants = claimPeople.primary;
  const others = claimPeople.nonClaimants;
  const declarant = claimPeople.declarant;
  const stampForms = bank ? (r.forms ?? []).filter((f: string) => ["I-C", "I-D", "I-E", "I-H"].includes(f)) : [];
  const state = view.case.deceasedState;
  return (
    <Card className="space-y-3 text-sm">
      <p className="flex items-start gap-2">
        <PenLine className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>
          <span className="font-semibold">{t("plan.whoSigns", "Who signs")}: </span>
          {[...claimants.map((p: any) => p.fullName), ...(bank && others.length ? others.map((p: any) => `${p.fullName} (I-D)`) : []), ...(bank && declarant && (r.forms ?? []).includes("I-E") ? [`${declarant.fullName} (I-E)`] : [])].join(", ") ||
            t("plan.addPeople", "Add the family first")}
        </span>
      </p>
      {stampForms.length > 0 && (
        <p className="flex items-start gap-2">
          <Stamp className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span>
            <span className="font-semibold">{t("plan.stamp", "Stamp paper")}: </span>
            {t("plan.stampText", "Annex {{forms}} must be stamped under your state's Stamp Act. Ask the branch for the value, buy an e-stamp, then sign.", { forms: stampForms.join(", ") })}{" "}
            <Link to="../../guides/stamp_paper" relative="path" className="font-medium text-brand-700 underline">
              {t("plan.stampGuide", "How")}
            </Link>
            {" · "}
            <button
              className="font-medium text-brand-700 underline"
              onClick={() =>
                nav(`/cases/${caseId}/ask?mode=web&q=${encodeURIComponent(`What is the stamp duty for an indemnity bond and an affidavit in ${state || "my state"}?`)}`)
              }
            >
              {t("plan.askState", "Ask the value for {{state}}", { state: state || t("guides.myState", "my state") })}
            </button>
          </span>
        </p>
      )}
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>
          <span className="font-semibold">{t("plan.where", "Where to submit")}: </span>
          {bank ? t("plan.anyBranch", "Any branch of {{bank}}; you don't have to go to the home branch (RBI para 29). Ask for a dated acknowledgement.", { bank: a.institution }) : r.where}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>{t("plan.selfAttest", "Self-attest each ID copy (sign across it) and carry the originals.")}</span>
      </p>
    </Card>
  );
}

function TrackOther({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, reload } = useCase();
  const [date, setDate] = useState(a.submittedOn || todayIso());
  const [got, setGot] = useState(String(a.receivedAmount ?? a.amount ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const r = a.route ?? {};
  async function save(body: any) {
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, body);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      {r.timeline && <p className="text-sm text-muted">{hi ? r.timeline.hi || r.timeline.en : r.timeline.en}</p>}
      {a.receivedOn ? (
        <p className="font-medium text-green-800">
          ✓ {t("plan.received", "Received {{amt}} on {{d}}", { amt: rupees(a.receivedAmount) || "", d: fmtDate(a.receivedOn, hi) })}
        </p>
      ) : a.submittedOn ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t("plan.submittedOn", "Submitted on {{d}}.", { d: fmtDate(a.submittedOn, hi) })}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("clock.amountReceived", "Amount received (₹)")}>
              <input className={inputCls + " w-40"} inputMode="numeric" value={got} onChange={(e) => setGot(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Button loading={busy} onClick={() => save({ receivedOn: todayIso(), receivedAmount: got ? Number(got) : "" })}>
              {t("plan.markReceived", "Mark as received")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("plan.submittedDate", "Submitted on")}>
            <input className={inputCls} type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button loading={busy} icon={<CalendarCheck className="size-4" />} onClick={() => save({ submittedOn: date })}>
            {t("plan.markSubmitted", "Mark as submitted")}
          </Button>
        </div>
      )}
      <ErrorNote error={error} />
    </Card>
  );
}

function Questions({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, reload } = useCase();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Card tone="amber">
      <p className="mb-3 font-semibold">{hi ? a.route.title.hi : a.route.title.en}</p>
      <div className="space-y-3">
        {a.route.missing.map((q: any) => (
          <Field key={q.fact} label={hi ? q.hi : q.en}>
            {q.options ? (
              <select className={inputCls} value={f[q.fact] ?? ""} onChange={(e) => setF({ ...f, [q.fact]: e.target.value })}>
                <option value="">—</option>
                {q.options.map((o: string) => (
                  <option key={o} value={o}>
                    {t(`opt.${o}`, { defaultValue: o })}
                  </option>
                ))}
              </select>
            ) : (
              <input className={inputCls} inputMode="numeric" value={f[q.fact] ?? ""} onChange={(e) => setF({ ...f, [q.fact]: e.target.value })} />
            )}
          </Field>
        ))}
        <ErrorNote error={error} />
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const body: any = {};
              if (f.nomination) body.nomination = f.nomination;
              if (f.bank_type) body.bankType = f.bank_type;
              if (f.amount) body.amount = Number(f.amount);
              await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, body);
              await reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("claim.findRoute", "Find the route")}
        </Button>
      </div>
    </Card>
  );
}

function RouteCard({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const r = a.route;
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${r.automation === "stop" ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}>
          {r.automation === "stop" ? <AlertTriangle className="size-5" /> : <Scale className="size-5" />}
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-soft">{t("claim.route", "Your route")}</p>
          <p className="text-lg font-semibold leading-snug">{hi ? r.title.hi : r.title.en}</p>
        </div>
      </div>
      <Citation para={r.citation?.para} quote={r.citation?.quote} url={r.citation?.url} title={r.citation?.title} />
      {r.threshold?.limit_inr && (
        <p className="text-sm text-muted">
          {t("claim.threshold", "Limit for this bank: {{limit}} (para 7(h)). This claim: {{amt}}.", {
            limit: rupees(r.threshold.limit_inr),
            amt: rupees(r.threshold.amount_inr),
          })}
        </p>
      )}
      {r.automation === "stop" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          {t("claim.stop", "This needs court documents or legal help. We've listed what the bank will ask for, but we don't automate this route.")}
        </p>
      )}
      {(r.notes ?? []).length > 0 && (
        <ul className="space-y-2">
          {r.notes.map((n: any, i: number) => (
            <li key={i} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
              {hi ? n.hi || n.en : n.en} <span className="text-xs font-medium text-brand-800">({t("claim.para", "para")} {n.para})</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClaimPeopleCard({ a }: { a: any }) {
  const { t } = useTranslation();
  const { caseId, view, reload } = useCase();
  const people = view.people as any[];
  const selectable = people.filter((person) => !person.isDeclarant);
  const declarants = people.filter((person) => person.isDeclarant);
  const forms: string[] = a.route?.forms ?? [];
  // Annex I-D appears only once someone is marked as not claiming, so offer the choice on every route that
  // can need it; otherwise clearing the list would hide the only way back.
  const needsNonClaimants = forms.includes("I-D") || ID_ROUTES.includes(a.route?.route);
  const needsDeclarant = forms.includes("I-E");
  const [primaryIds, setPrimaryIds] = useState<string[]>([]);
  const [nonClaimantIds, setNonClaimantIds] = useState<string[]>([]);
  const [declarantId, setDeclarantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const claimPeople = peopleForClaim(a, people);
  const selectionConfirmed = owns(a, claimPeople.nomineeClaim ? "nomineePersonIds" : "claimantPersonIds");

  useEffect(() => {
    const selected = peopleForClaim(a, people);
    setPrimaryIds(selected.primary.map((person: any) => person.personId));
    setNonClaimantIds(selected.nonClaimants.map((person: any) => person.personId));
    setDeclarantId(selected.declarant?.personId ?? "");
    setSaved(false);
  }, [a, people]);

  function toggle(id: string, ids: string[], setIds: (next: string[]) => void) {
    setSaved(false);
    setIds(ids.includes(id) ? ids.filter((personId) => personId !== id) : [...ids, id]);
  }

  if (!selectable.length) {
    return (
      <Card className="space-y-2">
        <p className="flex items-center gap-2 font-semibold"><UserRoundCheck className="size-5 text-brand-700" /> {t("claim.peopleForClaim", "People on this claim")}</p>
        <p className="text-sm text-muted">{t("claim.addFamilyToChoose", "Add family members, then choose who is making this claim.")}</p>
        <Link className="inline-flex text-sm font-medium text-brand-700 underline" to="../../setup/family" relative="path">
          {t("claim.addFamily", "Add family members")}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><UserRoundCheck className="size-5" /></span>
        <div>
          <p className="font-semibold">{t("claim.peopleForClaim", "People on this claim")}</p>
          <p className="text-sm text-muted">
            {claimPeople.nomineeClaim
              ? t("claim.chooseNominee", "Choose the registered nominee for this account.")
              : t("claim.chooseClaimants", "Choose only the people claiming this asset. This keeps every generated form accurate.")}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {selectable.map((person) => {
          const selected = primaryIds.includes(person.personId);
          return (
            <button
              key={person.personId}
              type="button"
              role="checkbox"
              aria-checked={selected}
              className={`focus-ring flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 transition-colors ${selected ? "bg-brand-50 text-brand-950 ring-brand-300" : "bg-white ring-line hover:bg-stone-50"}`}
              onClick={() => toggle(person.personId, primaryIds, setPrimaryIds)}
            >
              {selected ? <CheckCircle2 className="size-5 shrink-0 text-brand-700" /> : <Circle className="size-5 shrink-0 text-stone-400" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{person.fullName}</span>
                {person.relation && <span className="block text-xs text-muted">{person.relation}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {needsNonClaimants && selectable.some((person) => !primaryIds.includes(person.personId)) && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-medium">{t("claim.nonClaimantSigners", "Other heirs signing the no-objection form")}</p>
          <div className="flex flex-wrap gap-2">
            {selectable.filter((person) => !primaryIds.includes(person.personId)).map((person) => {
              const selected = nonClaimantIds.includes(person.personId);
              return (
                <button
                  key={person.personId}
                  type="button"
                  aria-pressed={selected}
                  className={`focus-ring rounded-full px-3 py-1.5 text-sm ring-1 ${selected ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-white text-muted ring-line"}`}
                  onClick={() => toggle(person.personId, nonClaimantIds, setNonClaimantIds)}
                >
                  {selected ? "✓ " : "+ "}{person.fullName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {needsDeclarant && (
        <div className="space-y-2">
          <Field label={t("claim.declarantForClaim", "Independent declarant for this claim") }>
            <select className={inputCls} value={declarantId} onChange={(event) => { setDeclarantId(event.target.value); setSaved(false); }}>
              <option value="">{t("claim.noDeclarant", "Choose a declarant")}</option>
              {declarants.map((person) => <option key={person.personId} value={person.personId}>{person.fullName}</option>)}
            </select>
          </Field>
          {!declarants.length && (
            <Link className="inline-flex text-sm font-medium text-brand-700 underline" to="../../setup/family" relative="path">
              {t("claim.addDeclarant", "Add an independent declarant under Family")}
            </Link>
          )}
        </div>
      )}

      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!primaryIds.length || (needsDeclarant && !declarantId)}
          onClick={async () => {
            setBusy(true);
            setSaved(false);
            setError(null);
            try {
              await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, {
                claimantPersonIds: claimPeople.nomineeClaim ? [] : primaryIds,
                nomineePersonIds: claimPeople.nomineeClaim ? primaryIds : [],
                nonClaimantPersonIds: needsNonClaimants ? nonClaimantIds.filter((id) => !primaryIds.includes(id)) : [],
                declarantPersonId: needsDeclarant ? declarantId : "",
              });
              await reload();
              setSaved(true);
            } catch (caught) {
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          {selectionConfirmed
            ? t("claim.savePeople", "Save people for this claim")
            : t("claim.confirmPeople", "Confirm people for this claim")}
        </Button>
        {saved && <span className="text-sm font-medium text-green-800">✓ {t("saved", "Saved")}</span>}
      </div>
    </Card>
  );
}

function PackCard({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const { caseId, view, reload } = useCase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [omissions, setOmissions] = useState<string[]>([]);
  const packs = (view.documents as any[]).filter((d) => d.kind === "pack" && d.assetId === a.assetId && d.status !== "stale");
  const claimPeople = peopleForClaim(a, view.people as any[]);
  const noPeople = claimPeople.primary.length === 0;
  const selectionConfirmed = owns(a, claimPeople.nomineeClaim ? "nomineePersonIds" : "claimantPersonIds");
  const bank = BANKISH.includes(a.assetType);

  async function open(docId: string) {
    const r: any = await api("GET", `/cases/${caseId}/documents/${docId}/url?variant=original`);
    window.open(r.url, "_blank");
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Printer className="size-5 text-brand-700" />
        <p className="font-semibold">{t("claim.pack", "Claim pack")}</p>
      </div>
      <p className="text-sm text-muted">
        {bank
          ? t("claim.packText", "RBI's standard forms, printed on the official format with your family's details, masked ID copies, and a checklist. Print, sign, submit.")
          : t("claim.packTextOther", "A pre-filled letter to {{inst}} with the death intimation and claim request, the document list, and the steps. Print, sign, submit with their own form.", { inst: a.institution })}
      </p>
      {(noPeople || !selectionConfirmed) && (
        <p className="rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">
          {noPeople ? (
            <>
              {t("claim.needPeople", "Add the claimants under Family first.")}{" "}
              <Link className="underline" to="../../setup/family" relative="path">
                {t("nav.family", "Family")}
              </Link>
            </>
          ) : t("claim.confirmPeopleFirst", "Confirm and save the people above before generating the pack.")}
        </p>
      )}
      <ErrorNote error={error} />
      <Button
        loading={busy}
        disabled={noPeople || !selectionConfirmed}
        icon={<FileDown className="size-4" />}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const win = window.open("", "_blank");
          try {
            const r: any = await api("POST", `/cases/${caseId}/assets/${a.assetId}/pack`);
            setOmissions(r.skippedUnmasked ?? []);
            if (win) win.location.href = r.url;
            else window.open(r.url, "_blank");
            await reload();
          } catch (e) {
            win?.close();
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {packs.length ? t("claim.regenerate", "Make a fresh pack") : t("claim.generate", "Generate claim pack")}
      </Button>
      {omissions.length > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          {t("claim.omitted", "Not included because a safe masked copy was unavailable: {{files}}. Mask or attach these before submitting.", { files: omissions.join(", ") })}
        </p>
      )}
      {packs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {packs.slice(0, 3).map((p) => (
            <li key={p.docId}>
              <button className="text-brand-700 underline" onClick={() => open(p.docId)}>
                {p.filename}
              </button>{" "}
              <span className="text-xs text-soft">{fmtDateTime(p.createdAt, i18n.language === "hi")}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SubmitCard({ a }: { a: any }) {
  const { t } = useTranslation();
  const { caseId, reload } = useCase();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ack, setAck] = useState<File | null>(null);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="size-5 text-brand-700" />
        <p className="font-semibold">{t("claim.submitted", "Submitted at the bank?")}</p>
      </div>
      <p className="text-sm text-muted">
        {t("claim.submitText", "When the bank confirms it has all documents (para 29), the 15-day settlement clock starts (para 31).")}
      </p>
      <Field label={t("claim.docsDate", "Bank confirmed all documents on")}>
        <input className={inputCls} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setAck(e.target.files?.[0] ?? null)} />
      <button className="text-sm text-brand-700 underline" onClick={() => fileRef.current?.click()}>
        {ack ? `✓ ${ack.name}` : t("claim.ackUpload", "Attach a photo of the dated acknowledgement (recommended)")}
      </button>
      <ErrorNote error={error} />
      <Button
        loading={busy}
        icon={<Hourglass className="size-4" />}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            let ackDocId = "";
            if (ack) ackDocId = (await uploadDocument(caseId, ack, "acknowledgement", { assetId: a.assetId })).docId;
            await api("POST", `/cases/${caseId}/assets/${a.assetId}/submit`, { docsCompleteDate: date, ackDocId });
            await reload();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("claim.startClock", "Start the 15-day clock")}
      </Button>
    </Card>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Clock({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const { caseId, view, reload } = useCase();
  const c = a.clock;
  const spd = Number(c.secondsPerDay || view.case.secondsPerDay || 86400);
  const now = useNow(spd < 86400 ? 500 : 60000);
  const day = useMemo(() => {
    if (spd < 86400 && c.startedAt) return Math.max(0, Math.floor((now - Date.parse(c.startedAt)) / (spd * 1000)));
    return Math.max(0, Math.floor((now - Date.parse(c.docsCompleteDate)) / 86400000));
  }, [now, spd, c.startedAt, c.docsCompleteDate]);
  const waiting = (view.waitingFor as any[]).find((w) => w.assetId === a.assetId);
  const shownDay = waiting?.stage === "settled" ? Math.max(day, 15) : day;
  const done = ["settled", "settled_late", "resolved", "escalated", "ombudsman_ready"].includes(a.status) || c.stage === "done";
  const pct = Math.min(100, (Math.min(shownDay, 15) / 15) * 100);
  const [amount, setAmount] = useState(String(a.amount || ""));
  const [paidOn, setPaidOn] = useState(todayIso());
  const [complaintSentOn, setComplaintSentOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const docs = view.documents as any[];
  const letter = docs.find((d) => d.docId === c.letterDocId);
  const omb = docs.find((d) => d.docId === c.ombudsmanDocId);

  async function answer(body: any) {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/cases/${caseId}/assets/${a.assetId}/answer`, body);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function open(docId: string) {
    const r: any = await api("GET", `/cases/${caseId}/documents/${docId}/url?variant=original`);
    window.open(r.url, "_blank");
  }

  return (
    <Card className="space-y-4" tone={a.status === "late" || a.status === "escalated" || a.status === "ombudsman_ready" ? "amber" : "plain"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Hourglass className="size-5 text-brand-700" />
          <p className="font-semibold">{t("clock.title", "Settlement clock")}</p>
        </div>
        <p className="text-sm text-muted">
          <span className="whitespace-nowrap">{t("clock.complete", "Documents complete {{d}}", { d: fmtDate(c.docsCompleteDate, i18n.language === "hi") })}</span>
          {" · "}
          <span className="whitespace-nowrap font-medium text-ink">{t("clock.due", "due {{d}}", { d: fmtDate(c.dueDate, i18n.language === "hi") })}</span>
        </p>
      </div>
      {!done && (
        <div>
          <div className="relative h-3 rounded-full bg-stone-200">
            <div className="h-3 rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${pct}%` }} />
            {[10, 14].map((m) => (
              <span key={m} className="absolute top-[-3px] h-[18px] w-0.5 bg-stone-500" style={{ left: `${(m / 15) * 100}%` }} title={`Day ${m}`} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-soft">
            <span>{t("clock.day0", "Day 0")}</span>
            <span className="font-semibold text-ink">
              {shownDay <= 15 ? t("clock.dayN", "Day {{n}} of 15", { n: shownDay }) : t("clock.over", "{{n}} days past due", { n: shownDay - 15 })}
              {spd < 86400 && ` · ${t("clock.demo", "demo: 1 day = {{s}}s", { s: spd })}`}
            </span>
            <span>{t("clock.day15", "Day 15")}</span>
          </div>
        </div>
      )}

      {waiting?.stage === "settled" && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <BellRing className="size-5 pulse-soft" /> {t("clock.askPaid", "Day 15 is over. Has the money arrived?")}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label={t("clock.amountReceived", "Amount received (₹)")}>
              <input className={inputCls + " w-40"} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t("clock.paidOn", "Money received on")}>
              <input className={inputCls + " w-44"} type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Button loading={busy} onClick={() => answer({ stage: "settled", settled: true, amountReceived: Number(amount || 0), paidOn })}>
              {t("clock.yes", "Yes, it's paid")}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => answer({ stage: "settled", settled: false })}>
              {t("clock.no", "Not yet")}
            </Button>
          </div>
        </div>
      )}
      {waiting?.stage === "complaint_sent" && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <BellRing className="size-5 pulse-soft" /> {t("clock.askComplaintSent", "Your complaint letter is ready. Start the 30-day response period only after you send it.")}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label={t("clock.complaintSentOn", "Complaint sent on")}>
              <input className={inputCls + " w-44"} type="date" max={todayIso()} value={complaintSentOn} onChange={(e) => setComplaintSentOn(e.target.value)} />
            </Field>
            <Button loading={busy} onClick={() => answer({ stage: "complaint_sent", sent: true, sentOn: complaintSentOn })}>
              {t("clock.confirmSent", "I sent the complaint")}
            </Button>
          </div>
        </div>
      )}
      {waiting?.stage === "resolved" && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <BellRing className="size-5 pulse-soft" /> {t("clock.askResolved", "30 days since you sent the complaint. Did the bank resolve it?")}
          </p>
          <div className="mt-3 flex gap-2">
            <Button loading={busy} onClick={() => answer({ stage: "resolved", resolved: true })}>
              {t("clock.resolvedYes", "Yes, resolved")}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => answer({ stage: "resolved", resolved: false })}>
              {t("clock.resolvedNo", "No: prepare the Ombudsman complaint")}
            </Button>
          </div>
        </div>
      )}

      <ErrorNote error={error} />

      {c.compensation?.compensation_inr !== undefined && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <p className="text-xs uppercase tracking-wide text-soft">{t("clock.comp", "Compensation owed by the bank")}</p>
          <p className="text-3xl font-semibold text-ink">{rupees(c.compensation.compensation_inr)}</p>
          <p className="mt-1 font-mono text-xs text-muted">{c.compensation.formula}</p>
          <p className="mt-1 text-xs text-muted">
            {c.compensation.kind === "deposit"
              ? t(c.compensation.delay_days === 1 ? "clock.compNote1" : "clock.compNote", "Bank Rate {{br}}% (on {{d}}) + 4% = {{r}}% a year, for {{n}} days of delay so far.", {
                  br: c.compensation.bank_rate_pct,
                  d: fmtDate(c.compensation.docs_complete, i18n.language === "hi"),
                  r: c.compensation.rate_pct,
                  n: c.compensation.delay_days,
                })
              : t("clock.compLocker", "₹5,000 for each day of delay (para 34).")}
          </p>
          <div className="mt-3">
            <Citation para={c.compensation.citation?.para} quote={c.compensation.citation?.quote} url={c.compensation.citation?.url} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {letter && (
          <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => open(letter.docId)}>
            {t("clock.letter", "Letter to the bank")}
          </Button>
        )}
        {omb && (
          <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => open(omb.docId)}>
            {t("clock.ombudsman", "RBI Ombudsman complaint draft")}
          </Button>
        )}
        {omb && (
          <a className="inline-flex items-center gap-1 text-sm text-brand-700 underline" href="https://cms.rbi.org.in" target="_blank" rel="noreferrer">
            cms.rbi.org.in <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      {a.status === "settled" && <p className="font-medium text-green-800">✓ {t("clock.settledOk", "Settled within 15 days. Nothing more to do here.")}</p>}
    </Card>
  );
}

function Checklist({ a }: { a: any }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const r = a.route;
  return (
    <Card className="space-y-3">
      <p className="text-lg font-semibold">{hi ? r.title.hi : r.title.en}</p>
      <ol className="space-y-2">
        {r.checklist.map((c: any, i: number) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{i + 1}</span>
            <span>{hi ? c.hi || c.en : c.en}</span>
          </li>
        ))}
      </ol>
      {r.where && (
        <p className="text-sm text-muted">
          {t("claim.where", "Where")}: {r.where}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {r.url && (
          <a className="inline-flex items-center gap-1 text-sm text-brand-700 underline" href={r.url} target="_blank" rel="noreferrer">
            {t("claim.official", "Official page")} <ExternalLink className="size-3.5" />
          </a>
        )}
        {!r.verified && <Chip tone="amber">{t("claim.guidance", "Guidance: confirm with the institution")}</Chip>}
      </div>
    </Card>
  );
}

function Facts({ a }: { a: any }) {
  const { t } = useTranslation();
  const { caseId, reload } = useCase();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>(() => ({
    nomination: a.nomination || "unknown",
    bankType: a.bankType || "",
    amount: a.amount ?? "",
    accountNumbers: (a.accountNumbers || []).join(", "),
    branch: a.branch || "",
    will: !!a.will,
    dispute: !!a.dispute,
    courtOrder: !!a.courtOrder,
    joint: !!a.joint,
    legalHeirCertificate: !!a.legalHeirCertificate,
  }));
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  if (!open)
    return (
      <button className="text-sm text-brand-700 underline" onClick={() => setOpen(true)}>
        {t("claim.editFacts", "Change the details of this claim")}
      </button>
    );
  return (
    <Card className="space-y-3">
      <p className="font-semibold">{t("claim.details", "Claim details")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("q.nominationShort", "Nominee")}>
          <select className={inputCls} value={f.nomination} onChange={(e) => setF({ ...f, nomination: e.target.value })}>
            <option value="unknown">{t("q.dontKnow", "I don't know yet")}</option>
            <option value="nominee">{t("q.nominee", "Yes, a nominee")}</option>
            <option value="survivor">{t("q.survivor", "Joint account, either or survivor")}</option>
            <option value="none">{t("q.none", "No nominee")}</option>
          </select>
        </Field>
        <Field label={t("q.bankType", "Type of bank")}>
          <select className={inputCls} value={f.bankType} onChange={(e) => setF({ ...f, bankType: e.target.value })}>
            <option value="">—</option>
            <option value="commercial">{t("q.commercial", "Commercial bank")}</option>
            <option value="cooperative">{t("q.coop", "Co-operative bank")}</option>
          </select>
        </Field>
        <Field label={t("q.amount", "Approximate amount (₹)")}>
          <input className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label={t("q.accounts", "Account / FD number")}>
          <input className={inputCls} value={f.accountNumbers} onChange={(e) => setF({ ...f, accountNumbers: e.target.value })} />
        </Field>
        <Field label={t("q.branch", "Branch")}>
          <input className={inputCls} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle checked={f.joint} onChange={(v) => setF({ ...f, joint: v })} label={t("q.joint", "Joint account")} />
        <Toggle checked={f.will} onChange={(v) => setF({ ...f, will: v })} label={t("q.will", "There is a Will")} />
        <Toggle checked={f.dispute} onChange={(v) => setF({ ...f, dispute: v })} label={t("q.dispute", "Heirs disagree")} />
        <Toggle checked={f.courtOrder} onChange={(v) => setF({ ...f, courtOrder: v })} label={t("q.court", "A court order stops payment")} />
        <Toggle checked={f.legalHeirCertificate} onChange={(v) => setF({ ...f, legalHeirCertificate: v })} label={t("q.lhc", "We have a Legal Heir Certificate")} />
      </div>
      <div className="flex gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const body: any = { ...f, amount: f.amount === "" ? "" : Number(f.amount) };
              if (body.nomination === "unknown") delete body.nomination;
              if (!body.bankType) delete body.bankType;
              await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, body);
              await reload();
              setOpen(false);
              nav(".", { replace: true });
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("claim.recheck", "Save and re-check the route")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel", "Cancel")}
        </Button>
      </div>
    </Card>
  );
}

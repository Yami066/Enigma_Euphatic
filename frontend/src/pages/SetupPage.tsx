import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, FileUp, Info, Landmark, Mail, Pencil, Plus, Trash2, UserPlus,
} from "lucide-react";
import { api, rupees, uploadDocument } from "../lib/api";
import { ASSET_TYPES, STATUS, useCase } from "../lib/case";
import { lookupIfsc } from "../lib/ifsc";
import { checkAccountNumber, checkDateOrder, checkIfsc, checkPin, RELIGIONS, STATES, todayIso } from "../lib/validate";
import { AssetForm, BANK_CATEGORY, type Category, categoryFor, INVESTMENTS } from "../components/AssetForm";
import { EMPTY_PERSON, PeopleList, PersonForm } from "../components/People";
import { Button, Card, Chip, ErrorNote, Field, inputCls } from "../components/ui";
import { EmailFinder } from "../components/EmailFinder";
import { FromDocuments, SearchKit } from "./FindPage";

export const STEPS = [
  { id: "about", en: "About them", hi: "उनके बारे में" },
  { id: "family", en: "Family", hi: "परिवार" },
  { id: "payee", en: "Who gets paid", hi: "भुगतान किसे" },
  { id: "banks", en: "Their bank accounts", hi: "उनके बैंक खाते" },
  { id: "investments", en: "Investments & policies", hi: "निवेश और पॉलिसी" },
  { id: "discover", en: "Find what nobody knew", hi: "अनजानी संपत्ति खोजें" },
  { id: "choose", en: "Choose what to claim", hi: "क्या दावा करें चुनें" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

export const BANKISH = ["bank_deposit", "term_deposit", "locker", "safe_custody"];
const NOM_EN: Record<string, string> = { nominee: "Nominee registered", survivor: "Joint (survivor)", none: "No nominee" };
const SRC_EN: Record<string, string> = { statement: "From statement", passbook: "From passbook", lead: "Found", manual: "Typed", email: "From email" };
const norm = (s: string) => (s || "").toLowerCase().replace(/\b(ltd|limited|bank|the|of|india|co|pvt)\b|[^a-z0-9]/g, "");
export const LIABILITIES = ["loan", "credit_card"];
const claimantsOf = (view: any) => (view.people as any[]).filter((p) => p.isClaimant || p.isNominee);

/** A step is done when its data exists, or when the family moved past it (skip / continue). */
export function stepDone(view: any, id: StepId): boolean {
  const done: string[] = view.case.setupDone ?? [];
  const c = view.case;
  const assets = view.assets as any[];
  switch (id) {
    case "about":
      return done.includes("about") || !!(c.deathCertNo || c.placeOfDeath);
    case "family":
      return claimantsOf(view).length > 0;
    case "payee": {
      const cl = claimantsOf(view);
      return done.includes("payee") || (cl.length > 0 && cl.every((p) => p.bankAccountNumber)) || !!c.payment?.accountNumber;
    }
    case "banks":
      return done.includes("banks") || assets.some((a) => BANKISH.includes(a.assetType));
    case "investments":
      return done.includes("investments");
    case "discover":
      return done.includes("discover") || (view.documents as any[]).some((d) => d.kind === "statement");
    case "choose":
      return done.includes("choose");
  }
}
export const nextSetupStep = (view: any) => STEPS.find((s) => !stepDone(view, s.id))?.id ?? null;

export default function SetupPage() {
  const { step } = useParams();
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { caseId, view, reload } = useCase();
  const idx = STEPS.findIndex((s) => s.id === step);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 }); // each step starts at the top, below the sticky header
  }, [step]);
  if (idx < 0) return <Navigate to={`/cases/${caseId}/setup/${nextSetupStep(view) ?? "about"}`} replace />;
  const cur = STEPS[idx];

  async function finish(markDone = true) {
    if (markDone) {
      const done = new Set<string>(view.case.setupDone ?? []);
      done.add(cur.id);
      await api("PATCH", `/cases/${caseId}`, { setupDone: [...done] });
      await reload();
    }
    if (idx < STEPS.length - 1) nav(`/cases/${caseId}/setup/${STEPS[idx + 1].id}`);
    else nav(`/cases/${caseId}/claims`);
  }
  const back = idx > 0 ? () => nav(`/cases/${caseId}/setup/${STEPS[idx - 1].id}`) : () => nav(`/cases/${caseId}`);

  const body: Record<StepId, ReactNode> = {
    about: <AboutStep onNext={finish} onBack={back} />,
    family: <FamilyStep onNext={finish} onBack={back} />,
    payee: <PayeeStep onNext={finish} onBack={back} />,
    banks: <BanksStep onNext={finish} onBack={back} />,
    investments: <InvestmentsStep onNext={finish} onBack={back} />,
    discover: <DiscoverStep onNext={finish} onBack={back} />,
    choose: <ChooseStep onNext={finish} onBack={back} />,
  };

  return (
    <div className="space-y-5" ref={top}>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-soft">
          {t("setup.stepOf", "Step {{n}} of {{total}}", { n: idx + 1, total: STEPS.length })}
        </p>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i < idx || stepDone(view, s.id) ? "bg-brand-600" : i === idx ? "bg-brand-300" : "bg-stone-200"}`} />
          ))}
        </div>
        <nav className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label={t("setup.steps", "Setup steps")}>
          {STEPS.map((s, i) => (
            <Link
              key={s.id}
              to={`/cases/${caseId}/setup/${s.id}`}
              aria-current={i === idx ? "step" : undefined}
              className={`focus-ring flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
                i === idx ? "bg-brand-700 text-white ring-brand-700" : stepDone(view, s.id) ? "bg-brand-50 text-brand-800 ring-brand-100" : "bg-white text-muted ring-line"
              }`}
            >
              {stepDone(view, s.id) && i !== idx && <Check className="size-3.5" />}
              {hi ? s.hi : s.en}
            </Link>
          ))}
        </nav>
      </div>
      {body[cur.id]}
    </div>
  );
}

type StepProps = { onNext: (markDone?: boolean) => Promise<void>; onBack: () => void };

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{sub}</p>
    </div>
  );
}

function StepFooter({ onBack, onSkip, onContinue, busy, label, error }: { onBack: () => void; onSkip?: () => void; onContinue: () => void; busy?: boolean; label?: string; error?: unknown }) {
  const { t } = useTranslation();
  return (
    <div className="sticky bottom-0 z-20 -mx-3 space-y-2 border-t border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" />} aria-label={t("back", "Back")}>
          <span className="hidden sm:inline">{t("back", "Back")}</span>
        </Button>
        <div className="flex-1" />
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            {t("setup.skip", "Skip for now")}
          </Button>
        )}
        <Button className="w-full sm:w-auto" onClick={onContinue} loading={busy}>
          {label ?? t("setup.continue", "Save and continue")} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function useStepRunner(onNext: StepProps["onNext"]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn?: () => Promise<unknown>, markDone = true) => {
    setBusy(true);
    setError(null);
    try {
      if (fn) await fn();
      await onNext(markDone);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// ------------------------------------------------------------------ 1. About them

const DECEASED = ["deceasedName", "dod", "dob", "placeOfDeath", "deathCertNo", "deathCertDate", "deathCertAuthority", "maritalStatus", "deceasedAddress", "deceasedCity", "deceasedPin", "deceasedState", "religion", "successionLaw", "will"] as const;

function AboutStep({ onNext, onBack }: StepProps) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const c = view.case;
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(DECEASED.map((k) => [k, c[k] ?? ""])));
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, run } = useStepRunner(onNext);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasCert = (view.documents as any[]).some((d) => d.kind === "death_certificate");

  const w = (x: { en: string; hi: string } | null) => (x ? (hi ? x.hi : x.en) : null);
  const certWarn = w(checkDateOrder(f.dod, f.deathCertDate, "The certificate date is before the date of death. Please check.", "प्रमाण पत्र की तारीख मृत्यु से पहले है। कृपया जांचें।"));
  const dodWarn = w(checkDateOrder(f.dob, f.dod, "Date of death is before the date of birth.", "मृत्यु की तारीख जन्म से पहले है।")) ?? w(checkDateOrder(f.dod, todayIso(), "Date of death is in the future.", "मृत्यु की तारीख भविष्य में है।"));

  function setReligion(v: string) {
    const prevLaw = RELIGIONS.find((r) => r.value === f.religion)?.law ?? "";
    const law = RELIGIONS.find((r) => r.value === v)?.law ?? "";
    setF((x) => ({ ...x, religion: v, successionLaw: !x.successionLaw || x.successionLaw === prevLaw ? law : x.successionLaw }));
  }

  async function uploadCert(file: File) {
    setUploading(true);
    setUpErr(null);
    try {
      await uploadDocument(caseId, file, "death_certificate");
      await reload();
    } catch (e) {
      setUpErr(e);
    } finally {
      setUploading(false);
    }
  }

  const text = (k: string, label: string, props: Record<string, any> = {}) => (
    <Field label={label} warn={props.warn} hint={props.hint}>
      <input className={inputCls} type={props.type ?? "text"} max={props.max} inputMode={props.inputMode} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <div className="space-y-5">
      <StepHeader
        title={t("about.title", "About {{name}}", { name: c.deceasedName })}
        sub={t("about.sub", "The bank's claim forms ask for these once. Fill what you know; blanks print as lines to write by hand.")}
      />
      <Card className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{text("deceasedName", t("cases.name", "Full name of the person who passed away"))}</div>
        {text("dod", t("cases.dod", "Date of death"), { type: "date", max: todayIso(), warn: dodWarn })}
        {text("dob", t("cases.dob", "Date of birth"), { type: "date", max: todayIso() })}
        {text("placeOfDeath", t("fam.d.placeOfDeath", "Place of death"))}
        {text("deathCertNo", t("fam.d.deathCertNo", "Death certificate number"))}
        {text("deathCertDate", t("fam.d.deathCertDate", "Certificate date"), { type: "date", max: todayIso(), warn: certWarn })}
        {text("deathCertAuthority", t("fam.d.deathCertAuthority", "Issued by (e.g. BBMP, Tahsildar)"))}
        <Field label={t("fam.d.maritalStatus", "Marital status")}>
          <select className={inputCls} value={f.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)}>
            <option value="">{t("pick", "Choose…")}</option>
            {["Married", "Unmarried", "Widow(er)", "Divorced"].map((m) => (
              <option key={m} value={m}>
                {t(`marital.${m}`, { defaultValue: m })}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCert(e.target.files[0])} />
          <Button variant={hasCert ? "soft" : "secondary"} className="w-full" loading={uploading} onClick={() => fileRef.current?.click()} icon={hasCert ? <CheckCircle2 className="size-4" /> : <FileUp className="size-4" />}>
            {hasCert ? t("about.certUploaded", "Death certificate uploaded") : t("about.uploadCert", "Upload death certificate")}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <ErrorNote error={upErr} />
        </div>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm font-semibold sm:col-span-2">{t("about.addressTitle", "Their address (as on the form)")}</p>
        <div className="sm:col-span-2">{text("deceasedAddress", t("fam.d.deceasedAddress", "House, street, area"))}</div>
        {text("deceasedCity", t("about.city", "City / District"))}
        {text("deceasedPin", t("about.pin", "PIN code"), { inputMode: "numeric", warn: w(checkPin(f.deceasedPin)) })}
        <Field label={t("about.state", "State")}>
          <select className={inputCls} value={f.deceasedState} onChange={(e) => set("deceasedState", e.target.value)}>
            <option value="">{t("pick", "Choose…")}</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fam.d.religion", "Religion")}>
          <select className={inputCls} value={f.religion} onChange={(e) => setReligion(e.target.value)}>
            <option value="">{t("pick", "Choose…")}</option>
            {RELIGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {hi ? r.hi : r.en}
              </option>
            ))}
          </select>
        </Field>
        {text("successionLaw", t("fam.d.successionLaw", "Law of succession"), { hint: t("about.lawHint", "Filled from religion; change it if needed.") })}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{t("about.will", "Did they leave a will?")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["no", t("about.willNo", "No will")],
              ["yes", t("about.willYes", "Yes, a will")],
              ["unknown", t("q.dontKnow", "I don't know yet")],
            ].map(([v, label]) => (
              <label key={v} className={`focus-within:ring-2 flex cursor-pointer items-center justify-center rounded-xl px-2 py-2.5 text-center text-sm font-medium ring-1 ${f.will === v ? "bg-brand-700 text-white ring-brand-700" : "bg-white ring-line"}`}>
                <input type="radio" name="will" className="sr-only" checked={f.will === v} onChange={() => set("will", v)} />
                {label}
              </label>
            ))}
          </div>
          {f.will === "yes" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("about.willNote", "With a will, banks follow RBI para 11 and may ask for probate. Each claim plan will show what's needed.")}
            </p>
          )}
        </fieldset>
      </Card>

      <StepFooter
        onBack={onBack}
        busy={busy}
        error={error}
        onContinue={() =>
          run(async () => {
            await api("PATCH", `/cases/${caseId}`, f);
            await reload();
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ 2. Family

function HeirHint() {
  const { t } = useTranslation();
  const { view } = useCase();
  const rel = view.case.religion;
  const text =
    rel === "Muslim"
      ? t("family.hintMuslim", "Under Muslim personal law, heirs and their shares depend on the family. List the spouse, children and parents who are alive.")
      : rel && rel !== "Christian" && rel !== "Parsi" && rel !== "Other"
        ? t("family.hintHindu", "Under the Hindu Succession Act, a man's first heirs include his mother, widow, sons and daughters; a woman's include her husband, sons and daughters. List everyone in that group who is alive.")
        : t("family.hintGeneral", "List every legal heir who is alive: usually the spouse, children and parents. The forms need each of them, even those who don't claim.");
  return (
    <p className="flex gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
      <Info className="mt-0.5 size-4 shrink-0" /> {text}
    </p>
  );
}

function FamilyStep({ onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const { view } = useCase();
  const [editing, setEditing] = useState<any>(null);
  const [declarant, setDeclarant] = useState(false);
  const { busy, error, run } = useStepRunner(onNext);
  const people = view.people as any[];
  const heirs = people.filter((p) => !p.isDeclarant);
  const undecided = heirs.filter((p) => !p.isClaimant && !p.isNonClaimantHeir && !p.isNominee);
  const claimants = claimantsOf(view);
  return (
    <div className="space-y-5">
      <StepHeader title={t("family.title", "Family and legal heirs")} sub={t("family.sub", "Name, address, age and relation of each legal heir, then who is claiming. Every form is filled from this list.")} />
      <HeirHint />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("family.heirs", "Legal heirs")}</h2>
          <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setEditing({ ...EMPTY_PERSON })}>
            {t("family.add", "Add a family member")}
          </Button>
        </div>
        {heirs.length === 0 ? (
          <p className="text-sm text-muted">{t("family.none", "No one added yet. Start with yourself.")}</p>
        ) : (
          <PeopleList people={people} onEdit={setEditing} filter={(p) => !p.isDeclarant} />
        )}
        {undecided.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("family.undecided", "Tap the pencil and say whether {{names}} is claiming or not.", { names: undecided.map((p) => p.fullName).join(", ") })}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("family.declTitle", "Someone outside the family")}</h2>
            <p className="text-sm text-muted">{t("family.declSub", "For bank claims without a legal heir certificate, a person who has known the family for years (not related, not claiming) signs a declaration (Annex I-E).")}</p>
          </div>
        </div>
        <PeopleList people={people} onEdit={setEditing} filter={(p) => p.isDeclarant} />
        {!people.some((p) => p.isDeclarant) && (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => { setDeclarant(true); setEditing({ ...EMPTY_PERSON, isDeclarant: true, relation: "Family friend" }); }}>
            {t("family.addDecl", "Add them (optional)")}
          </Button>
        )}
      </section>

      <PersonForm key={editing ? `${editing.personId}-${editing.fullName}` : "closed"} person={editing} declarantOnly={declarant || editing?.isDeclarant} onClose={() => { setEditing(null); setDeclarant(false); }} />
      <StepFooter
        onBack={onBack}
        busy={busy}
        error={error}
        onSkip={claimants.length ? undefined : () => run(undefined, false)}
        onContinue={() =>
          run(async () => {
            if (!claimants.length) throw new Error(t("family.needClaimant", "Mark at least one person as claiming, or tap 'Skip for now'."));
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ 3. Who gets paid

function PayeeCard({ p, onChange }: { p: any; onChange: (x: any) => void }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const [info, setInfo] = useState("");
  useEffect(() => {
    if ((p.bankIfsc || "").length !== 11) return setInfo("");
    let live = true;
    lookupIfsc(p.bankIfsc).then((x) => {
      if (!live || !x) return;
      setInfo(`${x.bank}, ${x.branch}`);
      onChange({ ...p, bankName: p.bankName || x.bank, bankBranch: p.bankBranch || `${x.branch}, ${x.city}` });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.bankIfsc]);
  const ifscWarn = checkIfsc(p.bankIfsc || "");
  const accWarn = checkAccountNumber(p.bankAccountNumber || "");
  const mismatch = p.confirm !== undefined && p.confirm !== "" && p.confirm !== p.bankAccountNumber;
  return (
    <Card className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="font-semibold">{p.fullName}</p>
        <p className="text-sm text-muted">{p.relation}</p>
      </div>
      <Field label="IFSC" warn={ifscWarn ? (hi ? ifscWarn.hi : ifscWarn.en) : null} hint={info ? `✓ ${info}` : t("payee.ifscHint", "On the cheque book or passbook")}>
        <input className={inputCls} maxLength={11} value={p.bankIfsc || ""} onChange={(e) => onChange({ ...p, bankIfsc: e.target.value.toUpperCase().trim() })} />
      </Field>
      <Field label={t("fam.bank", "Bank")}>
        <input className={inputCls} value={p.bankName || ""} onChange={(e) => onChange({ ...p, bankName: e.target.value })} />
      </Field>
      <Field label={t("fam.accNo", "Account number")} warn={accWarn ? (hi ? accWarn.hi : accWarn.en) : null}>
        <input className={inputCls} inputMode="numeric" value={p.bankAccountNumber || ""} onChange={(e) => onChange({ ...p, bankAccountNumber: e.target.value.replace(/\s/g, "") })} />
      </Field>
      <Field label={t("payee.confirm", "Re-enter account number")} warn={mismatch ? t("payee.mismatch", "The two numbers don't match.") : null}>
        <input className={inputCls} inputMode="numeric" value={p.confirm ?? ""} onChange={(e) => onChange({ ...p, confirm: e.target.value.replace(/\s/g, "") })} autoComplete="off" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("payee.branch", "Branch")}>
          <input className={inputCls} value={p.bankBranch || ""} onChange={(e) => onChange({ ...p, bankBranch: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

function PayeeStep({ onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { caseId, view, reload } = useCase();
  const claimants = claimantsOf(view);
  const [rows, setRows] = useState<any[]>(() => claimants.map((p) => ({ ...p, confirm: p.bankAccountNumber || "" })));
  const { busy, error, run } = useStepRunner(onNext);
  if (!claimants.length)
    return (
      <div className="space-y-5">
        <StepHeader title={t("payee.title", "Who gets paid")} sub={t("payee.sub", "The bank pays each claimant into their own account. These go into the payment table of the claim form.")} />
        <Card className="space-y-3 text-sm">
          <p>{t("payee.noClaimants", "First mark who is claiming in the Family step.")}</p>
          <Button variant="secondary" onClick={() => nav(`/cases/${caseId}/setup/family`)}>
            {t("payee.toFamily", "Go to Family")}
          </Button>
        </Card>
        <StepFooter onBack={onBack} onContinue={() => run(undefined, false)} label={t("setup.skip", "Skip for now")} />
      </div>
    );
  return (
    <div className="space-y-5">
      <StepHeader title={t("payee.title", "Who gets paid")} sub={t("payee.sub", "The bank pays each claimant into their own account. These go into the payment table of the claim form.")} />
      {rows.map((p, i) => (
        <PayeeCard key={p.personId} p={p} onChange={(x) => setRows((r) => r.map((y, j) => (j === i ? x : y)))} />
      ))}
      <StepFooter
        onBack={onBack}
        busy={busy}
        error={error}
        onContinue={() =>
          run(async () => {
            for (const p of rows) {
              if (p.bankAccountNumber && p.confirm !== p.bankAccountNumber) throw new Error(t("payee.fixMismatch", "Account numbers for {{name}} don't match.", { name: p.fullName }));
            }
            for (const p of rows) {
              await api("PUT", `/cases/${caseId}/people/${p.personId}`, {
                bankName: p.bankName || "", bankAccountNumber: p.bankAccountNumber || "", bankIfsc: p.bankIfsc || "", bankBranch: p.bankBranch || "",
              });
            }
            await reload();
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ 4. Their bank accounts / 5. Investments

export function AssetRow({ a, onEdit }: { a: any; onEdit: (a: any) => void }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, reload } = useCase();
  const [error, setError] = useState<unknown>(null);
  const st = STATUS[a.status];
  const id = a.identifiers || {};
  const ref = [a.accountType && a.accountType !== "SB" ? a.accountType : "", ...(a.accountNumbers || []), id.folio, id.boId, id.policyNo, id.uan, id.pran, id.cardLast4 && `••••${id.cardLast4}`, id.scheme].filter(Boolean).join(" · ");
  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{a.institution}</p>
          <p className="truncate text-sm text-muted">
            {hi ? ASSET_TYPES[a.assetType]?.hi : ASSET_TYPES[a.assetType]?.en}
            {ref ? ` · ${ref}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="focus-ring rounded-lg p-2.5 text-muted hover:bg-stone-100" onClick={() => onEdit(a)} aria-label={`${t("edit", "Edit")}: ${a.institution}`}>
            <Pencil className="size-4" />
          </button>
          <button
            className="focus-ring rounded-lg p-2.5 text-muted hover:bg-red-50 hover:text-red-700"
            aria-label={`${t("delete", "Remove")}: ${a.institution}`}
            onClick={async () => {
              if (!window.confirm(t("asset.confirmDelete", "Remove {{name}} from the list?", { name: a.institution }))) return;
              try {
                await api("DELETE", `/cases/${caseId}/assets/${a.assetId}`);
                await reload();
              } catch (e) {
                setError(e);
              }
            }}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.amount ? <Chip>{rupees(a.amount)}</Chip> : null}
        {a.nomination && a.nomination !== "unknown" && <Chip tone="brand">{t(`nom.${a.nomination}`, { defaultValue: NOM_EN[a.nomination] ?? a.nomination })}</Chip>}
        {st && <Chip tone={st.tone}>{hi ? st.hi : st.en}</Chip>}
        {a.source && a.source !== "manual" && <Chip tone="blue">{t(`src.${a.source}`, { defaultValue: SRC_EN[a.source] ?? a.source })}</Chip>}
      </div>
      <ErrorNote error={error} />
    </Card>
  );
}

function BanksStep({ onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const { view } = useCase();
  const [cat, setCat] = useState<Category | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const { busy, error, run } = useStepRunner(onNext);
  const banks = (view.assets as any[]).filter((a) => BANKISH.includes(a.assetType));
  return (
    <div className="space-y-5">
      <StepHeader title={t("banks.title", "Their bank accounts")} sub={t("banks.sub", "Add every bank where they had an account, FD or locker. Type it, snap the passbook's first page, or upload a statement.")} />
      <Button icon={<Landmark className="size-4" />} onClick={() => { setEditing(null); setCat(BANK_CATEGORY); }}>
        {t("banks.add", "Add a bank account")}
      </Button>
      {banks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {banks.map((a) => (
            <AssetRow key={a.assetId} a={a} onEdit={(x) => { setEditing(x); setCat(BANK_CATEGORY); }} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{t("banks.none", "No accounts yet.")}</p>
      )}
      <p className="flex gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-sm text-stone-700">
        <Info className="mt-0.5 size-4 shrink-0" />
        {t("banks.tip", "Not sure of every account? At each bank, ask for all accounts, FDs and lockers under their customer ID (CIF). Banks must tell the legal heirs.")}
      </p>
      <AssetForm category={cat} asset={editing} onClose={() => { setCat(null); setEditing(null); }} />
      <StepFooter onBack={onBack} busy={busy} error={error} onContinue={() => run()} />
    </div>
  );
}

function InvestmentsStep({ onNext, onBack }: StepProps) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { view } = useCase();
  const [cat, setCat] = useState<Category | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const { busy, error, run } = useStepRunner(onNext);
  const items = (view.assets as any[]).filter((a) => !BANKISH.includes(a.assetType) || a.accountType === "TD" || a.accountType === "RD");
  const others = items.filter((a) => !BANKISH.includes(a.assetType));
  return (
    <div className="space-y-5">
      <StepHeader title={t("inv.title", "Investments and policies you know of")} sub={t("inv.sub", "Tap what they had. Each asks only for its own number (folio, demat ID, policy, UAN…). Not sure? The next step finds the rest from statements.")} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INVESTMENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setEditing(null); setCat(c); }}
            className={`focus-ring flex items-start gap-2.5 rounded-2xl p-3 text-left ring-1 transition hover:ring-brand-200 ${c.liability ? "bg-stone-50 ring-line" : "bg-white ring-line"}`}
          >
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${c.liability ? "bg-stone-200 text-stone-700" : "bg-brand-50 text-brand-700"}`}>{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{hi ? c.hi : c.en}</span>
              <span className="block text-xs text-muted">{hi ? c.sub.hi : c.sub.en}</span>
            </span>
          </button>
        ))}
      </div>
      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("inv.added", "Added")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map((a) => (
              <AssetRow key={a.assetId} a={a} onEdit={(x) => { setEditing(x); setCat(categoryFor(x)); }} />
            ))}
          </div>
        </section>
      )}
      <EmailFinder />
      <AssetForm category={cat} asset={editing} onClose={() => { setCat(null); setEditing(null); }} />
      <StepFooter onBack={onBack} busy={busy} error={error} onContinue={() => run()} />
    </div>
  );
}

// ------------------------------------------------------------------ 6. Find what nobody knew about

function DiscoverStep({ onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"docs" | "search">("docs");
  const { busy, error, run } = useStepRunner(onNext);
  return (
    <div className="space-y-5">
      <StepHeader
        title={t("disc.title", "Find what nobody knew about")}
        sub={t("disc.sub", "A year of bank statements shows dividends (shares), SIPs (mutual funds), premiums (insurance) and more. Official searches find money dormant for years.")}
      />
      <div className="flex gap-2 rounded-xl bg-stone-100 p-1 text-sm">
        {(["docs", "search"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`focus-ring flex-1 rounded-lg py-2 font-medium ${tab === k ? "bg-white shadow-sm" : "text-muted"}`}>
            {k === "docs" ? t("find.tabDocs", "From your documents") : t("find.tabSearch", "Official searches")}
          </button>
        ))}
      </div>
      {tab === "docs" ? <FromDocuments stay /> : <SearchKit />}
      <StepFooter onBack={onBack} busy={busy} error={error} onContinue={() => run()} />
    </div>
  );
}

// ------------------------------------------------------------------ 7. Choose what to claim

function ChooseStep({ onNext, onBack }: StepProps) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const { busy, error, run } = useStepRunner(onNext);
  const [err, setErr] = useState<unknown>(null);
  const assets = view.assets as any[];
  const have = (view.assets as any[]).map((a) => norm(a.institution)).filter((h) => h.length >= 4);
  const known = (name: string) => {
    const n = norm(name);
    return n.length >= 4 && have.some((h) => h.startsWith(n) || n.startsWith(h));
  };
  const allNew = (view.leads as any[]).filter((l) => (l.status || "new") === "new");
  const newLeads = allNew.filter((l) => !known(l.institution));
  const dupes = allNew.length - newLeads.length;
  const claims = assets.filter((a) => !LIABILITIES.includes(a.assetType));
  const owed = assets.filter((a) => LIABILITIES.includes(a.assetType));
  const total = useMemo(() => claims.filter((a) => a.include !== false).reduce((s, a) => s + Number(a.amount || 0), 0), [claims]);

  async function toggle(a: any) {
    setErr(null);
    try {
      await api("PATCH", `/cases/${caseId}/assets/${a.assetId}`, { include: a.include === false });
      await reload();
    } catch (e) {
      setErr(e);
    }
  }
  async function lead(l: any, add: boolean) {
    setErr(null);
    try {
      await api("POST", `/cases/${caseId}/leads/${l.leadId}/${add ? "confirm" : "dismiss"}`, add ? {} : undefined);
      await reload();
    } catch (e) {
      setErr(e);
    }
  }

  const row = (a: any) => (
    <label key={a.assetId} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
      <input type="checkbox" className="size-5 accent-brand-700" checked={a.include !== false} onChange={() => toggle(a)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.institution}</span>
        <span className="block truncate text-xs text-muted">
          {hi ? ASSET_TYPES[a.assetType]?.hi : ASSET_TYPES[a.assetType]?.en}
          {a.amount ? ` · ${rupees(a.amount)}` : ""}
        </span>
      </span>
    </label>
  );

  return (
    <div className="space-y-5">
      <StepHeader title={t("choose.title", "Choose what to claim")} sub={t("choose.sub", "Tick everything you want to claim. You'll get a step-by-step plan for each: documents, pre-filled forms, where to go, and a tracker.")} />
      <Card tone="brand" className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-800">{t("choose.selected", "Selected to claim")}</p>
          <p className="text-2xl font-semibold text-brand-900">{claims.filter((a) => a.include !== false).length}</p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-brand-800">{t("choose.approx", "Approx. value")}</p>
            <p className="text-2xl font-semibold text-brand-900">{rupees(total)}</p>
          </div>
        )}
      </Card>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("choose.claims", "Assets")}</h2>
        {claims.length ? claims.map(row) : <p className="text-sm text-muted">{t("choose.noneYet", "Nothing added yet. Go back and add their bank accounts and investments.")}</p>}
      </section>
      {newLeads.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{t("choose.leads", "Found in statements, not added yet")}</h2>
          {dupes > 0 && <p className="text-xs text-muted">{t("choose.dupes", "{{n}} more found items are already in your list.", { n: dupes })}</p>}
          {newLeads.map((l) => (
            <div key={l.leadId} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.institution}</span>
                <span className="block truncate text-xs text-muted">{hi ? l.label?.hi : l.label?.en}</span>
              </span>
              <Button size="sm" onClick={() => lead(l, true)}>
                {t("choose.add", "Add")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => lead(l, false)}>
                {t("find.notRelevant", "Not relevant")}
              </Button>
            </div>
          ))}
        </section>
      )}
      {owed.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{t("choose.owed", "Things they owed (to inform, not pay from your pocket)")}</h2>
          {owed.map(row)}
        </section>
      )}
      <ErrorNote error={err} />
      <StepFooter onBack={onBack} busy={busy} error={error} label={t("choose.build", "See my claim plan")} onContinue={() => run()} />
    </div>
  );
}

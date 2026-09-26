import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, FileText, FolderHeart, LogOut, Plus, ScanSearch, TimerReset } from "lucide-react";
import { Button, Card, Chip, Empty, ErrorNote, Field, inputCls, Modal, Spinner, Toggle } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { api } from "../lib/api";
import { brand } from "../lib/config";

const RELATIONS = ["Son", "Daughter", "Wife", "Husband", "Mother", "Father", "Brother", "Sister", "Other"];
type CaseGoal = "find" | "claim" | "follow";

export default function CasesPage({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [cases, setCases] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ cases: any[] }>("GET", "/me/cases").then((r) => setCases(r.cases)).catch(setError);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-2 px-4 sm:px-6">
          <span className="text-lg font-semibold text-brand-800">{i18n.language === "hi" ? brand.appNameHi : brand.appName}</span>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={onSignOut} aria-label={t("signOut", "Sign out")}>
              <span className="hidden sm:inline">{t("signOut", "Sign out")}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("cases.title", "Your family cases")}</h1>
            <p className="mt-1 text-sm text-muted">{email}</p>
          </div>
          <Button className="w-full sm:w-auto" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
            {t("cases.new", "Open a case")}
          </Button>
        </div>
        <ErrorNote error={error} />
        {cases === null && !error && <Spinner label={t("loading", "Loading…")} />}
        {cases?.length === 0 && (
          <Empty
            icon={<FolderHeart className="size-8" />}
            title={t("cases.emptyTitle", "We're sorry for your loss.")}
            text={t("cases.emptyText", "Open a case for the person who passed away. We'll help you find what they left and claim it, one step at a time.")}
            action={<Button onClick={() => setOpen(true)}>{t("cases.new", "Open a case")}</Button>}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {cases?.map((c) => (
            <button key={c.caseId} className="focus-ring min-h-32 rounded-2xl text-left" onClick={() => nav(`/cases/${c.caseId}`)}>
              <Card className="h-full transition hover:bg-stone-50 hover:ring-brand-200">
                <p className="text-xs uppercase tracking-wide text-soft">{t("cases.inMemory", "In memory of")}</p>
                <p className="mt-1 text-lg font-semibold">{c.deceasedName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.dod && <Chip>{t("cases.died", "Died")} {c.dod}</Chip>}
                  <Chip tone="brand">{t(`role.${c.myRole}`, { defaultValue: c.myRole })}</Chip>
                  {c.demo && <Chip tone="amber">{t("cases.sample", "Sample case")}</Chip>}
                  {c.secondsPerDay < 86400 && <Chip tone="amber">{t("cases.demo", "Demo speed")}</Chip>}
                </div>
              </Card>
            </button>
          ))}
        </div>
      </main>
      <NewCaseModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id, goal) => {
          const destination = goal === "find" ? "setup/discover" : goal === "claim" ? "setup/banks" : "claims";
          nav(`/cases/${id}/${destination}`);
        }}
      />
    </div>
  );
}

function NewCaseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string, goal: CaseGoal) => void }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const [goal, setGoal] = useState<CaseGoal>("find");
  const [f, setF] = useState({ deceasedName: "", dod: "", dob: "", relation: "Other", yourName: "", pan: "" });
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (f.pan) localStorage.setItem("pan:" + f.deceasedName.trim().toUpperCase(), f.pan.trim().toUpperCase());
      const c = await api<any>("POST", "/cases", { ...f, secondsPerDay: demo ? 4 : 86400 });
      onCreated(c.caseId, goal);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("cases.new", "Open a case")}>
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{hi ? "आप सबसे पहले क्या करना चाहते हैं?" : "What would you like to do first?"}</legend>
          <div className="space-y-2">
            <GoalChoice
              value="find"
              selected={goal === "find"}
              onSelect={setGoal}
              icon={<ScanSearch className="size-5" />}
              title={hi ? "संपत्ति खोजें" : "Find assets"}
              text={hi ? "ईमेल, स्टेटमेंट या पासबुक से संकेत खोजें।" : "Look for clues in email, statements, or passbooks."}
            />
            <GoalChoice
              value="claim"
              selected={goal === "claim"}
              onSelect={setGoal}
              icon={<FileText className="size-5" />}
              title={hi ? "मालूम संपत्ति का दावा तैयार करें" : "Prepare a known claim"}
              text={hi ? "जिस बैंक खाते या पॉलिसी की जानकारी है, उसे जोड़ें।" : "Add a bank account or policy you already know about."}
            />
            <GoalChoice
              value="follow"
              selected={goal === "follow"}
              onSelect={setGoal}
              icon={<TimerReset className="size-5" />}
              title={hi ? "जमा किए दावे का पीछा करें" : "Follow up on a submitted claim"}
              text={hi ? "पहले दावा दर्ज करें, फिर पावती और तारीखें ट्रैक करें।" : "Record the claim, then track its acknowledgement and dates."}
            />
          </div>
        </fieldset>
        <Field label={t("cases.name", "Full name of the person who passed away")}>
          <input className={inputCls} required value={f.deceasedName} onChange={(e) => setF({ ...f, deceasedName: e.target.value })} />
        </Field>
        <details className="rounded-2xl ring-1 ring-line">
          <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>{hi ? "वैकल्पिक विवरण" : "Optional details"}</span>
            <Plus className="size-4 text-soft" />
          </summary>
          <div className="space-y-4 border-t border-line px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("cases.dod", "Date of death")} hint={t("optional", "Optional")}>
                <input className={inputCls} type="date" value={f.dod} onChange={(e) => setF({ ...f, dod: e.target.value })} />
              </Field>
              <Field label={t("cases.dob", "Date of birth")} hint={t("optional", "Optional")}>
                <input className={inputCls} type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("cases.relation", "You are their")}>
                <select className={inputCls} value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`rel.${r}`, { defaultValue: r })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("cases.yourName", "Your name")} hint={t("optional", "Optional")}>
                <input className={inputCls} value={f.yourName} onChange={(e) => setF({ ...f, yourName: e.target.value })} />
              </Field>
            </div>
            <Field label={t("cases.pan", "Their PAN")} hint={t("cases.panHint", "Optional. Kept only on this device for official searches; we store just the last 4 characters.")}>
              <input className={inputCls} value={f.pan} maxLength={10} onChange={(e) => setF({ ...f, pan: e.target.value })} />
            </Field>
          </div>
        </details>
        <details className="rounded-2xl bg-stone-50 ring-1 ring-line">
          <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center rounded-2xl px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {hi ? "उन्नत परीक्षण सेटिंग" : "Advanced testing settings"}
          </summary>
          <div className="space-y-3 border-t border-line px-4 py-4">
            <p className="text-sm leading-5 text-muted">
              {hi
                ? "डेमो मोड समय सीमा को बहुत तेज़ चलाता है। इसे केवल प्रस्तुति या परीक्षण के लिए चालू करें; असली केस सामान्य गति पर रखें।"
                : "Demo mode makes deadline clocks run extremely fast. Turn it on only for a presentation or test; keep real cases at normal speed."}
            </p>
            <Toggle checked={demo} onChange={setDemo} label={t("cases.demoToggle", "Demo speed: 1 day = 4 seconds (for trying the clock)")} />
          </div>
        </details>
        <ErrorNote error={error} />
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t("cases.create", "Open case")}
        </Button>
      </form>
    </Modal>
  );
}

function GoalChoice({
  value,
  selected,
  onSelect,
  icon,
  title,
  text,
}: {
  value: CaseGoal;
  selected: boolean;
  onSelect: (goal: CaseGoal) => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <label
      className={`relative flex min-h-16 cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition-colors ${
        selected ? "bg-brand-50 ring-brand-200" : "bg-white ring-line hover:bg-stone-50"
      }`}
    >
      <input
        type="radio"
        name="case-goal"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="peer sr-only"
      />
      <span className={`mt-0.5 shrink-0 ${selected ? "text-brand-700" : "text-soft"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted">{text}</span>
      </span>
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-brand-700 bg-brand-700 text-white" : "border-stone-300"
        }`}
        aria-hidden="true"
      >
        {selected && <Check className="size-3" />}
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-3 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
    </label>
  );
}

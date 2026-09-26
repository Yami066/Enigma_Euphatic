import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Briefcase, CreditCard, ExternalLink, FileUp, HandCoins, HeartPulse, Landmark, LineChart, PieChart, PiggyBank,
  ShieldCheck, TrendingUp, Umbrella, Wand2,
} from "lucide-react";
import { api, rupees, uploadDocument } from "../lib/api";
import { ASSET_TYPES, useCase } from "../lib/case";
import { Button, Card, Chip, CopyButton, Empty, ErrorNote, Field, inputCls, Modal, Spinner } from "../components/ui";

const ICONS: Record<string, ReactElement> = {
  shares: <TrendingUp className="size-5" />,
  broker: <LineChart className="size-5" />,
  mutual_fund: <PieChart className="size-5" />,
  life_insurance: <ShieldCheck className="size-5" />,
  health_insurance: <HeartPulse className="size-5" />,
  pmjjby: <Umbrella className="size-5" />,
  pmsby: <Umbrella className="size-5" />,
  govt_scheme: <Landmark className="size-5" />,
  deposit: <PiggyBank className="size-5" />,
  loan: <CreditCard className="size-5" />,
  credit_card: <CreditCard className="size-5" />,
  employer: <Briefcase className="size-5" />,
  pension: <HandCoins className="size-5" />,
};

export default function FindPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"docs" | "search">("docs");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("find.title", "Find what they left")}</h1>
        <p className="text-sm text-muted">
          {t("find.sub", "Recent accounts show up in the family's own papers. Official searches mostly show money dormant for 7–10+ years. We use both.")}
        </p>
      </div>
      <div className="flex gap-2 rounded-xl bg-stone-100 p-1 text-sm">
        {(["docs", "search"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`focus-ring flex-1 rounded-lg py-2 font-medium ${tab === k ? "bg-white shadow-sm" : "text-muted"}`}
          >
            {k === "docs" ? t("find.tabDocs", "From your documents") : t("find.tabSearch", "Official searches")}
          </button>
        ))}
      </div>
      {tab === "docs" ? <FromDocuments /> : <SearchKit />}
    </div>
  );
}

export function FromDocuments({ stay }: { stay?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [summary, setSummary] = useState<any>(null);
  const [filter, setFilter] = useState<"new" | "confirmed" | "dismissed">("new");
  const [adding, setAdding] = useState<any>(null);

  async function scan(file: File | Blob, name?: string) {
    setBusy(true);
    setError(null);
    try {
      const r: any = await uploadDocument(caseId, file, "statement", { filename: name });
      setSummary(r.statement);
      setFilter("new");
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function useSample() {
    const res = await fetch("/samples/sample_statement.pdf");
    await scan(await res.blob(), "sample_statement.pdf");
  }

  const leads = useMemo(() => (view.leads as any[]).filter((l) => (l.status || "new") === filter), [view.leads, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { new: 0, confirmed: 0, dismissed: 0 };
    for (const l of view.leads as any[]) c[l.status || "new"]++;
    return c;
  }, [view.leads]);

  async function dismiss(l: any) {
    await api("POST", `/cases/${caseId}/leads/${l.leadId}/dismiss`);
    await reload();
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FileUp className="size-6" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{t("find.uploadTitle", "Upload a bank statement")}</p>
            <p className="text-sm text-muted">
              {t("find.uploadText", "PDF from net banking, or CSV. 12 months works best. Dividends reveal shares, SIPs reveal mutual funds, premiums reveal insurance.")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])}
            />
            <Button loading={busy} onClick={() => fileRef.current?.click()} icon={<FileUp className="size-4" />}>
              {t("find.choose", "Choose file")}
            </Button>
            <button className="text-sm text-brand-700 underline" onClick={useSample} disabled={busy}>
              {t("find.sample", "Try the sample statement")}
            </button>
          </div>
        </div>
        {busy && (
          <div className="mt-4">
            <Spinner label={t("find.reading", "Reading every transaction…")} />
          </div>
        )}
        {summary && !busy && (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
            {t("find.summary", "Read {{n}} transactions from {{bank}} (a/c ending {{last4}}).", {
              n: summary.txnCount,
              bank: summary.bankName || t("find.yourBank", "your bank"),
              last4: summary.accountLast4 || "----",
            })}
          </p>
        )}
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      </Card>

      {view.leads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["new", "confirmed", "dismissed"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${filter === k ? "bg-brand-700 text-white ring-brand-700" : "bg-white ring-line"}`}
            >
              {k === "new" ? t("find.toReview", "To review") : k === "confirmed" ? t("find.added", "Added") : t("find.dismissed", "Not relevant")} ({counts[k]})
            </button>
          ))}
        </div>
      )}

      {view.leads.length === 0 && !busy && (
        <Empty
          icon={<Wand2 className="size-8" />}
          title={t("find.emptyTitle", "No leads yet")}
          text={t("find.emptyText", "Upload a statement, or try the sample, to see what we can find.")}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {leads.map((l) => (
          <LeadCard key={l.leadId} lead={l} hi={hi} onAdd={() => setAdding(l)} onDismiss={() => dismiss(l)} />
        ))}
      </div>
      <AddLeadModal lead={adding} onClose={() => setAdding(null)} stay={stay} />
    </div>
  );
}

function LeadCard({ lead, hi, onAdd, onDismiss }: { lead: any; hi: boolean; onAdd: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const liability = ["loan", "credit_card"].includes(lead.leadType);
  const highlight = ["pmjjby", "pmsby"].includes(lead.leadType);
  return (
    <Card tone={highlight ? "amber" : "plain"} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${liability ? "bg-stone-100 text-stone-700" : "bg-brand-50 text-brand-700"}`}>
          {ICONS[lead.leadType] ?? <Wand2 className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{lead.institution}</p>
          <p className="text-sm text-muted">{hi ? lead.label?.hi : lead.label?.en}</p>
        </div>
        <Chip tone={lead.confidence === "high" ? "green" : lead.confidence === "medium" ? "amber" : "stone"}>
          {t(`conf.${lead.confidence}`, { defaultValue: lead.confidence })}
        </Chip>
      </div>
      <p className="text-sm">{hi ? lead.reason?.hi : lead.reason?.en}</p>
      {lead.evidence?.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-stone-50 p-2.5 font-mono text-[12px] leading-snug text-stone-700">
          {lead.evidence.slice(0, 3).map((e: any, i: number) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {e.date} · {e.narration}
              </span>
              <span className={e.direction === "credit" ? "text-green-700" : ""}>
                {e.direction === "credit" ? "+" : "−"}
                {rupees(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {lead.nextSteps?.[0] && <p className="text-sm text-brand-900">→ {hi ? lead.nextSteps[0].hi : lead.nextSteps[0].en}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {lead.status === "confirmed" ? (
          <Button size="sm" variant="soft" onClick={() => nav(`../claims/${lead.assetId}`)}>
            {t("find.openClaim", "Open claim")}
          </Button>
        ) : lead.status === "dismissed" ? null : (
          <>
            <Button size="sm" onClick={onAdd}>
              {liability ? t("find.track", "Track this") : t("find.add", "Add as a claim")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t("find.notRelevant", "Not relevant")}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function AddLeadModal({ lead, onClose, stay }: { lead: any; onClose: () => void; stay?: boolean }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const { caseId, reload } = useCase();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (lead) setF({ nomination: "unknown", amount: "", bankType: lead.assetFacts?.bank_type || "", accountNumbers: "", branch: "" });
  }, [lead]);
  if (!lead) return null;
  const bankish = ["term_deposit", "bank_deposit", "locker"].includes(lead.assetType);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: any = {};
      if (bankish) {
        if (f.nomination !== "unknown") body.nomination = f.nomination;
        if (f.amount) body.amount = Number(f.amount);
        if (f.bankType) body.bankType = f.bankType;
        if (f.accountNumbers) body.accountNumbers = f.accountNumbers;
        if (f.branch) body.branch = f.branch;
      }
      const a: any = await api("POST", `/cases/${caseId}/leads/${lead.leadId}/confirm`, body);
      await reload();
      onClose();
      if (!stay) nav(`../claims/${a.assetId}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title={lead.institution}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {hi ? ASSET_TYPES[lead.assetType]?.hi : ASSET_TYPES[lead.assetType]?.en} · {hi ? lead.label?.hi : lead.label?.en}
        </p>
        {bankish ? (
          <>
            <Field label={t("q.nomination", "Was there a nominee, or a joint 'either or survivor' account?")}>
              <select className={inputCls} value={f.nomination} onChange={(e) => setF({ ...f, nomination: e.target.value })}>
                <option value="unknown">{t("q.dontKnow", "I don't know yet")}</option>
                <option value="nominee">{t("q.nominee", "Yes, a nominee")}</option>
                <option value="survivor">{t("q.survivor", "Joint account, either or survivor")}</option>
                <option value="none">{t("q.none", "No nominee")}</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("q.amount", "Approximate amount (₹)")}>
                <input className={inputCls} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} />
              </Field>
              <Field label={t("q.bankType", "Type of bank")}>
                <select className={inputCls} value={f.bankType} onChange={(e) => setF({ ...f, bankType: e.target.value })}>
                  <option value="">{t("q.dontKnow", "I don't know yet")}</option>
                  <option value="commercial">{t("q.commercial", "Commercial bank")}</option>
                  <option value="cooperative">{t("q.coop", "Co-operative bank")}</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("q.accounts", "Account / FD number")} hint={t("optional", "Optional")}>
                <input className={inputCls} value={f.accountNumbers} onChange={(e) => setF({ ...f, accountNumbers: e.target.value })} />
              </Field>
              <Field label={t("q.branch", "Branch")} hint={t("optional", "Optional")}>
                <input className={inputCls} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} />
              </Field>
            </div>
          </>
        ) : (
          <p className="text-sm">{t("find.checklistNote", "We'll add it with a step-by-step checklist for this kind of asset.")}</p>
        )}
        <ErrorNote error={error} />
        <Button className="w-full" onClick={submit} loading={busy}>
          {t("find.addConfirm", "Add and see the route")}
        </Button>
      </div>
    </Modal>
  );
}

export function SearchKit() {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const [kit, setKit] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const [record, setRecord] = useState<any>(null);
  const pan = useMemo(() => {
    try {
      return localStorage.getItem("pan:" + String(view.case.deceasedName).trim().toUpperCase()) || "";
    } catch {
      return "";
    }
  }, [view.case.deceasedName]);

  useEffect(() => {
    api("GET", `/cases/${caseId}/search-kit`).then(setKit).catch(setError);
  }, [caseId, view.leads.length]);

  if (error) return <ErrorNote error={error} />;
  if (!kit) return <Spinner label={t("loading", "Loading…")} />;
  return (
    <div className="space-y-4">
      <Card tone="amber">
        <p className="text-sm">{hi ? kit.note.hi : kit.note.en}</p>
      </Card>
      <Card>
        <p className="mb-2 font-semibold">{t("kit.names", "Try each spelling of the name")}</p>
        <div className="flex flex-wrap gap-2">
          {kit.nameVariants.map((n: string) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-3 pr-1 text-sm">
              {n} <CopyButton value={n} label=" " />
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">PAN:</span>
          {pan ? (
            <>
              <span className="font-mono">{pan}</span> <CopyButton value={pan} />
              <span className="text-xs text-soft">{t("kit.panLocal", "(stored only on this device)")}</span>
            </>
          ) : (
            <span className="text-soft">{t("kit.panMissing", "Not saved on this device. Type it on the portal.")} {kit.panLast4 && `(…${kit.panLast4})`}</span>
          )}
          {view.case.dob && (
            <>
              <span className="text-muted">{t("kit.dob", "Date of birth")}:</span> <span className="font-mono">{view.case.dob}</span>
              <CopyButton value={view.case.dob} />
            </>
          )}
        </div>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        {kit.portals.map((p: any) => (
          <Card key={p.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-soft">{p.owner}</p>
              </div>
              {p.dormant_only && <Chip tone="amber">{t("kit.dormant", "Dormant money")}</Chip>}
            </div>
            <p className="text-sm text-muted">{hi ? p.finds.hi : p.finds.en}</p>
            {Object.entries(p.prefill || {}).map(([k, v]: any) =>
              Array.isArray(v) && v.length ? (
                <div key={k} className="text-sm">
                  <span className="text-soft">{t(`kit.f.${k}`, { defaultValue: k })}: </span>
                  {v.slice(0, 4).join(", ")}
                </div>
              ) : null,
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <a
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                {t("kit.open", "Open portal")} <ExternalLink className="size-3.5" />
              </a>
              <Button size="sm" variant="secondary" onClick={() => setRecord(p)}>
                {t("kit.record", "I found something")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <RecordFinding portal={record} onClose={() => setRecord(null)} onSaved={reload} />
    </div>
  );
}

function RecordFinding({ portal, onClose, onSaved }: { portal: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { caseId } = useCase();
  const [f, setF] = useState({ institution: "", assetType: "shares", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  if (!portal) return null;
  return (
    <Modal open={!!portal} onClose={onClose} title={t("kit.recordTitle", "Record what you found")}>
      <div className="space-y-3">
        <Field label={t("kit.where", "Institution / company")}>
          <input className={inputCls} value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("kit.type", "Type")}>
            <select className={inputCls} value={f.assetType} onChange={(e) => setF({ ...f, assetType: e.target.value })}>
              {["shares", "mutual_fund", "bank_deposit", "term_deposit", "life_insurance", "epf", "govt_scheme", "other"].map((k) => (
                <option key={k} value={k}>
                  {ASSET_TYPES[k].en}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("q.amount", "Approximate amount (₹)")}>
            <input className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        </div>
        <Field label={t("kit.note", "Note")}>
          <input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("POST", `/cases/${caseId}/findings`, { ...f, portal: portal.name, amount: Number(f.amount || 0) });
              onSaved();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("save", "Save")}
        </Button>
      </div>
    </Modal>
  );
}

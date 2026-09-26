import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2, Mail, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { ASSET_TYPES, useCase } from "../lib/case";
import { fmtDate } from "../lib/format";
import { connectGmail, disconnectGmail, gmailAvailable, type GmailAccount, prepareGmail, scanGmail } from "../lib/gmail";
import { type Finding, merge, sameInstitution } from "../lib/gmailScan";
import { Button, Card, Chip, ErrorNote } from "./ui";

const MANUAL = [
  { en: "Mutual fund statements (CAS)", hi: "म्यूचुअल फंड स्टेटमेंट (सीएएस)", q: 'from:(camsonline.com OR kfintech.com OR mfcentral.com) OR subject:("consolidated account statement")' },
  { en: "Demat and shares", hi: "डीमैट और शेयर", q: 'from:(nsdl.co.in OR cdslindia.com OR zerodha.com OR groww.in OR upstox.com OR angelone.in) OR subject:("contract note" OR demat)' },
  { en: "Dividends", hi: "लाभांश", q: 'subject:(dividend) OR "dividend credited"' },
  { en: "Insurance premiums and policies", hi: "बीमा प्रीमियम और पॉलिसी", q: 'subject:("premium receipt" OR "policy document" OR "premium due") OR from:(licindia.in)' },
  { en: "PF, pension and NPS", hi: "पीएफ, पेंशन और एनपीएस", q: 'from:(epfindia.gov.in OR npscra.nsdl.co.in OR proteantech.in) OR subject:(UAN OR PRAN OR "EPF passbook")' },
  { en: "Fixed and recurring deposits", hi: "सावधि और आवर्ती जमा", q: 'subject:("fixed deposit" OR "term deposit" OR "FD receipt" OR "recurring deposit")' },
  { en: "Credit cards and loans", hi: "क्रेडिट कार्ड और ऋण", q: 'subject:("credit card statement" OR "loan statement" OR "EMI")' },
];

type Conn = GmailAccount & {
  status: "scanning" | "done" | "partial" | "error";
  done: number;
  total: number;
  failed: number;
  found: Finding[];
  error?: string;
};

const accountKey = (email: string) => email.trim().toLowerCase();

export function EmailFinder() {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [conns, setConnsState] = useState<Conn[]>([]);
  const connsRef = useRef<Conn[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const expiryTimers = useRef(new Map<string, number>());
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState<string>("");
  const available = gmailAvailable();
  const ownerEmail = String(view?.me?.email ?? "").trim().toLowerCase();
  const scopeKey = `${caseId}|${ownerEmail}`;

  const changeConns = useCallback((fn: (current: Conn[]) => Conn[]) => {
    setConnsState((current) => {
      const next = fn(current);
      connsRef.current = next;
      return next;
    });
  }, []);

  const stopAccountWork = useCallback((email: string) => {
    const key = accountKey(email);
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    const timer = expiryTimers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    expiryTimers.current.delete(key);
  }, []);

  // Connections belong only to this case and signed-in member. Leaving this screen or signing out revokes them.
  useEffect(() => {
    setConnsState([]);
    connsRef.current = [];
    return () => {
      for (const c of connsRef.current) {
        stopAccountWork(c.email);
        disconnectGmail(c);
      }
      connsRef.current = [];
    };
  }, [scopeKey, stopAccountWork]);

  useEffect(() => {
    if (!available) return;
    prepareGmail().then(() => setReady(true)).catch(setError);
  }, [available]);

  const findings = useMemo(() => merge(conns.flatMap((c) => c.found)), [conns]);
  const inList = (f: Finding) => (view.assets as any[]).some((a) => sameInstitution(a.institution, f.institution, a.assetType, f.type));
  const scanning = conns.some((c) => c.status === "scanning");

  const removeAccount = useCallback((email: string, revoke = true) => {
    const key = accountKey(email);
    const existing = connsRef.current.find((c) => accountKey(c.email) === key);
    stopAccountWork(email);
    if (revoke && existing) disconnectGmail(existing);
    changeConns((current) => current.filter((c) => accountKey(c.email) !== key));
  }, [changeConns, stopAccountWork]);

  const scheduleExpiry = useCallback((acc: GmailAccount) => {
    const key = accountKey(acc.email);
    const remaining = acc.expiresAt - Date.now();
    if (remaining <= 0) {
      removeAccount(acc.email);
      setError(new Error(t("gmail.expired", "Gmail access expired. Connect the account again.")));
      return;
    }
    const timer = window.setTimeout(() => {
      removeAccount(acc.email);
      setError(new Error(t("gmail.expired", "Gmail access expired. Connect the account again.")));
    }, remaining);
    expiryTimers.current.set(key, timer);
  }, [removeAccount, t]);

  const runScan = useCallback((acc: GmailAccount) => {
    const key = accountKey(acc.email);
    if (Date.now() >= acc.expiresAt) {
      removeAccount(acc.email);
      setError(new Error(t("gmail.expired", "Gmail access expired. Connect the account again.")));
      return;
    }
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    const update = (patch: Partial<Conn>) => {
      if (controllers.current.get(key) !== controller) return;
      changeConns((current) => current.map((c) => accountKey(c.email) === key ? { ...c, ...patch } : c));
    };
    update({ status: "scanning", done: 0, total: 1, failed: 0, error: undefined });
    scanGmail(acc, ({ done, total, failed }) => update({ done, total, failed }), controller.signal)
      .then((result) => {
        if (controllers.current.get(key) !== controller) return;
        const failed = result.failures.length;
        const allFailed = failed === result.total;
        update({
          status: allFailed ? "error" : failed > 0 ? "partial" : "done",
          found: result.findings,
          done: result.total,
          total: result.total,
          failed,
          error: allFailed ? (result.failures[0]?.message ?? t("gmail.scanFailed", "The Gmail search did not finish.")) : undefined,
        });
      })
      .catch((e) => {
        if (controller.signal.aborted || e?.name === "AbortError") return;
        update({ status: "error", error: e?.message ?? String(e) });
      });
  }, [changeConns, removeAccount, t]);

  async function connect() {
    setError(null);
    setConnecting(true);
    try {
      const acc = await connectGmail();
      const key = accountKey(acc.email);
      const existing = connsRef.current.find((c) => accountKey(c.email) === key);
      // Don't revoke here: Google's revoke removes the whole grant for the account, which would also cut off
      // the live connection (or the token we just received).
      if (existing && existing.expiresAt > Date.now()) {
        setError(new Error(t("gmail.already", "{{email}} is already connected.", { email: acc.email })));
        return;
      }
      if (existing) removeAccount(existing.email, false);
      const conn: Conn = { ...acc, status: "scanning", done: 0, total: 1, failed: 0, found: [] };
      changeConns((current) => [...current.filter((c) => accountKey(c.email) !== key), conn]);
      scheduleExpiry(acc);
      runScan(acc);
    } catch (e) {
      setError(e);
    } finally {
      setConnecting(false);
    }
  }

  async function add(f: Finding) {
    setAdding(f.key);
    setError(null);
    try {
      const evidenceNote = f.needsReview ? "Added after reviewing a possible email match" : `Found from ${f.count} supporting email${f.count === 1 ? "" : "s"}`;
      await api("POST", `/cases/${caseId}/assets`, {
        assetType: f.type,
        institution: f.institution,
        source: "email",
        include: true,
        notes: `${evidenceNote}${f.latest ? `; latest ${f.latest}` : ""}.`,
      });
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setAdding("");
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Mail className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{t("email.title", "Search their email")}</p>
          <p className="text-sm text-muted">
            {available
              ? t("gmail.sub", "Connect a Gmail account that may have received their statements or receipts. You will review every result before adding it.")
              : t("email.sub", "If the family can open their email, these searches find statements and receipts. They open in Gmail on your phone; nothing is sent to us.")}
          </p>
        </div>
      </div>

      {available && (
        <>
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {t("gmail.privacy", "Read-only and processed in this browser. We inspect only sender, subject and date; emails and access tokens never reach our servers. Access is revoked when you disconnect or leave this screen.")}
          </p>

          {conns.length > 0 && (
            <ul className="space-y-2">
              {conns.map((c) => (
                <li key={c.email} className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-line sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {c.status === "scanning" ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-700" /> : c.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-brand-700" /> : c.status === "partial" ? <AlertTriangle className="size-4 shrink-0 text-amber-700" /> : <X className="size-4 shrink-0 text-red-700" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.email}</span>
                      <span className="block text-xs text-muted">
                        {c.status === "scanning"
                          ? t("gmail.scanning", "Searching… {{done}} of {{total}}", { done: c.done, total: c.total })
                          : c.status === "done"
                            ? t("gmail.foundN", "{{n}} things found", { n: c.found.length })
                            : c.status === "partial"
                              ? t("gmail.partial", "{{n}} found; {{failed}} searches could not finish", { n: c.found.length, failed: c.failed })
                              : c.error}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    {(c.status === "partial" || c.status === "error") && c.expiresAt > Date.now() && (
                      <button type="button" className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => runScan(c)}>
                        <RefreshCw className="size-3" /> {t("retry", "Retry")}
                      </button>
                    )}
                    <button type="button" className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-stone-100" onClick={() => removeAccount(c.email)}>
                      {t("gmail.disconnect", "Disconnect")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button variant={conns.length ? "secondary" : "primary"} icon={conns.length ? <Plus className="size-4" /> : <Mail className="size-4" />} disabled={!ready || connecting} loading={connecting || (!ready && !error)} onClick={connect}>
            {conns.length ? t("gmail.addAnother", "Add another Gmail account") : t("gmail.connect", "Connect Gmail (read-only)")}
          </Button>

          {findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("gmail.results", "Review what we found")}</p>
              <ul className="space-y-3">
                {findings.map((f) => {
                  const known = inList(f);
                  const evidence = f.evidence[0];
                  return (
                    <li key={f.key} className="rounded-2xl bg-white p-3.5 ring-1 ring-line sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium">{f.institution}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {hi ? ASSET_TYPES[f.type]?.hi : ASSET_TYPES[f.type]?.en} · {t("gmail.evidenceCount", "{{n}} evidence email(s)", { n: f.count })}
                            {f.latest ? ` · ${t("gmail.latest", "latest {{d}}", { d: fmtDate(f.latest, hi) })}` : ""}
                            {conns.length > 1 ? ` · ${f.accounts.join(", ")}` : ""}
                          </span>
                        </span>
                        {f.needsReview && <Chip tone="amber"><AlertTriangle className="size-3" /> {t("gmail.needsReview", "Needs review")}</Chip>}
                      </div>

                      {evidence && (
                        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">{t("gmail.evidence", "Email evidence")}</p>
                          <p className="mt-0.5 break-words text-sm text-ink">{evidence.subject || t("gmail.noSubject", "(No subject)")}</p>
                          <p className="mt-1 break-all text-xs text-muted">{evidence.from}{evidence.date ? ` · ${fmtDate(evidence.date, hi)}` : ""}</p>
                        </div>
                      )}

                      {f.needsReview && (
                        <p className="mt-2 text-xs text-amber-800">
                          {t("gmail.reviewHint", "The sender matched, but the subject does not prove there was an account or policy. Open the email and confirm it belongs to the deceased before adding.")}
                        </p>
                      )}

                      <div className="mt-3 flex justify-end">
                        {known ? (
                          <Chip tone="green"><Check className="size-3" /> {t("gmail.inList", "In your list")}</Chip>
                        ) : (
                          <Button className="w-full sm:w-auto" size="sm" loading={adding === f.key} onClick={() => add(f)}>
                            {f.needsReview ? t("gmail.addAfterReview", "Add after checking") : t("choose.add", "Add")}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!scanning && conns.length > 0 && conns.every((c) => c.status === "done") && findings.length === 0 && (
            <p className="text-sm text-muted">{t("gmail.none", "Nothing found in these accounts. Try another account, or the searches below.")}</p>
          )}
          <ErrorNote error={error} />
        </>
      )}

      <ManualSearches collapsed={available} />
    </Card>
  );
}

function ManualSearches({ collapsed }: { collapsed: boolean }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const [copied, setCopied] = useState("");
  const list = (
    <ul className="divide-y divide-line">
      {MANUAL.map((s) => (
        <li key={s.q} className="flex flex-wrap items-center gap-2 py-2">
          <span className="min-w-48 flex-1 text-sm">{hi ? s.hi : s.en}</span>
          <a className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50" href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(s.q)}`} target="_blank" rel="noreferrer">
            Gmail <ExternalLink className="size-3" />
          </a>
          <button
            type="button"
            className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(s.q);
                setCopied(s.q);
                setTimeout(() => setCopied(""), 1500);
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            {copied === s.q ? <Check className="size-3" /> : <Copy className="size-3" />} {t("email.copy", "Copy search")}
          </button>
        </li>
      ))}
    </ul>
  );
  if (!collapsed)
    return (
      <>
        {list}
        <p className="text-xs text-soft">{t("email.found", "Found something? Add it above with the matching tile.")}</p>
      </>
    );
  return (
    <details className="rounded-xl bg-stone-50 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-muted">{t("gmail.manual", "Or search by hand (opens your Gmail, works for Outlook too with Copy)")}</summary>
      {list}
    </details>
  );
}

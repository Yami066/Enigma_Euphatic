import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Globe2, Lightbulb, SendHorizonal, ShieldCheck } from "lucide-react";
import { askAssistant } from "../lib/api";
import { useCase } from "../lib/case";
import { Card, Chip, inputCls } from "../components/ui";

type Msg = { role: "user" | "bot"; text: string; citations?: any[]; removed?: any[]; askedAs?: string; mode?: string; fallback?: boolean; note?: string };

export default function AskPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "hi" ? "hi" : "en";
  const { caseId, view } = useCase();
  const [params] = useSearchParams();
  const assetId = params.get("asset") || "";
  const asset = (view.assets as any[]).find((a) => a.assetId === assetId);
  const [mode, setMode] = useState<"explain" | "web">(params.get("mode") === "web" ? "web" : asset ? "explain" : "web");
  const [q, setQ] = useState(params.get("q") || "");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const examples =
    mode === "web"
      ? [
          t("ask.ex1", "How do we claim unpaid dividends from IEPF?"),
          t("ask.ex2", "What is the current RBI Bank Rate?"),
          t("ask.ex3", "How does a nominee claim EPF, pension and EDLI after a death?"),
        ]
      : [
          t("ask.ex4", "Why is this the right route for this account?"),
          t("ask.ex5", "Who should sign the no-objection letter?"),
          t("ask.ex6", "What happens if the bank is late?"),
        ];

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await askAssistant({ caseId, assetId: mode === "explain" ? assetId : "", question: text, mode, lang });
      setMsgs((m) => [...m, { role: "bot", text: r.answer, citations: r.citations, removed: r.removed, askedAs: r.askedAs, mode: r.mode, fallback: r.fallback, note: r.note }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "bot", text: e?.message ?? String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("ask.title", "Ask")}</h1>
        <p className="text-sm text-muted">
          {t("ask.sub", "Explanations: OpenAI gpt-oss-120b in AWS Mumbai. Web search: Amazon Nova 2 Lite with sources. It never changes your routes, dates or amounts.")}
        </p>
      </div>
      <div className="flex gap-2 rounded-xl bg-stone-100 p-1 text-sm">
        <button onClick={() => setMode("explain")} className={`focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium ${mode === "explain" ? "bg-white shadow-sm" : "text-muted"}`}>
          <Lightbulb className="size-4" /> {t("ask.explain", "Explain")}
          {asset && mode === "explain" && <span className="truncate text-xs text-soft">· {asset.institution}</span>}
        </button>
        <button onClick={() => setMode("web")} className={`focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium ${mode === "web" ? "bg-white shadow-sm" : "text-muted"}`}>
          <Globe2 className="size-4" /> {t("ask.web", "Search the web")}
        </button>
      </div>
      {mode === "web" && (
        <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          {t("ask.privacy", "Before searching, we remove names, PAN, Aadhaar, phone and account numbers. Web search runs inside AWS (Nova Web Grounding) and every answer shows its sources.")}
        </p>
      )}

      <div className="flex-1 space-y-3">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {examples.map((e) => (
              <button key={e} onClick={() => send(e)} className="focus-ring rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line hover:ring-brand-200">
                {e}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 px-4 py-2.5 text-white">
              {m.text}
            </div>
          ) : (
            <Card key={i} className="max-w-[92%] space-y-3">
              {m.removed && m.removed.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-brand-700" /> {t("ask.removed", "Removed before sending:")}
                  {[...new Set(m.removed.map((r: any) => r.type))].map((ty) => (
                    <Chip key={ty} tone="brand">
                      {ty}
                    </Chip>
                  ))}
                </div>
              )}
              <Answer text={m.text} />
              {m.fallback && <Chip tone="amber">{t("ask.fallback", "AI unavailable: showing the rule text")}</Chip>}
              {m.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{m.note}</p>}
              {m.citations && m.citations.length > 0 && (
                <div className="space-y-1.5 border-t border-line pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft">{t("ask.sources", "Sources")}</p>
                  {m.citations.map((c: any) => (
                    <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-brand-700 hover:underline">
                      {c.official ? <BadgeCheck className="size-4 shrink-0 text-green-700" /> : <Globe2 className="size-4 shrink-0 text-stone-400" />}
                      <span className="truncate">{c.domain}</span>
                      {c.official ? <Chip tone="green">{t("ask.official", "official")}</Chip> : <Chip>{t("ask.unverified", "check it")}</Chip>}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          ),
        )}
        {busy && <Card className="max-w-[60%] text-sm text-muted pulse-soft">{mode === "web" ? t("ask.searching", "Searching official sources… this can take up to a minute.") : t("ask.thinking", "Thinking…")}</Card>}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send(q);
        }}
        className="sticky bottom-20 flex gap-2 rounded-2xl bg-white p-2 ring-1 ring-line md:bottom-4"
      >
        <input className={inputCls + " border-0"} placeholder={t("ask.placeholder", "Type your question…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" disabled={busy || !q.trim()} className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white disabled:opacity-50" aria-label={t("ask.send", "Send")}>
          <SendHorizonal className="size-5" />
        </button>
      </form>
    </div>
  );
}

/** The model writes light markdown (bold, bullets). Render just that, as text nodes: no HTML injection. */
function Answer({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link)
        return (
          <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-brand-700 underline">
            {link[1]}
          </a>
        );
      return <span key={i}>{part}</span>;
    });
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of (text || "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*([-*•]|\d+[.)])\s+/.test(line);
    const body = line.replace(/^\s*([-*•]|\d+[.)])\s+/, "");
    const last = blocks[blocks.length - 1];
    if (!line.trim()) blocks.push({ list: false, lines: [] });
    else if (last && last.list === bullet && (bullet || last.lines.length)) last.lines.push(body);
    else blocks.push({ list: bullet, lines: [body] });
  }
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}</p>
          ),
        )}
    </div>
  );
}

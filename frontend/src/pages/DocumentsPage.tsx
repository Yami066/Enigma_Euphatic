import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, FileDown, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { api, uploadDocument } from "../lib/api";
import { useCase } from "../lib/case";
import { Button, Card, Chip, ErrorNote } from "../components/ui";

const KINDS: Record<string, { en: string; hi: string }> = {
  statement: { en: "Bank statement", hi: "बैंक स्टेटमेंट" },
  death_certificate: { en: "Death certificate", hi: "मृत्यु प्रमाण पत्र" },
  id_proof: { en: "ID proof", hi: "पहचान पत्र" },
  acknowledgement: { en: "Bank acknowledgement", hi: "बैंक पावती" },
  pack: { en: "Claim pack", hi: "दावा पैक" },
  letter: { en: "Letter to bank", hi: "बैंक को पत्र" },
  ombudsman: { en: "Ombudsman draft", hi: "लोकपाल शिकायत मसौदा" },
  other: { en: "Other", hi: "अन्य" },
};

export default function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const [msg, setMsg] = useState<{ tone: "ok" | "deny"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const dcRef = useRef<HTMLInputElement>(null);

  async function open(d: any, variant: "original" | "preview") {
    setMsg(null);
    try {
      const r: any = await api("GET", `/cases/${caseId}/documents/${d.docId}/url?variant=${variant}`);
      window.open(r.url, "_blank");
    } catch (e: any) {
      setMsg({ tone: "deny", text: e?.message ?? String(e) });
    }
  }

  async function up(file: File, kind: string) {
    setBusy(kind);
    setError(null);
    try {
      const r: any = await uploadDocument(caseId, file, kind);
      if (kind === "id_proof")
        setMsg({ tone: "ok", text: t("docs.masked", "Masked {{n}} Aadhaar number(s). Only the last 4 digits stay visible.", { n: r.maskedCount ?? 0 }) });
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("docs.title", "Documents")}</h1>
        <p className="text-sm text-muted">{t("docs.sub", "Stored privately and encrypted. Links expire after 5 minutes. Aadhaar numbers are masked automatically.")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("docs.idTitle", "ID proof")}</p>
            <p className="text-xs text-muted">{t("docs.idText", "Photo or PDF. We mask the Aadhaar number (Textract + Comprehend).")}</p>
          </div>
          <input ref={idRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && up(e.target.files[0], "id_proof")} />
          <Button className="shrink-0" size="sm" loading={busy === "id_proof"} icon={<Upload className="size-4" />} onClick={() => idRef.current?.click()}>
            {t("docs.upload", "Upload")}
          </Button>
        </Card>
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("docs.dcTitle", "Death certificate")}</p>
            <p className="text-xs text-muted">{t("docs.dcText", "Attached to every claim pack.")}</p>
          </div>
          <input ref={dcRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && up(e.target.files[0], "death_certificate")} />
          <Button className="shrink-0" size="sm" loading={busy === "death_certificate"} icon={<Upload className="size-4" />} onClick={() => dcRef.current?.click()}>
            {t("docs.upload", "Upload")}
          </Button>
        </Card>
      </div>
      <ErrorNote error={error} />
      {msg && (
        <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${msg.tone === "deny" ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
          {msg.tone === "deny" ? <ShieldAlert className="mt-0.5 size-4 shrink-0" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0" />}
          {msg.text}
        </p>
      )}
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {(view.documents as any[]).length === 0 && <li className="p-4 text-sm text-muted">{t("docs.none", "No documents yet.")}</li>}
          {(view.documents as any[]).map((d) => {
            const generated = ["pack", "letter", "ombudsman"].includes(d.kind);
            const stale = d.kind === "pack" && d.status === "stale";
            return (
              <li key={d.docId} className={`flex flex-wrap items-center gap-3 p-4 ${stale ? "bg-stone-50 opacity-75" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.filename}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Chip>{hi ? KINDS[d.kind]?.hi : KINDS[d.kind]?.en}</Chip>
                    {stale && <Chip tone="amber">{t("docs.outdated", "Outdated — make a fresh pack")}</Chip>}
                    {d.hasMaskedCopy && <Chip tone="green">{t("docs.maskedChip", "Masked copy ready")}</Chip>}
                    {d.maskedCount > 0 && <Chip tone="brand">{t("docs.aadhaarN", "{{n}} Aadhaar masked", { n: d.maskedCount })}</Chip>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {d.hasMaskedCopy && (
                    <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} onClick={() => open(d, "preview")}>
                      {t("docs.viewMasked", "Masked copy")}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" disabled={stale} icon={<FileDown className="size-4" />} onClick={() => open(d, generated ? "preview" : "original")}>
                    {generated ? t("docs.open", "Open") : t("docs.original", "Original")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

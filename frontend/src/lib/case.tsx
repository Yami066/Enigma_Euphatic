import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

export type CaseView = any; // shape defined by backend service.case_view

type Ctx = { caseId: string; view: CaseView | null; error: unknown; reload: () => Promise<void> };
const CaseCtx = createContext<Ctx | null>(null);

export function CaseProvider({ caseId, children }: { caseId: string; children: ReactNode }) {
  const [view, setView] = useState<CaseView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setView(await api("GET", `/cases/${caseId}`));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      busy.current = false;
    }
  }, [caseId]);

  useEffect(() => {
    setView(null);
    reload();
  }, [reload]);

  // Live updates while a claim clock is running (fast in demo mode).
  useEffect(() => {
    if (!view) return;
    const active =
      (view.assets ?? []).some((a: any) => ["clock_running", "late"].includes(a.status)) || (view.waitingFor ?? []).length > 0;
    if (!active) return;
    const fast = (view.case?.secondsPerDay ?? 86400) < 86400;
    const id = setInterval(reload, fast ? 3000 : 60000);
    return () => clearInterval(id);
  }, [view, reload]);

  return <CaseCtx.Provider value={{ caseId, view, error, reload }}>{children}</CaseCtx.Provider>;
}

export function useCase() {
  const c = useContext(CaseCtx);
  if (!c) throw new Error("useCase outside CaseProvider");
  return c;
}

export const STATUS: Record<string, { en: string; hi: string; tone: "stone" | "brand" | "amber" | "red" | "green" | "blue" }> = {
  draft: { en: "Draft", hi: "मसौदा", tone: "stone" },
  needs_info: { en: "Needs answers", hi: "जवाब चाहिए", tone: "amber" },
  needs_lawyer: { en: "Needs court papers", hi: "न्यायालय दस्तावेज़ चाहिए", tone: "red" },
  checklist: { en: "Checklist", hi: "सूची", tone: "blue" },
  ready: { en: "Ready for pack", hi: "पैक के लिए तैयार", tone: "brand" },
  pack_ready: { en: "Pack ready", hi: "पैक तैयार", tone: "brand" },
  clock_running: { en: "15-day clock running", hi: "15 दिन की घड़ी चालू", tone: "blue" },
  late: { en: "Bank is late", hi: "बैंक देरी में", tone: "red" },
  escalated: { en: "Escalated to Ombudsman", hi: "लोकपाल तक पहुंचाया", tone: "red" },
  ombudsman_ready: { en: "Ombudsman draft ready", hi: "लोकपाल मसौदा तैयार", tone: "amber" },
  settled: { en: "Settled on time", hi: "समय पर निपटा", tone: "green" },
  settled_late: { en: "Settled late", hi: "देरी से निपटा", tone: "amber" },
  resolved: { en: "Resolved", hi: "सुलझ गया", tone: "green" },
};

export const ASSET_TYPES: Record<string, { en: string; hi: string }> = {
  bank_deposit: { en: "Bank account", hi: "बैंक खाता" },
  term_deposit: { en: "Fixed deposit", hi: "सावधि जमा (एफडी)" },
  locker: { en: "Bank locker", hi: "बैंक लॉकर" },
  safe_custody: { en: "Safe custody articles", hi: "सुरक्षित अभिरक्षा वस्तुएं" },
  epf: { en: "PF / pension (EPFO)", hi: "पीएफ / पेंशन (ईपीएफओ)" },
  life_insurance: { en: "Life insurance", hi: "जीवन बीमा" },
  pmjjby: { en: "PMJJBY cover", hi: "पीएमजेजेबीवाई बीमा" },
  pmsby: { en: "PMSBY cover", hi: "पीएमएसबीवाई बीमा" },
  mutual_fund: { en: "Mutual funds", hi: "म्यूचुअल फंड" },
  shares: { en: "Shares / demat", hi: "शेयर / डीमैट" },
  nps: { en: "NPS pension account", hi: "एनपीएस पेंशन खाता" },
  ppf: { en: "PPF account", hi: "पीपीएफ खाता" },
  post_office: { en: "Post office savings", hi: "डाकघर बचत" },
  govt_scheme: { en: "Govt scheme (APY, SSY…)", hi: "सरकारी योजना (एपीवाई, एसएसवाई…)" },
  credit_card: { en: "Credit card (liability)", hi: "क्रेडिट कार्ड (देनदारी)" },
  loan: { en: "Loan (liability)", hi: "ऋण (देनदारी)" },
  other: { en: "Other", hi: "अन्य" },
};

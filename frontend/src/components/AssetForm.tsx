import { type ReactElement, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Briefcase, Camera, CreditCard, FileUp, Landmark, Lock, Mail, PiggyBank, PieChart, ShieldCheck, TrendingUp, Wallet,
} from "lucide-react";
import { api, uploadDocument } from "../lib/api";
import { useCase } from "../lib/case";
import { lookupIfsc } from "../lib/ifsc";
import { type Check, checkAccountNumber, checkBoId, checkIfsc, checkLast4, checkPran, checkUan } from "../lib/validate";
import { Button, ErrorNote, Field, inputCls, Modal, Spinner } from "./ui";

type Opt = { value: string; en: string; hi: string };
type FieldSpec = {
  key: string; // asset field, or "id.<name>" for identifiers
  en: string;
  hi: string;
  kind?: "text" | "money" | "select" | "date" | "nomination";
  options?: Opt[];
  list?: string;
  check?: (v: string) => Check;
  optional?: boolean;
  when?: (f: Record<string, string>) => boolean;
  numeric?: boolean;
};
export type Category = { id: string; assetType: string; en: string; hi: string; sub: { en: string; hi: string }; icon: ReactElement; fields: FieldSpec[]; liability?: boolean };

const NOMINATION: FieldSpec = { key: "nomination", en: "Was there a nominee?", hi: "क्या नामिती था?", kind: "nomination" };
const NOMINEE_NAME: FieldSpec = { key: "nomineeName", en: "Nominee's name", hi: "नामिती का नाम", optional: true, when: (f) => f.nomination === "nominee" };
const VALUE: FieldSpec = { key: "amount", en: "Approximate value today (₹)", hi: "आज का लगभग मूल्य (₹)", kind: "money", optional: true };

const ACCOUNT_TYPES: Opt[] = [
  { value: "SB", en: "Savings account", hi: "बचत खाता" },
  { value: "CA", en: "Current account", hi: "चालू खाता" },
  { value: "TD", en: "Fixed deposit (FD)", hi: "सावधि जमा (एफडी)" },
  { value: "RD", en: "Recurring deposit (RD)", hi: "आवर्ती जमा (आरडी)" },
  { value: "LOCKER", en: "Safe deposit locker", hi: "लॉकर" },
  { value: "CUSTODY", en: "Articles in safe custody", hi: "सुरक्षित अभिरक्षा में वस्तुएं" },
];
export const typeForAccount = (t: string) =>
  t === "TD" || t === "RD" ? "term_deposit" : t === "LOCKER" ? "locker" : t === "CUSTODY" ? "safe_custody" : "bank_deposit";

const BANK: Category = {
  id: "bank", assetType: "bank_deposit", en: "Bank account, FD or locker", hi: "बैंक खाता, एफडी या लॉकर",
  sub: { en: "Savings, current, FD, RD, locker", hi: "बचत, चालू, एफडी, आरडी, लॉकर" }, icon: <Landmark className="size-5" />,
  fields: [
    { key: "accountType", en: "What is it?", hi: "यह क्या है?", kind: "select", options: ACCOUNT_TYPES },
    { key: "institution", en: "Bank name", hi: "बैंक का नाम", list: "banks" },
    { key: "branch", en: "Branch", hi: "शाखा", optional: true },
    { key: "ifsc", en: "IFSC (fills bank and branch)", hi: "IFSC (बैंक और शाखा भर देता है)", check: checkIfsc, optional: true },
    { key: "accountNumbers", en: "Account / FD number", hi: "खाता / एफडी नंबर", check: checkAccountNumber, optional: true, when: (f) => !["LOCKER", "CUSTODY"].includes(f.accountType), numeric: true },
    { key: "lockerNo", en: "Locker number", hi: "लॉकर नंबर", optional: true, when: (f) => f.accountType === "LOCKER" },
    { key: "maturityDate", en: "Maturity date", hi: "परिपक्वता तिथि", kind: "date", optional: true, when: (f) => ["TD", "RD"].includes(f.accountType) },
    { key: "bankType", en: "Type of bank", hi: "बैंक का प्रकार", kind: "select", optional: true, options: [
      { value: "", en: "I don't know", hi: "पता नहीं" },
      { value: "commercial", en: "Commercial bank (SBI, HDFC…)", hi: "वाणिज्यिक बैंक" },
      { value: "cooperative", en: "Co-operative bank", hi: "सहकारी बैंक" },
    ] },
    { key: "amount", en: "Approximate balance incl. interest (₹)", hi: "ब्याज सहित लगभग शेष (₹)", kind: "money", optional: true, when: (f) => !["LOCKER", "CUSTODY"].includes(f.accountType) },
    NOMINATION,
    NOMINEE_NAME,
  ],
};

export const INVESTMENTS: Category[] = [
  { ...BANK, id: "fd", en: "Fixed / recurring deposit", hi: "सावधि / आवर्ती जमा", sub: { en: "At a bank", hi: "बैंक में" }, icon: <PiggyBank className="size-5" /> },
  { id: "mf", assetType: "mutual_fund", en: "Mutual funds", hi: "म्यूचुअल फंड", sub: { en: "SIPs, folios", hi: "एसआईपी, फोलियो" }, icon: <PieChart className="size-5" />, fields: [
    { key: "institution", en: "Fund house (AMC)", hi: "फंड हाउस (एएमसी)", list: "amcs" },
    { key: "id.folio", en: "Folio number(s)", hi: "फोलियो नंबर", optional: true },
    VALUE, NOMINATION, NOMINEE_NAME,
  ] },
  { id: "shares", assetType: "shares", en: "Shares / demat", hi: "शेयर / डीमैट", sub: { en: "Zerodha, Groww, Upstox…", hi: "ज़ेरोधा, ग्रो, अपस्टॉक्स…" }, icon: <TrendingUp className="size-5" />, fields: [
    { key: "institution", en: "Broker / depository participant", hi: "ब्रोकर / डीपी", list: "brokers" },
    { key: "id.boId", en: "Demat account (BO) ID", hi: "डीमैट खाता (बीओ) आईडी", check: checkBoId, optional: true },
    VALUE, NOMINATION, NOMINEE_NAME,
  ] },
  { id: "insurance", assetType: "life_insurance", en: "Life insurance", hi: "जीवन बीमा", sub: { en: "LIC, private insurers", hi: "एलआईसी, निजी बीमा" }, icon: <ShieldCheck className="size-5" />, fields: [
    { key: "institution", en: "Insurer", hi: "बीमा कंपनी", list: "insurers" },
    { key: "id.policyNo", en: "Policy number", hi: "पॉलिसी नंबर", optional: true },
    { key: "amount", en: "Sum assured (₹)", hi: "बीमा राशि (₹)", kind: "money", optional: true },
    NOMINATION, NOMINEE_NAME,
  ] },
  { id: "epf", assetType: "epf", en: "PF, pension, gratuity", hi: "पीएफ, पेंशन, ग्रेच्युटी", sub: { en: "EPFO and employer dues", hi: "ईपीएफओ और नियोक्ता बकाया" }, icon: <Briefcase className="size-5" />, fields: [
    { key: "institution", en: "Employer", hi: "नियोक्ता" },
    { key: "id.uan", en: "UAN (12 digits)", hi: "यूएएन (12 अंक)", check: checkUan, optional: true, numeric: true },
    VALUE,
  ] },
  { id: "nps", assetType: "nps", en: "NPS", hi: "एनपीएस", sub: { en: "National Pension System", hi: "राष्ट्रीय पेंशन प्रणाली" }, icon: <Wallet className="size-5" />, fields: [
    { key: "institution", en: "Where it was opened (bank / POP)", hi: "कहां खुला (बैंक / पीओपी)" },
    { key: "id.pran", en: "PRAN (12 digits)", hi: "प्रान (12 अंक)", check: checkPran, optional: true, numeric: true },
    VALUE, NOMINATION, NOMINEE_NAME,
  ] },
  { id: "ppf", assetType: "ppf", en: "PPF", hi: "पीपीएफ", sub: { en: "Bank or post office", hi: "बैंक या डाकघर" }, icon: <PiggyBank className="size-5" />, fields: [
    { key: "institution", en: "Bank / post office", hi: "बैंक / डाकघर" },
    { key: "accountNumbers", en: "PPF account number", hi: "पीपीएफ खाता संख्या", optional: true },
    VALUE, NOMINATION, NOMINEE_NAME,
  ] },
  { id: "post", assetType: "post_office", en: "Post office savings", hi: "डाकघर बचत", sub: { en: "NSC, KVP, SCSS, MIS, RD", hi: "एनएससी, केवीपी, एससीएसएस, एमआईएस" }, icon: <Mail className="size-5" />, fields: [
    { key: "id.scheme", en: "Scheme", hi: "योजना", kind: "select", options: ["NSC", "KVP", "SCSS", "MIS", "RD", "TD", "SB"].map((v) => ({ value: v, en: v, hi: v })) },
    { key: "institution", en: "Post office", hi: "डाकघर" },
    { key: "accountNumbers", en: "Account / certificate numbers", hi: "खाता / प्रमाण पत्र संख्या", optional: true },
    VALUE, NOMINATION, NOMINEE_NAME,
  ] },
  { id: "card", assetType: "credit_card", en: "Credit card", hi: "क्रेडिट कार्ड", sub: { en: "To inform and close", hi: "सूचना देने और बंद करने के लिए" }, icon: <CreditCard className="size-5" />, liability: true, fields: [
    { key: "institution", en: "Card issuer", hi: "कार्ड जारीकर्ता", list: "banks" },
    { key: "id.cardLast4", en: "Last 4 digits of the card", hi: "कार्ड के आखिरी 4 अंक", check: checkLast4, optional: true, numeric: true },
    { key: "amount", en: "Outstanding (₹)", hi: "बकाया (₹)", kind: "money", optional: true },
  ] },
  { id: "loan", assetType: "loan", en: "Loan", hi: "ऋण", sub: { en: "Home, car, personal", hi: "होम, कार, पर्सनल" }, icon: <Lock className="size-5" />, liability: true, fields: [
    { key: "institution", en: "Lender", hi: "ऋणदाता", list: "banks" },
    { key: "id.loanType", en: "Kind of loan", hi: "ऋण का प्रकार", optional: true },
    { key: "accountNumbers", en: "Loan account number", hi: "ऋण खाता संख्या", optional: true },
    { key: "amount", en: "Outstanding (₹)", hi: "बकाया (₹)", kind: "money", optional: true },
  ] },
  { id: "other", assetType: "other", en: "Something else", hi: "कुछ और", sub: { en: "Bonds, gold, chit fund…", hi: "बॉन्ड, सोना, चिट फंड…" }, icon: <FileUp className="size-5" />, fields: [
    { key: "institution", en: "Where is it held?", hi: "यह कहां है?" },
    { key: "notes", en: "What is it?", hi: "यह क्या है?", optional: true },
    VALUE,
  ] },
];
export const BANK_CATEGORY = BANK;

export const LISTS: Record<string, string[]> = {
  banks: ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank of India", "Bank of India", "Indian Bank", "Central Bank of India", "Indian Overseas Bank", "UCO Bank", "Bank of Maharashtra", "Punjab & Sind Bank", "IDBI Bank", "IndusInd Bank", "Yes Bank", "IDFC FIRST Bank", "Federal Bank", "South Indian Bank", "Karnataka Bank", "Karur Vysya Bank", "City Union Bank", "RBL Bank", "Bandhan Bank", "AU Small Finance Bank", "India Post Payments Bank", "Saraswat Co-operative Bank", "Cosmos Co-operative Bank"],
  amcs: ["SBI Mutual Fund", "HDFC Mutual Fund", "ICICI Prudential Mutual Fund", "Nippon India Mutual Fund", "Kotak Mahindra Mutual Fund", "Aditya Birla Sun Life Mutual Fund", "Axis Mutual Fund", "UTI Mutual Fund", "DSP Mutual Fund", "Mirae Asset Mutual Fund", "Tata Mutual Fund", "Franklin Templeton Mutual Fund", "Parag Parikh Mutual Fund", "Motilal Oswal Mutual Fund", "Canara Robeco Mutual Fund", "Quant Mutual Fund", "Edelweiss Mutual Fund", "Invesco India Mutual Fund", "LIC Mutual Fund", "Bandhan Mutual Fund"],
  brokers: ["Zerodha", "Groww", "Upstox", "Angel One", "ICICI Direct", "HDFC Securities", "Kotak Securities", "SBI Securities", "Motilal Oswal", "5paisa", "Dhan", "Paytm Money", "Sharekhan", "Axis Direct", "IIFL Securities"],
  insurers: ["Life Insurance Corporation of India (LIC)", "HDFC Life", "ICICI Prudential Life", "SBI Life", "Axis Max Life", "Tata AIA Life", "Bajaj Allianz Life", "Kotak Life", "PNB MetLife", "Aditya Birla Sun Life Insurance", "Canara HSBC Life", "Star Union Dai-ichi Life", "Aegon Life", "Postal Life Insurance"],
};

const COOP = /\b(co-?op|co-?operative|sahakari|sahakara|nagari|urban bank)\b/i;

export function categoryFor(asset: any): Category {
  if (["bank_deposit", "term_deposit", "locker", "safe_custody"].includes(asset?.assetType)) return BANK;
  return INVESTMENTS.find((c) => c.assetType === asset?.assetType) ?? INVESTMENTS[INVESTMENTS.length - 1];
}

function toForm(asset: any, cat: Category): Record<string, string> {
  const f: Record<string, string> = {};
  for (const fs of cat.fields) {
    const v = fs.key.startsWith("id.") ? asset?.identifiers?.[fs.key.slice(3)] : asset?.[fs.key];
    f[fs.key] = Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v);
    if (fs.kind === "select" && !f[fs.key] && fs.options?.length) f[fs.key] = fs.options[0].value; // what the select shows
  }
  if (cat.id === "bank" || cat.id === "fd") {
    const t = asset?.assetType;
    f.accountType = asset?.accountType || (t === "term_deposit" ? "TD" : t === "locker" ? "LOCKER" : t === "safe_custody" ? "CUSTODY" : cat.id === "fd" ? "TD" : "SB");
  }
  f.nomination = f.nomination || (cat.fields.includes(NOMINATION) ? "unknown" : "");
  return f;
}

export function AssetForm({ category, asset, onClose, onSaved }: { category: Category | null; asset?: any; onClose: () => void; onSaved?: (a: any) => void }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, reload } = useCase();
  const [f, setF] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"type" | "passbook" | "statement">("type");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");
  const [ifscInfo, setIfscInfo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (category) {
      setF(toForm(asset, category));
      setTab("type");
      setNote("");
      setIfscInfo("");
      setError(null);
    }
  }, [category, asset]);

  // IFSC fills bank and branch (only the code leaves the device)
  useEffect(() => {
    const code = (f.ifsc || "").toUpperCase();
    if (code.length !== 11) return;
    let live = true;
    lookupIfsc(code).then((info) => {
      if (!live || !info) return;
      setIfscInfo(`${info.bank}, ${info.branch} (${info.city})`);
      setF((x) => ({ ...x, institution: x.institution || info.bank, branch: x.branch || info.branch, bankType: x.bankType || (COOP.test(info.bank) ? "cooperative" : "commercial") }));
    });
    return () => {
      live = false;
    };
  }, [f.ifsc]);

  if (!category) return null;
  const isBank = category.id === "bank" || category.id === "fd";
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function readPhoto(file: File, kind: "passbook" | "statement") {
    setReading(true);
    setError(null);
    try {
      const r: any = await uploadDocument(caseId, file, kind);
      if (kind === "passbook") {
        const got = r.fields || {};
        setF((x) => ({
          ...x,
          institution: got.institution || x.institution,
          branch: got.branch || x.branch,
          ifsc: got.ifsc || x.ifsc,
          accountNumbers: got.accountNumber || x.accountNumbers,
          bankType: got.bankType || x.bankType,
          nomination: got.nomination || x.nomination,
          nomineeName: got.nomineeName || x.nomineeName,
          accountType: got.accountType || x.accountType,
        }));
        const n = Object.keys(got).length;
        setNote(n ? t("asset.readOk", "We read {{n}} details from the photo. Please check each one.", { n }) : t("asset.readNone", "We couldn't read details from this photo. Please type them."));
      } else {
        const st = r.statement || {};
        setF((x) => ({ ...x, institution: st.bankName || x.institution, bankType: st.bankType || x.bankType, accountNumbers: x.accountNumbers || (st.accountLast4 ? `XXXX${st.accountLast4}` : "") }));
        setNote(t("asset.stmtOk", "Read {{n}} transactions. We also looked for other assets in it; you'll see them in 'Find'. Please complete the account details.", { n: st.txnCount ?? 0 }));
      }
      setTab("type");
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: any = { identifiers: { ...(asset?.identifiers || {}) }, source: asset?.source || "manual", include: asset?.include ?? true };
      for (const fs of category!.fields) {
        if (fs.when && !fs.when(f)) continue;
        const v = (f[fs.key] ?? "").trim();
        if (fs.key.startsWith("id.")) body.identifiers[fs.key.slice(3)] = v;
        else if (fs.kind === "money") body.amount = v ? Number(v.replace(/[^\d.]/g, "")) : "";
        else if (fs.key === "nomination") {
          if (v && v !== "unknown") body.nomination = v;
          else if (asset) body.nomination = "unknown";
        } else body[fs.key] = v;
      }
      if (isBank) {
        body.assetType = typeForAccount(f.accountType);
        body.accountType = f.accountType;
        if (!body.bankType) delete body.bankType;
        if (!body.bankType && COOP.test(body.institution || "")) body.bankType = "cooperative";
      } else body.assetType = category!.assetType;
      if (!body.institution) throw new Error(t("asset.needName", "Please enter the name of the bank or company."));
      const saved: any = asset
        ? await api("PATCH", `/cases/${caseId}/assets/${asset.assetId}`, body)
        : await api("POST", `/cases/${caseId}/assets`, body);
      await reload();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!category} onClose={onClose} title={asset ? asset.institution : hi ? category.hi : category.en}>
      <div className="space-y-4">
        {isBank && !asset && (
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 text-sm">
            {([
              ["type", t("asset.typeIt", "Type it")],
              ["passbook", t("asset.passbook", "Passbook photo")],
              ["statement", t("asset.statement", "Statement")],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`focus-ring rounded-lg py-2 font-medium ${tab === k ? "bg-white shadow-sm" : "text-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tab !== "type" ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-line p-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              {tab === "passbook" ? <Camera className="size-6" /> : <FileUp className="size-6" />}
            </div>
            <p className="text-sm text-muted">
              {tab === "passbook"
                ? t("asset.passbookText", "Take a clear photo of the passbook's first page (or an FD receipt). Amazon Textract reads the bank, branch, IFSC and account number; any Aadhaar number is masked.")
                : t("asset.statementText", "Upload a statement PDF or CSV. We fill in the bank and also look for shares, funds and insurance hidden in the transactions.")}
            </p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={tab === "passbook" ? "image/*,.pdf" : ".pdf,.csv,image/*"}
              capture={tab === "passbook" ? "environment" : undefined}
              onChange={(e) => e.target.files?.[0] && readPhoto(e.target.files[0], tab as "passbook" | "statement")}
            />
            {reading ? (
              <Spinner label={t("asset.reading", "Reading…")} />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button onClick={() => fileRef.current?.click()} icon={tab === "passbook" ? <Camera className="size-4" /> : <FileUp className="size-4" />}>
                  {tab === "passbook" ? t("asset.takePhoto", "Take or choose a photo") : t("asset.chooseFile", "Choose file")}
                </Button>
                <button
                  type="button"
                  className="text-sm text-brand-700 underline"
                  onClick={async () => {
                    const name = tab === "passbook" ? "sample_passbook.jpg" : "sample_statement.pdf";
                    const blob = await (await fetch(`/samples/${name}`)).blob();
                    await readPhoto(new File([blob], name, { type: blob.type }), tab as "passbook" | "statement");
                  }}
                >
                  {tab === "passbook" ? t("asset.samplePassbook", "Try a sample passbook") : t("find.sample", "Try the sample statement")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {note && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">{note}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {category.fields.map((fs) => {
                if (fs.when && !fs.when(f)) return null;
                const label = (hi ? fs.hi : fs.en) + (fs.optional ? "" : " *");
                const v = f[fs.key] ?? "";
                const c = fs.check?.(v);
                const warn = c ? (hi ? c.hi : c.en) : fs.key === "ifsc" && ifscInfo ? null : null;
                const full = fs.kind === "nomination" || fs.key === "institution" || fs.key === "accountType";
                return (
                  <div key={fs.key} className={full ? "sm:col-span-2" : ""}>
                    <Field label={label} warn={warn} hint={fs.key === "ifsc" && ifscInfo ? `✓ ${ifscInfo}` : undefined}>
                      {fs.kind === "select" ? (
                        <select className={inputCls} value={v} onChange={(e) => set(fs.key, e.target.value)}>
                          {fs.options!.map((o) => (
                            <option key={o.value} value={o.value}>
                              {hi ? o.hi : o.en}
                            </option>
                          ))}
                        </select>
                      ) : fs.kind === "nomination" ? (
                        <select className={inputCls} value={v || "unknown"} onChange={(e) => set(fs.key, e.target.value)}>
                          <option value="unknown">{t("q.dontKnow", "I don't know yet")}</option>
                          <option value="nominee">{t("q.nominee", "Yes, a nominee")}</option>
                          <option value="survivor">{t("q.survivor", "Joint account, either or survivor")}</option>
                          <option value="none">{t("q.none", "No nominee")}</option>
                        </select>
                      ) : (
                        <input
                          className={inputCls}
                          type={fs.kind === "date" ? "date" : "text"}
                          inputMode={fs.kind === "money" || fs.numeric ? "numeric" : undefined}
                          list={fs.list ? `list-${fs.list}` : undefined}
                          value={v}
                          maxLength={fs.key === "ifsc" ? 11 : undefined}
                          onChange={(e) => set(fs.key, fs.key === "ifsc" ? e.target.value.toUpperCase().trim() : fs.kind === "money" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>
            {Object.entries(LISTS).map(([k, items]) => (
              <datalist key={k} id={`list-${k}`}>
                {items.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            ))}
            {category.liability && (
              <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-700">
                {t("asset.liabilityNote", "This is something they owed. We'll show how to inform the lender and check for insurance; heirs don't pay it from their own pocket.")}
              </p>
            )}
            <ErrorNote error={error} />
            <Button className="w-full" onClick={save} loading={busy}>
              {asset ? t("save", "Save") : t("asset.add", "Add to the list")}
            </Button>
          </>
        )}
        {tab !== "type" && <ErrorNote error={error} />}
      </div>
    </Modal>
  );
}

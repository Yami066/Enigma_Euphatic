import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewKey =
  | "landing"
  | "dashboard"
  | "intake"
  | "docDiscovery"
  | "emailDiscovery"
  | "routing"
  | "paperwork"
  | "followup"
  | "sharedAccess"
  | "settings";

export type AssetStatus = "on-track" | "attention" | "overdue" | "neutral";

export interface Asset {
  assetId: string;
  assetType: "bank_deposit" | "term_deposit" | "locker" | "life_insurance" | "shares" | "pension" | "mutual_fund";
  institution: string;
  accountNumber: string;
  amount: number;
  nomination: "nominee" | "survivor" | "none";
  nomineeName?: string;
  routeTitle: string;
  routeCode: "NOMINEE" | "SIMPLIFIED" | "ABOVE_THRESHOLD" | "LOCKER_SIMPLIFIED" | "INSURANCE_CLAIM" | "DEMAT_TRANSMISSION";
  rbiCitation: string;
  status: AssetStatus;
  docsCompleteDate?: string;
  deadlineDays: number;
  daysRemaining: number;
  branch?: string;
  ifsc?: string;
  confidence?: number;
  discoveredVia?: "manual" | "statement_ocr" | "gmail_scan" | "udgam_search";
}

export interface CaseData {
  caseId: string;
  deceased: {
    fullName: string;
    dateOfDeath: string;
    placeOfDeath: string;
    deathCertNo: string;
    pan: string;
    religion: string;
  };
  claimant: {
    fullName: string;
    relation: string;
    email: string;
    phone: string;
    bankName: string;
    bankAccountNumber: string;
    ifsc: string;
  };
  heirs: Array<{
    personId: string;
    fullName: string;
    relation: string;
    role: "Claimant" | "Nominee" | "Non-claimant (NOC)" | "Declarant";
    email?: string;
    phone?: string;
  }>;
  assets: Asset[];
}

const DEFAULT_CASE_DATA: CaseData = {
  caseId: "AL-2026-0849",
  deceased: {
    fullName: "Late Rameshwar Prasad Sharma",
    dateOfDeath: "2026-01-14",
    placeOfDeath: "New Delhi",
    deathCertNo: "NDMC/DC/2026/01492",
    pan: "ABCPS1234F",
    religion: "Hindu",
  },
  claimant: {
    fullName: "Arjun Sharma",
    relation: "Son",
    email: "arjun.sharma@example.com",
    phone: "+91 98765 43210",
    bankName: "HDFC Bank",
    bankAccountNumber: "50100234567890",
    ifsc: "HDFC0000003",
  },
  heirs: [
    { personId: "p_1", fullName: "Arjun Sharma", relation: "Son", role: "Claimant", email: "arjun.sharma@example.com", phone: "+91 98765 43210" },
    { personId: "p_2", fullName: "Sunita Sharma", relation: "Spouse", role: "Nominee", phone: "+91 98111 22334" },
    { personId: "p_3", fullName: "Pooja Sharma", relation: "Daughter", role: "Non-claimant (NOC)", email: "pooja.sharma@example.com" },
  ],
  assets: [
    {
      assetId: "ast_sbi_fd",
      assetType: "term_deposit",
      institution: "State Bank of India",
      accountNumber: "38921004419",
      amount: 1250000,
      nomination: "nominee",
      nomineeName: "Arjun Sharma",
      routeTitle: "Nominee Settlement (Para 28)",
      routeCode: "NOMINEE",
      rbiCitation: "RBI Master Directions 2025 para 28: Mandatory settlement to registered nominee within 15 calendar days of receiving full documentation without succession certificate.",
      status: "on-track",
      docsCompleteDate: "2026-03-16",
      deadlineDays: 15,
      daysRemaining: 4,
      branch: "Parliament Street, New Delhi",
      ifsc: "SBIN0000691",
      confidence: 100,
      discoveredVia: "manual",
    },
    {
      assetId: "ast_hdfc_sb",
      assetType: "bank_deposit",
      institution: "HDFC Bank",
      accountNumber: "50100982348921",
      amount: 485000,
      nomination: "none",
      routeTitle: "Simplified Settlement Without Legal Representation (Para 30)",
      routeCode: "SIMPLIFIED",
      rbiCitation: "RBI Master Directions 2025 para 30: For claims below bank board threshold (up to ₹5 Lakhs), settlement on Annex I-B claim form, Annex I-C affidavit, and Annex I-D NOC from non-claiming heirs.",
      status: "attention",
      docsCompleteDate: "2026-03-12",
      deadlineDays: 15,
      daysRemaining: 1,
      branch: "Connaught Place, New Delhi",
      ifsc: "HDFC0000003",
      confidence: 96,
      discoveredVia: "statement_ocr",
    },
    {
      assetId: "ast_pnb_sb",
      assetType: "bank_deposit",
      institution: "Punjab National Bank",
      accountNumber: "01520001009871",
      amount: 320000,
      nomination: "none",
      routeTitle: "Simplified Settlement with Delay Notice (Para 33)",
      routeCode: "SIMPLIFIED",
      rbiCitation: "RBI Master Directions 2025 para 31 & 33: 15 calendar day statutory limit exceeded. Penal interest at Bank Rate + 4% p.a. is due from day 16.",
      status: "overdue",
      docsCompleteDate: "2026-02-20",
      deadlineDays: 15,
      daysRemaining: -19,
      branch: "Karol Bagh, New Delhi",
      ifsc: "PUNB0015200",
      confidence: 92,
      discoveredVia: "udgam_search",
    },
    {
      assetId: "ast_icici_locker",
      assetType: "locker",
      institution: "ICICI Bank",
      accountNumber: "LKR-402",
      amount: 0,
      nomination: "nominee",
      nomineeName: "Sunita Sharma",
      routeTitle: "Locker Access & Inventory Protocol (Para 35)",
      routeCode: "LOCKER_SIMPLIFIED",
      rbiCitation: "RBI Directions 2025 para 35: Access granted to nominee with bank inventory officer in presence of independent witness.",
      status: "neutral",
      deadlineDays: 15,
      daysRemaining: 15,
      branch: "Barakhamba Road, New Delhi",
      ifsc: "ICIC0000007",
      confidence: 88,
      discoveredVia: "statement_ocr",
    },
    {
      assetId: "ast_lic_jeevan",
      assetType: "life_insurance",
      institution: "Life Insurance Corporation of India (LIC)",
      accountNumber: "112349012",
      amount: 2500000,
      nomination: "nominee",
      nomineeName: "Sunita Sharma",
      routeTitle: "Death Claim - Form 3783 (IRDAI Timelines)",
      routeCode: "INSURANCE_CLAIM",
      rbiCitation: "IRDAI Protection of Policyholders' Interests Regulations: 30 days mandatory settlement timeline from receipt of all requirements.",
      status: "on-track",
      docsCompleteDate: "2026-03-18",
      deadlineDays: 30,
      daysRemaining: 21,
      branch: "DO-1, New Delhi",
      confidence: 98,
      discoveredVia: "gmail_scan",
    },
    {
      assetId: "ast_epfo_pf",
      assetType: "pension",
      institution: "Employees' Provident Fund Organisation (EPFO)",
      accountNumber: "100982341102",
      amount: 720000,
      nomination: "nominee",
      nomineeName: "Sunita Sharma",
      routeTitle: "Composite Claim Form (Death) & EDLI Benefits",
      routeCode: "INSURANCE_CLAIM",
      rbiCitation: "EPF Scheme 1952 para 70: Priority settlement within 20 days. Up to ₹7 Lakhs insurance cover under EDLI Scheme 1976.",
      status: "attention",
      docsCompleteDate: "2026-03-14",
      deadlineDays: 20,
      daysRemaining: 7,
      branch: "Bhikaji Cama Place, Regional Office",
      confidence: 94,
      discoveredVia: "gmail_scan",
    },
    {
      assetId: "ast_zerodha_shares",
      assetType: "shares",
      institution: "Zerodha Broking Ltd / CDSL",
      accountNumber: "1208160012345678",
      amount: 1840000,
      nomination: "nominee",
      nomineeName: "Arjun Sharma",
      routeTitle: "Transmission of Securities (SEBI Master Circular)",
      routeCode: "DEMAT_TRANSMISSION",
      rbiCitation: "SEBI Master Circular on Transmission of Securities: Fast-track transmission to registered nominee within 7 days upon receipt of Client Master List & notarized Death Certificate.",
      status: "neutral",
      deadlineDays: 7,
      daysRemaining: 7,
      confidence: 99,
      discoveredVia: "gmail_scan",
    },
  ],
};

const STRINGS: Record<"en" | "hi", Record<string, string>> = {
  en: {
    "brand.name": "AfterLoss",
    "brand.tagline": "Empathetic, authoritative estate settlement under RBI Directions 2025.",
    "compliance.tag": "RBI Directions 2025",
    "nav.landing": "Welcome",
    "nav.dashboard": "Case Overview",
    "nav.intake": "Guided Intake",
    "nav.docDiscovery": "Document OCR",
    "nav.emailDiscovery": "Inbox Scan",
    "nav.routing": "Legal Routing",
    "nav.paperwork": "Official Packs",
    "nav.followup": "Statutory Clocks",
    "nav.sharedAccess": "Family Access",
    "nav.settings": "Settings",
    "btn.askAI": "Ask Legal AI",
    "btn.invite": "Invite Family",
    "btn.signIn": "Sign In",
    "btn.signOut": "Sign Out",
    "badge.onTrack": "On Track",
    "badge.attention": "Attention Needed",
    "badge.overdue": "Overdue (Penal Interest)",
    "badge.neutral": "Not Initiated",
  },
  hi: {
    "brand.name": "AfterLoss",
    "brand.tagline": "आरबीआई दिशानिर्देश 2025 के तहत पारिवारिक संपत्ति दावा और निपटान प्रणाली।",
    "compliance.tag": "आरबीआई दिशानिर्देश 2025",
    "nav.landing": "स्वागत",
    "nav.dashboard": "केस अवलोकन",
    "nav.intake": "मार्गदर्शित प्रविष्टि",
    "nav.docDiscovery": "दस्तावेज़ स्कैन",
    "nav.emailDiscovery": "ईमेल खोज",
    "nav.routing": "कानूनी मार्ग",
    "nav.paperwork": "आधिकारिक फॉर्म",
    "nav.followup": "समय-सीमा ट्रैकर",
    "nav.sharedAccess": "पारिवारिक पहुंच",
    "nav.settings": "सेटिंग्स",
    "btn.askAI": "कानूनी सहायक से पूछें",
    "btn.invite": "परिवार को जोड़ें",
    "btn.signIn": "साइन इन करें",
    "btn.signOut": "साइन आउट",
    "badge.onTrack": "समय पर",
    "badge.attention": "ध्यान दें",
    "badge.overdue": "अवधि समाप्त (दंडात्मक ब्याज)",
    "badge.neutral": "प्रारंभ नहीं",
  },
};

export interface AppContextType {
  currentView: ViewKey;
  setCurrentView: (view: ViewKey) => void;
  lang: "en" | "hi";
  setLang: (lang: "en" | "hi") => void;
  t: (key: string, fallback?: string) => string;
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  caseData: CaseData;
  setCaseData: React.Dispatch<React.SetStateAction<CaseData>>;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  inviteModalOpen: boolean;
  setInviteModalOpen: (open: boolean) => void;
  activeClaimPackModal: Asset | null;
  setActiveClaimPackModal: (asset: Asset | null) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  addAsset: (asset: Partial<Asset>) => void;
  updateAsset: (assetId: string, patch: Partial<Asset>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<ViewKey>("dashboard");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [caseData, setCaseData] = useState<CaseData>(() => {
    const saved = localStorage.getItem("afterloss_case_data");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_CASE_DATA;
      }
    }
    return DEFAULT_CASE_DATA;
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activeClaimPackModal, setActiveClaimPackModal] = useState<Asset | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("afterloss_case_data", JSON.stringify(caseData));
  }, [caseData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3200);
  };

  const t = (key: string, fallback?: string): string => {
    return STRINGS[lang]?.[key] ?? fallback ?? key;
  };

  const addAsset = (newAst: Partial<Asset>) => {
    const id = "ast_" + Math.random().toString(36).substring(2, 9);
    const asset: Asset = {
      assetId: id,
      assetType: newAst.assetType || "bank_deposit",
      institution: newAst.institution || "Bank Account",
      accountNumber: newAst.accountNumber || "XXXX",
      amount: newAst.amount || 0,
      nomination: newAst.nomination || "none",
      nomineeName: newAst.nomineeName,
      routeTitle: newAst.routeTitle || "Simplified Settlement",
      routeCode: newAst.routeCode || "SIMPLIFIED",
      rbiCitation: newAst.rbiCitation || "RBI Directions 2025 para 30",
      status: newAst.status || "neutral",
      deadlineDays: newAst.deadlineDays || 15,
      daysRemaining: newAst.daysRemaining ?? 15,
      branch: newAst.branch,
      ifsc: newAst.ifsc,
      confidence: newAst.confidence || 100,
      discoveredVia: newAst.discoveredVia || "manual",
    };
    setCaseData((prev) => ({
      ...prev,
      assets: [asset, ...prev.assets],
    }));
    showToast(`Added ${asset.institution} to active claims.`);
  };

  const updateAsset = (assetId: string, patch: Partial<Asset>) => {
    setCaseData((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.assetId === assetId ? { ...a, ...patch } : a)),
    }));
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView,
        lang,
        setLang,
        t,
        isAuthenticated,
        setIsAuthenticated,
        caseData,
        setCaseData,
        authModalOpen,
        setAuthModalOpen,
        assistantOpen,
        setAssistantOpen,
        inviteModalOpen,
        setInviteModalOpen,
        activeClaimPackModal,
        setActiveClaimPackModal,
        toastMessage,
        showToast,
        addAsset,
        updateAsset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}

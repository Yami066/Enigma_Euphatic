import { useState, type ReactNode } from "react";
import {
  Bot,
  Building,
  CheckCircle,
  Clock,
  Compass,
  FileCheck,
  FileSearch,
  FileText,
  Home,
  Languages,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp, type ViewKey } from "../../context/AppContext";
import { AIAssistantDrawer } from "./AIAssistantDrawer";
import { InviteModal } from "./InviteModal";
import { OfficialFormPreviewModal } from "./OfficialFormPreviewModal";
import { SignInModal } from "./SignInModal";
import { Toast } from "./Toast";

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  const {
    currentView,
    setCurrentView,
    lang,
    setLang,
    t,
    isAuthenticated,
    setIsAuthenticated,
    caseData,
    setAuthModalOpen,
    setAssistantOpen,
    setInviteModalOpen,
    activeClaimPackModal,
    setActiveClaimPackModal,
    showToast,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{
    key: ViewKey;
    labelEn: string;
    labelHi: string;
    icon: typeof Home;
    badge?: string;
  }> = [
    { key: "dashboard", labelEn: "Case Overview", labelHi: "केस अवलोकन", icon: LayoutDashboard },
    { key: "intake", labelEn: "Guided Intake", labelHi: "मार्गदर्शित प्रविष्टि", icon: Compass },
    { key: "docDiscovery", labelEn: "Document OCR", labelHi: "दस्तावेज़ स्कैन", icon: FileSearch },
    { key: "emailDiscovery", labelEn: "Inbox Scan", labelHi: "ईमेल खोज", icon: Mail },
    { key: "routing", labelEn: "Legal Routing", labelHi: "कानूनी मार्ग", icon: Scale },
    { key: "paperwork", labelEn: "Official Packs", labelHi: "आधिकारिक फॉर्म", icon: FileCheck },
    { key: "followup", labelEn: "Statutory Clocks", labelHi: "समय-सीमा ट्रैकर", icon: Clock },
    { key: "sharedAccess", labelEn: "Family Access", labelHi: "पारिवारिक पहुंच", icon: Users },
    { key: "settings", labelEn: "Settings", labelHi: "सेटिंग्स", icon: Settings },
  ];

  const handleNavClick = (key: ViewKey) => {
    setCurrentView(key);
    setMobileMenuOpen(false);
  };

  const getPageTitle = (key: ViewKey): string => {
    const item = navItems.find((n) => n.key === key);
    if (!item) return key === "landing" ? "Euphatic" : "Dashboard";
    return lang === "hi" ? item.labelHi : item.labelEn;
  };

  return (
    <div className="flex min-h-screen bg-[#FFFDFB] text-[#4F3F38]">
      {/* ================= Fixed Left Sidebar (240px) ================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col justify-between bg-[#4F3F38] text-white md:flex">
        <div>
          {/* Logo & Product Brand Header */}
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#3a2d27] font-mono text-base font-bold text-[#FFB077] shadow-inner">
              AL
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white">Euphatic</span>
              </div>
              <span className="block text-[11px] font-medium text-[#ACA986]">
                Estate Settlement
              </span>
            </div>
          </div>

          {/* Compliance Tag */}
          <div className="mx-4 mt-3 rounded-full bg-white/5 px-3 py-1 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FFB077]">
              <ShieldCheck className="size-3 text-[#B7C497]" />
              RBI Directions 2025
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="mt-4 space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item.key)}
                  className={`group relative flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-xs font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-white/10 text-white font-semibold"
                      : "text-[#EDE9E2]/80 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {/* Peach Active Left Indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#FFB077]" />
                  )}
                  <Icon
                    className={`size-4 shrink-0 transition-colors ${
                      isActive ? "text-[#FFB077]" : "text-[#ACA986] group-hover:text-white"
                    }`}
                  />
                  <span className="truncate">{lang === "hi" ? item.labelHi : item.labelEn}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Case & Auth status */}
        <div className="border-t border-white/10 p-4">
          <div className="mb-2 rounded-[8px] bg-white/5 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-[#ACA986]">Current Case</span>
            <span className="font-mono text-xs font-bold text-white">{caseData.caseId}</span>
            <p className="truncate text-[11px] text-[#EDE9E2]/70">{caseData.deceased.fullName}</p>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center justify-between pt-1">
              <span className="truncate text-xs text-[#EDE9E2]/80">
                {caseData.claimant.fullName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsAuthenticated(false);
                  showToast("Signed out from workspace.");
                }}
                className="text-[#ACA986] hover:text-[#FFB077]"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="btn-primary-sm w-full text-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* ================= Main Area (Offset by 240px on md+) ================= */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-[240px]">
        {/* TopBar (Sticky, ~60px) */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#EDE9E2] bg-[#FFFDFB]/95 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-1.5 text-[#4F3F38] hover:bg-[#F5F3EC] md:hidden"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            {/* Case ID Chip */}
            <button
              type="button"
              onClick={() => setCurrentView("dashboard")}
              className="hidden items-center gap-1.5 rounded-full border border-[#EDE9E2] bg-[#F5F3EC] px-3 py-1 font-mono text-xs font-bold text-[#4F3F38] hover:border-[#4F3F38] sm:inline-flex"
            >
              <span className="size-2 rounded-full bg-[#B7C497]" />
              {caseData.caseId}
            </button>

            {/* Page Title */}
            <h1 className="text-base font-semibold text-[#4F3F38] sm:text-lg">
              {getPageTitle(currentView)}
            </h1>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Bilingual Toggle (EN / हिं) */}
            <div className="flex rounded-full border border-[#EDE9E2] bg-[#F5F3EC] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-full px-2.5 py-1 transition-all ${
                  lang === "en" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#8A7F76]"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("hi")}
                className={`rounded-full px-2.5 py-1 transition-all ${
                  lang === "hi" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#8A7F76]"
                }`}
              >
                हिं
              </button>
            </div>

            {/* Invite Family Button */}
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="btn-secondary-sm hidden text-xs sm:inline-flex"
            >
              <UserPlus className="size-3.5" />
              {t("btn.invite", "Invite Family")}
            </button>

            {/* Ask AI Drawer Button */}
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="btn-primary-sm text-xs"
            >
              <Sparkles className="size-3.5" />
              {t("btn.askAI", "Ask Legal AI")}
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-[60px] z-40 bg-[#4F3F38] p-4 text-white md:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavClick(item.key)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-white/10"
                  >
                    <Icon className="size-5 text-[#FFB077]" />
                    <span>{lang === "hi" ? item.labelHi : item.labelEn}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-7 md:pb-12">
          {children}
        </main>
      </div>

      {/* Global Modals, AI Drawer, and Toasts */}
      <AIAssistantDrawer />
      <InviteModal />
      <SignInModal />
      {activeClaimPackModal && (
        <OfficialFormPreviewModal
          asset={activeClaimPackModal}
          onClose={() => setActiveClaimPackModal(null)}
        />
      )}
      <Toast />
    </div>
  );
}

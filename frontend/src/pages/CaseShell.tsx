import { type ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  FileStack,
  Home,
  ListChecks,
  LogOut,
  Menu,
  MessageCircleQuestion,
  ScanSearch,
  Scale,
  Users,
  X,
} from "lucide-react";
import { CaseProvider, useCase } from "../lib/case";
import { brand } from "../lib/config";
import { Chip, ErrorNote, Spinner } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { ErrorBoundary } from "../components/ErrorBoundary";

type NavItem = {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
};

export default function CaseShell({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { caseId = "" } = useParams();
  return (
    <CaseProvider caseId={caseId}>
      <Shell email={email} onSignOut={onSignOut} />
    </CaseProvider>
  );
}

function Shell({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const nav = useNavigate();
  const location = useLocation();
  const { view, error } = useCase();
  const [moreOpen, setMoreOpen] = useState(false);

  const items: NavItem[] = [
    { to: "", end: true, icon: <Home className="size-5" />, label: hi ? "आज" : "Today" },
    { to: "find", icon: <ScanSearch className="size-5" />, label: t("nav.find", "Find") },
    { to: "claims", icon: <Scale className="size-5" />, label: t("nav.claims", "Claims") },
    { to: "documents", icon: <FileStack className="size-5" />, label: t("nav.docs", "Documents"), mobileLabel: hi ? "दस्तावेज़" : "Docs" },
    { to: "family", icon: <Users className="size-5" />, label: t("nav.family", "Family") },
    { to: "setup", icon: <ListChecks className="size-5" />, label: hi ? "विवरण व सेटअप" : "Details & setup" },
    { to: "guides", icon: <BookOpen className="size-5" />, label: t("nav.guides", "Guides") },
    { to: "ask", icon: <MessageCircleQuestion className="size-5" />, label: t("nav.ask", "Ask") },
  ];
  const mobileMain = items.slice(0, 4);
  const mobileMore = items.slice(4);
  const inSetup = location.pathname.includes("/setup");
  const moreIsActive = mobileMore.some((item) => {
    const segment = item.to.split("/")[0];
    return location.pathname.includes(`/${segment}`);
  });
  const role = view?.me?.role;

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <div className={`case-shell min-h-screen pb-24 md:pb-0 ${inSetup ? "case-shell--setup" : ""}`}>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <button
            className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-stone-100"
            onClick={() => nav("/")}
            aria-label={t("back", "Back")}
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-soft sm:text-xs">
              {i18n.language === "hi" ? brand.appNameHi : brand.appName}
            </p>
            <p className="truncate text-[15px] font-semibold sm:text-base">
              {view ? `${t("cases.inMemory", "In memory of")} ${view.case.deceasedName}` : "…"}
            </p>
          </div>
          {role && (
            <span className="hidden sm:inline-flex">
              <Chip tone={role === "helper" ? "amber" : "brand"}>{t(`role.${role}`, { defaultValue: role })}</Chip>
            </span>
          )}
          {view?.case?.demo && (
            <span className="hidden sm:inline-flex">
              <Chip tone="amber">{t("cases.sample", "Sample case")}</Chip>
            </span>
          )}
          {view?.case?.secondsPerDay < 86400 && (
            <span className="hidden lg:inline-flex">
              <Chip tone="amber">{t("cases.demo", "Demo speed")}</Chip>
            </span>
          )}
          <LangToggle />
          <button
            className="focus-ring hidden size-11 items-center justify-center rounded-xl text-muted hover:bg-stone-100 md:flex"
            onClick={onSignOut}
            aria-label={t("signOut", "Sign out")}
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:gap-8">
        <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 md:block lg:w-52" aria-label={hi ? "केस नेविगेशन" : "Case navigation"}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition-colors ${
                  isActive ? "bg-brand-700 text-white" : "text-ink hover:bg-white"
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          <ErrorNote error={error} />
          {!view && !error ? (
            <Spinner label={t("loading", "Loading…")} />
          ) : (
            view && (
              <ErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            )
          )}
        </main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white shadow-[0_-4px_18px_rgba(28,25,23,0.06)] md:hidden" aria-label={hi ? "केस नेविगेशन" : "Case navigation"}>
        <div className="grid grid-cols-5">
          {mobileMain.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `focus-ring flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${
                  isActive ? "text-brand-700" : "text-soft"
                }`
              }
            >
              {item.icon}
              <span className="w-full truncate text-center">{item.mobileLabel ?? item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`focus-ring flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${
              moreOpen || moreIsActive ? "text-brand-700" : "text-soft"
            }`}
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-controls="case-more-menu"
          >
            <Menu className="size-5" />
            <span>{hi ? "और" : "More"}</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35 md:hidden" role="presentation" onClick={() => setMoreOpen(false)}>
          <section
            id="case-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label={hi ? "और विकल्प" : "More options"}
            className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300" />
            <div className="flex items-start gap-3 border-b border-line pb-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{view?.case?.deceasedName}</p>
                <p className="truncate text-xs text-soft">{email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role && <Chip tone={role === "helper" ? "amber" : "brand"}>{t(`role.${role}`, { defaultValue: role })}</Chip>}
                  {view?.case?.demo && <Chip tone="amber">{t("cases.sample", "Sample case")}</Chip>}
                  {view?.case?.secondsPerDay < 86400 && <Chip tone="amber">{t("cases.demo", "Demo speed")}</Chip>}
                </div>
              </div>
              <button
                type="button"
                className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-stone-100"
                onClick={() => setMoreOpen(false)}
                aria-label={hi ? "बंद करें" : "Close"}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 py-3">
              {mobileMore.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `focus-ring flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      isActive ? "bg-brand-50 text-brand-800" : "bg-stone-50 text-ink"
                    }`
                  }
                >
                  <span className="shrink-0 text-brand-700">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
            <button
              type="button"
              className="focus-ring flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-700 hover:bg-red-50"
              onClick={onSignOut}
            >
              <LogOut className="size-5" />
              {t("signOut", "Sign out")}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { setLang } from "../i18n";

export function LangToggle() {
  const { i18n } = useTranslation();
  const hi = i18n.language === "hi";
  return (
    <button
      type="button"
      onClick={() => setLang(hi ? "en" : "hi")}
      className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-line hover:bg-brand-50"
      aria-label="Change language"
    >
      <Languages className="size-4" />
      {hi ? "English" : "हिंदी"}
    </button>
  );
}

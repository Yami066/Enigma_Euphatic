import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  const v = {
    primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50",
    secondary: "bg-white text-ink ring-1 ring-line hover:bg-stone-50",
    ghost: "text-brand-700 hover:bg-brand-50",
    danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
    soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  }[variant];
  const s = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-12 px-5 text-base" }[size];
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed ${v} ${s} ${className}`}
      {...rest}
      disabled={loading || rest.disabled}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "brand" | "amber" | "plain" }) {
  const t = tone === "brand" ? "bg-brand-50 ring-brand-100" : tone === "amber" ? "bg-amber-50 ring-amber-200" : "bg-card ring-line";
  return <section className={`rounded-2xl p-4 ring-1 sm:p-5 ${t} ${className}`}>{children}</section>;
}

export function Chip({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "brand" | "amber" | "red" | "green" | "blue" }) {
  const t = {
    stone: "bg-stone-100 text-stone-700",
    brand: "bg-brand-100 text-brand-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Field({ label, hint, warn, children }: { label: string; hint?: string; warn?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {warn ? (
        <span className="mt-1 block text-xs text-amber-800" role="alert">
          {warn}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-soft">{hint}</span>
      )}
    </label>
  );
}

export const inputCls =
  "focus-ring h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink placeholder:text-stone-400";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      {icon && <div className="text-brand-700">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-wide text-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? t("copied", "Copied") : label ?? t("copy", "Copy")}
    </button>
  );
}

export function Citation({ para, quote, url, title }: { para?: string; quote?: string; url?: string; title?: string }) {
  const { t } = useTranslation();
  if (!quote) return null;
  return (
    <figure className="rounded-xl border-l-4 border-brand-600 bg-brand-50/60 px-4 py-3">
      <blockquote className="text-sm italic leading-relaxed text-ink">“{quote}”</blockquote>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-brand-800">
          {t("rbiPara", "RBI Directions 2025, para")} {para}
        </span>
        {url && (
          <a className="inline-flex items-center gap-1 text-brand-700 underline" href={url} target="_blank" rel="noreferrer">
            {title ? t("officialText", "Official text") : t("source", "Source")} <ExternalLink className="size-3" />
          </a>
        )}
      </figcaption>
    </figure>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="focus-ring rounded-lg p-1 text-muted hover:bg-stone-100" onClick={onClose} aria-label={t("close", "Close")}>
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</p>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-line">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-700" : "bg-stone-300"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

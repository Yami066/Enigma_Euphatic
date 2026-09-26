// Dates as Indian readers expect them: "3 Oct 2026" (en-IN) / "3 अक्तू॰ 2026" (hi-IN).

export function fmtDate(iso: string | undefined | null, hi = false): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString(hi ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | undefined | null, hi = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleString(hi ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" });
}

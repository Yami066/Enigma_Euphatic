import { CheckCircle2, X } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function Toast() {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-150">
      <div className="flex items-center gap-2.5 rounded-[10px] bg-[#4F3F38] px-4 py-3 text-xs font-semibold text-white shadow-modal">
        <CheckCircle2 className="size-4 text-[#FFB077]" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}

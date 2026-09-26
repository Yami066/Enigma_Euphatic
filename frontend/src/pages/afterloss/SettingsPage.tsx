import { useState } from "react";
import { Bell, Check, Database, Download, Languages, RefreshCw, Save, Settings, ShieldCheck } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function SettingsPage() {
  const { caseData, setCaseData, lang, setLang, showToast } = useApp();
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(true);

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(caseData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `AfterLoss_Case_${caseData.caseId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Exported case backup successfully.");
  };

  const handleResetData = () => {
    localStorage.removeItem("afterloss_case_data");
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Settings className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4F3F38]">Case Workspace Settings</h2>
            <p className="text-xs text-[#8A7F76]">
              Case metadata, compliance audit settings, notification triggers, and data privacy options.
            </p>
          </div>
        </div>
      </div>

      {/* Case Metadata */}
      <div className="app-card space-y-4">
        <h3 className="text-base font-bold text-[#4F3F38]">Case Metadata & Jurisdiction</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-lg bg-[#F5F3EC]/50 p-3">
            <span className="text-[#8A7F76]">Case Identifier:</span>
            <div className="font-mono text-sm font-bold text-[#4F3F38]">{caseData.caseId}</div>
          </div>

          <div className="rounded-lg bg-[#F5F3EC]/50 p-3">
            <span className="text-[#8A7F76]">Compliance Framework:</span>
            <div className="font-semibold text-[#4F3F38]">RBI Master Directions 2025</div>
          </div>

          <div className="rounded-lg bg-[#F5F3EC]/50 p-3">
            <span className="text-[#8A7F76]">Place of Jurisdiction:</span>
            <div className="font-semibold text-[#4F3F38]">{caseData.deceased.placeOfDeath}</div>
          </div>

          <div className="rounded-lg bg-[#F5F3EC]/50 p-3">
            <span className="text-[#8A7F76]">Deceased PAN:</span>
            <div className="font-mono font-semibold text-[#4F3F38]">{caseData.deceased.pan}</div>
          </div>
        </div>
      </div>

      {/* Language Switcher */}
      <div className="app-card space-y-4">
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-[#4F3F38]" />
          <h3 className="text-base font-bold text-[#4F3F38]">Display Language / भाषा</h3>
        </div>
        <p className="text-xs text-[#8A7F76]">
          Switch between English and Hindi across all screens and official legal text.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setLang("en");
              showToast("Switched language to English.");
            }}
            className={`flex-1 rounded-[8px] border p-3 text-left transition-all ${
              lang === "en" ? "border-[#4F3F38] bg-[#F5F3EC]" : "border-[#EDE9E2] hover:bg-[#F5F3EC]/50"
            }`}
          >
            <div className="text-sm font-bold text-[#4F3F38]">English</div>
            <div className="text-xs text-[#8A7F76]">Official Indian English legal terminology</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setLang("hi");
              showToast("भाषा हिन्दी में बदली गई।");
            }}
            className={`flex-1 rounded-[8px] border p-3 text-left transition-all ${
              lang === "hi" ? "border-[#4F3F38] bg-[#F5F3EC]" : "border-[#EDE9E2] hover:bg-[#F5F3EC]/50"
            }`}
          >
            <div className="text-sm font-bold text-[#4F3F38]">हिन्दी (Hindi)</div>
            <div className="text-xs text-[#8A7F76]">आरबीआई दिशानिर्देश और कानूनी अनुवाद</div>
          </button>
        </div>
      </div>

      {/* Notification Milestones */}
      <div className="app-card space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-[#4F3F38]" />
          <h3 className="text-base font-bold text-[#4F3F38]">Statutory Milestone Notifications</h3>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-lg border border-[#EDE9E2] p-3 text-xs">
            <div>
              <span className="font-semibold text-[#4F3F38]">Day 10 Approaching Deadline Warning</span>
              <p className="text-[#8A7F76]">Receive alert 5 days before the RBI 15-day window closes.</p>
            </div>
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
              className="accent-[#4F3F38] size-4"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-[#EDE9E2] p-3 text-xs">
            <div>
              <span className="font-semibold text-[#4F3F38]">Day 16 Automatic Delay Penalty Notice Trigger</span>
              <p className="text-[#8A7F76]">Generate demand letter on the exact date penal interest starts accruing.</p>
            </div>
            <input
              type="checkbox"
              checked={notifySms}
              onChange={(e) => setNotifySms(e.target.checked)}
              className="accent-[#4F3F38] size-4"
            />
          </label>
        </div>
      </div>

      {/* Data Export & Backup */}
      <div className="app-card space-y-4">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-[#4F3F38]" />
          <h3 className="text-base font-bold text-[#4F3F38]">Data Backup & Export</h3>
        </div>
        <p className="text-xs text-[#8A7F76]">
          All case records are encrypted. You can export a full JSON snapshot or reset demo data.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="btn-secondary-sm text-xs"
          >
            <Download className="size-3.5" />
            Export Case Backup (.JSON)
          </button>

          <button
            type="button"
            onClick={handleResetData}
            className="btn-destructive-sm text-xs"
          >
            <RefreshCw className="size-3.5" />
            Reset Demo State
          </button>
        </div>
      </div>
    </div>
  );
}

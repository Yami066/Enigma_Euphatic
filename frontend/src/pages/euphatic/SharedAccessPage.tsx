import { useState } from "react";
import { Check, CheckCircle2, Copy, Mail, MessageSquare, Send, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function SharedAccessPage() {
  const { caseData, setCaseData, setInviteModalOpen, showToast, setCurrentView } = useApp();
  const [copied, setCopied] = useState(false);
  const [digitalConsentSigned, setDigitalConsentSigned] = useState(false);

  const isJoinInvite = Boolean(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("join")
  );

  const inviteLink = `${window.location.origin}/?join=${caseData.caseId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showToast("Family collaboration link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello! You have been invited to review and collaborate on Estate Settlement Case #${caseData.caseId} (${caseData.deceased.fullName || "Family Estate"}) under RBI Master Directions 2025.\n\nPlease open this link to review the bank accounts and grant your digital consent / NOC:\n${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Legal Heir Invitation: Estate Settlement Case #${caseData.caseId}`);
    const body = encodeURIComponent(
      `Dear Family Member,\n\nYou have been listed as a Class-I legal heir for the estate settlement of ${caseData.deceased.fullName || "our family member"} under RBI Master Directions 2025.\n\nPlease click the secure collaboration link below to review the estate accounts and complete your digital declaration / NOC:\n\n${inviteLink}\n\nCase Reference: ${caseData.caseId}\nEuphatics LegalTech Platform`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleDeleteHeir = (personId: string, name: string) => {
    setCaseData((prev) => ({
      ...prev,
      heirs: prev.heirs.filter((h) => h.personId !== personId),
    }));
    showToast(`Removed ${name} from case access.`);
  };

  return (
    <div className="space-y-8">
      {/* Invited Heir Consent Portal Banner (When opened via ?join=) */}
      {isJoinInvite && (
        <div className="rounded-xl border-2 border-[#B7C497] bg-[#F5F8F2] p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 text-[#2E3D1F] shrink-0" />
            <div>
              <span className="rounded bg-[#B7C497]/40 px-2 py-0.5 text-[10px] font-bold text-[#2E3D1F]">
                SECURE HEIR COLLABORATION PORTAL ACTIVE
              </span>
              <h3 className="mt-1 text-base font-bold text-[#2E3D1F]">
                Welcome! You are reviewing Estate Case #{caseData.caseId}
              </h3>
              <p className="text-xs text-[#4F3F38]">
                Deceased: <strong>{caseData.deceased.fullName}</strong> • Active Jurisdiction: {caseData.deceased.placeOfDeath}
              </p>
            </div>
          </div>
          <p className="text-xs text-[#6B6358] leading-relaxed">
            As a registered Class-I legal heir, you can review the total portfolio assets below. Under RBI Directions 2025 Para 30, non-claiming heirs must provide an Annex I-D No Objection Certificate (NOC) to allow simplified release of bank funds.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDigitalConsentSigned(true);
                showToast("Digital consent recorded! Annex I-D NOC timestamped under Indian Evidence Act 65B.");
              }}
              disabled={digitalConsentSigned}
              className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
                digitalConsentSigned
                  ? "bg-[#2E3D1F] text-white"
                  : "btn-primary"
              }`}
            >
              <Check className="size-4" />
              {digitalConsentSigned ? "✓ Digital Consent & NOC Signed (Verified)" : "Grant & Sign Digital Consent (Annex I-D NOC)"}
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("dashboard")}
              className="btn-secondary text-xs"
            >
              View Full Estate Overview
            </button>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="app-card border-l-4 border-l-[#FFB077]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#4F3F38]">Family Co-Claimants & Legal Heirs</h2>
              <p className="text-xs text-[#6B6358]">
                Manage family member roles for Annex I-C declarations and Annex I-D No Objection Certificates (NOC).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="btn-primary-sm text-xs"
          >
            <UserPlus className="size-3.5" />
            Invite Family Member
          </button>
        </div>
      </div>

      {/* Quick Invite Link & Dispatch */}
      <div className="app-card space-y-3">
        <label className="app-label">Secure Family Collaboration Link & Quick Dispatch</label>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            readOnly
            value={inviteLink}
            className="app-input flex-1 font-mono text-xs text-[#6B6358]"
          />
          <button
            type="button"
            onClick={copyLink}
            className="btn-secondary-sm shrink-0 text-xs"
          >
            {copied ? <Check className="size-3.5 text-[#B7C497]" /> : <Copy className="size-3.5" />}
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="rounded-[8px] bg-[#25D366] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#1EBE5B] transition-colors"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={handleShareEmail}
            className="rounded-[8px] bg-[#4F3F38] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#3a2d27] transition-colors"
          >
            Email
          </button>
        </div>
        <span className="app-helper">
          Family members can open this link on their mobile phone or PC to review the assets and digitally consent to Annex I-D relinquishment forms.
        </span>
      </div>

      {/* List of Heirs */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#4F3F38]">Registered Family Tree & Roles</h3>

        <div className="app-card overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#EDE9E2] bg-[#F5F3EC]/50 font-semibold text-[#6B6358]">
                <th className="px-5 py-3.5">Full Legal Name</th>
                <th className="px-5 py-3.5">Relation</th>
                <th className="px-5 py-3.5">Settlement Capacity</th>
                <th className="px-5 py-3.5">Contact Details</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE9E2]">
              {caseData.heirs.map((heir) => (
                <tr key={heir.personId} className="hover:bg-[#F5F3EC]/30">
                  <td className="px-5 py-4 font-semibold text-[#4F3F38]">
                    {heir.fullName}
                  </td>
                  <td className="px-5 py-4 text-[#6B6358]">{heir.relation}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-[#F5F3EC] px-2.5 py-0.5 font-semibold text-[#4F3F38] border border-[#EDE9E2]">
                      {heir.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[#6B6358]">
                    {heir.email || heir.phone || "Invited via Link"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteHeir(heir.personId, heir.fullName)}
                      className="text-[#6B6358] hover:text-[#AA4342]"
                      title="Remove from case"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CitationBlock
        citation="Hindu Succession Act 1956 & Indian Succession Act 1925: All surviving Class-I legal heirs have an equal right to inherit intestate assets unless a valid registered relinquishment deed (Annex I-D) or probate is produced."
        source="Statutory Succession Acts"
      />
    </div>
  );
}

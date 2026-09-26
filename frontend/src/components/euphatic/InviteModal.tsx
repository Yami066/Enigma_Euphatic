import { useState } from "react";
import { Check, Copy, ExternalLink, Mail, MessageSquare, Send, Shield, UserCheck, Users, X } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function InviteModal() {
  const { inviteModalOpen, setInviteModalOpen, caseData, setCaseData, showToast } = useApp();
  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState("Daughter");
  const [role, setRole] = useState<"Claimant" | "Nominee" | "Non-claimant (NOC)" | "Declarant">("Non-claimant (NOC)");
  const [contact, setContact] = useState("");
  const [copied, setCopied] = useState(false);

  if (!inviteModalOpen) return null;

  const inviteLink = `${window.location.origin}/?join=${caseData.caseId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showToast("Case invitation link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const cleaned = contact.replace(/[^0-9]/g, "");
    const msg = `Hello ${fullName || "Family Member"}! You have been added as a legal heir (${role}) on Euphatics for Estate Settlement Case #${caseData.caseId} (${caseData.deceased.fullName || "Estate Record"}).\n\nPlease click this secure collaboration link to review bank accounts and provide your digital consent / NOC under RBI Directions 2025:\n${inviteLink}`;
    const url = cleaned.length >= 10
      ? `https://api.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    showToast("Opening WhatsApp with pre-filled invitation...");
  };

  const handleSendEmail = () => {
    const subject = `Legal Heir Invitation: Estate Settlement Case #${caseData.caseId}`;
    const body = `Dear ${fullName || "Family Member"},\n\nYou have been listed as a legal heir (${role}) for the estate settlement of ${caseData.deceased.fullName || "our family member"} under RBI Master Directions 2025.\n\nPlease click the secure collaboration link below to review the bank accounts and complete your digital declaration / NOC:\n\n${inviteLink}\n\nCase Reference: ${caseData.caseId}\nDeceased: ${caseData.deceased.fullName || "Family Estate"}\nEuphatics LegalTech Platform`;
    const targetEmail = contact.includes("@") ? contact : "";
    window.open(`mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    showToast("Opening email composer with pre-filled invitation...");
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    const newHeir = {
      personId: "p_" + Math.random().toString(36).substring(2, 7),
      fullName,
      relation,
      role,
      email: contact.includes("@") ? contact : undefined,
      phone: !contact.includes("@") && contact.length > 0 ? contact : undefined,
    };

    setCaseData((prev) => ({
      ...prev,
      heirs: [...prev.heirs, newHeir],
    }));

    showToast(`Added ${fullName} (${role}) to family estate tree.`);
    // Automatically trigger dispatch if contact provided
    if (contact.includes("@")) {
      handleSendEmail();
    } else if (contact.replace(/[^0-9]/g, "").length >= 10) {
      handleSendWhatsApp();
    }
    setInviteModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4F3F38]/40 p-4 backdrop-blur-sm">
      <div className="app-card relative w-full max-w-lg shadow-modal animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={() => setInviteModalOpen(false)}
          className="absolute right-4 top-4 text-[#6B6358] hover:text-[#4F3F38]"
        >
          <X className="size-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-[#4F3F38] text-[#FFB077]">
            <Users className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#4F3F38]">Invite Family Co-Claimant or Heir</h2>
            <p className="text-xs text-[#6B6358]">
              Case Reference: <span className="font-mono font-bold text-[#4F3F38]">{caseData.caseId}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="app-label">Full Legal Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Pooja Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="app-input"
              />
              <span className="app-helper">As per Aadhaar or official ID</span>
            </div>

            <div>
              <label className="app-label">Relationship to Deceased</label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="app-input"
              >
                <option value="Spouse">Spouse / Widow(er)</option>
                <option value="Son">Son</option>
                <option value="Daughter">Daughter</option>
                <option value="Mother">Mother</option>
                <option value="Father">Father</option>
                <option value="Brother">Brother</option>
                <option value="Sister">Sister</option>
                <option value="Legal Guardian">Legal Guardian</option>
              </select>
            </div>
          </div>

          <div>
            <label className="app-label">Settlement Role (RBI Directions 2025)</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { id: "Non-claimant (NOC)", label: "Heir Giving NOC", desc: "Signs Annex I-D No Objection Certificate" },
                { id: "Claimant", label: "Co-Claimant", desc: "Jointly receives and receipts funds" },
                { id: "Nominee", label: "Registered Nominee", desc: "Authorized under bank records" },
                { id: "Declarant", label: "Declarant / Witness", desc: "Signs family tree affidavit Annex I-C" },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer flex-col rounded-lg border p-2.5 transition-all ${
                    role === item.id ? "border-[#4F3F38] bg-[#F5F3EC]" : "border-[#EDE9E2] hover:bg-[#F5F3EC]/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value={item.id}
                      checked={role === item.id}
                      onChange={() => setRole(item.id as any)}
                      className="accent-[#4F3F38]"
                    />
                    <span className="text-xs font-semibold text-[#4F3F38]">{item.label}</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[#6B6358]">{item.desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="app-label">Email or Phone Number</label>
            <div className="relative">
              <input
                type="text"
                placeholder="pooja.sharma@example.com or 9876543210"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="app-input pr-28"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="rounded bg-[#25D366] text-white px-2 py-1 text-[10px] font-bold hover:bg-[#1EBE5B] transition-colors"
                  title="Send via WhatsApp"
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="rounded bg-[#4F3F38] text-white px-2 py-1 text-[10px] font-bold hover:bg-[#3a2d27] transition-colors"
                  title="Send via Email"
                >
                  Email
                </button>
              </div>
            </div>
            <span className="app-helper">
              Click WhatsApp or Email to immediately dispatch the invitation with pre-filled legal text.
            </span>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button type="submit" className="btn-primary w-full">
              <Mail className="size-4" />
              Add Family Member & Generate Invite
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-[#EDE9E2] pt-4 space-y-2">
          <label className="app-label">Or share direct secure collaboration link</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="app-input font-mono text-xs text-[#6B6358]"
            />
            <button
              type="button"
              onClick={copyLink}
              className="btn-secondary-sm shrink-0"
            >
              {copied ? <Check className="size-3.5 text-[#B7C497]" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
          <span className="text-[11px] text-[#6B6358] block">
            Anyone opening this link on their phone or laptop will enter the case review & digital NOC consent portal.
          </span>
        </div>
      </div>
    </div>
  );
}

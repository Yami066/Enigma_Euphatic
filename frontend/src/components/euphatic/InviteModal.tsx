import { useState } from "react";
import { Copy, Mail, Shield, UserCheck, Users, X } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function InviteModal() {
  const { inviteModalOpen, setInviteModalOpen, caseData, setCaseData, showToast } = useApp();
  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState("Daughter");
  const [role, setRole] = useState<"Claimant" | "Nominee" | "Non-claimant (NOC)" | "Declarant">("Non-claimant (NOC)");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  if (!inviteModalOpen) return null;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    const newHeir = {
      personId: "p_" + Math.random().toString(36).substring(2, 7),
      fullName,
      relation,
      role,
      email: email || undefined,
    };

    setCaseData((prev) => ({
      ...prev,
      heirs: [...prev.heirs, newHeir],
    }));

    showToast(`Invitation sent to ${fullName} as ${role}.`);
    setInviteModalOpen(false);
  };

  const inviteLink = `${window.location.origin}/join/${caseData.caseId}?invite=${Math.random().toString(36).slice(2, 8)}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showToast("Case invitation link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
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
            <label className="app-label">Email or Phone (Optional)</label>
            <input
              type="text"
              placeholder="pooja.sharma@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="app-input"
            />
          </div>

          <div className="pt-2">
            <button type="submit" className="btn-primary w-full">
              <Mail className="size-4" />
              Add Family Member & Generate Invite
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-[#EDE9E2] pt-4">
          <label className="app-label">Or share direct secure link</label>
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
              <Copy className="size-3.5" />
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Check, Copy, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "../../components/euphatic/CitationBlock";

export function SharedAccessPage() {
  const { caseData, setCaseData, setInviteModalOpen, showToast } = useApp();
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/join/${caseData.caseId}?invite=fam_shared`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showToast("Family access link copied.");
    setTimeout(() => setCopied(false), 2000);
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

      {/* Quick Invite Link */}
      <div className="app-card space-y-3">
        <label className="app-label">Secure Family Collaboration Link</label>
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
            className="btn-secondary-sm shrink-0 text-xs"
          >
            <Copy className="size-3.5" />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <span className="app-helper">
          Family members can review asset amounts and digitally consent to Annex I-D relinquishment forms.
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

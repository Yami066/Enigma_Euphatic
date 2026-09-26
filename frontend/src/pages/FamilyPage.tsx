import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { useCase } from "../lib/case";
import { EMPTY_PERSON, PeopleList, PersonForm } from "../components/People";
import { Button, Card, Chip, ErrorNote, Field, inputCls } from "../components/ui";

export default function FamilyPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { caseId, view, reload } = useCase();
  const [editing, setEditing] = useState<any>(null);
  const [invite, setInvite] = useState({ email: "", role: "heir" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const isLead = view.me.role === "lead";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("fam.title", "Family")}</h1>
        <p className="text-sm text-muted">
          {t("fam.sub", "People who sign the forms, and people who can use this case. You enter details once; every form uses them.")}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("fam.people", "People in the claim")}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => nav("../setup/about")}>
              {t("fam.editDetails", "Their details")}
            </Button>
            <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setEditing({ ...EMPTY_PERSON })}>
              {t("fam.addPerson", "Add person")}
            </Button>
          </div>
        </div>
        {(view.people as any[]).length === 0 ? (
          <p className="text-sm text-muted">{t("fam.noPeople", "Add the legal heirs: who claims, who doesn't, and an independent person who knows the family.")}</p>
        ) : (
          <PeopleList people={view.people} onEdit={setEditing} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("fam.members", "Who can use this case")}</h2>
        <Card className="space-y-3">
          <ul className="divide-y divide-line">
            {(view.members as any[]).map((m) => (
              <li key={m.email} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">{m.email}</span>
                <span className="flex shrink-0 gap-1.5">
                  <Chip tone={m.role === "helper" ? "amber" : "brand"}>{t(`role.${m.role}`, { defaultValue: m.role })}</Chip>
                  {m.status === "invited" && <Chip>{t("fam.invited", "Invited")}</Chip>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            {t("fam.roles", "Heirs can do everything except manage members. Helpers (a CA or family friend) can view the case and masked copies, but never download original documents. Enforced by Cedar policies in Amazon Verified Permissions.")}
          </p>
          {isLead && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label={t("fam.inviteEmail", "Invite by email")}>
                <input className={inputCls} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </Field>
              <select className={inputCls} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} aria-label={t("fam.role", "Role")}>
                <option value="heir">{t("role.heir", "Heir")}</option>
                <option value="helper">{t("role.helper", "Helper")}</option>
              </select>
              <Button
                icon={<UserPlus className="size-4" />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("POST", `/cases/${caseId}/members`, invite);
                    setInvite({ email: "", role: "heir" });
                    await reload();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("fam.invite", "Invite")}
              </Button>
            </div>
          )}
          <ErrorNote error={error} />
        </Card>
      </section>

      <PersonForm key={editing ? `${editing.personId}-${editing.fullName}` : "closed"} person={editing} declarantOnly={!!editing?.isDeclarant} onClose={() => setEditing(null)} />
    </div>
  );
}

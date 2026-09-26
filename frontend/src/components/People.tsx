import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useCase } from "../lib/case";
import { ageOn, checkLast4, checkMobile, RELATIONS, todayIso } from "../lib/validate";
import { Button, Card, Chip, ErrorNote, Field, inputCls, Modal, Toggle } from "./ui";

export const EMPTY_PERSON = {
  personId: "new", fullName: "", relation: "", age: "", dob: "", address: "", phone: "", email: "", idType: "Aadhaar", idLast4: "",
  isClaimant: false, isNominee: false, isNonClaimantHeir: false, isDeclarant: false, yearsKnown: "", sdo: "", guardianName: "", guardianRelation: "",
};

export function RoleChips({ p }: { p: any }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {p.isNominee && <Chip tone="brand">{t("fam.nominee", "Nominee")}</Chip>}
      {p.isClaimant && <Chip tone="green">{t("fam.claimant", "Claimant")}</Chip>}
      {p.isNonClaimantHeir && <Chip tone="amber">{t("fam.nonClaimant", "Heir, not claiming (signs I-D)")}</Chip>}
      {p.isDeclarant && <Chip tone="blue">{t("fam.declarant", "Independent declarant (I-E)")}</Chip>}
    </div>
  );
}

export function PeopleList({ people, onEdit, filter }: { people: any[]; onEdit: (p: any) => void; filter?: (p: any) => boolean }) {
  const { t } = useTranslation();
  const { caseId, reload } = useCase();
  const [error, setError] = useState<unknown>(null);
  const shown = filter ? people.filter(filter) : people;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <Card key={p.personId} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.fullName}</p>
                <p className="text-sm text-muted">
                  {p.relation}
                  {p.age ? ` · ${p.age}` : ""}
                  {p.idLast4 ? ` · ${p.idType} ••••${p.idLast4}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="focus-ring rounded-lg p-2.5 text-muted hover:bg-stone-100" onClick={() => onEdit(p)} aria-label={`${t("edit", "Edit")}: ${p.fullName}`}>
                  <Pencil className="size-4" />
                </button>
                <button
                  className="focus-ring rounded-lg p-2.5 text-muted hover:bg-red-50 hover:text-red-700"
                  aria-label={`${t("delete", "Remove")}: ${p.fullName}`}
                  onClick={async () => {
                    if (!window.confirm(t("fam.confirmDelete", "Remove {{name}} from this case? Forms will no longer include them.", { name: p.fullName }))) return;
                    setError(null);
                    try {
                      await api("DELETE", `/cases/${caseId}/people/${p.personId}`);
                      await reload();
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <RoleChips p={p} />
          </Card>
        ))}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

export function PersonForm({ person, onClose, declarantOnly }: { person: any; onClose: () => void; declarantOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === "hi";
  const { caseId, view, reload } = useCase();
  const [p, setP] = useState<any>(person);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [otherRel, setOtherRel] = useState(!!person?.relation && !RELATIONS.includes(person.relation));
  if (!person || !p) return null;
  const set = (k: string, v: any) => setP((x: any) => ({ ...x, [k]: v }));
  const c = view.case;
  const theirAddress = [c.deceasedAddress, c.deceasedCity, c.deceasedState, c.deceasedPin].filter(Boolean).join(", ");
  const ageNow = p.dob ? ageOn(p.dob, todayIso()) : p.age ? Number(p.age) : null;
  const minor = ageNow !== null && ageNow < 18 && !p.isDeclarant;
  const mobileWarn = checkMobile(p.phone || "");
  const idWarn = checkLast4(p.idLast4 || "");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { personId, createdAt, type, ...body } = p;
      const age = p.dob ? ageOn(p.dob, todayIso()) : p.age ? Number(p.age) : undefined;
      await api("PUT", `/cases/${caseId}/people/${personId || "new"}`, { ...body, age: age ?? undefined });
      await reload();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!person} onClose={onClose} title={p.fullName || (declarantOnly ? t("fam.addDecl", "Add the independent person") : t("fam.addPerson", "Add person"))}>
      <form className="space-y-3" onSubmit={save}>
        <Field label={t("fam.fullName", "Full name (as on ID)") + " *"}>
          <input className={inputCls} required value={p.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        {!declarantOnly && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fam.relation", "Relationship to the deceased")}>
              <select
                className={inputCls}
                value={otherRel ? "Other" : p.relation}
                onChange={(e) => {
                  setOtherRel(e.target.value === "Other");
                  set("relation", e.target.value === "Other" ? "" : e.target.value);
                }}
              >
                <option value="">{t("pick", "Choose…")}</option>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`rel.${r}`, { defaultValue: r })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fam.dob", "Date of birth")} hint={ageNow !== null ? t("fam.ageIs", "Age {{n}}", { n: ageNow }) : t("optional", "Optional")}>
              <input className={inputCls} type="date" max={todayIso()} value={p.dob ?? ""} onChange={(e) => set("dob", e.target.value)} />
            </Field>
          </div>
        )}
        {!declarantOnly && otherRel && (
          <Field label={t("fam.relationOther", "Relationship (type it)")}>
            <input className={inputCls} value={p.relation} onChange={(e) => set("relation", e.target.value)} />
          </Field>
        )}
        {!declarantOnly && !p.dob && (
          <Field label={t("fam.age", "Age")} hint={t("fam.ageHint", "If you don't know the date of birth")}>
            <input className={inputCls} inputMode="numeric" value={p.age ?? ""} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <Field label={t("fam.address", "Address")}>
          <textarea className={inputCls + " h-auto min-h-[64px] py-2"} rows={2} value={p.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        {theirAddress && !declarantOnly && (
          <button type="button" className="text-sm font-medium text-brand-700 underline" onClick={() => set("address", theirAddress)}>
            {t("fam.sameAddress", "Same address as {{name}}", { name: c.deceasedName })}
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fam.phone", "Mobile")} warn={mobileWarn ? (hi ? mobileWarn.hi : mobileWarn.en) : null}>
            <input className={inputCls} inputMode="tel" value={p.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label={t("fam.email", "Email")}>
            <input className={inputCls} type="email" value={p.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fam.idType", "ID type")}>
            <select className={inputCls} value={p.idType} onChange={(e) => set("idType", e.target.value)}>
              {["Aadhaar", "PAN", "Passport", "Voter ID", "Driving licence"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label={t("fam.idLast4", "Last 4 digits of ID")} warn={idWarn ? (hi ? idWarn.hi : idWarn.en) : null} hint={t("fam.idHint", "We never store full ID numbers.")}>
            <input className={inputCls} maxLength={4} value={p.idLast4 ?? ""} onChange={(e) => set("idLast4", e.target.value.toUpperCase())} />
          </Field>
        </div>
        {minor && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-amber-50 p-3">
            <p className="col-span-2 text-xs text-amber-900">{t("fam.minorNote", "Under 18: a guardian signs for them on the forms.")}</p>
            <Field label={t("fam.guardian", "Guardian's name")}>
              <input className={inputCls} value={p.guardianName ?? ""} onChange={(e) => set("guardianName", e.target.value)} />
            </Field>
            <Field label={t("fam.guardianRel", "Guardian's relation to the minor")}>
              <input className={inputCls} value={p.guardianRelation ?? ""} onChange={(e) => set("guardianRelation", e.target.value)} />
            </Field>
          </div>
        )}
        {!declarantOnly && (
          <div className="space-y-2">
            <Toggle checked={!!p.isClaimant} onChange={(v) => setP((x: any) => ({ ...x, isClaimant: v, isNonClaimantHeir: v ? false : x.isNonClaimantHeir }))} label={t("fam.tClaimant", "Claims and signs the forms")} />
            <Toggle checked={!!p.isNonClaimantHeir} onChange={(v) => setP((x: any) => ({ ...x, isNonClaimantHeir: v, isClaimant: v ? false : x.isClaimant }))} label={t("fam.tNon", "Legal heir who is NOT claiming (signs a no-objection)")} />
            <Toggle checked={!!p.isNominee} onChange={(v) => set("isNominee", v)} label={t("fam.tNominee", "Is the registered nominee")} />
          </div>
        )}
        {(declarantOnly || p.isDeclarant) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fam.years", "Has known the family for (years)")}>
              <input className={inputCls} inputMode="numeric" value={p.yearsKnown ?? ""} onChange={(e) => set("yearsKnown", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("fam.sdo", "Son/ daughter/ spouse of")} hint={t("fam.sdoHint", "Printed as S/D/O on Annex I-E")}>
              <input className={inputCls} value={p.sdo ?? ""} onChange={(e) => set("sdo", e.target.value)} />
            </Field>
          </div>
        )}
        <ErrorNote error={error} />
        <Button type="submit" className="w-full" loading={busy}>
          {t("save", "Save")}
        </Button>
      </form>
    </Modal>
  );
}

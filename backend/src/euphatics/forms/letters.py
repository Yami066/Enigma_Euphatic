"""Letters the family sends when a bank is late (paras 29, 31, 33) and the
RBI Ombudsman complaint draft (Integrated Ombudsman Scheme, 2021)."""
from __future__ import annotations

from datetime import date

from .doc import AMBER, AMBER_TINT, Doc, rupees


def build_bank_delay_letter(ctx: dict, comp: dict, today: str | None = None) -> bytes:
    c, a = ctx["case"], ctx["asset"]
    lead = (ctx.get("claimants") or ctx.get("nominees") or [{}])[0]
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d = Doc(footer=f"Draft prepared with {brand}. Review before sending. Not legal advice.")
    d.text(f"Date: {today or date.today().isoformat()}", size=9.5)
    d.space(6)
    d.text("To,", size=9.5)
    d.text("The Branch Manager / Nodal Officer (Customer Service)", size=9.5)
    d.text(a.get("institution") or "[Bank]", size=9.5, bold=True)
    d.text(a.get("branch") or "[Branch]", size=9.5)
    d.space(8)
    subject = ("Sub: Delay in settlement of claim of the deceased customer "
               f"{c.get('deceasedName')}: request for settlement and compensation under para 33 of the RBI "
               "(Settlement of Claims in respect of Deceased Customers of Banks) Directions, 2025")
    d.text(subject, size=10, bold=True)
    d.space(4)
    d.para("Respected Sir/Madam,")
    rate_line = (f"the prevailing Bank Rate of {comp['bank_rate_pct']:.2f}% (in force on "
                 f"{comp['docs_complete']}, the date all documents were received) plus 4%, i.e. {comp['rate_pct']:.2f}% per annum")
    for p in [
        f"I/We lodged the claim for the account(s) {', '.join(a.get('accountNumbers') or []) or ''} of the late "
        f"{c.get('deceasedName')}. The bank confirmed receipt of all required documents on {comp['docs_complete']} "
        "(para 29).",
        f"Under para 31, the claim had to be settled within 15 calendar days, i.e. by {comp['due_date']}. As of "
        f"{comp['end_date']}, it has not been settled: a delay of {comp['delay_days']} day(s).",
        f"Under para 33, the bank must communicate the reasons for the delay and, for delay attributable to the bank, "
        f"pay compensation as interest at not less than {rate_line}, on the settlement amount for the period of delay.",
    ]:
        d.para(p)
    d.heading("Compensation due so far")
    d.field("Settlement amount", rupees(comp["amount_inr"]))
    d.field("Rate (Bank Rate + 4%)", f"{comp['rate_pct']:.2f}% per annum")
    d.field("Days of delay", str(comp["delay_days"]))
    d.field("Compensation (so far)", rupees(comp["compensation_inr"]))
    d.space(4)
    d.para("I/We request you to settle the claim immediately along with the compensation above (updated to the date "
           "of payment), or to inform me/us in writing of the reasons for the delay.")
    d.para("If this is not resolved within 30 days, I/we will be constrained to approach the RBI Ombudsman under the "
           "Reserve Bank - Integrated Ombudsman Scheme, 2021 (cms.rbi.org.in).")
    d.space(6)
    d.para("Yours faithfully,")
    d.signature_boxes([{**lead, "role": lead.get("relation") or "Claimant"}], cols=1)
    d.note_box("Keep a copy with the bank's acknowledgement stamp or email reply. You'll need it for the Ombudsman.",
               color=AMBER, fill=AMBER_TINT)
    return d.finish()


def build_ombudsman_draft(ctx: dict, comp: dict, bank_letter_date: str, today: str | None = None) -> bytes:
    c, a = ctx["case"], ctx["asset"]
    lead = (ctx.get("claimants") or ctx.get("nominees") or [{}])[0]
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d = Doc(footer=f"Draft prepared with {brand}. File it yourself on cms.rbi.org.in. Not legal advice.")
    d.title("RBI Ombudsman complaint: ready-to-copy details",
            "File on https://cms.rbi.org.in (Reserve Bank - Integrated Ombudsman Scheme, 2021)")
    d.note_box("You can approach the Ombudsman after complaining to the bank in writing, if it hasn't replied within "
               "30 days or the reply isn't satisfactory. File within one year of the bank's reply (or one year and "
               "30 days if there was no reply).")
    d.heading("Complainant")
    d.field("Name", lead.get("fullName"))
    d.field("Relationship to the deceased", lead.get("relation"))
    d.field("Address", lead.get("address"))
    d.field("Phone / email", " / ".join(x for x in [lead.get("phone"), lead.get("email")] if x))
    d.heading("Regulated entity")
    d.field("Bank", a.get("institution"))
    d.field("Branch", a.get("branch"))
    d.heading("Complaint")
    d.field("Category", "Deposit account: settlement of claim of deceased customer")
    d.field("Deceased customer", f"{c.get('deceasedName')} (died {c.get('dod')})")
    d.field("Account(s)", ", ".join(a.get("accountNumbers") or []))
    d.field("Documents complete (bank confirmation)", comp["docs_complete"])
    d.field("Due under para 31", comp["due_date"])
    d.field("Written complaint to bank on", bank_letter_date)
    d.field("Status on filing", f"Not settled; {comp['delay_days']} day(s) late")
    d.heading("Facts (copy into the portal)")
    d.para(f"The bank confirmed receipt of all documents for the claim of the late {c.get('deceasedName')} on "
           f"{comp['docs_complete']}. Under para 31 of the RBI (Settlement of Claims in respect of Deceased Customers "
           f"of Banks) Directions, 2025, the claim had to be settled by {comp['due_date']}. It remains unsettled "
           f"{comp['delay_days']} day(s) later. I wrote to the bank on {bank_letter_date} but the matter is unresolved.")
    d.heading("Relief sought")
    d.para(f"Immediate settlement of the claim ({rupees(comp['amount_inr'])}) with compensation under para 33 as "
           f"interest at {comp['rate_pct']:.2f}% per annum (Bank Rate + 4%) for the period of delay, currently "
           f"{rupees(comp['compensation_inr'])}.")
    d.heading("Attach")
    d.bullet(["Bank's dated acknowledgement / confirmation of complete documents",
              "Copy of your written complaint to the bank (with its acknowledgement)",
              "Bank's reply, if any", "Death certificate and your ID proof"])
    return d.finish()

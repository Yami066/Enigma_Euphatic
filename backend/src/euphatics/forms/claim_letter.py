"""Pack for assets outside RBI's bank forms: a plan sheet and a pre-filled claim letter.

Mutual funds, shares, insurance, PF, NPS and small savings each have their institution's own claim form (AMFI
Form T3, the DP's transmission form, the insurer's claimant statement, EPFO Forms 20/10D/5(IF), Form-11…).
The letter carries every detail those forms ask for, in one place, so the family can copy it across and attach
it; the plan sheet lists the documents, where to go and the official timeline with sources.
"""
from __future__ import annotations

from datetime import date

from .annex import payee_account
from .doc import AMBER, AMBER_TINT, Doc, rupees

LIABILITIES = {"loan", "credit_card"}
KIND = {
    "mutual_fund": "mutual fund units", "shares": "shares / securities in the demat account", "life_insurance": "life insurance policy",
    "pmjjby": "PMJJBY cover", "pmsby": "PMSBY cover", "epf": "provident fund, pension and EDLI dues", "nps": "NPS account",
    "ppf": "PPF account", "post_office": "post office savings", "govt_scheme": "government savings scheme account",
    "credit_card": "credit card account", "loan": "loan account", "other": "account / holding",
}
ID_LABELS = {"folio": "Folio number(s)", "boId": "Demat (BO) ID", "policyNo": "Policy number", "uan": "UAN", "pran": "PRAN",
             "cardLast4": "Card ending", "scheme": "Scheme", "loanType": "Loan type"}


def _d(iso: str | None) -> str:
    try:
        return date.fromisoformat(str(iso)[:10]).strftime("%d-%m-%Y") if iso else ""
    except ValueError:
        return str(iso)


def _plan(d: Doc, ctx: dict) -> None:
    c, a, r = ctx["case"], ctx["asset"], ctx["route"]
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d.title(f"Claim plan: {a.get('institution') or KIND.get(a.get('assetType'), 'asset')}",
            f"For the late {c.get('deceasedName')} (died {_d(c.get('dod'))})  ·  prepared by {brand} on {_d(ctx.get('generatedAt'))}")
    d.heading((r.get("title") or {}).get("en") or r.get("route", ""))
    d.heading("What to do, in order")
    d.bullet([f"{i}. {s.get('en')}" for i, s in enumerate(r.get("steps") or r.get("checklist") or [], 1)])
    if r.get("where"):
        d.para(f"Where: {r['where']}")
    if r.get("timeline"):
        d.note_box(f"Timeline: {r['timeline'].get('en')}")
    d.heading("Documents")
    rows = []
    for doc in r.get("documents") or []:
        status = f"Official form: {doc['form']}" if doc.get("form") else "Get it (see the app's guide)" if doc.get("guide") else ""
        rows.append([doc.get("en", doc.get("id", "")), status])
    rows.append(["Claim / intimation letter (next page)", "Filled in this pack: sign"])
    d.table(["Document", "Status"], rows, [340, 159])
    if r.get("sources"):
        d.para("Sources: " + "; ".join(f"{s.get('label')} ({s.get('url')})" for s in r["sources"]), size=8)
    d.note_box(ctx.get("brand", {}).get("disclaimer") or "Not legal advice. Confirm with the institution before signing.",
               color=AMBER, fill=AMBER_TINT)


def _letter(d: Doc, ctx: dict) -> None:
    c, a = ctx["case"], ctx["asset"]
    claimants = ctx.get("claimants") or []
    liability = a.get("assetType") in LIABILITIES
    kind = KIND.get(a.get("assetType"), "account")
    d.new_page()
    d.para(f"Date: {_d(ctx.get('generatedAt'))}")
    d.para("To,")
    d.para(f"{a.get('institution') or 'The institution'}" + (f", {a['branch']}" if a.get("branch") else ""))
    d.space(4)
    subject = (f"Intimation of death of {c.get('deceasedName')} and request for the outstanding statement and any insurance "
               f"cover on the {kind}" if liability else
               f"Intimation of death of {c.get('deceasedName')} and claim for the {kind}")
    d.heading(f"Subject: {subject}")
    d.para("Madam/ Dear Sir,")
    d.para(f"This is to inform you that {c.get('deceasedName')}, holder of the {kind} with you, passed away on "
           f"{_d(c.get('dod'))}" + (f" at {c['placeOfDeath']}" if c.get("placeOfDeath") else "") + ". "
           + (f"A copy of the death certificate (No. {c['deathCertNo']}, issued by {c.get('deathCertAuthority') or 'the registrar'}"
              f"{', dated ' + _d(c.get('deathCertDate')) if c.get('deathCertDate') else ''}) is enclosed." if c.get("deathCertNo")
              else "A copy of the death certificate is enclosed."))
    rows = [["Name of the deceased", c.get("deceasedName") or ""], ["Date of death", _d(c.get("dod"))]]
    if a.get("accountNumbers"):
        rows.append(["Account / certificate number(s)", ", ".join(a["accountNumbers"])])
    for k, v in (a.get("identifiers") or {}).items():
        if v:
            rows.append([ID_LABELS.get(k, k), str(v)])
    if a.get("amount") not in (None, ""):
        rows.append(["Approximate value" if not liability else "Outstanding (as we understand it)", rupees(a["amount"])])
    if a.get("nomination") in ("nominee", "survivor"):
        rows.append(["Nominee", a.get("nomineeName") or "Registered (as per your records)"])
    elif a.get("nomination") == "none":
        rows.append(["Nominee", "None registered: claim by the legal heirs"])
    d.table(["Detail", "Value"], rows, [190, 309])
    if liability:
        d.para("Please (1) share the final outstanding statement, (2) tell us whether any insurance cover (credit life / loan "
               "protection / card cover) was attached to this account and how to claim it, and (3) stop further charges and "
               "auto-debits. Any dues will be settled from the estate of the deceased as per law.")
    else:
        d.para("We request you to settle / transmit the above in favour of the claimant(s) named below, and to send us your "
               "claim form and list of documents if anything more is needed. Please acknowledge this letter with the date "
               "of receipt.")
    d.heading("Claimant(s)")
    d.table(["Name", "Relation", "Contact"],
            [[p.get("fullName", ""), p.get("relation", ""), " / ".join(x for x in [p.get("phone"), p.get("email")] if x)]
             for p in claimants] or [["", "", ""]], [200, 110, 189])
    if not liability and claimants:
        acct = payee_account(claimants[0], ctx.get("payment") or {}, True)
        if acct:
            d.para(f"Please credit the amount to: {claimants[0].get('fullName')}, {acct.get('bankName', '')} "
                   f"A/c {acct.get('accountNumber', '')}, IFSC {acct.get('ifsc', '')}"
                   + (f", {acct['branch']}" if acct.get("branch") else "") + ".")
    enclosures = [doc.get("en", "") for doc in (ctx["route"].get("documents") or []) if doc.get("id") != "claim_letter"]
    if enclosures:
        d.heading("Enclosures")
        d.bullet([f"{i}. {e}" for i, e in enumerate(enclosures, 1)], size=8.5)
    d.para("Yours faithfully,")
    d.signature_boxes([{"fullName": p.get("fullName", ""), "role": p.get("relation", "")} for p in claimants] or [{"fullName": "", "role": ""}],
                      cols=2, place_date=True)


def build_claim_letter_pack(ctx: dict, attachments: list[dict] | None = None) -> bytes:
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d = Doc(footer=f"{brand} claim pack · {ctx['asset'].get('institution') or ''} · Not legal advice; verify with the institution.")
    _plan(d, ctx)
    _letter(d, ctx)
    for att in attachments or []:
        d.image_page(att.get("label", "Attachment"), att["image"], att.get("note", ""))
    return d.finish()

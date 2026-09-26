"""RBI standard claim formats, Annex I-A to I-E of RBI/2025-26/82, pre-filled.

Section numbers, headings and wording follow the standard formats that banks
must use under para 27 (text taken from SBI's published copy of the RBI
formats, 18 Dec 2025: sources/rbi-2025-deceased-claims/bank-copies/).
Anything we don't know is left as a blank line to fill by hand.
"""
from __future__ import annotations

from datetime import date

from .doc import AMBER, AMBER_TINT, Doc, rupees

STAMP = "(To be duly stamped as per the Stamp Act applicable to the State)"
OVD_NOTE = ("\"Officially Valid Document\" (OVD) means the passport, the driving licence, proof of possession of Aadhaar "
            "number, the Voter's Identity Card issued by the Election Commission of India, job card issued by NREGA duly "
            "signed by an officer of the State Government and letter issued by the National Population Register "
            "containing details of name and address.")


def _v(x, blank: str = "____________") -> str:
    return str(x) if x not in (None, "", []) else blank


def _age_at_death(case: dict) -> str:
    try:
        dob, dod = date.fromisoformat(case["dob"]), date.fromisoformat(case["dod"])
        return str(dod.year - dob.year - ((dod.month, dod.day) < (dob.month, dob.day)))
    except (KeyError, TypeError, ValueError):
        return ""


def _addressee(d: Doc, ctx: dict) -> None:
    a = ctx["asset"]
    d.text("The Branch Manager", size=9.5)
    d.text(f"{_v(a.get('institution'), '_________________')} Bank" if "bank" not in (a.get("institution") or "").lower()
           else a.get("institution"), size=9.5, bold=True)
    d.text(f"{_v(a.get('branch'), '_________________')} Branch", size=9.5)
    d.text(f"Date: {_v(ctx.get('generatedAt'))}", size=9.5)
    d.space(4)
    d.text("Madam/ Dear Sir,", size=9.5)
    d.space(2)


def _deceased_info(d: Doc, ctx: dict, legal_heirs: bool) -> None:
    c = ctx["case"]
    d.para("2. I/ We furnish below the required information about the deceased customer:")
    d.field("(a) Date and Place of Death", f"{_v(c.get('dod'))}, {_v(c.get('placeOfDeath'))}", label_w=190)
    d.field("(b) Death Certificate No./ dated/ Authority",
            f"{_v(c.get('deathCertNo'))} / {_v(c.get('deathCertDate'))} / {_v(c.get('deathCertAuthority'))}  (copy enclosed)",
            label_w=190)
    d.field("(c) Age (as on the date of death)", f"{_v(_age_at_death(c), '_____')} Yrs.", label_w=190)
    d.field("(d) Marital Status", _v(c.get("maritalStatus"), "Married / Unmarried / Widow(er)"), label_w=190)
    d.field("(e) Address", _v(c.get("deceasedAddress"), "_______________________________________________"), label_w=190)
    if legal_heirs:
        d.field("(f) Religion / law of succession", f"{_v(c.get('religion'))} / {_v(c.get('successionLaw'))}", label_w=190)


def _accounts_table(d: Doc, ctx: dict) -> None:
    a = ctx["asset"]
    nature = {"term_deposit": "TD", "bank_deposit": "SB/ CA"}.get(a.get("assetType"), "")
    nums = a.get("accountNumbers") or [""]
    rows = []
    for i, n in enumerate(nums[:4], 1):
        rows.append([str(i), nature, n, rupees(a.get("amount")) if i == 1 else "", a.get("maturityDate", "") if i == 1 else ""])
    rows.append(["", "Total", "", rupees(a.get("amount")), ""])
    d.table(["Sr. No.", "Nature of Deposits (SB/ CA/ TD, etc.)", "Account No.", "Amount", "Date of Maturity (in case of TD)"],
            rows, [40, 130, 120, 100, 109])


def _locker_lines(d: Doc, ctx: dict) -> None:
    a = ctx["asset"]
    if a.get("assetType") in ("locker", "safe_custody"):
        d.field("b. Safe Deposit Locker No./ Mode of Holding", _v(a.get("lockerNo")), label_w=220)
        d.field("c. Safe Custody Article Receipt No.", _v(a.get("receiptNo")), label_w=220)


def payee_account(p: dict, payment: dict, first: bool) -> dict:
    """The claimant's own account if entered, else the case-level payment account for the first claimant."""
    if p.get("bankAccountNumber"):
        return {"bankName": p.get("bankName", ""), "accountNumber": p.get("bankAccountNumber", ""),
                "ifsc": p.get("bankIfsc", ""), "branch": p.get("bankBranch", "")}
    if first and payment.get("accountNumber"):
        return {"bankName": payment.get("bankName", ""), "accountNumber": payment.get("accountNumber", ""),
                "ifsc": payment.get("ifsc", ""), "branch": payment.get("branch", "")}
    return {}


def _payment_rows(people: list[dict], payment: dict) -> list[list[str]]:
    rows = []
    for i, p in enumerate(people[:4], 1):
        a = payee_account(p, payment, i == 1)
        acct = " ".join(x for x in [a.get("bankName"), a.get("accountNumber")] if x)
        rows.append([str(i), p.get("fullName", ""), p.get("address", ""), p.get("phone", ""), p.get("email", ""),
                     " / ".join(x for x in [acct, a.get("ifsc")] if x)])
    return rows


def _sign_table(d: Doc, people: list[dict], title: str) -> None:
    d.heading(title, keep_with=90)
    d.table(["Sr. No.", "Name", "Signature/ Thumb impression"],
            [[str(i), p.get("fullName", ""), ""] for i, p in enumerate(people[:4], 1)] or [["1", "", ""]],
            [40, 220, 239], size=9)
    d.para("Name and address of witness (in case of claimant(s) placing the thumb impression): ______________________")
    d.para("Signature of witness: ____________________")


# ------------------------------------------------------------------ Annex I-A

def annex_I_A(d: Doc, ctx: dict) -> None:
    c = ctx["case"]
    nominees = ctx.get("nominees") or ctx.get("claimants") or []
    d.title("Annex I-A",
            "Application Form for Settlement of Claim in Deposit Accounts/ Release of Contents of Safe Deposit Lockers/ "
            "Return of Articles in Safe Custody kept by Deceased Customer (cases with Nomination or Joint Account with "
            "survivorship clause)")
    _addressee(d, ctx)
    d.text(f"Claim as *Nominee/ Survivor for Payment of Balances in the *Deposit Accounts/ Release of Contents of Safe "
           f"Deposit Lockers/ Return of Articles in Safe Custody kept by Shri/ Smt./ Kum. {c.get('deceasedName')}",
           size=9.5, bold=True)
    d.space(3)
    names = ", ".join(p.get("fullName", "") for p in nominees) or "________________"
    d.para(f"I/ We {names} (Nominee(s)/ Survivor(s)) hereby declare that I am/ we are the *Nominee(s)/ Survivor(s) in the "
           f"*Deposit Accounts/ Safe Deposit Lockers/ Articles in Safe Custody kept by Shri/ Smt./ Kum. "
           f"{c.get('deceasedName')} who expired on {_v(c.get('dod'))}.")
    _deceased_info(d, ctx, legal_heirs=False)
    d.para("3. I/ We, therefore, submit my/ our Claim as Nominee(s)/ Survivor(s) for *payment of the balance with accrued "
           "interest in deposit accounts/ release of contents of safe deposit lockers/ return of articles in safe custody "
           "kept by deceased customer as per details given below:")
    d.text("a. Deposit Accounts", size=9.5, bold=True)
    _accounts_table(d, ctx)
    _locker_lines(d, ctx)
    d.para("4. Details of Nominee(s)/ Survivor(s):")
    d.para("4.1 I/ We request the bank to transfer the balance payable (after making the required adjustments, set-off, "
           "if any) in deposit accounts of the deceased to the account(s) given below:")
    d.table(["Sr.", "Name", "Address", "Mobile", "Email", "Bank Name, Account Type & Number, and IFSC"],
            _payment_rows(nominees, ctx.get("payment") or {}), [26, 85, 120, 70, 88, 110], size=8)
    d.para("5. I/ We undertake that")
    for line in [
        "(i) I/ We shall hold/ receive the aforesaid amount/ articles in a fiduciary capacity as a trustee of the rightful "
        "beneficiary(ies) and any settlement made to me/ us shall not affect their rights.",
        "(ii) The aforesaid *accounts/ safe deposit locker/ safe custody articles are not the subject matter of any dispute "
        "and that there is no Court order restraining me/ us from claiming or the bank from settling the claim in my/ our "
        "favour or otherwise.",
        "(iii) I/ We authorise the bank to exercise its right to lien and set-off and accordingly, to deduct the outstanding "
        "dues which are payable to the bank in relation to credit facilities availed by the Deceased or any other dues "
        "payable to the bank, from the balance held by the Deceased in the aforementioned account(s).",
    ]:
        d.text(line, size=9, indent=10)
    d.space(3)
    d.para("6. I/ We have attached the following documents for the purpose of settlement of my/ our claim:")
    d.checkbox_line("Death certificate (of deceased customer)", checked=True)
    d.checkbox_line("Officially Valid Document in support of the identity and address of the Nominee(s)/ Survivor(s) "
                    "making the claim.", checked=True)
    d.para("7. The facts stated above are true and correct to the best of my/ our knowledge and belief.")
    _sign_table(d, nominees, "8. Name and signature of the nominee(s)/ survivor(s) who will receive the balance payable")
    d.text("*(Delete whichever is not applicable)", size=8, color=AMBER)
    d.text(OVD_NOTE, size=7.5)


# ------------------------------------------------------------------ Annex I-B

def annex_I_B(d: Doc, ctx: dict) -> None:
    c = ctx["case"]
    claimants, others = ctx.get("claimants") or [], ctx.get("nonClaimants") or []
    d.title("Annex I-B",
            "Application Form for Settlement of Claim in Deposit Accounts/ Release of Contents of Safe Deposit Lockers/ "
            "Return of Articles in Safe Custody kept by Deceased Customer (cases other than Nomination or Joint Account "
            "with survivorship clause)")
    _addressee(d, ctx)
    d.text(f"Claim for Payment of Balances in the *Deposit Accounts/ Release of Contents of Safe Deposit Locker/ Return of "
           f"Articles in Safe Custody kept by Shri/ Smt./ Kum. {c.get('deceasedName')}", size=9.5, bold=True)
    d.space(3)
    names = ", ".join(p.get("fullName", "") for p in claimants) or "________________"
    d.para(f"I/ We {names} (Claimant(s)) hereby declare that I am/ we are the claimant(s) in the *Deposit Accounts/ Safe "
           f"Deposit Locker/ Articles in Safe Custody kept by Shri/ Smt./ Kum. {c.get('deceasedName')} who expired on "
           f"{_v(c.get('dod'))}.")
    _deceased_info(d, ctx, legal_heirs=True)
    d.text("(g) Name, Relation & Age of the legal heir(s) of the deceased:", size=9.5)
    heirs = [(p, "No") for p in claimants] + [(p, "Yes") for p in others]
    d.table(["Sr.", "Name & Address", "Age", "Relation", "Mobile & Email", "Signing Letter of Disclaimer/ No Objection"],
            [[str(i), f"{p.get('fullName', '')}, {p.get('address', '')}".strip(", "), str(p.get("age") or ""),
              p.get("relation", ""), " ".join(x for x in [p.get("phone"), p.get("email")] if x), yn]
             for i, (p, yn) in enumerate(heirs[:6], 1)], [26, 150, 32, 70, 101, 120], size=8)
    d.para("3. I/ We, therefore, submit my/ our Claim for *payment of the balance with accrued interest in deposit accounts/ "
           "release of contents of safe deposit lockers/ return of articles in safe custody kept by deceased customer as "
           "per details given below:")
    d.text("a. Deposit Accounts", size=9.5, bold=True)
    _accounts_table(d, ctx)
    _locker_lines(d, ctx)
    d.para("4.1 I/ We undertake that")
    for line in [
        "(i) I/ We shall hold/ receive the aforesaid amount/ payment in a fiduciary capacity as a trustee of the rightful "
        "beneficiary(ies) and any settlement made to me/ us shall not affect their rights.",
        "(ii) The aforesaid *accounts/ safe deposit lockers/ safe custody articles are not the subject matter of any dispute "
        "and that there is no Court order restraining me/ us from claiming or the bank from settling the claim in my/ our "
        "favour or otherwise.",
        "(iii) I/ We authorise the bank to exercise its right to lien and set-off and accordingly, to deduct the outstanding "
        "dues which are payable to the bank in relation to credit facilities availed by the Deceased customer or any other "
        "dues payable to the bank, from the balance held by the Deceased customer in the aforementioned account(s).",
        "(iv) To indemnify and hold the bank harmless against any claims, suits, legal proceedings by any legal heirs, "
        "executors, administrators, legal representatives, arising out of/ in connection with the settlement of this "
        "deceased claim in accordance to this request letter.",
    ]:
        d.text(line, size=9, indent=10)
    d.space(3)
    d.para("4.2 I/ We declare that")
    d.checkbox_line("there is no Will left behind by the Deceased to the best of my/ our knowledge and belief.",
                    checked=not ctx["asset"].get("will"))
    d.para("4.3 I/ We lodge my/ our claim for the above *balance with accrued interest/ safe deposit locker/ articles in "
           "safe custody of the above-named deceased in terms of:")
    lhc = bool(ctx["asset"].get("legalHeirCertificate"))
    d.checkbox_line("Legal Heir Certificate granted by ______________ at __________ vide order dated ______________ "
                    "(copy enclosed).", checked=lhc)
    d.checkbox_line("Declaration/ Affidavit from an independent person regarding the legal heir(s) of the deceased "
                    "depositor (copy enclosed).", checked=not lhc)
    d.para("5.1 I/ We request the bank to transfer the balance payable (after making the required adjustments, set-off, if "
           "any) to the account of claimant(s) given below:")
    pay = ctx.get("payment") or {}
    rows = []
    for i, p in enumerate(claimants[:4], 1):
        a = payee_account(p, pay, i == 1)
        if a:
            rows.append([str(i), p.get("fullName", ""), " ".join(x for x in [a.get("bankName"), a.get("accountNumber")] if x),
                         a.get("ifsc", ""), a.get("branch", "")])
    if not rows:
        rows = [["1", pay.get("accountHolder") or (claimants[0].get("fullName", "") if claimants else ""),
                 " ".join(x for x in [pay.get("bankName"), pay.get("accountNumber")] if x), pay.get("ifsc", ""), ""]]
    d.table(["Sr.", "Name of Claimant", "Bank Name and A/c No.", "IFSC", "Branch Details"], rows,
            [26, 140, 150, 90, 93], size=8.5)
    d.para("6. I/ We have attached the following documents for the purpose of settlement of my/ our claim:")
    docs = [("Death certificate (of deceased customer)", True),
            ("Officially Valid Document in support of the identity and address of the Claimant(s) making the claim.", True),
            ("Legal Heir Certificate", lhc),
            ("Declaration/ Affidavit from an independent person regarding the legal heir(s) of the deceased customer", not lhc),
            ("Bond of indemnity signed by Claimant(s)", True),
            ("Letter of disclaimer/ no objection from non-claimant legal heir(s)", bool(others))]
    for label, on in docs:
        d.checkbox_line(label, checked=on)
    d.para("7. The facts stated above are true and correct to the best of my/ our knowledge and belief.")
    _sign_table(d, claimants, "8. Name and signature of the claimant(s) who will receive the balance payable")
    d.text("*(Delete whichever is not applicable)", size=8, color=AMBER)
    d.text(OVD_NOTE, size=7.5)


# ------------------------------------------------------------------ Annex I-C

def annex_I_C(d: Doc, ctx: dict) -> None:
    a, c = ctx["asset"], ctx["case"]
    claimants = ctx.get("claimants") or []
    d.title("Annex I-C", "BOND OF INDEMNITY/ SURETY*")
    d.note_box(STAMP + "  (For Settlement of Claim in Deposit Accounts of Deceased Customer without production of "
               "Legal Documents)", color=AMBER, fill=AMBER_TINT)
    _addressee(d, ctx)
    d.para("IN CONSIDERATION of your paying or agreeing to pay us,")
    for i in range(4):
        name = claimants[i].get("fullName", "") if i < len(claimants) else ""
        d.text(f"{i + 1}. {name or '__________________________________________________'}", size=9.5, indent=10)
    d.space(2)
    d.para(f"the sum of Rupees {rupees(a.get('amount')).replace('Rs. ', '') or '______________'} standing at the credit of "
           f"following deposit accounts with your bank in the name of Shri/ Smt./ Kum. {c.get('deceasedName')} since "
           "deceased, without production of a Court Order or Probate of Will or Letter of Administration or a "
           "Succession Certificate to his/ her estate:")
    _accounts_table(d, ctx)
    names = ", ".join(p.get("fullName", "") for p in claimants) or "________________"
    d.para(f"We, {names}, do hereby for ourselves and our heirs, legal representatives, executors and administrators, "
           "jointly and severally UNDERTAKE AND AGREE to indemnify you, the bank, its officers/ Directors, and its "
           "successors and assignees against all claims, demands, proceedings, losses, damages, charges and expenses "
           "which may be raised against or incurred by you by reasons or in consequence of your having agreed to pay/ or "
           "paying the said sum to the claimant(s) as aforesaid.")
    d.heading("SIGNED AND DELIVERED by the above named (Heir(s)/ claimant(s) of the deceased customer)", keep_with=90)
    d.signature_boxes([{**p, "role": p.get("relation") or "Claimant"} for p in claimants] or [{"fullName": "", "role": "Claimant"}])
    d.para("Signed and delivered by the above named on this ______ day of __________ two thousand ______.")
    if (a.get("route") or "") == "ABOVE_THRESHOLD":
        d.heading("*SIGNED AND DELIVERED by the above named (Sureties)", keep_with=90)
        d.signature_boxes([{"fullName": "", "role": "Surety 1"}, {"fullName": "", "role": "Surety 2"}])
    else:
        d.note_box("Surety is applicable only in case of claims above the threshold limit. This claim is within the "
                   "threshold, so no third-party surety is needed (para 10(a)).")


# ------------------------------------------------------------------ Annex I-D

def annex_I_D(d: Doc, ctx: dict) -> None:
    c = ctx["case"]
    others, claimants = ctx.get("nonClaimants") or [], ctx.get("claimants") or []
    d.title("Annex I-D", "LETTER OF DISCLAIMER/ NO OBJECTION")
    d.note_box(STAMP, color=AMBER, fill=AMBER_TINT)
    _addressee(d, ctx)
    d.para(f"Details of deposit account(s)/ safe custody articles/ safe deposit locker in the name of Shri/ Smt./ Kum. "
           f"{c.get('deceasedName')} since deceased are as follows:")
    d.text("a. Deposit Accounts", size=9.5, bold=True)
    _accounts_table(d, ctx)
    _locker_lines(d, ctx)
    d.para(f"2. With reference to the above account(s)/ safe deposit locker/ safe custody articles, I/ We, the legal heirs "
           f"of Shri/ Smt./ Kum. {c.get('deceasedName')} (Name of deceased customer), have to advise that we have no "
           f"interest in the above deposits/ assets and as such we have no objection to your paying the *balance amount "
           f"in the above account(s)/ releasing the contents in safe deposit locker/ returning the safe custody articles "
           f"lying with you in the name of the aforesaid Shri/ Smt./ Kum. {c.get('deceasedName')} (Name of the deceased "
           f"customer) to Shri/ Smt./ Kum.:")
    for i in range(max(1, min(4, len(claimants)))):
        name = claimants[i].get("fullName", "") if i < len(claimants) else ""
        d.text(f"{i + 1}. {name or '__________________________________________________'}", size=9.5, indent=10)
    d.space(3)
    d.para("Such payment of the *balance in the above account(s)/ release of the contents in safe deposit locker/ return "
           "of the safe custody articles would be completely binding on us and we will not question the bank's action in "
           "doing so. I/ We undertake to bind ourselves, our heirs and legal representatives not to revoke the "
           "declaration made herein.")
    d.table(["Sr. No.", "Name of the Non-claimant Legal Heir(s) (who relinquish their rights)", "Age (yrs.)", "Signature"],
            [[str(i), p.get("fullName", ""), str(p.get("age") or ""), ""] for i, p in enumerate(others[:4], 1)]
            or [["1", "", "", ""]], [40, 250, 60, 149], size=9)
    d.para("Signed on this ______ day of __________ two thousand ______.")
    d.text("*(Delete whichever is not applicable)", size=8, color=AMBER)


# ------------------------------------------------------------------ Annex I-E

def annex_I_E(d: Doc, ctx: dict, affidavit: bool = False) -> None:
    c, a = ctx["case"], ctx["asset"]
    dec = ctx.get("declarant") or {}
    heirs = (ctx.get("claimants") or []) + (ctx.get("nonClaimants") or [])
    d.title("Annex I-E", "DECLARATION/ AFFIDAVIT")
    d.note_box(STAMP, color=AMBER, fill=AMBER_TINT)
    d.para(f"I, {_v(dec.get('fullName'), '_____________________')} S/D/O {_v(dec.get('sdo'), '_____________________')} "
           f"residing at {_v(dec.get('address'), '______________________________________')} do hereby "
           f"{'make oath' if affidavit else 'solemnly affirm'} and say as follows:")
    d.para(f"That Shri/ Smt. /Kum. {c.get('deceasedName')} (Name of the deceased customer) hereinafter, referred to as "
           f"\"the deceased\" died intestate on {_v(c.get('dod'))} at {_v(c.get('placeOfDeath'))}.")
    d.para(f"2. That I know the deceased and his/ her family since the last {_v(dec.get('yearsKnown'), '____')} years.")
    d.para("3. That at the time of his/ her death, the deceased left surviving him/ her the following persons who "
           "according to the law by which they are governed, are the only legal heirs of the deceased entitled to succeed "
           "to the estate of the deceased on an intestate succession:")
    d.table(["Sr. No", "Name", "Age (yrs.)", "Relationship with the deceased"],
            [[str(i), p.get("fullName", ""), str(p.get("age") or ""), p.get("relation", "")] for i, p in enumerate(heirs[:6], 1)]
            or [["1", "", "", ""]], [45, 220, 70, 164], size=9)
    d.para("4. That I am not related in any manner whatsoever to the deceased or any of the above-mentioned persons nor have "
           "I any claim or interest of whatsoever nature in the estate of the deceased.")
    inst, br = _v(a.get("institution"), "________________"), _v(a.get("branch"), "____________")
    d.para(f"5. That I am informed, and I verily believe that the deceased has left certain *deposits/ safe deposit "
           f"locker/ articles in safe custody with the {inst} {br} branch, to which the above-mentioned persons are "
           "entitled to claim.")
    d.para(f"6. That I am making this solemn declaration sincerely and conscientiously believing the same to be true and "
           f"with full knowledge that it is on the strength of this declaration that the {inst} {br} branch, has agreed "
           "at my request to make payment of the amount of the deposits and *deliver the articles in safe deposit locker/ "
           "safe custody to the above mentioned persons without requiring production of a grant of legal document to the "
           "estate of the deceased from a competent Court by them.")
    d.para(f"*{'Sworn' if affidavit else 'Solemnly affirmed'} at __________ this ______ day of ______ two thousand ______.")
    d.signature_boxes([{**dec, "role": "Signature of Declarant"}], cols=1)
    if affidavit:
        d.signature_boxes([{"fullName": "", "role": "before me: Notary Public/ Judge/ Magistrate (seal)"}], cols=1)
    else:
        d.note_box("The declaration is required to be sworn as an affidavit before a Notary Public/ Judge/ Magistrate only "
                   "if the claim amount is above the threshold limit. This claim is within the threshold.")
    d.text("*(Delete whichever is not applicable)", size=8, color=AMBER)


RENDERERS = {"I-A": annex_I_A, "I-B": annex_I_B, "I-C": annex_I_C, "I-D": annex_I_D, "I-E": annex_I_E}

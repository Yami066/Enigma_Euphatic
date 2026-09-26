"""A ready-made sample case, so anyone can see the whole journey without typing their family's details in.

Everything here is synthetic: the people, the bank accounts and the statement rows below are invented.
The statement is run through the real detector, so the findings look exactly like a family's own would.
"""
from __future__ import annotations

from . import service as svc

# A few rows of an invented statement. Real parsing, invented money.
STATEMENT_CSV = """Date,Narration,Debit,Credit,Balance
02/01/2026,NEFT CR-HDFCL-HDFC LIFE INS-PREMIUM REFUND,,2150.00,214320.00
05/01/2026,ACH D- INDIAN CLEARING CORP-SIP HDFC FLEXI CAP,5000.00,,209320.00
10/01/2026,ACH C- ITC LTD-DIVIDEND FY26 INTERIM,,1840.00,211160.00
21/01/2026,PREMIUM LIC OF INDIA POLICY 892441237,12480.00,,198680.00
01/02/2026,ACH D- INDIAN CLEARING CORP-SIP HDFC FLEXI CAP,5000.00,,193680.00
05/02/2026,BY TRF-PMJJBY PREM SBI LIFE,436.00,,193244.00
14/02/2026,INT CREDIT-TERM DEPOSIT 00231 NANDINI SAHAKARI,,4820.00,198064.00
01/03/2026,ACH D- INDIAN CLEARING CORP-SIP HDFC FLEXI CAP,5000.00,,193064.00
18/03/2026,ACH C- INFOSYS LIMITED-DIVIDEND FINAL,,3200.00,196264.00
02/04/2026,EPFO CONTRIBUTION UAN 100234567890,,18500.00,214764.00
"""

CASE = {
    "deceasedName": "Ramesh Kumar Sharma",
    "dod": "2026-07-02",
    "dob": "1962-11-14",
    "relation": "Daughter",
    "yourName": "Riya Sharma",
    "secondsPerDay": 4,  # the 15-day clock runs in a minute, so the whole journey is visible
}

DETAILS = {
    "placeOfDeath": "Bengaluru",
    "deathCertNo": "BBMP/2026/0074521",
    "deathCertDate": "2026-07-09",
    "deathCertAuthority": "Bruhat Bengaluru Mahanagara Palike",
    "maritalStatus": "married",
    "deceasedAddress": "12, 4th Cross, Koramangala 5th Block",
    "deceasedCity": "Bengaluru",
    "deceasedPin": "560095",
    "deceasedState": "Karnataka",
    "religion": "hindu",
    "will": "no",
    "payment": {"accountHolder": "Sunita Sharma", "accountNumber": "30021144552210",
                "ifsc": "SBIN0004321", "bankName": "State Bank of India", "branch": "Koramangala"},
    "setupDone": ["about", "family", "payee", "banks", "investments"],
}

PEOPLE = [
    {"fullName": "Sunita Sharma", "relation": "Wife", "age": 48, "isClaimant": True, "isNominee": True,
     "address": "12, 4th Cross, Koramangala 5th Block, Bengaluru 560095", "phone": "9845000000",
     "idType": "Aadhaar", "idLast4": "0551", "bankName": "State Bank of India",
     "bankAccountNumber": "30021144552210", "bankIfsc": "SBIN0004321", "bankBranch": "Koramangala"},
    {"fullName": "Riya Sharma", "relation": "Daughter", "age": 20, "isClaimant": True,
     "address": "12, 4th Cross, Koramangala 5th Block, Bengaluru 560095", "idType": "Aadhaar", "idLast4": "7712"},
    {"fullName": "Arjun Sharma", "relation": "Son", "age": 26, "isNonClaimantHeir": True,
     "address": "Flat 9B, Sai Residency, Baner, Pune 411045"},
    {"fullName": "K. Venkatesh Rao", "relation": "Family friend", "age": 61, "isDeclarant": True,
     "yearsKnown": 22, "address": "14, 5th Cross, Koramangala 5th Block, Bengaluru 560095"},
]

ASSETS = [
    {"assetType": "bank_deposit", "institution": "State Bank of India", "bankType": "commercial",
     "branch": "Koramangala", "ifsc": "SBIN0004321", "accountNumbers": "30021144550098",
     "nomination": "nominee", "nomineeName": "Sunita Sharma", "amount": 245000, "source": "manual",
     "notes": "Savings account the pension was credited to."},
    {"assetType": "term_deposit", "institution": "Nandini Sahakari Bank", "bankType": "cooperative",
     "branch": "Jayanagar", "accountNumbers": "FD 00231", "nomination": "none", "amount": 320000,
     "source": "statement", "notes": "Interest credit on the statement led to this deposit."},
    {"assetType": "life_insurance", "institution": "Life Insurance Corporation of India",
     "identifiers": "Policy 892441237", "nomination": "nominee", "nomineeName": "Sunita Sharma",
     "amount": 500000, "source": "statement", "notes": "Premium debit found on the statement."},
    {"assetType": "mutual_fund", "institution": "HDFC Mutual Fund", "identifiers": "Folio 10294837/21",
     "nomination": "none", "amount": 186400, "source": "statement", "notes": "Monthly SIP debit on the statement."},
]

MAX_CASES = 12  # a sandbox account is shared, so stop it growing without limit


def _leads(cd: svc.CaseData) -> list[dict]:
    from ..discovery import scan_statement

    out = scan_statement(STATEMENT_CSV.encode(), "sample-statement.csv", "text/csv", case_key=cd.case_id)
    return out["leads"]


def seed_case(store, email: str) -> dict:
    """Create the sample case for this signed-in person and return its case id."""
    mine = svc.my_cases(store, email)
    demo = [c for c in mine if c.get("demo")]
    if len(mine) >= MAX_CASES and demo:
        return {"caseId": demo[0]["caseId"], "created": False}

    case = svc.create_case(store, email, CASE)
    cd = svc.load_case(store, case["caseId"])
    store.update(svc.pk(cd.case_id), "META", {"demo": True})
    svc.update_case(store, cd, DETAILS)

    for person in PEOPLE:
        svc.upsert_person(store, cd, "new", person)
    cd = svc.load_case(store, cd.case_id)
    by_name = {p["fullName"]: p["personId"] for p in cd.people}

    for asset in ASSETS:
        created = svc.create_asset(store, cd, {**asset, "include": True}, email)
        cd = svc.load_case(store, cd.case_id)
        if asset["assetType"] == "term_deposit":  # the route that needs a disclaimer and a declarant
            svc.update_asset(store, cd, created["assetId"], {
                "claimantPersonIds": [by_name["Sunita Sharma"], by_name["Riya Sharma"]],
                "nonClaimantPersonIds": [by_name["Arjun Sharma"]],
                "declarantPersonId": by_name["K. Venkatesh Rao"],
            }, email)
            cd = svc.load_case(store, cd.case_id)

    leads = _leads(cd)
    saved = svc.save_leads(store, cd, leads, "demo-statement")
    svc.add_event(store, cd.case_id, "scan",
                  f"Read a sample bank statement and found {len(saved)} possible asset(s).", email,
                  text_hi=f"नमूना बैंक स्टेटमेंट पढ़ा और {len(saved)} संभावित संपत्तियां मिलीं।")
    svc.add_event(store, cd.case_id, "demo",
                  "Sample case loaded. Every name, account and amount here is invented.", email,
                  text_hi="नमूना केस लोड हुआ। इसमें हर नाम, खाता और राशि काल्पनिक है।")
    return {"caseId": cd.case_id, "created": True, "leads": len(saved), "assets": len(ASSETS)}

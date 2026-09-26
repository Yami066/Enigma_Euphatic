"""Transactions → leads (possible assets and liabilities).

Ordered, explainable rules: every lead keeps the exact statement lines that
produced it (evidence), so the family can see *why* we think a policy or a
share holding exists. The model is not used here; unclear lines are returned
separately so the assistant can *suggest* a category that a human confirms.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from functools import lru_cache

from rapidfuzz import fuzz

from .statement import Statement, Txn, dictionary, norm

# ------------------------------------------------------------------ lead model

LEAD_TYPES = {
    "shares": {"asset_type": "shares", "en": "Shares (dividends received)", "hi": "शेयर (लाभांश प्राप्त)"},
    "broker": {"asset_type": "shares", "en": "Demat / broking account", "hi": "डीमैट / ब्रोकिंग खाता"},
    "mutual_fund": {"asset_type": "mutual_fund", "en": "Mutual fund investments", "hi": "म्यूचुअल फंड निवेश"},
    "life_insurance": {"asset_type": "life_insurance", "en": "Life insurance policy", "hi": "जीवन बीमा पॉलिसी"},
    "health_insurance": {"asset_type": "other", "en": "Health / general insurance policy", "hi": "स्वास्थ्य / सामान्य बीमा पॉलिसी"},
    "pmjjby": {"asset_type": "pmjjby", "en": "PMJJBY life cover (₹2 lakh)", "hi": "पीएमजेजेबीवाई जीवन बीमा (₹2 लाख)"},
    "pmsby": {"asset_type": "pmsby", "en": "PMSBY accident cover (₹2 lakh)", "hi": "पीएमएसबीवाई दुर्घटना बीमा (₹2 लाख)"},
    "govt_scheme": {"asset_type": "govt_scheme", "en": "Government savings / pension scheme", "hi": "सरकारी बचत / पेंशन योजना"},
    "deposit": {"asset_type": "term_deposit", "en": "Fixed / recurring deposit", "hi": "सावधि / आवर्ती जमा"},
    "loan": {"asset_type": "loan", "en": "Loan (liability) — check if insured", "hi": "ऋण (देनदारी) — बीमा जांचें"},
    "credit_card": {"asset_type": "credit_card", "en": "Credit card (liability)", "hi": "क्रेडिट कार्ड (देनदारी)"},
    "employer": {"asset_type": "epf", "en": "Employer: PF, gratuity, group insurance", "hi": "नियोक्ता: पीएफ, ग्रेच्युटी, समूह बीमा"},
    "pension": {"asset_type": "other", "en": "Pension being received", "hi": "प्राप्त हो रही पेंशन"},
}

NEXT_STEPS = {
    "shares": [
        {"en": "Find the demat account: look for NSDL/CDSL 'CAS' emails, DigiLocker, or ask the company's RTA with a dividend date.", "hi": "डीमैट खाता खोजें: NSDL/CDSL के CAS ईमेल, डिजीलॉकर, या कंपनी के आरटीए से पूछें।"},
        {"en": "Check IEPF for older dividends that were never paid out.", "hi": "आईईपीएफ पर पुराने अनपेड लाभांश जांचें।"},
    ],
    "broker": [
        {"en": "Ask the broker / DP for the holding statement and their transmission form.", "hi": "ब्रोकर/डीपी से होल्डिंग विवरण और हस्तांतरण फ़ॉर्म मांगें।"},
    ],
    "mutual_fund": [
        {"en": "List every folio with a CAS (CAMS / KFintech) or SEBI MITRA, then request transmission from the AMC.", "hi": "सीएएस या सेबी मित्रा से सभी फोलियो की सूची बनाएं, फिर एएमसी से हस्तांतरण मांगें।"},
        {"en": "Stop the SIP so money doesn't keep leaving the account.", "hi": "एसआईपी बंद कराएं ताकि खाते से पैसा न कटे।"},
    ],
    "life_insurance": [
        {"en": "Tell the insurer about the death and ask for the claim form; policy number is on premium receipts.", "hi": "बीमा कंपनी को सूचना दें और दावा फ़ॉर्म मांगें।"},
    ],
    "health_insurance": [
        {"en": "Check whether the policy includes personal-accident or group life cover; cancel future renewals.", "hi": "देखें कि पॉलिसी में दुर्घटना या समूह जीवन कवर है या नहीं।"},
    ],
    "pmjjby": [
        {"en": "The ₹436 yearly debit means ₹2 lakh of life cover: the nominee claims at this bank branch with the death certificate.", "hi": "₹436 की कटौती का मतलब ₹2 लाख का बीमा: नामिती इसी शाखा में दावा करे।"},
    ],
    "pmsby": [
        {"en": "Pays ₹2 lakh only for accidental death: claim at this bank branch with the FIR / post-mortem report.", "hi": "केवल दुर्घटना मृत्यु पर ₹2 लाख: एफआईआर/पोस्टमार्टम रिपोर्ट के साथ दावा करें।"},
    ],
    "govt_scheme": [
        {"en": "Claim under the scheme's own rules at the post office / bank / NPS point of presence (outside RBI's 2025 Directions, para 6(b)).", "hi": "योजना के नियमों के अनुसार डाकघर/बैंक में दावा करें।"},
    ],
    "deposit": [
        {"en": "Ask the bank for every deposit held under the customer ID; FDs can be closed early without penalty (para 13).", "hi": "ग्राहक आईडी पर सभी जमा की सूची मांगें; एफडी बिना जुर्माने के बंद हो सकती है।"},
    ],
    "loan": [
        {"en": "Ask the lender for the loan statement and whether loan-protection insurance was bundled before paying anything.", "hi": "कुछ भी चुकाने से पहले पूछें कि क्या ऋण बीमा जुड़ा था।"},
    ],
    "credit_card": [
        {"en": "Inform the card issuer; ask about any card-linked insurance cover and the outstanding amount.", "hi": "कार्ड जारीकर्ता को सूचित करें; कार्ड बीमा के बारे में पूछें।"},
    ],
    "employer": [
        {"en": "Ask HR for the UAN, EPF composite death claim (Forms 20/10D/5IF), gratuity and group insurance.", "hi": "एचआर से यूएएन, ईपीएफ दावा, ग्रेच्युटी और समूह बीमा के बारे में पूछें।"},
    ],
    "pension": [
        {"en": "Inform the pension-paying bank/office to stop payments and ask about family pension for the spouse.", "hi": "पेंशन कार्यालय को सूचित करें और पति/पत्नी की पारिवारिक पेंशन के बारे में पूछें।"},
    ],
}

PORTALS = {
    "shares": ["iepf", "unified"],
    "broker": ["unified"],
    "mutual_fund": ["mitra", "unified"],
    "life_insurance": ["insurer_unclaimed", "unified"],
    "health_insurance": [],
    "pmjjby": [],
    "pmsby": [],
    "govt_scheme": ["unified"],
    "deposit": ["udgam", "unified"],
    "loan": [],
    "credit_card": [],
    "employer": ["epfo"],
    "pension": [],
}


@dataclass
class Evidence:
    date: str
    narration: str
    amount: float
    direction: str


@dataclass
class Lead:
    id: str
    type: str
    asset_type: str
    institution: str
    confidence: str
    label: dict
    reason: dict
    evidence: list[Evidence] = field(default_factory=list)
    count: int = 0
    credits: int = 0
    debits: int = 0
    total_inr: float = 0.0
    first_date: str | None = None
    last_date: str | None = None
    pattern: str | None = None
    next_steps: list[dict] = field(default_factory=list)
    portals: list[str] = field(default_factory=list)
    asset_facts: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------------ matching

@lru_cache(maxsize=None)
def _entries(kind: str) -> list[tuple[str, dict]]:
    out = []
    for e in dictionary()[kind]:
        for a in e["aliases"]:
            out.append((norm(a), e))
    return sorted(out, key=lambda t: len(t[0]), reverse=True)


def match(kind: str, text_norm: str, fuzzy: bool = True) -> tuple[dict | None, str | None]:
    padded = f" {text_norm} "
    for alias, entry in _entries(kind):
        if f" {alias} " in padded:
            return entry, "exact"
    if fuzzy:
        best, score = None, 0.0
        for alias, entry in _entries(kind):
            if len(alias) < 6:
                continue
            s = fuzz.partial_ratio(alias, text_norm)
            if s > score:
                best, score = entry, s
        if best and score >= 92:
            return best, "fuzzy"
    return None, None


def has(pattern: str, text_norm: str) -> bool:
    return re.search(pattern, f" {text_norm} ") is not None


# ------------------------------------------------------------------ rules

DIV = r" (DIV|DIVD|DIVIDEND|INT DIV|FINAL DIV|INTERIM DIV) "
LOAN = r" (EMI|LOAN|HOME LOAN|HL|HOUSING FIN|PERSONAL LOAN|CAR LOAN|VEHICLE LOAN|LAP) "
CARD = r" (CREDIT CARD|CC PAYMENT|CARD PAYMENT|CARD BILL|CRED CLUB|CREDCLUB) "
MF_HINT = r" (MF|SIP|MUTUAL FUND|CAMS|KFIN|KFINTECH|KARVY|BSESTARMF|BSE STAR MF|ICCL|MFSS|MF UTILITIES|MFUTILITY) "
PREMIUM = r" (PREMIUM|PREM|RENEWAL PREM|POLICY) "
MATURITY = r" (MATURITY|SURVIVAL BENEFIT|MONEY BACK|MONEYBACK) "
SALARY = r" (SALARY|SAL|PAYROLL|SAL CR) "
PENSION = r" (PENSION|PEN CR|FAMILY PENSION|SPARSH|CPAO) "
DEPOSIT = r" (FD|TD|RD|TERM DEPOSIT|FIXED DEPOSIT|RECURRING|RD INST|RD INSTALMENT|FD INT|TD INT|FD MATURITY|INT ON FD) "


TXN_WORDS = {"NEFT", "RTGS", "IMPS", "UPI", "ACH", "NACH", "ECS", "CR", "DR", "C", "D", "TO", "FROM", "BY",
             "TRF", "TRANSFER", "INB", "MB", "IB", "BIL", "BILL", "PAY", "PAYMENT"}


def _strip_txn_words(s: str) -> str:
    words = s.split()
    while words and words[0] in TXN_WORDS:
        words.pop(0)
    return " ".join(words)


def _employer_name(narration: str) -> str | None:
    parts = re.split(r"[/\-|:]+", narration.upper())
    for p in parts:
        p = " ".join(p.split())
        if re.search(r"\b(PVT|PRIVATE|LTD|LIMITED|LLP|TECHNOLOGIES|SERVICES|INDUSTRIES|CORPORATION)\b", p) and len(p) > 4:
            return p.title()
    return None


def classify(t: Txn, stmt: Statement) -> tuple[str, str, str, str] | None:
    """Return (lead_type, institution, confidence, pattern) or None."""
    n = norm(t.narration)
    bank = stmt.bank_name or "this bank"

    if has(r" (PMJJBY|JEEVAN JYOTI) ", n):
        return "pmjjby", f"PMJJBY through {bank}", "high", "PMJJBY"
    if has(r" (PMSBY|SURAKSHA BIMA) ", n):
        return "pmsby", f"PMSBY through {bank}", "high", "PMSBY"
    if has(r" (APY|ATAL PENSION) ", n):
        return "govt_scheme", "Atal Pension Yojana", "high", "APY"
    if has(r" (NPS|PRAN|NPS TRUST) ", n):
        return "govt_scheme", "National Pension System (NPS)", "high", "NPS"
    if has(r" (PPF|PUBLIC PROVIDENT) ", n):
        return "govt_scheme", "Public Provident Fund (PPF)", "high", "PPF"
    if has(r" (SSY|SUKANYA) ", n):
        return "govt_scheme", "Sukanya Samriddhi account", "high", "SSY"
    if has(r" (SCSS|SENIOR CITIZEN SAVINGS) ", n):
        return "govt_scheme", "Senior Citizens' Savings Scheme", "high", "SCSS"
    if has(r" (NSC|KVP|KISAN VIKAS|POST OFFICE|INDIA POST|DOP) ", n) and not has(r" IPPB ", n):
        return "govt_scheme", "Post office savings (NSC / KVP / RD)", "medium", "POST OFFICE"

    if t.credit and has(DIV, n):
        company, how = match("companies", n)
        if company:
            return "shares", company["name"], "high" if how == "exact" else "medium", "DIVIDEND"
        return "shares", "Unlisted/unknown company (dividend credit)", "medium", "DIVIDEND"

    lender, how_l = match("lenders", n, fuzzy=False)
    if t.debit and (lender or has(LOAN, n)):
        name = lender["name"] if lender else "Loan (from EMI debits)"
        return "loan", name, "high" if lender and has(LOAN, n) else "medium", "EMI"
    if t.debit and has(CARD, n):
        return "credit_card", "Credit card", "medium", "CARD"

    broker, how_b = match("brokers", n, fuzzy=False)
    if broker:
        return "broker", broker["name"], "high", "BROKER"

    amc, how_a = match("amcs", n)
    if amc or has(MF_HINT, n):
        if amc:
            return "mutual_fund", amc["name"], "high" if how_a == "exact" else "medium", "SIP" if t.debit else "MF"
        via = next((k for k in ["CAMS", "KFINTECH", "KFIN", "BSESTARMF", "ICCL", "MFSS"] if f" {k} " in f" {n} "), None)
        return "mutual_fund", f"Mutual fund (via {via})" if via else "Mutual fund (AMC not named)", "medium", "SIP" if t.debit else "MF"

    insurer, how_i = match("insurers", n)
    if insurer and (t.debit or has(MATURITY, n)):
        kind = "life_insurance" if insurer.get("kind") == "life" else "health_insurance"
        return kind, insurer["name"], "high" if how_i == "exact" else "medium", "PREMIUM" if t.debit else "MATURITY"
    if t.debit and has(PREMIUM, n):
        return "life_insurance", "Insurance policy (insurer not named)", "low", "PREMIUM"

    if t.credit and has(SALARY, n):
        return "employer", _employer_name(t.narration) or "Employer (from salary credits)", "medium", "SALARY"
    if t.credit and has(PENSION, n):
        return "pension", "Pension payer", "medium", "PENSION"

    if has(DEPOSIT, n) and not has(r" (SB INT|SAVINGS INT) ", n):
        other_bank, _ = match("banks", n, fuzzy=False)
        coop = any(f" {norm(mk)} " in f" {n} " for mk in dictionary()["coop_markers"])
        if other_bank:
            where = other_bank["name"]
        elif coop:
            m = re.search(r"([A-Z][A-Z ]*(?:CO OP|COOP|COOPERATIVE|SAHAKARI|SAHAKARA)[A-Z ]*BANK)", n)
            where = _strip_txn_words(m.group(1)).title() if m else "A co-operative bank"
        else:
            where = f"{bank} (another deposit)"
        return "deposit", where, "medium", "DEPOSIT"
    return None


SCHEME_TYPES = (("NPS", "nps"), ("PPF", "ppf"), ("Post office", "post_office"), ("Senior Citizens", "post_office"))

SIGNALS = {  # pattern -> what the matched entries look like (en, hi)
    "PMJJBY": ("PMJJBY premium", "PMJJBY प्रीमियम"),
    "PMSBY": ("PMSBY premium", "PMSBY प्रीमियम"),
    "APY": ("Atal Pension Yojana contribution", "अटल पेंशन योजना अंशदान"),
    "NPS": ("NPS contribution", "NPS अंशदान"),
    "PPF": ("PPF deposit", "PPF जमा"),
    "SSY": ("Sukanya Samriddhi deposit", "सुकन्या समृद्धि जमा"),
    "SCSS": ("Senior Citizens' Savings Scheme", "वरिष्ठ नागरिक बचत योजना"),
    "POST OFFICE": ("Post office savings", "डाकघर बचत"),
    "DIVIDEND": ("Dividend", "लाभांश"),
    "EMI": ("Loan EMI", "लोन की EMI"),
    "CARD": ("Credit card payment", "क्रेडिट कार्ड भुगतान"),
    "BROKER": ("Broker transfer", "ब्रोकर से लेन-देन"),
    "SIP": ("Mutual fund SIP", "म्यूचुअल फंड SIP"),
    "MF": ("Mutual fund payout", "म्यूचुअल फंड से भुगतान"),
    "PREMIUM": ("Insurance premium", "बीमा प्रीमियम"),
    "MATURITY": ("Policy maturity / survival benefit", "पॉलिसी मैच्योरिटी / सर्वाइवल बेनिफ़िट"),
    "SALARY": ("Salary", "वेतन"),
    "PENSION": ("Pension", "पेंशन"),
    "DEPOSIT": ("FD / RD interest or instalment", "FD / RD ब्याज या किस्त"),
}


def _reason(lead: Lead, recurring: bool) -> dict:
    """'Mutual fund SIP: 12 debits from 2025-09-05 to 2026-08-05, same amount each time'."""
    en_sig, hi_sig = SIGNALS.get(lead.pattern or "", (lead.pattern or "Match", lead.pattern or "मेल"))
    parts_en = [f"{n} {w}{'s' if n != 1 else ''}" for n, w in ((lead.credits, "credit"), (lead.debits, "debit")) if n]
    parts_hi = [f"{n} {w}" for n, w in ((lead.credits, "क्रेडिट"), (lead.debits, "डेबिट")) if n]
    if lead.first_date == lead.last_date:
        when_en, when_hi = f"on {lead.first_date}", f"{lead.first_date} को"
    else:
        when_en, when_hi = f"from {lead.first_date} to {lead.last_date}", f"{lead.first_date} से {lead.last_date} तक"
    return {
        "en": f"{en_sig}: {' and '.join(parts_en)} {when_en}" + (", same amount each time" if recurring else ""),
        "hi": f"{hi_sig}: {when_hi} {' और '.join(parts_hi)}" + (", हर बार एक ही राशि" if recurring else ""),
    }


def _lead_id(case_key: str, lead_type: str, institution: str) -> str:
    return hashlib.sha1(f"{case_key}|{lead_type}|{institution.upper()}".encode()).hexdigest()[:12]


def _pattern_note(ev: list[Evidence]) -> str | None:
    if len(ev) < 3:
        return None
    amounts = [e.amount for e in ev]
    if max(amounts) - min(amounts) <= 0.02 * max(amounts):
        return "recurring"
    return "repeated"


def detect_leads(stmt: Statement, case_key: str = "") -> tuple[list[Lead], list[Txn]]:
    """Returns (leads, unclear) where unclear are debit/credit lines we couldn't classify
    but that look like money going to or coming from an institution (not UPI/ATM/cash)."""
    leads: dict[tuple[str, str], Lead] = {}
    unclear: list[Txn] = []
    for t in stmt.txns:
        got = classify(t, stmt)
        if not got:
            n = norm(t.narration)
            if (t.amount or 0) >= 200 and has(r" (NACH|ACH|ECS|SI|STANDING|NEFT|RTGS) ", n) and not has(r" (UPI|ATM|CASH|POS) ", n):
                unclear.append(t)
            continue
        lead_type, institution, confidence, pattern = got
        key = (lead_type, institution)
        meta = LEAD_TYPES[lead_type]
        lead = leads.get(key)
        if lead is None:
            lead = Lead(
                id=_lead_id(case_key, lead_type, institution),
                type=lead_type,
                asset_type=meta["asset_type"],
                institution=institution,
                confidence=confidence,
                label={"en": meta["en"], "hi": meta["hi"]},
                reason={},
                next_steps=NEXT_STEPS.get(lead_type, []),
                portals=PORTALS.get(lead_type, []),
            )
            leads[key] = lead
        order = {"low": 0, "medium": 1, "high": 2}
        if order[confidence] > order[lead.confidence]:
            lead.confidence = confidence
        lead.count += 1
        if t.credit:
            lead.credits += 1
        else:
            lead.debits += 1
        lead.total_inr = round(lead.total_inr + t.amount, 2)
        lead.first_date = min(filter(None, [lead.first_date, t.date]))
        lead.last_date = max(filter(None, [lead.last_date, t.date]))
        lead.pattern = pattern
        if len(lead.evidence) < 6:
            lead.evidence.append(Evidence(date=t.date, narration=t.narration, amount=t.amount, direction=t.direction))

    out = []
    for lead in leads.values():
        lead.reason = _reason(lead, _pattern_note(lead.evidence) == "recurring")
        if lead.type == "govt_scheme":  # each scheme has its own claim playbook
            lead.asset_type = next((t for key, t in SCHEME_TYPES if key in lead.institution), "govt_scheme")
        facts: dict = {"asset_type": lead.asset_type, "institution": lead.institution}
        if lead.type == "deposit":
            facts["bank_type"] = "cooperative" if any(
                f" {norm(mk)} " in f" {norm(lead.institution)} " for mk in dictionary()["coop_markers"]) else (
                stmt.bank_type if lead.institution.startswith(stmt.bank_name or "~") or "this bank" in lead.institution else None)
        lead.asset_facts = facts
        out.append(lead)

    priority = {"pmjjby": 0, "pmsby": 1, "shares": 2, "mutual_fund": 3, "life_insurance": 4, "deposit": 5,
                "govt_scheme": 6, "employer": 7, "broker": 8, "health_insurance": 9, "loan": 10,
                "credit_card": 11, "pension": 12}
    out.sort(key=lambda l: (priority.get(l.type, 99), -l.total_inr))
    return out, unclear

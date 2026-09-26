"""Search kit: official searches the family runs themselves.

These portals need registration, OTP and captcha, and there's no public API,
so we never automate them. We prepare exactly what to type, in the order the
portal asks for it, and the family records what they find.

Important limitation shown in the UI: UDGAM, MITRA and IEPF only list money
that has been dormant for years (bank deposits 10+ years, MF folios with no
activity for 10 years, dividends unpaid for 7 years). A recent death's active
accounts are found from the family's own documents instead.
"""
from __future__ import annotations

from .names import name_variants

PORTALS = {
    "unified": {
        "name": "Your Money, Your Right (unified portal)",
        "url": "https://www.unclaimedassetsportal.in",
        "owner": "Department of Financial Services, Govt. of India (launched 1 Jun 2026)",
        "finds": {"en": "A single gateway that links to all the searches below.",
                  "hi": "नीचे दी गई सभी खोजों का एक ही प्रवेश द्वार।"},
        "dormant_only": True,
        "fields": [],
    },
    "udgam": {
        "name": "RBI UDGAM",
        "url": "https://udgam.rbi.org.in",
        "owner": "Reserve Bank of India",
        "finds": {"en": "Bank deposits unclaimed for 10+ years (moved to RBI's DEA Fund); 30+ banks, ~90% of the money.",
                  "hi": "10+ वर्षों से अनक्लेम्ड बैंक जमा (आरबीआई डीईए फंड)।"},
        "dormant_only": True,
        "fields": ["name", "banks", "one_of:pan,dob,driving_licence,voter_id,passport"],
    },
    "mitra": {
        "name": "SEBI MITRA (via MF Central / AMFI)",
        "url": "https://www.mfcentral.com",
        "owner": "SEBI with CAMS and KFintech (Feb 2025)",
        "finds": {"en": "Mutual fund folios with no investor activity for 10 years; lets a rightful claimant search another person's folios.",
                  "hi": "10 वर्षों से निष्क्रिय म्यूचुअल फंड फोलियो; दावेदार किसी और के फोलियो खोज सकता है।"},
        "dormant_only": True,
        "fields": ["pan", "name"],
    },
    "iepf": {
        "name": "IEPF Authority",
        "url": "https://www.iepf.gov.in",
        "owner": "Ministry of Corporate Affairs",
        "finds": {"en": "Dividends unpaid for 7 years and the shares moved with them; claim with Form IEPF-5.",
                  "hi": "7 वर्षों से अनपेड लाभांश और शेयर; फ़ॉर्म IEPF-5 से दावा।"},
        "dormant_only": True,
        "fields": ["name", "folio_optional", "companies"],
    },
    "insurer_unclaimed": {
        "name": "Insurers' unclaimed-amount search",
        "url": "https://licindia.in",
        "owner": "Each insurer (IRDAI requires a search page)",
        "finds": {"en": "Policy money not collected; search on each insurer's website with policy number, name and date of birth.",
                  "hi": "बिना लिया गया पॉलिसी पैसा; हर बीमा कंपनी की वेबसाइट पर खोजें।"},
        "dormant_only": False,
        "fields": ["name", "dob", "policy_optional", "insurers"],
    },
    "epfo": {
        "name": "EPFO",
        "url": "https://www.epfindia.gov.in",
        "owner": "Employees' Provident Fund Organisation",
        "finds": {"en": "PF, pension (EPS) and EDLI insurance; the employer's HR can share the UAN.",
                  "hi": "पीएफ, पेंशन और ईडीएलआई बीमा; एचआर से यूएएन लें।"},
        "dormant_only": False,
        "fields": ["uan_optional", "employer"],
    },
    "digilocker": {
        "name": "DigiLocker (data-access nominee)",
        "url": "https://www.digilocker.gov.in",
        "owner": "MeitY / SEBI (from Apr 2025)",
        "finds": {"en": "If the person named you a data-access nominee, you get read-only access to their demat and MF statements.",
                  "hi": "यदि आपको डेटा-एक्सेस नामिती बनाया गया था, तो डीमैट और एमएफ विवरण देख सकते हैं।"},
        "dormant_only": False,
        "fields": [],
    },
    "income_tax": {
        "name": "Income-tax portal: register as legal heir, then see AIS / 26AS",
        "url": "https://www.incometax.gov.in",
        "owner": "Income Tax Department",
        "finds": {"en": "After approval, the tax statements list every bank that paid interest and every company that paid dividends: the most complete map.",
                  "hi": "मंज़ूरी के बाद कर विवरण में ब्याज देने वाले सभी बैंक और लाभांश देने वाली कंपनियां दिखती हैं।"},
        "dormant_only": False,
        "fields": ["pan", "dob", "legal_heir_certificate"],
    },
}


def build_search_kit(case: dict, leads: list[dict] | None = None) -> dict:
    """case: {deceasedName, dob?, pan?}; leads: lead dicts (to shortlist banks/companies/insurers)."""
    leads = leads or []
    name = case.get("deceasedName") or ""
    variants = name_variants(name)
    banks = sorted({l["institution"] for l in leads if l.get("type") in {"deposit"}} |
                   ({case["statementBank"]} if case.get("statementBank") else set()))
    companies = sorted({l["institution"] for l in leads if l.get("type") == "shares" and "unknown" not in l["institution"].lower()})
    insurers = sorted({l["institution"] for l in leads if l.get("type") in {"life_insurance", "health_insurance"}})
    amcs = sorted({l["institution"] for l in leads if l.get("type") == "mutual_fund"})
    employers = sorted({l["institution"] for l in leads if l.get("type") == "employer"})

    values = {
        "name": variants,
        "pan": case.get("pan") or "",
        "dob": case.get("dob") or "",
        "banks": banks,
        "companies": companies,
        "insurers": insurers,
        "amcs": amcs,
        "employer": employers,
    }
    order = ["unified", "udgam", "mitra", "iepf", "insurer_unclaimed", "epfo", "digilocker", "income_tax"]
    kit = []
    for pid in order:
        p = PORTALS[pid]
        prefill = {}
        for f in p["fields"]:
            key = f.split(":")[0].replace("_optional", "")
            if key == "one_of":
                prefill["identifier"] = {"pan": values["pan"], "dob": values["dob"]}
            elif key in values:
                prefill[key] = values[key]
        relevant = True
        if pid == "iepf":
            relevant = bool(companies) or True
        kit.append({"id": pid, **p, "prefill": prefill, "relevant": relevant})
    return {
        "note": {"en": "These official searches mostly find money dormant for 7–10+ years. Recent accounts are found from your documents.",
                 "hi": "ये आधिकारिक खोजें ज़्यादातर 7–10+ वर्षों से निष्क्रिय पैसा दिखाती हैं। हाल के खाते आपके दस्तावेज़ों से मिलते हैं।"},
        "nameVariants": variants,
        "portals": kit,
    }

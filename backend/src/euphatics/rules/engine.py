"""Deterministic route engine.

Rules live in data/*.json (rules as data). This module only evaluates them:
no model is involved, and every result carries the paragraph and exact quote
it came from, so the UI can always show "why".

Evaluation is ordered and three-valued (true / false / unknown), the same idea
as SchemeProof's "needs information": if an earlier rule can't be ruled out
because a fact is unknown, we ask for that fact instead of guessing.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"

BANK_ASSETS = {"bank_deposit", "term_deposit"}
LOCKER_ASSETS = {"locker", "safe_custody"}
OTHER_ASSETS = {
    "epf", "life_insurance", "pmjjby", "pmsby", "mutual_fund", "shares", "nps", "ppf", "post_office",
    "govt_scheme", "credit_card", "loan", "other",
}
ASSET_TYPES = BANK_ASSETS | LOCKER_ASSETS | OTHER_ASSETS
BANK_TYPES = {"cooperative", "commercial"}
NOMINATIONS = {"nominee", "survivor", "none", "unknown"}

QUESTIONS = {
    "nomination": {
        "fact": "nomination",
        "en": "Did this account have a nominee, or was it a joint 'either or survivor' account?",
        "hi": "क्या इस खाते में नामिती था, या यह 'कोई भी या उत्तरजीवी' वाला संयुक्त खाता था?",
        "options": ["nominee", "survivor", "none"],
    },
    "amount": {
        "fact": "amount",
        "en": "Roughly how much is in it, including interest?",
        "hi": "इसमें ब्याज सहित लगभग कितनी राशि है?",
    },
    "value": {
        "fact": "amount",
        "en": "Roughly how much is it worth today?",
        "hi": "आज इसका लगभग कितना मूल्य है?",
    },
    "bank_type": {
        "fact": "bank_type",
        "en": "Is it a co-operative bank or another (commercial) bank?",
        "hi": "क्या यह सहकारी बैंक है या अन्य (वाणिज्यिक) बैंक?",
        "options": ["cooperative", "commercial"],
    },
}


@dataclass
class Facts:
    asset_type: str
    bank_type: str | None = None          # 'cooperative' | 'commercial'
    nomination: str = "unknown"           # 'nominee' | 'survivor' | 'none' | 'unknown'
    amount: float | None = None           # aggregate amount payable incl. interest (INR)
    will: bool = False
    dispute: bool = False
    court_order: bool = False
    joint: bool = False
    non_claimant_heirs: int = 0
    legal_heir_certificate: bool = False

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Facts":
        allowed = {k: d[k] for k in cls.__dataclass_fields__ if k in d and d[k] is not None}
        f = cls(**allowed)
        f.validate()
        return f

    def validate(self) -> None:
        if self.asset_type not in ASSET_TYPES:
            raise ValueError(f"unknown asset_type {self.asset_type!r}")
        if self.nomination not in NOMINATIONS:
            raise ValueError(f"unknown nomination {self.nomination!r}")
        if self.bank_type is not None and self.bank_type not in BANK_TYPES:
            raise ValueError(f"unknown bank_type {self.bank_type!r}")
        if self.amount is not None and float(self.amount) < 0:
            raise ValueError("amount cannot be negative")


@dataclass
class RouteResult:
    route: str
    rule_id: str | None
    automation: str                        # full | partial | stop | checklist | needs_info
    title: dict
    documents: list[dict] = field(default_factory=list)
    forms: list[str] = field(default_factory=list)
    citation: dict | None = None
    notes: list[dict] = field(default_factory=list)
    missing: list[dict] = field(default_factory=list)
    threshold: dict | None = None
    checklist: list[dict] = field(default_factory=list)
    where: str | None = None
    url: str | None = None
    verified: bool = True
    steps: list[dict] = field(default_factory=list)
    timeline: dict | None = None
    sources: list[dict] = field(default_factory=list)
    variant: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@lru_cache(maxsize=1)
def load_guides() -> dict:
    with open(DATA_DIR / "guides.json", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def load_rulebook() -> dict:
    with open(DATA_DIR / "rbi_deceased_2025.json", encoding="utf-8") as fh:
        rbi = json.load(fh)
    with open(DATA_DIR / "other_assets.json", encoding="utf-8") as fh:
        other = json.load(fh)
    return {"rbi": rbi, "other": other}


def _threshold_for(bank_type: str | None, book: dict) -> float | None:
    if bank_type is None:
        return None
    t = book["thresholds"]
    return float(t["cooperative"] if bank_type == "cooperative" else t["other"])


def _derived(facts: Facts, book: dict) -> dict[str, Any]:
    """Facts as the rule conditions see them. None means unknown."""
    threshold = _threshold_for(facts.bank_type, book)
    lte = None
    if threshold is not None and facts.amount is not None:
        # Para 10(a) covers claims "up to" the threshold; 10(b) is "above" it.
        lte = float(facts.amount) <= threshold
    return {
        "court_order": facts.court_order,
        "dispute": facts.dispute,
        "will": facts.will,
        "nomination": None if facts.nomination == "unknown" else facts.nomination,
        "amount_lte_threshold": lte,
        "joint": facts.joint,
    }


def _check(cond_value: Any, fact_value: Any) -> bool | None:
    if fact_value is None:
        return None
    if isinstance(cond_value, list):
        return fact_value in cond_value
    return fact_value == cond_value


def _unknown_questions(rule: dict, derived: dict, facts: Facts) -> list[dict]:
    qs: list[dict] = []
    for key, cond in rule["when"].items():
        if derived.get(key) is not None:
            continue
        if key == "nomination":
            qs.append(QUESTIONS["nomination"])
        elif key == "amount_lte_threshold":
            if facts.amount is None:
                qs.append(QUESTIONS["amount"])
            if facts.bank_type is None:
                qs.append(QUESTIONS["bank_type"])
    return qs


def _documents(rule: dict, book: dict, facts: Facts) -> tuple[list[dict], list[str]]:
    docs: list[dict] = []
    forms: list[str] = []
    for doc_id in rule["documents"]:
        spec = dict(book["documents"][doc_id])
        if spec.get("only_if") == "non_claimant_heirs" and facts.non_claimant_heirs <= 0:
            continue
        if facts.asset_type == "safe_custody" and doc_id == "inventory_I_F":
            doc_id, spec = "inventory_I_G", dict(book["documents"]["inventory_I_G"])
        if doc_id.startswith("heirship_") and facts.legal_heir_certificate:
            spec = {
                "en": "Legal Heir Certificate issued by a competent authority (you have one, so the Annex I-E declaration isn't needed)",
                "hi": "सक्षम प्राधिकारी द्वारा जारी कानूनी वारिस प्रमाण पत्र",
            }
        spec["id"] = doc_id
        guide = load_guides()["rbiDocs"].get(doc_id)
        if guide:
            spec["guide"] = guide
        docs.append(spec)
        form = spec.get("form")
        if form and not spec.get("at_branch") and form not in forms:
            forms.append(form)
    return docs, forms


def _citation(book: dict, para: str, quote: str) -> dict:
    src = book["source"]
    return {
        "source_id": src["id"],
        "title": src["title"],
        "ref": src["ref"],
        "url": src["url"],
        "file": src["file"],
        "para": para,
        "quote": quote,
    }


def _notes(rule: dict, book: dict, facts: Facts) -> list[dict]:
    out: list[dict] = []
    for n in rule.get("notes", []):
        if n.get("only_if") == "joint" and not facts.joint:
            continue
        out.append({**n, "citation": _citation(book, n["para"], n["quote"])})
    extra = book["extra_notes"]
    if facts.asset_type == "term_deposit":
        n = extra["term_deposit"]
        out.append({**n, "citation": _citation(book, n["para"], n["quote"])})
    n = extra["acknowledgement"]
    out.append({**n, "citation": _citation(book, n["para"], n["quote"])})
    return out


def _evaluate_rbi(facts: Facts, book: dict) -> RouteResult:
    derived = _derived(facts, book)
    candidates = [r for r in book["routes"] if facts.asset_type in r["asset_types"]]
    for rule in candidates:
        results = [_check(v, derived.get(k)) for k, v in rule["when"].items()]
        if any(r is False for r in results):
            continue
        if any(r is None for r in results):
            return RouteResult(
                route="NEEDS_INFO",
                rule_id=None,
                automation="needs_info",
                title={"en": "A few answers needed to pick the right route",
                       "hi": "सही मार्ग चुनने के लिए कुछ जवाब चाहिए"},
                missing=_unknown_questions(rule, derived, facts),
            )
        docs, forms = _documents(rule, book, facts)
        threshold = None
        if "amount_lte_threshold" in rule["when"]:
            t = book["thresholds"]
            threshold = {
                "bank_type": facts.bank_type,
                "limit_inr": _threshold_for(facts.bank_type, book),
                "amount_inr": facts.amount,
                "citation": _citation(book, t["para"], t["quote"]),
            }
        return RouteResult(
            route=rule["route"],
            rule_id=rule["id"],
            automation=rule.get("automation", "full"),
            title=rule["title"],
            documents=docs,
            forms=forms,
            citation=_citation(book, rule["para"], rule["quote"]),
            notes=_notes(rule, book, facts),
            threshold=threshold,
        )
    raise RuntimeError(f"no rule matched {facts}")  # the rule set is exhaustive; tests guard this


def _variant_matches(when: dict, facts: Facts) -> bool | None:
    """True / False, or None when a fact the variant depends on is unknown."""
    unknown = False
    if "nomination" in when:
        if facts.nomination == "unknown":
            unknown = True
        elif facts.nomination not in when["nomination"]:
            return False
    for key in ("amount_lte", "amount_gt"):
        if key in when:
            if facts.amount is None:
                unknown = True
                continue
            amount = float(facts.amount)
            if key == "amount_lte" and not amount <= when[key]:
                return False
            if key == "amount_gt" and not amount > when[key]:
                return False
    return None if unknown else True


def _evaluate_other(facts: Facts, other: dict) -> RouteResult:
    spec = other["routes"].get(facts.asset_type) or other["routes"]["other"]
    missing: dict[str, dict] = {}
    chosen = None
    for v in spec["variants"]:
        ok = _variant_matches(v.get("when", {}), facts)
        if ok:
            chosen = v
            break
        if ok is None:
            when = v.get("when", {})
            if "nomination" in when and facts.nomination == "unknown":
                missing["nomination"] = QUESTIONS["nomination"]
            if ("amount_lte" in when or "amount_gt" in when) and facts.amount is None:
                missing["value"] = QUESTIONS["value"]
    if chosen is None:
        return RouteResult(
            route="NEEDS_INFO", rule_id=None, automation="needs_info",
            title={"en": "A few answers needed to pick the right process",
                   "hi": "सही प्रक्रिया चुनने के लिए कुछ जवाब चाहिए"},
            missing=list(missing.values()), where=spec.get("where"), url=spec.get("url"),
            verified=bool(spec.get("verified", False)), sources=spec.get("sources", []),
        )
    steps = chosen.get("steps", [])
    return RouteResult(
        route=spec["route"],
        rule_id=f"OTHER_{facts.asset_type.upper()}_{chosen['id'].upper()}",
        automation="checklist",
        title=chosen.get("title") or spec["title"],
        documents=chosen.get("documents", []),
        forms=[d["form"] for d in chosen.get("documents", []) if d.get("form")],
        checklist=steps,
        steps=steps,
        where=spec.get("where"),
        url=spec.get("url"),
        verified=bool(spec.get("verified", False)),
        timeline=spec.get("timeline"),
        sources=spec.get("sources", []),
        variant=chosen["id"],
    )


def evaluate_asset(facts: Facts | dict) -> RouteResult:
    if isinstance(facts, dict):
        facts = Facts.from_dict(facts)
    facts.validate()
    book = load_rulebook()
    if facts.asset_type in BANK_ASSETS | LOCKER_ASSETS:
        return _evaluate_rbi(facts, book["rbi"])
    return _evaluate_other(facts, book["other"])

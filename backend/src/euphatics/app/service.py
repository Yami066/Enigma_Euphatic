"""Business logic behind the API. Store, authz and AWS side effects are injected,
so the same code runs against DynamoDB in Lambda and an in-memory store in tests."""
from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from ..brand import brand
from ..discovery import build_search_kit
from ..rules import evaluate_asset
from ..rules.compensation import deposit_compensation, due_date, locker_compensation
from ..rules.engine import BANK_ASSETS, LOCKER_ASSETS

IST = timezone(timedelta(hours=5, minutes=30))
ROLES = {"lead", "heir", "helper"}
DOC_KINDS = {"statement", "death_certificate", "id_proof", "acknowledgement", "passbook", "pack", "letter",
             "ombudsman", "other"}
ASSET_FIELDS = {
    "assetType", "institution", "branch", "bankType", "nomination", "amount", "will", "dispute", "courtOrder",
    "joint", "legalHeirCertificate", "accountNumbers", "accountType", "nameAsPerBank", "notes",
    "maturityDate", "lockerNo", "receiptNo",
    # flow v2: where it came from, how it's identified, and whether the family chose to claim it
    "ifsc", "nomineeName", "source", "identifiers", "include", "category", "customerId",
    # tracking outside the RBI clock: which documents the family has, and when it was submitted / paid
    "docsHave", "submittedOn", "receivedOn", "receivedAmount",
    # claim-specific recipients. Older assets without these fields continue to use the case-level family roles.
    "claimantPersonIds", "nomineePersonIds", "nonClaimantPersonIds", "declarantPersonId",
}
CLAIM_PERSON_LIST_FIELDS = ("claimantPersonIds", "nomineePersonIds", "nonClaimantPersonIds")
PACK_MATERIAL_ASSET_FIELDS = ASSET_FIELDS - {
    "include", "source", "category", "docsHave", "submittedOn", "receivedOn", "receivedAmount",
}
HELPER_PERSON_FIELDS = {
    "type", "personId", "fullName", "relation", "isClaimant", "isNominee", "isNonClaimantHeir",
    "isDeclarant", "guardianName", "guardianRelation",
}
DECEASED_FIELDS = (
    "placeOfDeath", "deathCertNo", "deathCertDate", "deathCertAuthority", "maritalStatus", "deceasedAddress",
    "deceasedCity", "deceasedPin", "deceasedState", "religion", "successionLaw", "will",
)
PERSON_FIELDS = {
    "fullName", "relation", "age", "dob", "address", "phone", "email", "idType", "idLast4", "isClaimant",
    "isNominee", "isNonClaimantHeir", "isDeclarant", "yearsKnown", "sdo", "guardianName", "guardianRelation",
    # the claimant's own account, printed in the payment tables of Annex I-A / I-B
    "bankName", "bankAccountNumber", "bankIfsc", "bankBranch",
}
SETUP_STEPS = ("about", "family", "payee", "banks", "investments", "discover", "choose")


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str = "error"):
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_ist() -> date:
    return datetime.now(IST).date()


def new_id(prefix: str = "") -> str:
    return prefix + secrets.token_hex(5)


def pk(case_id: str) -> str:
    return f"CASE#{case_id}"


@dataclass
class CaseData:
    case_id: str
    meta: dict
    members: list[dict] = field(default_factory=list)
    people: list[dict] = field(default_factory=list)
    leads: list[dict] = field(default_factory=list)
    assets: list[dict] = field(default_factory=list)
    docs: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    tokens: list[dict] = field(default_factory=list)

    def asset(self, asset_id: str) -> dict:
        for a in self.assets:
            if a["assetId"] == asset_id:
                return a
        raise ApiError(404, "Asset not found", "not_found")

    def doc(self, doc_id: str) -> dict:
        for d in self.docs:
            if d["docId"] == doc_id:
                return d
        raise ApiError(404, "Document not found", "not_found")

    def lead(self, lead_id: str) -> dict:
        for l in self.leads:
            if l["leadId"] == lead_id:
                return l
        raise ApiError(404, "Lead not found", "not_found")


def load_case(store, case_id: str) -> CaseData:
    items = store.query_pk(pk(case_id))
    meta = next((i for i in items if i["SK"] == "META"), None)
    if not meta:
        raise ApiError(404, "Case not found", "not_found")
    cd = CaseData(case_id, meta)
    for it in items:
        sk = it["SK"]
        if sk.startswith("MEMBER#"):
            cd.members.append(it)
        elif sk.startswith("PERSON#"):
            cd.people.append(it)
        elif sk.startswith("LEAD#"):
            cd.leads.append(it)
        elif sk.startswith("ASSET#"):
            cd.assets.append(it)
        elif sk.startswith("DOC#"):
            cd.docs.append(it)
        elif sk.startswith("EVENT#"):
            cd.events.append(it)
        elif sk.startswith("TOKEN#"):
            cd.tokens.append(it)
    cd.events.sort(key=lambda e: e["SK"], reverse=True)
    return cd


def require(authz, email: str, action: str, cd: CaseData, doc: dict | None = None) -> None:
    d = authz.check(email, action, cd.case_id, cd.members, doc)
    if not d.allowed:
        raise ApiError(403, d.reason, "forbidden")


def role_of(cd: CaseData, email: str) -> str | None:
    for m in cd.members:
        if m["email"] == email:
            return m.get("role")
    return None


def add_event(store, case_id: str, kind: str, text: str, actor: str = "system", asset_id: str | None = None,
              text_hi: str | None = None, extra: dict | None = None) -> dict:
    ev = {"PK": pk(case_id), "SK": f"EVENT#{now_iso()}#{new_id()}", "type": "event", "eventType": kind,
          "text": text, "textHi": text_hi or "", "actor": actor, "assetId": asset_id or "", "at": now_iso()}
    if extra:
        ev["extra"] = extra
    return store.put(ev)


def _clean(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in {"PK", "SK", "GSI1PK", "GSI1SK"}}


# ------------------------------------------------------------------ cases

def create_case(store, email: str, body: dict) -> dict:
    name = (body.get("deceasedName") or "").strip()
    if not name:
        raise ApiError(400, "Please enter the name of the person who passed away.", "invalid")
    case_id = new_id("c")
    pan = (body.get("pan") or "").strip().upper()
    meta = {
        "PK": pk(case_id), "SK": "META", "type": "case", "caseId": case_id,
        "deceasedName": name, "dod": body.get("dod") or "", "dob": body.get("dob") or "",
        "panLast4": pan[-4:] if pan else "", "relation": body.get("relation") or "",
        "leadEmail": email, "secondsPerDay": int(body.get("secondsPerDay") or 86400),
        "createdAt": now_iso(), "payment": {},
    }
    store.put(meta)
    store.put({"PK": pk(case_id), "SK": f"MEMBER#{email}", "type": "member", "email": email, "role": "lead",
               "status": "active", "name": body.get("yourName") or "", "createdAt": now_iso(),
               "GSI1PK": f"USER#{email}", "GSI1SK": f"CASE#{case_id}"})
    add_event(store, case_id, "case_created", f"Case opened for the late {name}.", email,
              text_hi=f"स्वर्गीय {name} के लिए केस खोला गया।")
    return _clean(meta)


def my_cases(store, email: str) -> list[dict]:
    out = []
    for m in store.query_gsi1(f"USER#{email}"):
        case_id = m["GSI1SK"].split("#", 1)[1]
        meta = store.get(pk(case_id), "META")
        if meta:
            out.append({**_clean(meta), "myRole": m.get("role")})
    out.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    return out


def update_case(store, cd: CaseData, body: dict) -> dict:
    fields = {}
    for k in ("deceasedName", "dod", "dob", "relation", *DECEASED_FIELDS):
        if k in body:
            fields[k] = str(body[k] or "")
    if "secondsPerDay" in body:
        fields["secondsPerDay"] = max(2, min(86400, int(body["secondsPerDay"])))
    if "payment" in body and isinstance(body["payment"], dict):
        p = body["payment"]
        fields["payment"] = {k: str(p.get(k) or "") for k in ("accountHolder", "accountNumber", "ifsc", "bankName")}
    if "pan" in body:
        pan = (body.get("pan") or "").strip().upper()
        fields["panLast4"] = pan[-4:] if pan else ""
    if "setupDone" in body and isinstance(body["setupDone"], list):
        fields["setupDone"] = [s for s in SETUP_STEPS if s in body["setupDone"]]
    pack_material_case_fields = {"deceasedName", "dod", "dob", "payment", *DECEASED_FIELDS}
    pack_material_changed = any(k in pack_material_case_fields and fields[k] != cd.meta.get(k) for k in fields)
    updated = _clean(store.update(pk(cd.case_id), "META", fields))
    cd.meta.update(fields)
    if pack_material_changed:
        for a in cd.assets:  # case facts feed routes and every generated form
            reroute(store, cd, a)
    return updated


def case_view(cd: CaseData, email: str) -> dict:
    role = role_of(cd, email)
    assets = [_clean(a) for a in cd.assets]
    docs = []
    for d in cd.docs:
        dd = _clean(d)
        dd["hasMaskedCopy"] = bool(d.get("maskedKey") or d.get("maskedKeys"))
        dd.pop("s3Key", None)
        dd.pop("maskedKey", None)
        dd.pop("maskedKeys", None)
        docs.append(dd)
    selected_assets = [a for a in cd.assets if a.get("include") is not False]

    def received_for(a: dict) -> float:
        clock = a.get("clock") or {}
        if "amountReceived" in clock:
            return float(clock.get("amountReceived") or 0)
        return float(a.get("receivedAmount") or 0)

    received = sum(received_for(a) for a in selected_assets)
    comp = sum(float(((a.get("clock") or {}).get("compensation") or {}).get("compensation_inr") or 0)
               for a in selected_assets)
    case = _clean(cd.meta)
    people = [_clean(p) for p in cd.people]
    if role == "helper":
        # Helpers can coordinate names and claim roles, but do not need identity, contact or payout details.
        case.pop("payment", None)
        case.pop("panLast4", None)
        people = [{k: v for k, v in p.items() if k in HELPER_PERSON_FIELDS} for p in people]
    return {
        "case": case,
        "me": {"email": email, "role": role},
        "members": [_clean(m) for m in cd.members],
        "people": people,
        "leads": [_clean(l) for l in cd.leads],
        "assets": assets,
        "documents": docs,
        "events": [_clean(e) for e in cd.events[:60]],
        "waitingFor": [{"assetId": t["SK"].split("#")[1], "stage": t["SK"].split("#")[2]} for t in cd.tokens],
        "totals": {
            "leadsNew": sum(1 for l in cd.leads if l.get("status") == "new"),
            "assets": len(selected_assets),
            "claimsRunning": sum(1 for a in selected_assets
                                 if a.get("status") in {"clock_running", "late", "escalated"}),
            "received": round(received, 2),
            "compensation": round(comp, 2),
            "expected": round(sum(float(a.get("amount") or 0) for a in selected_assets
                                   if a.get("assetType") in BANK_ASSETS), 2),
        },
        "nextActions": next_actions(cd),
    }


def next_actions(cd: CaseData) -> list[dict]:
    acts = []
    tokens = {t["SK"].split("#", 1)[1] for t in cd.tokens}
    for a in cd.assets:
        if a.get("include") is False:
            continue
        aid, inst = a["assetId"], a.get("institution") or "this claim"
        if f"{aid}#settled" in tokens:
            acts.append({"kind": "answer", "assetId": aid, "text": f"Has the money from {inst} arrived?",
                         "textHi": f"क्या {inst} से पैसा आ गया?"})
        elif f"{aid}#complaint_sent" in tokens:
            acts.append({"kind": "answer", "assetId": aid,
                         "text": f"Have you sent the complaint letter to {inst}?",
                         "textHi": f"क्या आपने {inst} को शिकायत पत्र भेज दिया है?"})
        elif f"{aid}#resolved" in tokens:
            acts.append({"kind": "answer", "assetId": aid, "text": f"Did {inst} resolve the complaint?",
                         "textHi": f"क्या {inst} ने शिकायत का समाधान किया?"})
    if not any(p.get("isClaimant") or p.get("isNominee") for p in cd.people):
        acts.append({"kind": "people", "text": "Add the family members who will sign the claims.",
                     "textHi": "दावों पर हस्ताक्षर करने वाले परिवार के सदस्य जोड़ें।"})
    new_leads = sum(1 for l in cd.leads if l.get("status") == "new")
    if new_leads:
        acts.append({"kind": "leads", "text": f"Review {new_leads} possible asset(s) we found.",
                     "textHi": f"हमें मिली {new_leads} संभावित संपत्तियों की समीक्षा करें।"})
    if not cd.leads and not cd.assets:
        acts.append({"kind": "find", "text": "Upload a bank statement so we can look for assets.",
                     "textHi": "संपत्ति खोजने के लिए बैंक स्टेटमेंट अपलोड करें।"})
    for a in cd.assets:
        if a.get("include") is False:
            continue
        inst = a.get("institution") or "this claim"
        st = a.get("status")
        if st == "needs_info":
            acts.append({"kind": "asset", "assetId": a["assetId"], "text": f"Answer a few questions about {inst}.",
                         "textHi": f"{inst} के बारे में कुछ सवालों के जवाब दें।"})
        elif st == "ready":
            acts.append({"kind": "pack", "assetId": a["assetId"], "text": f"Generate the claim pack for {inst}.",
                         "textHi": f"{inst} के लिए दावा पैक बनाएं।"})
        elif st == "pack_ready":
            acts.append({"kind": "submit", "assetId": a["assetId"],
                         "text": f"Submit at any {inst} branch, then upload the dated acknowledgement.",
                         "textHi": f"{inst} की किसी भी शाखा में जमा करें और पावती अपलोड करें।"})
    return acts[:6]


def delete_case(store, files, cd: CaseData) -> None:
    if files:
        files.delete_prefix(f"cases/{cd.case_id}/")
    for it in store.query_pk(pk(cd.case_id)):
        store.delete(it["PK"], it["SK"])


# ------------------------------------------------------------------ family

def invite_member(store, cd: CaseData, body: dict, actor: str) -> dict:
    email = (body.get("email") or "").strip().lower()
    role = body.get("role") or "heir"
    if "@" not in email or role not in {"heir", "helper"}:
        raise ApiError(400, "Enter a valid email and a role (heir or helper).", "invalid")
    item = {"PK": pk(cd.case_id), "SK": f"MEMBER#{email}", "type": "member", "email": email, "role": role,
            "status": "invited", "name": body.get("name") or "", "invitedBy": actor, "createdAt": now_iso(),
            "GSI1PK": f"USER#{email}", "GSI1SK": f"CASE#{cd.case_id}"}
    store.put(item)
    add_event(store, cd.case_id, "member_invited", f"{email} was invited as {role}.", actor)
    return _clean(item)


def upsert_person(store, cd: CaseData, person_id: str, body: dict) -> dict:
    if person_id in ("new", "", None):
        person_id = new_id("p")
    data = {k: body[k] for k in PERSON_FIELDS if k in body}
    if "idLast4" in data:
        data["idLast4"] = str(data["idLast4"] or "")[-4:]
    if "bankIfsc" in data:
        data["bankIfsc"] = str(data["bankIfsc"] or "").strip().upper()
    if not (data.get("fullName") or store.get(pk(cd.case_id), f"PERSON#{person_id}")):
        raise ApiError(400, "Enter the person's full name.", "invalid")
    item = store.update(pk(cd.case_id), f"PERSON#{person_id}", {"type": "person", "personId": person_id, **data})
    existing = next((person for person in cd.people if person.get("personId") == person_id), None)
    if existing:
        existing.update(item)
    else:
        cd.people.append(item)
    # Family roles, names and payout details all feed claim routes or generated forms.
    for asset in cd.assets:
        reroute(store, cd, asset)
    return _clean(item)


def delete_person(store, cd: CaseData, person_id: str) -> None:
    store.delete(pk(cd.case_id), f"PERSON#{person_id}")
    cd.people = [person for person in cd.people if person.get("personId") != person_id]
    for asset in cd.assets:
        changes: dict[str, Any] = {}
        for field_name in CLAIM_PERSON_LIST_FIELDS:
            if field_name in asset and person_id in (asset.get(field_name) or []):
                changes[field_name] = [value for value in asset[field_name] if value != person_id]
        if asset.get("declarantPersonId") == person_id:
            changes["declarantPersonId"] = ""
        if changes:
            update_asset(store, cd, asset["assetId"], changes, "")
        else:
            reroute(store, cd, asset)


# ------------------------------------------------------------------ assets and leads

def facts_for(cd: CaseData, a: dict) -> dict:
    if "nonClaimantPersonIds" in a:
        known_people = {p.get("personId") for p in cd.people}
        non_claimant_heirs = sum(1 for person_id in a.get("nonClaimantPersonIds") or []
                                 if person_id in known_people)
    else:
        non_claimant_heirs = sum(1 for p in cd.people if p.get("isNonClaimantHeir"))
    return {
        "asset_type": a.get("assetType") or "other",
        "bank_type": a.get("bankType") or None,
        "nomination": a.get("nomination") or "unknown",
        "amount": a.get("amount") if a.get("amount") not in ("", None) else None,
        "will": bool(a.get("will")) or cd.meta.get("will") == "yes",
        "dispute": bool(a.get("dispute")),
        "court_order": bool(a.get("courtOrder")),
        "joint": bool(a.get("joint")),
        "non_claimant_heirs": non_claimant_heirs,
        "legal_heir_certificate": bool(a.get("legalHeirCertificate")),
    }


def route_status(route: dict, current: str | None) -> str:
    if current in {"pack_ready", "clock_running", "late", "escalated", "ombudsman_ready", "settled",
                   "settled_late", "resolved"}:
        return current
    if route["route"] == "NEEDS_INFO":
        return "needs_info"
    if route["automation"] == "stop":
        return "needs_lawyer"
    if route["automation"] == "checklist":
        return "checklist"
    return "ready"


def _normalise_asset_fields(body: dict) -> dict:
    data = {k: body[k] for k in ASSET_FIELDS if k in body}
    if "include" in data:
        data["include"] = bool(data["include"])
    if "identifiers" in data and not isinstance(data["identifiers"], dict):
        data["identifiers"] = {}
    if "docsHave" in data:
        data["docsHave"] = {str(k): bool(v) for k, v in (data["docsHave"] or {}).items()} if isinstance(data["docsHave"], dict) else {}
    if data.get("receivedAmount") not in (None, ""):
        data["receivedAmount"] = float(data["receivedAmount"])
    if isinstance(data.get("accountNumbers"), str):
        data["accountNumbers"] = [s.strip() for s in data["accountNumbers"].split(",") if s.strip()]
    if data.get("amount") in ("",):
        data["amount"] = None
    elif data.get("amount") is not None:
        data["amount"] = float(data["amount"])
    for field_name in CLAIM_PERSON_LIST_FIELDS:
        if field_name not in data:
            continue
        if not isinstance(data[field_name], (list, tuple)):
            raise ValueError(f"{field_name} must be a list of person IDs")
        seen = set()
        person_ids = []
        for raw_id in data[field_name]:
            person_id = str(raw_id or "").strip()
            if person_id and person_id not in seen:
                seen.add(person_id)
                person_ids.append(person_id)
        data[field_name] = person_ids
    if "declarantPersonId" in data:
        data["declarantPersonId"] = str(data["declarantPersonId"] or "").strip()
    return data


def _validate_claim_people(cd: CaseData, asset: dict) -> None:
    people_by_id = {p.get("personId"): p for p in cd.people}
    known_people = set(people_by_id)
    for field_name in CLAIM_PERSON_LIST_FIELDS:
        unknown = [person_id for person_id in asset.get(field_name) or [] if person_id not in known_people]
        if unknown:
            raise ValueError(f"{field_name} contains a person who is not in this case")
        if any(people_by_id[person_id].get("isDeclarant") for person_id in asset.get(field_name) or []):
            raise ValueError(f"{field_name} cannot include an independent declarant")
    claimants = set(asset.get("claimantPersonIds") or []) | set(asset.get("nomineePersonIds") or [])
    if claimants & set(asset.get("nonClaimantPersonIds") or []):
        raise ValueError("A person cannot both claim and sign as a non-claimant")
    declarant_id = asset.get("declarantPersonId")
    if declarant_id and declarant_id not in known_people:
        raise ValueError("declarantPersonId contains a person who is not in this case")
    if declarant_id and not people_by_id[declarant_id].get("isDeclarant"):
        raise ValueError("declarantPersonId must identify an independent declarant")


def _stale_pack_documents(store, cd: CaseData, asset_id: str, stale_at: str) -> None:
    for doc in cd.docs:
        if doc.get("kind") != "pack" or doc.get("assetId") != asset_id or doc.get("status") == "stale":
            continue
        fields = {"status": "stale", "staleAt": stale_at}
        store.update(pk(cd.case_id), doc["SK"], fields)
        doc.update(fields)


def reroute(store, cd: CaseData, asset: dict) -> dict:
    route = evaluate_asset(facts_for(cd, asset)).to_dict()
    stale_pack = asset.get("status") == "pack_ready"
    routed_at = now_iso()
    fields = {"route": route,
              "status": route_status(route, None if stale_pack else asset.get("status")),
              "routedAt": routed_at}
    if stale_pack:
        fields.update({"packDocId": "", "packStaleAt": routed_at})
    asset.update(fields)
    updated = store.update(pk(cd.case_id), asset["SK"], fields)
    if stale_pack:
        _stale_pack_documents(store, cd, asset["assetId"], routed_at)
    return updated


def create_asset(store, cd: CaseData, body: dict, actor: str, lead_id: str | None = None) -> dict:
    try:
        data = _normalise_asset_fields(body)
    except (TypeError, ValueError) as e:
        raise ApiError(400, str(e), "invalid") from e
    if not data.get("assetType"):
        raise ApiError(400, "Choose what kind of asset this is.", "invalid")
    asset_id = new_id("a")
    item = {"PK": pk(cd.case_id), "SK": f"ASSET#{asset_id}", "type": "asset", "assetId": asset_id,
            "leadId": lead_id or "", "createdAt": now_iso(), "status": "draft", **data}
    try:
        _validate_claim_people(cd, item)
        route = evaluate_asset(facts_for(cd, item)).to_dict()
    except ValueError as e:
        raise ApiError(400, str(e), "invalid") from e
    item["route"] = route
    item["status"] = route_status(route, None)
    store.put(item)
    cd.assets.append(item)
    add_event(store, cd.case_id, "asset_added", f"Added {data.get('institution') or data['assetType']}: "
              f"{route['title']['en']}.", actor, asset_id)
    return _clean(item)


def update_asset(store, cd: CaseData, asset_id: str, body: dict, actor: str) -> dict:
    a = cd.asset(asset_id)
    try:
        data = _normalise_asset_fields(body)
        candidate = {**a, **data}
        _validate_claim_people(cd, candidate)
        route = evaluate_asset(facts_for(cd, candidate)).to_dict()
    except (TypeError, ValueError) as e:
        raise ApiError(400, str(e), "invalid") from e

    stale_pack = a.get("status") == "pack_ready" and any(
        field_name in PACK_MATERIAL_ASSET_FIELDS and a.get(field_name) != value
        for field_name, value in data.items()
    )
    routed_at = now_iso()
    fields = {**data, "route": route,
              "status": route_status(route, None if stale_pack else a.get("status")),
              "routedAt": routed_at}
    if stale_pack:
        fields.update({"packDocId": "", "packStaleAt": routed_at})
    updated = store.update(pk(cd.case_id), a["SK"], fields)
    a.update(fields)
    if stale_pack:
        _stale_pack_documents(store, cd, asset_id, routed_at)
    return _clean(updated)


def delete_asset(store, cd: CaseData, asset_id: str, actor: str) -> None:
    a = cd.asset(asset_id)
    if a.get("status") in {"clock_running", "late"}:
        raise ApiError(409, "This claim's clock is running. Close it before removing the claim.", "running")
    store.delete(pk(cd.case_id), a["SK"])
    if a.get("leadId"):  # the lead goes back to 'to review'
        lead = next((l for l in cd.leads if l["leadId"] == a["leadId"]), None)
        if lead:
            store.update(pk(cd.case_id), lead["SK"], {"status": "new", "assetId": ""})
    add_event(store, cd.case_id, "asset_removed", f"Removed {a.get('institution') or a.get('assetType')} from the list.",
              actor, asset_id)


def confirm_lead(store, cd: CaseData, lead_id: str, body: dict, actor: str) -> dict:
    lead = cd.lead(lead_id)
    if lead.get("status") == "confirmed" and lead.get("assetId"):
        return _clean(cd.asset(lead["assetId"]))
    facts = dict(lead.get("assetFacts") or {})
    seed = {"assetType": facts.get("asset_type") or lead.get("assetType") or "other",
            "institution": facts.get("institution") or lead.get("institution")}
    if facts.get("bank_type"):
        seed["bankType"] = facts["bank_type"]
    seed.update(body or {})
    asset = create_asset(store, cd, seed, actor, lead_id)
    store.update(pk(cd.case_id), lead["SK"], {"status": "confirmed", "assetId": asset["assetId"]})
    return asset


def dismiss_lead(store, cd: CaseData, lead_id: str) -> None:
    lead = cd.lead(lead_id)
    store.update(pk(cd.case_id), lead["SK"], {"status": "dismissed"})


def save_leads(store, cd: CaseData, leads: list[dict], doc_id: str, source: str = "statement") -> list[dict]:
    existing = {l["leadId"]: l for l in cd.leads}
    saved = []
    for l in leads:
        lid = l["id"]
        item = {"PK": pk(cd.case_id), "SK": f"LEAD#{lid}", "type": "lead", "leadId": lid,
                "leadType": l["type"], "assetType": l["asset_type"], "institution": l["institution"],
                "confidence": l["confidence"], "label": l["label"], "reason": l["reason"],
                "evidence": l["evidence"], "count": l["count"], "totalInr": l["total_inr"],
                "firstDate": l["first_date"], "lastDate": l["last_date"], "nextSteps": l["next_steps"],
                "portals": l["portals"], "assetFacts": l["asset_facts"], "source": source,
                "sourceDocId": doc_id, "createdAt": now_iso()}
        prev = existing.get(lid)
        item["status"] = prev.get("status", "new") if prev else "new"
        if prev and prev.get("assetId"):
            item["assetId"] = prev["assetId"]
        store.put(item)
        saved.append(_clean(item))
    return saved


def add_finding(store, cd: CaseData, body: dict, actor: str) -> dict:
    inst = (body.get("institution") or "").strip()
    asset_type = body.get("assetType") or "other"
    if not inst:
        raise ApiError(400, "Enter where the money was found.", "invalid")
    lid = new_id("f")
    item = {"PK": pk(cd.case_id), "SK": f"LEAD#{lid}", "type": "lead", "leadId": lid, "leadType": asset_type,
            "assetType": asset_type, "institution": inst, "confidence": "high",
            "label": {"en": f"Found on {body.get('portal') or 'an official search'}",
                      "hi": f"{body.get('portal') or 'आधिकारिक खोज'} पर मिला"},
            "reason": {"en": body.get("note") or "Recorded from an official search.",
                       "hi": body.get("note") or "आधिकारिक खोज से दर्ज।"},
            "evidence": [], "count": 1, "totalInr": float(body.get("amount") or 0), "firstDate": "", "lastDate": "",
            "nextSteps": [], "portals": [body.get("portal") or ""],
            "assetFacts": {"asset_type": asset_type, "institution": inst}, "source": "search",
            "status": "new", "createdAt": now_iso()}
    store.put(item)
    add_event(store, cd.case_id, "finding", f"Recorded a finding from {body.get('portal') or 'a search'}: {inst}.", actor)
    return _clean(item)


def search_kit(cd: CaseData) -> dict:
    case = {"deceasedName": cd.meta.get("deceasedName"), "dob": cd.meta.get("dob"),
            "statementBank": cd.meta.get("statementBank") or ""}
    leads = [{"type": l.get("leadType"), "institution": l.get("institution")} for l in cd.leads
             if l.get("status") != "dismissed"]
    kit = build_search_kit(case, leads)
    kit["panLast4"] = cd.meta.get("panLast4") or ""
    return kit


# ------------------------------------------------------------------ documents

def new_upload(store, cd: CaseData, email: str, body: dict, presign_put: Callable[[str, str], str]) -> dict:
    kind = body.get("kind") or "other"
    if kind not in DOC_KINDS - {"pack", "letter", "ombudsman"}:
        raise ApiError(400, "Unknown document kind.", "invalid")
    filename = body.get("filename") or "upload"
    ctype = body.get("contentType") or "application/octet-stream"
    if int(body.get("size") or 0) > 15 * 1024 * 1024:
        raise ApiError(400, "Files up to 15 MB, please.", "too_large")
    from ..aws.files import safe_name

    doc_id = new_id("d")
    key = f"cases/{cd.case_id}/docs/{doc_id}/{safe_name(filename)}"
    item = {"PK": pk(cd.case_id), "SK": f"DOC#{doc_id}", "type": "doc", "docId": doc_id, "kind": kind,
            "filename": filename, "contentType": ctype, "s3Key": key, "status": "pending", "uploadedBy": email,
            "createdAt": now_iso(), "assetId": body.get("assetId") or "", "personId": body.get("personId") or ""}
    store.put(item)
    return {"docId": doc_id, "uploadUrl": presign_put(key, ctype), "contentType": ctype}


def record_generated_doc(store, case_id: str, kind: str, key: str, filename: str, asset_id: str = "",
                         content_type: str = "application/pdf") -> dict:
    doc_id = new_id("d")
    item = {"PK": pk(case_id), "SK": f"DOC#{doc_id}", "type": "doc", "docId": doc_id, "kind": kind,
            "filename": filename, "contentType": content_type, "s3Key": key, "status": "ready",
            "uploadedBy": "system", "createdAt": now_iso(), "assetId": asset_id}
    store.put(item)
    return item


# ------------------------------------------------------------------ claim clock

def submit_claim(store, cd: CaseData, asset_id: str, body: dict, actor: str,
                 start_fn: Callable[[str, str, dict], str]) -> dict:
    a = cd.asset(asset_id)
    if a.get("assetType") not in BANK_ASSETS | LOCKER_ASSETS:
        raise ApiError(400, "Only bank deposits and lockers have RBI's 15-day clock.", "no_clock")
    if (a.get("route") or {}).get("route") in {"NEEDS_INFO", "BLOCKED_BY_COURT"}:
        raise ApiError(400, "Answer the open questions on this claim first.", "not_ready")
    if a.get("status") in {"clock_running", "late"}:
        raise ApiError(409, "The clock is already running for this claim.", "running")
    docs_complete = body.get("docsCompleteDate") or today_ist().isoformat()
    spd = int(cd.meta.get("secondsPerDay") or 86400)
    payload = {"caseId": cd.case_id, "assetId": asset_id, "docsCompleteDate": docs_complete,
               "secondsPerDay": spd, "assetType": a.get("assetType"), "amount": a.get("amount") or 0,
               "institution": a.get("institution") or ""}
    arn = start_fn(cd.case_id, asset_id, payload)
    clock = {"docsCompleteDate": docs_complete, "dueDate": due_date(docs_complete, a["assetType"]).isoformat(),
             "executionArn": arn, "stage": "running", "secondsPerDay": spd, "startedAt": now_iso(),
             "ackDocId": body.get("ackDocId") or "", "branch": body.get("branch") or ""}
    updated = store.update(pk(cd.case_id), a["SK"], {"status": "clock_running", "clock": clock})
    add_event(store, cd.case_id, "clock_started",
              f"{a.get('institution')}: documents complete on {docs_complete}. The bank must settle by "
              f"{clock['dueDate']} (RBI para 31).", actor, asset_id,
              text_hi=f"{a.get('institution')}: दस्तावेज़ {docs_complete} को पूरे। बैंक को {clock['dueDate']} तक निपटाना होगा।")
    return _clean(updated)


def answer_clock(store, cd: CaseData, asset_id: str, body: dict, actor: str,
                 send_fn: Callable[[str, dict], None]) -> dict:
    stage = body.get("stage") or "settled"
    if stage not in {"settled", "complaint_sent", "resolved"}:
        raise ApiError(400, "Unknown claim-clock question.", "invalid")
    tok = store.get(pk(cd.case_id), f"TOKEN#{asset_id}#{stage}")
    if not tok:
        raise ApiError(409, "The clock isn't waiting for this answer right now.", "not_waiting")
    if stage == "settled":
        paid_on = str(body.get("paidOn") or "").strip()
        if paid_on:  # the clock Lambda computes delay from this date; a bad one would fail the execution
            try:
                paid_day = date.fromisoformat(paid_on)
            except ValueError as e:
                raise ApiError(400, "Enter the date the money arrived as YYYY-MM-DD.", "invalid") from e
            if paid_day > today_ist():
                raise ApiError(400, "The date the money arrived can't be in the future.", "invalid")
            paid_on = paid_day.isoformat()
        output = {"settled": bool(body.get("settled")), "amountReceived": float(body.get("amountReceived") or 0),
                  "paidOn": paid_on}
        text = "Family confirmed the money arrived." if output["settled"] else "Family said the money hasn't arrived."
    elif stage == "complaint_sent":
        sent_on = str(body.get("sentOn") or "").strip()
        try:
            sent_day = date.fromisoformat(sent_on)
        except ValueError as e:
            raise ApiError(400, "Enter the date when the complaint was sent.", "invalid") from e
        if not body.get("sent") or sent_day > today_ist():
            raise ApiError(400, "Confirm this only after the complaint has been sent.", "invalid")
        output = {"sent": True, "sentOn": sent_day.isoformat()}
        text = f"Family confirmed the bank letter was sent on {output['sentOn']}."
    else:  # resolved
        output = {"resolved": bool(body.get("resolved"))}
        text = "Family said the bank resolved it." if output["resolved"] else "Family said the bank hasn't resolved it."
    send_fn(tok["taskToken"], output)
    store.delete(pk(cd.case_id), tok["SK"])
    add_event(store, cd.case_id, "clock_answer", text, actor, asset_id)
    return output


def compensation_for(asset: dict, docs_complete: str, end: str, paid: bool) -> dict:
    if asset.get("assetType") in LOCKER_ASSETS:
        return locker_compensation(docs_complete, communicated_on=end if paid else None, today=end)
    return deposit_compensation(float(asset.get("amount") or 0), docs_complete,
                                paid_on=end if paid else None, today=end)


# ------------------------------------------------------------------ pack context

def _people_for_ids(people: list[dict], person_ids: list[str]) -> list[dict]:
    by_id = {p.get("personId"): p for p in people}
    return [by_id[person_id] for person_id in person_ids if person_id in by_id]


def pack_context(cd: CaseData, asset: dict) -> dict:
    people = cd.people
    has_claimants = "claimantPersonIds" in asset
    has_nominees = "nomineePersonIds" in asset
    if has_claimants or has_nominees:
        claimants = _people_for_ids(people, asset.get("claimantPersonIds") or []) if has_claimants else []
        nominees = _people_for_ids(people, asset.get("nomineePersonIds") or []) if has_nominees else []
        if not has_claimants:
            claimants = list(nominees)
        if not has_nominees:
            nominees = list(claimants)
    else:
        claimants = [p for p in people if p.get("isClaimant")]
        nominees = [p for p in people if p.get("isNominee")] or claimants

    if "nonClaimantPersonIds" in asset:
        non_claimants = _people_for_ids(people, asset.get("nonClaimantPersonIds") or [])
    else:
        non_claimants = [p for p in people if p.get("isNonClaimantHeir")]

    if "declarantPersonId" in asset:
        declarant = next(iter(_people_for_ids(people, [asset.get("declarantPersonId") or ""])), None)
    else:
        declarant = next((p for p in people if p.get("isDeclarant")), None)

    if any(field_name in asset for field_name in CLAIM_PERSON_LIST_FIELDS):
        heirs, seen = [], set()
        for person in claimants + nominees + non_claimants:
            person_id = person.get("personId")
            if person_id != (declarant or {}).get("personId") and person_id not in seen:
                seen.add(person_id)
                heirs.append(person)
    else:
        heirs = [p for p in people if not p.get("isDeclarant")]
    return {
        "case": {"deceasedName": cd.meta.get("deceasedName"), "dod": cd.meta.get("dod"), "dob": cd.meta.get("dob"),
                 **{k: cd.meta.get(k, "") for k in DECEASED_FIELDS}},
        "heirs": heirs,
        "asset": {**_clean(asset), "accountNumbers": asset.get("accountNumbers") or []},
        "route": asset.get("route") or {},
        "claimants": claimants or nominees,
        "nominees": nominees,
        "nonClaimants": non_claimants,
        "declarant": declarant or {},
        "payment": cd.meta.get("payment") or {},
        "brand": brand(),
        "generatedAt": today_ist().isoformat(),
    }

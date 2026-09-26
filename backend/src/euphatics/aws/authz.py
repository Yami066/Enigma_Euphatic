"""Authorization with Amazon Verified Permissions (Cedar).

The policies live in backend/template.yaml (AWS::VerifiedPermissions::Policy).
Every request builds the Case (and Document) entity from DynamoDB and asks AVP
IsAuthorized. `LocalAuthz` mirrors the same policies for tests and local runs.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

NS = "Euphatics"

CASE_ACTIONS = {"ViewCase", "EditCase", "ManageMembers", "UploadDocument", "UseAssistant"}
DOC_ACTIONS = {"ViewDocumentPreview", "DownloadOriginal"}

REASONS = {
    "DownloadOriginal": "Only the case lead and heirs can download original documents. Helpers see masked previews "
                        "(Cedar forbid policy).",
    "ManageMembers": "Only the case lead can add or change family members (Cedar forbid policy).",
}


@dataclass
class Decision:
    allowed: bool
    reason: str = ""
    policies: tuple = ()


def _uid(kind: str, id_: str) -> dict:
    return {"entityType": f"{NS}::{kind}", "entityId": id_}


def roles(members: list[dict]) -> dict[str, list[str]]:
    out = {"lead": [], "heir": [], "helper": []}
    for m in members:
        out.setdefault(m.get("role", "heir"), []).append(m["email"])
    return out


class AvpAuthz:
    def __init__(self, policy_store_id: str | None = None):
        from .clients import client

        self.ps = policy_store_id or os.environ["POLICY_STORE_ID"]
        self.avp = client("verifiedpermissions")

    def _entities(self, case_id: str, members: list[dict], doc: dict | None) -> list[dict]:
        r = roles(members)
        lead = r["lead"][0] if r["lead"] else "nobody@invalid"
        ents = [{"identifier": _uid("User", e)} for e in {m["email"] for m in members}]
        ents.append({
            "identifier": _uid("Case", case_id),
            "attributes": {
                "lead": {"entityIdentifier": _uid("User", lead)},
                "heirs": {"set": [{"entityIdentifier": _uid("User", e)} for e in r["heir"]]},
                "helpers": {"set": [{"entityIdentifier": _uid("User", e)} for e in r["helper"]]},
            },
        })
        if doc:
            ents.append({
                "identifier": _uid("Document", doc["docId"]),
                "attributes": {"case": {"entityIdentifier": _uid("Case", case_id)},
                               "kind": {"string": doc.get("kind", "other")}},
            })
        return ents

    def check(self, email: str, action: str, case_id: str, members: list[dict], doc: dict | None = None) -> Decision:
        resource = _uid("Document", doc["docId"]) if action in DOC_ACTIONS else _uid("Case", case_id)
        resp = self.avp.is_authorized(
            policyStoreId=self.ps,
            principal=_uid("User", email),
            action={"actionType": f"{NS}::Action", "actionId": action},
            resource=resource,
            entities={"entityList": self._entities(case_id, members, doc)},
        )
        allowed = resp.get("decision") == "ALLOW"
        pols = tuple(p.get("policyId") for p in resp.get("determiningPolicies", []))
        return Decision(allowed, "" if allowed else REASONS.get(action, "Not allowed for your role in this case."), pols)


class LocalAuthz:
    """Same semantics as the Cedar policies in template.yaml."""

    def check(self, email: str, action: str, case_id: str, members: list[dict], doc: dict | None = None) -> Decision:
        r = roles(members)
        is_lead, is_heir, is_helper = email in r["lead"], email in r["heir"], email in r["helper"]
        allowed = False
        if action in CASE_ACTIONS:
            if is_lead:
                allowed = True
            elif is_heir and action != "ManageMembers":
                allowed = True
            elif is_helper and action in {"ViewCase", "UseAssistant"}:
                allowed = True
        elif action == "DownloadOriginal":
            allowed = is_lead or is_heir
        elif action == "ViewDocumentPreview":
            allowed = is_lead or is_heir or is_helper
        # forbid guardrails
        if action == "DownloadOriginal" and not (is_lead or is_heir):
            allowed = False
        if action == "ManageMembers" and not is_lead:
            allowed = False
        return Decision(allowed, "" if allowed else REASONS.get(action, "Not allowed for your role in this case."))


def default_authz():
    if os.environ.get("POLICY_STORE_ID"):
        return AvpAuthz()
    return LocalAuthz()

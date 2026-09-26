"""Cedar policies: valid against the schema, same decisions as LocalAuthz, and in sync with template.yaml."""
import json
import re
from pathlib import Path

import pytest

from euphatics.aws.authz import LocalAuthz

cedarpy = pytest.importorskip("cedarpy")

ROOT = Path(__file__).resolve().parents[1]
POLICY_FILES = sorted((ROOT / "policies").glob("*.cedar"))
SCHEMA = (ROOT / "policies" / "schema.cedarschema.json").read_text(encoding="utf-8")
POLICIES = "\n\n".join(p.read_text(encoding="utf-8") for p in POLICY_FILES)
TEMPLATE = (ROOT / "template.yaml").read_text(encoding="utf-8")

LEAD, HEIR, HELPER, STRANGER = "lead@x.com", "heir@x.com", "help@x.com", "x@x.com"
MEMBERS = [{"email": LEAD, "role": "lead"}, {"email": HEIR, "role": "heir"}, {"email": HELPER, "role": "helper"}]


def U(e):
    return {"__entity": {"type": "Euphatics::User", "id": e}}


ENTITIES = [
    {"uid": {"__entity": {"type": "Euphatics::Case", "id": "c1"}},
     "attrs": {"lead": U(LEAD), "heirs": [U(HEIR)], "helpers": [U(HELPER)]}, "parents": []},
    {"uid": {"__entity": {"type": "Euphatics::Document", "id": "d1"}},
     "attrs": {"case": {"__entity": {"type": "Euphatics::Case", "id": "c1"}}, "kind": "id_proof"}, "parents": []},
] + [{"uid": U(e), "attrs": {}, "parents": []} for e in [LEAD, HEIR, HELPER, STRANGER]]


def test_policies_validate_against_schema():
    res = cedarpy.validate_policies(POLICIES, SCHEMA)
    assert res.validation_passed, res.errors


@pytest.mark.parametrize("who", [LEAD, HEIR, HELPER, STRANGER])
@pytest.mark.parametrize("action", ["ViewCase", "EditCase", "ManageMembers", "UploadDocument", "UseAssistant",
                                    "ViewDocumentPreview", "DownloadOriginal"])
def test_cedar_matches_local_authz(who, action):
    rtype, rid = ("Document", "d1") if action in {"ViewDocumentPreview", "DownloadOriginal"} else ("Case", "c1")
    req = {"principal": f'Euphatics::User::"{who}"', "action": f'Euphatics::Action::"{action}"',
           "resource": f'Euphatics::{rtype}::"{rid}"', "context": {}}
    cedar = cedarpy.is_authorized(req, POLICIES, ENTITIES, schema=SCHEMA).decision == cedarpy.Decision.Allow
    local = LocalAuthz().check(who, action, "c1", MEMBERS, {"docId": "d1", "kind": "id_proof"}).allowed
    assert cedar == local


def _norm(s):
    return re.sub(r"\s+", " ", s).strip()


def test_template_policies_and_schema_are_in_sync_with_files():
    tpl = _norm(TEMPLATE)
    for f in POLICY_FILES:
        assert _norm(f.read_text(encoding="utf-8")) in tpl, f"{f.name} differs from template.yaml"
    m = re.search(r"CedarJson: \|\s*\n\s*(\{.*\})\s*\n", TEMPLATE)
    assert m and json.loads(m.group(1)) == json.loads(SCHEMA)

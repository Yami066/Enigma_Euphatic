"""End-to-end service flow on the in-memory store: the same code the Lambdas run."""
from pathlib import Path

import pytest

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws.authz import LocalAuthz
from euphatics.aws.store import MemoryStore
from euphatics.discovery import scan_statement
from euphatics.forms import build_pack

SAMPLES = Path(__file__).resolve().parents[2] / "samples" / "data"
LEAD, HEIR, HELPER, STRANGER = "riya@example.com", "arjun@example.com", "rao@example.com", "x@example.com"


@pytest.fixture()
def world():
    store, authz = MemoryStore(), LocalAuthz()
    case = svc.create_case(store, LEAD, {"deceasedName": "Ramesh Kumar Sharma", "dod": "2026-07-02",
                                         "pan": "ABCPS1234K", "secondsPerDay": 4})
    cd = svc.load_case(store, case["caseId"])
    svc.invite_member(store, cd, {"email": HEIR, "role": "heir"}, LEAD)
    svc.invite_member(store, cd, {"email": HELPER, "role": "helper"}, LEAD)
    for p in [
        {"fullName": "Sunita Sharma", "relation": "Wife", "isClaimant": True, "idType": "Aadhaar", "idLast4": "123412341234"},
        {"fullName": "Riya Sharma", "relation": "Daughter", "isClaimant": True},
        {"fullName": "Arjun Sharma", "relation": "Son", "isNonClaimantHeir": True},
        {"fullName": "K. Venkatesh Rao", "relation": "Family friend", "isDeclarant": True, "yearsKnown": 22},
    ]:
        svc.upsert_person(store, cd, "new", p)
    return store, authz, svc.load_case(store, case["caseId"])


def test_case_is_listed_for_lead_and_invitees(world):
    store, _, cd = world
    assert [c["caseId"] for c in svc.my_cases(store, LEAD)] == [cd.case_id]
    assert svc.my_cases(store, HELPER)[0]["myRole"] == "helper"
    assert cd.meta["panLast4"] == "234K"  # full PAN is never stored
    assert next(p for p in cd.people if p["fullName"] == "Sunita Sharma")["idLast4"] == "1234"


def test_cedar_roles(world):
    _, authz, cd = world
    doc = {"docId": "d1", "kind": "id_proof"}
    assert authz.check(LEAD, "ManageMembers", cd.case_id, cd.members).allowed
    assert not authz.check(HEIR, "ManageMembers", cd.case_id, cd.members).allowed
    assert authz.check(HEIR, "DownloadOriginal", cd.case_id, cd.members, doc).allowed
    helper_dl = authz.check(HELPER, "DownloadOriginal", cd.case_id, cd.members, doc)
    assert not helper_dl.allowed and "masked" in helper_dl.reason
    assert authz.check(HELPER, "ViewDocumentPreview", cd.case_id, cd.members, doc).allowed
    assert not authz.check(STRANGER, "ViewCase", cd.case_id, cd.members).allowed
    with pytest.raises(ApiError) as e:
        svc.require(authz, STRANGER, "ViewCase", cd)
    assert e.value.status == 403


def test_statement_to_route_to_pack_to_clock(world):
    store, _, cd = world
    out = scan_statement((SAMPLES / "sample_statement.pdf").read_bytes(), "s.pdf", case_key=cd.case_id)
    saved = svc.save_leads(store, cd, out["leads"], "doc1")
    assert len(saved) == 16
    cd = svc.load_case(store, cd.case_id)
    view = svc.case_view(cd, LEAD)
    assert view["totals"]["leadsNew"] == 16
    assert any(a["kind"] == "leads" for a in view["nextActions"])

    fd_lead = next(l for l in cd.leads if l["leadType"] == "deposit")
    asset = svc.confirm_lead(store, cd, fd_lead["leadId"], {"nomination": "none", "amount": 320000,
                                                           "accountNumbers": "FD 00231", "branch": "Koramangala"}, LEAD)
    assert asset["route"]["route"] == "SIMPLIFIED"
    assert asset["route"]["forms"] == ["I-B", "I-C", "I-D", "I-E"]  # Arjun is a non-claimant heir → I-D
    assert asset["status"] == "ready"

    cd = svc.load_case(store, cd.case_id)
    a = cd.asset(asset["assetId"])
    pdf = build_pack(svc.pack_context(cd, a), [])
    assert pdf[:5] == b"%PDF-"

    started = {}

    def fake_start(case_id, asset_id, payload):
        started.update(payload)
        return "arn:fake:execution"

    running = svc.submit_claim(store, cd, a["assetId"], {"docsCompleteDate": "2026-08-01"}, LEAD, fake_start)
    assert running["status"] == "clock_running"
    assert running["clock"]["dueDate"] == "2026-08-16"
    assert started["secondsPerDay"] == 4

    store.put({"PK": svc.pk(cd.case_id), "SK": f"TOKEN#{a['assetId']}#settled", "taskToken": "tok-1"})
    sent = {}
    svc.answer_clock(store, svc.load_case(store, cd.case_id), a["assetId"], {"stage": "settled", "settled": False},
                     LEAD, lambda tok, out: sent.update({"tok": tok, **out}))
    assert sent == {"tok": "tok-1", "settled": False, "amountReceived": 0.0, "paidOn": ""}
    with pytest.raises(ApiError):
        svc.answer_clock(store, svc.load_case(store, cd.case_id), a["assetId"], {"stage": "settled"}, LEAD, lambda *_: None)


def test_unknown_facts_ask_questions_and_checklists_have_no_clock(world):
    store, _, cd = world
    a = svc.create_asset(store, cd, {"assetType": "bank_deposit", "institution": "SBI"}, LEAD)
    assert a["status"] == "needs_info"
    epf = svc.create_asset(store, cd, {"assetType": "epf", "institution": "Deccan Tools"}, LEAD)
    assert epf["status"] == "checklist"
    with pytest.raises(ApiError) as e:
        svc.submit_claim(store, svc.load_case(store, cd.case_id), epf["assetId"], {}, LEAD, lambda *_: "x")
    assert e.value.code == "no_clock"
    updated = svc.update_asset(store, svc.load_case(store, cd.case_id), a["assetId"],
                               {"nomination": "nominee"}, LEAD)
    assert updated["route"]["route"] == "NOMINEE" and updated["status"] == "ready"


def test_delete_case_removes_everything(world):
    store, _, cd = world
    svc.delete_case(store, None, cd)
    assert store.query_pk(svc.pk(cd.case_id)) == []

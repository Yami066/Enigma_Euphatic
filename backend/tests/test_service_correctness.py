"""Regression coverage for claim-state, privacy and recipient correctness."""
import pytest

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws.store import MemoryStore


LEAD = "lead@example.com"
HELPER = "helper@example.com"


def make_case(*, pan: str = ""):
    store = MemoryStore()
    case = svc.create_case(store, LEAD, {"deceasedName": "Ramesh Sharma", "pan": pan})
    return store, svc.load_case(store, case["caseId"])


def add_person(store, cd, **fields):
    return svc.upsert_person(store, cd, "new", fields)


def make_pack_ready(store, cd, asset):
    doc = svc.record_generated_doc(store, cd.case_id, "pack", "packs/old.pdf", "old-pack.pdf", asset["assetId"])
    store.update(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}",
                 {"status": "pack_ready", "packDocId": doc["docId"]})
    return doc, svc.load_case(store, cd.case_id)


def test_invalid_asset_update_is_rejected_before_any_state_is_persisted():
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "none",
        "bankType": "commercial", "amount": 1000,
    }, LEAD)
    cd = svc.load_case(store, cd.case_id)
    before = store.get(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}")

    with pytest.raises(ApiError) as error:
        svc.update_asset(store, cd, asset["assetId"], {"institution": "Changed", "amount": -100}, LEAD)

    assert error.value.code == "invalid"
    assert store.get(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}") == before
    assert cd.asset(asset["assetId"])["amount"] == 1000
    assert cd.asset(asset["assetId"])["institution"] == "SBI"


@pytest.mark.parametrize(("change", "expected_route", "expected_status"), [
    ({"courtOrder": True}, "BLOCKED_BY_COURT", "needs_lawyer"),
    ({"accountNumbers": ["00990011"]}, "NOMINEE", "ready"),
])
def test_material_change_invalidates_a_ready_pack(change, expected_route, expected_status):
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    doc, cd = make_pack_ready(store, cd, asset)

    updated = svc.update_asset(store, cd, asset["assetId"], change, LEAD)

    assert updated["route"]["route"] == expected_route
    assert updated["status"] == expected_status
    assert updated["packDocId"] == ""
    assert updated["packStaleAt"]
    stale_doc = store.get(svc.pk(cd.case_id), f"DOC#{doc['docId']}")
    assert stale_doc["status"] == "stale"
    assert stale_doc["staleAt"] == updated["packStaleAt"]


def test_ombudsman_ready_is_preserved_by_normal_rerouting():
    route = {"route": "NEEDS_INFO", "automation": "needs_info"}
    assert svc.route_status(route, "ombudsman_ready") == "ombudsman_ready"


def test_dashboard_totals_include_manual_receipts_and_exclude_unselected_claims():
    store, cd = make_case()
    bank = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    insurance = svc.create_asset(store, cd, {
        "assetType": "life_insurance", "institution": "LIC", "amount": 500, "receivedAmount": 250,
    }, LEAD)
    excluded = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "Other Bank", "nomination": "nominee", "amount": 9000,
        "include": False,
    }, LEAD)
    store.update(svc.pk(cd.case_id), f"ASSET#{bank['assetId']}", {
        "status": "clock_running",
        "clock": {"amountReceived": 100, "compensation": {"compensation_inr": 5}},
    })
    store.update(svc.pk(cd.case_id), f"ASSET#{excluded['assetId']}", {
        "status": "ready",
        "clock": {"amountReceived": 9000, "compensation": {"compensation_inr": 99}},
    })
    store.put({"PK": svc.pk(cd.case_id), "SK": f"TOKEN#{excluded['assetId']}#settled", "taskToken": "tok"})

    view = svc.case_view(svc.load_case(store, cd.case_id), LEAD)

    assert view["totals"] == {
        "leadsNew": 0, "assets": 2, "claimsRunning": 1, "received": 350.0,
        "compensation": 5.0, "expected": 1000.0,
    }
    assert insurance["assetId"] in {a["assetId"] for a in view["assets"]}
    assert all(action.get("assetId") != excluded["assetId"] for action in view["nextActions"])


def test_helper_case_view_redacts_person_identity_contact_and_payment_fields():
    store, cd = make_case(pan="ABCPS1234K")
    svc.invite_member(store, cd, {"email": HELPER, "role": "helper", "name": "Case helper"}, LEAD)
    svc.update_case(store, cd, {"payment": {
        "accountHolder": "Sunita Sharma", "accountNumber": "1234567890", "ifsc": "SBIN0001234",
        "bankName": "SBI",
    }})
    person = add_person(
        store, cd, fullName="Sunita Sharma", relation="Wife", isClaimant=True, dob="1970-01-01",
        address="12 Private Road", phone="9999999999", email="sunita@example.com", idType="Aadhaar",
        idLast4="1234", sdo="Ramesh Sharma", bankName="SBI", bankAccountNumber="1234567890",
        bankIfsc="SBIN0001234", bankBranch="MG Road",
    )
    cd = svc.load_case(store, cd.case_id)

    lead_person = svc.case_view(cd, LEAD)["people"][0]
    helper_view = svc.case_view(cd, HELPER)
    helper_person = helper_view["people"][0]

    assert lead_person["bankAccountNumber"] == "1234567890"
    assert helper_person == {
        "type": "person", "personId": person["personId"], "fullName": "Sunita Sharma",
        "relation": "Wife", "isClaimant": True,
    }
    assert "payment" not in helper_view["case"]
    assert "panLast4" not in helper_view["case"]


def test_pack_context_uses_claim_specific_people_and_legacy_assets_still_fallback():
    store, cd = make_case()
    sunita = add_person(store, cd, fullName="Sunita", relation="Wife", isClaimant=True, isNominee=True)
    riya = add_person(store, cd, fullName="Riya", relation="Daughter", isClaimant=True, isNominee=True)
    arjun = add_person(store, cd, fullName="Arjun", relation="Son", isNonClaimantHeir=True)
    declarant = add_person(store, cd, fullName="Rao", relation="Friend", isDeclarant=True)
    cd = svc.load_case(store, cd.case_id)

    first = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "Bank A", "nomination": "nominee", "amount": 1000,
        "nomineePersonIds": [sunita["personId"]], "claimantPersonIds": [sunita["personId"]],
        "nonClaimantPersonIds": [], "declarantPersonId": declarant["personId"],
    }, LEAD)
    second = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "Bank B", "nomination": "nominee", "amount": 1000,
        "nomineePersonIds": [riya["personId"]], "claimantPersonIds": [riya["personId"]],
        "nonClaimantPersonIds": [], "declarantPersonId": declarant["personId"],
    }, LEAD)
    scoped_no_nominee = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "Bank C", "nomination": "none", "amount": 1000,
        "bankType": "commercial", "claimantPersonIds": [sunita["personId"]], "nonClaimantPersonIds": [],
    }, LEAD)
    legacy = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "Legacy Bank", "nomination": "none", "amount": 1000,
        "bankType": "commercial",
    }, LEAD)

    first_ctx = svc.pack_context(cd, first)
    second_ctx = svc.pack_context(cd, second)
    legacy_ctx = svc.pack_context(cd, legacy)
    assert [p["fullName"] for p in first_ctx["nominees"]] == ["Sunita"]
    assert [p["fullName"] for p in first_ctx["claimants"]] == ["Sunita"]
    assert [p["fullName"] for p in first_ctx["heirs"]] == ["Sunita"]
    assert first_ctx["declarant"]["fullName"] == "Rao"
    assert [p["fullName"] for p in second_ctx["nominees"]] == ["Riya"]
    assert "I-D" not in scoped_no_nominee["route"]["forms"]
    assert "I-D" in legacy["route"]["forms"]
    assert {p["fullName"] for p in legacy_ctx["nominees"]} == {"Sunita", "Riya"}
    assert arjun["personId"] in {p["personId"] for p in legacy_ctx["nonClaimants"]}


def test_claim_specific_person_ids_must_belong_to_the_case():
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "life_insurance", "institution": "LIC",
    }, LEAD)
    before = store.get(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}")

    with pytest.raises(ApiError) as error:
        svc.update_asset(store, cd, asset["assetId"], {"claimantPersonIds": ["p-missing"]}, LEAD)

    assert error.value.code == "invalid"
    assert store.get(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}") == before


def test_claim_specific_roles_cannot_put_a_declarant_or_claimant_on_both_sides():
    store, cd = make_case()
    claimant = add_person(store, cd, fullName="Sunita Sharma", relation="Wife", isClaimant=True)
    declarant = add_person(store, cd, fullName="Family Friend", relation="Friend", isDeclarant=True)
    asset = svc.create_asset(store, cd, {"assetType": "life_insurance", "institution": "LIC"}, LEAD)

    with pytest.raises(ApiError):
        svc.update_asset(store, cd, asset["assetId"], {"claimantPersonIds": [declarant["personId"]]}, LEAD)
    with pytest.raises(ApiError):
        svc.update_asset(store, cd, asset["assetId"], {
            "claimantPersonIds": [claimant["personId"]],
            "nonClaimantPersonIds": [claimant["personId"]],
        }, LEAD)


def test_family_change_invalidates_generated_packs_and_reroutes_claims():
    store, cd = make_case()
    claimant = add_person(store, cd, fullName="Sunita Sharma", relation="Wife", isClaimant=True)
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "none",
        "bankType": "commercial", "amount": 1000,
    }, LEAD)
    _doc, cd = make_pack_ready(store, svc.load_case(store, cd.case_id), asset)

    svc.upsert_person(store, cd, claimant["personId"], {"fullName": "Sunita S. Sharma"})

    updated = svc.load_case(store, cd.case_id).asset(asset["assetId"])
    assert updated["status"] != "pack_ready"
    assert updated["packDocId"] == ""
    assert updated["packStaleAt"]


def test_case_detail_change_invalidates_generated_packs():
    store, cd = make_case()
    add_person(store, cd, fullName="Sunita Sharma", relation="Wife", isClaimant=True)
    asset = svc.create_asset(store, cd, {
        "assetType": "life_insurance", "institution": "LIC", "amount": 1000,
    }, LEAD)
    _doc, cd = make_pack_ready(store, svc.load_case(store, cd.case_id), asset)

    svc.update_case(store, cd, {"deceasedName": "Ramesh Kumar Sharma"})

    updated = svc.load_case(store, cd.case_id).asset(asset["assetId"])
    assert updated["status"] != "pack_ready"
    assert updated["packDocId"] == ""


def test_answer_clock_handles_confirmed_bank_letter_submission():
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    store.put({
        "PK": svc.pk(cd.case_id), "SK": f"TOKEN#{asset['assetId']}#complaint_sent",
        "type": "token", "taskToken": "task-token",
    })
    sent = {}

    result = svc.answer_clock(
        store, svc.load_case(store, cd.case_id), asset["assetId"],
        {"stage": "complaint_sent", "sent": True, "sentOn": "2026-09-12"}, LEAD,
        lambda token, output: sent.update({"token": token, "output": output}),
    )

    expected = {"sent": True, "sentOn": "2026-09-12"}
    assert result == expected
    assert sent == {"token": "task-token", "output": expected}
    assert store.get(svc.pk(cd.case_id), f"TOKEN#{asset['assetId']}#complaint_sent") is None
    events = svc.load_case(store, cd.case_id).events
    assert any("sent on 2026-09-12" in event["text"] for event in events)


def test_complaint_sent_question_is_a_next_action():
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    store.put({
        "PK": svc.pk(cd.case_id), "SK": f"TOKEN#{asset['assetId']}#complaint_sent",
        "type": "token", "taskToken": "complaint-token",
    })

    actions = svc.next_actions(svc.load_case(store, cd.case_id))

    assert any(action.get("kind") == "answer" and action.get("assetId") == asset["assetId"]
               and "complaint letter" in action.get("text", "") for action in actions)


@pytest.mark.parametrize("paid_on", ["12/09/2026", "2999-01-01"])
def test_settled_answer_rejects_a_bad_or_future_paid_date(paid_on):
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    token_key = f"TOKEN#{asset['assetId']}#settled"
    store.put({"PK": svc.pk(cd.case_id), "SK": token_key, "type": "token", "taskToken": "task-token"})
    sent = []

    with pytest.raises(ApiError) as error:
        svc.answer_clock(store, svc.load_case(store, cd.case_id), asset["assetId"],
                         {"stage": "settled", "settled": True, "paidOn": paid_on}, LEAD, lambda *a: sent.append(a))

    assert error.value.code == "invalid" and not sent  # the clock never receives a date it can't use
    assert store.get(svc.pk(cd.case_id), token_key) is not None


def test_complaint_wait_cannot_start_before_letter_is_sent():
    store, cd = make_case()
    asset = svc.create_asset(store, cd, {
        "assetType": "bank_deposit", "institution": "SBI", "nomination": "nominee", "amount": 1000,
    }, LEAD)
    token_key = f"TOKEN#{asset['assetId']}#complaint_sent"
    store.put({"PK": svc.pk(cd.case_id), "SK": token_key, "type": "token", "taskToken": "task-token"})

    with pytest.raises(ApiError) as error:
        svc.answer_clock(store, svc.load_case(store, cd.case_id), asset["assetId"],
                         {"stage": "complaint_sent", "sent": False, "sentOn": "2026-09-12"}, LEAD,
                         lambda *_: None)

    assert error.value.code == "invalid"
    assert store.get(svc.pk(cd.case_id), token_key) is not None

"""The sample case behind "Try the demo": complete enough to show the whole journey, and clearly synthetic."""
from euphatics.app import demo, service as svc
from euphatics.aws.store import MemoryStore

VISITOR = "visitor@example.com"


def seeded():
    store = MemoryStore()
    result = demo.seed_case(store, VISITOR)
    return store, svc.load_case(store, result["caseId"]), result


def test_sample_case_has_family_assets_and_findings():
    _, cd, result = seeded()

    assert cd.meta["demo"] is True and cd.meta["secondsPerDay"] == 4
    assert {p["fullName"] for p in cd.people} == {
        "Sunita Sharma", "Riya Sharma", "Arjun Sharma", "K. Venkatesh Rao"}
    assert len(cd.assets) == len(demo.ASSETS)
    assert result["leads"] > 0 and all(lead["status"] == "new" for lead in cd.leads)


def test_routes_are_computed_so_every_claim_opens_on_a_plan():
    _, cd, _ = seeded()
    routes = {a["assetType"]: a["route"]["route"] for a in cd.assets}

    assert routes["bank_deposit"] == "NOMINEE"  # nominated: the simple path
    assert routes["term_deposit"] == "SIMPLIFIED"  # no nomination, under the co-operative limit
    assert all(a.get("status") for a in cd.assets)


def test_the_no_nomination_claim_carries_its_own_people():
    _, cd, _ = seeded()
    fd = next(a for a in cd.assets if a["assetType"] == "term_deposit")
    by_id = {p["personId"]: p["fullName"] for p in cd.people}

    assert [by_id[i] for i in fd["claimantPersonIds"]] == ["Sunita Sharma", "Riya Sharma"]
    assert [by_id[i] for i in fd["nonClaimantPersonIds"]] == ["Arjun Sharma"]
    assert by_id[fd["declarantPersonId"]] == "K. Venkatesh Rao"
    assert "I-D" in fd["route"]["forms"] and "I-E" in fd["route"]["forms"]


def test_a_shared_sandbox_stops_collecting_cases():
    store = MemoryStore()
    first = demo.seed_case(store, VISITOR)
    for _ in range(demo.MAX_CASES):
        svc.create_case(store, VISITOR, {"deceasedName": "Someone"})

    again = demo.seed_case(store, VISITOR)

    assert again["created"] is False and again["caseId"] == first["caseId"]

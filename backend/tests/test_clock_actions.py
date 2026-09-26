import json
from pathlib import Path

from euphatics.app import service as svc
from euphatics.aws.store import MemoryStore
from handlers import clock


def _claim():
    store = MemoryStore()
    case = svc.create_case(store, "lead@example.com", {"deceasedName": "Synthetic Parent"})
    cd = svc.load_case(store, case["caseId"])
    asset = svc.create_asset(
        store,
        cd,
        {"assetType": "bank_deposit", "institution": "Example Bank", "nomination": "nominee", "amount": 10000},
        "lead@example.com",
    )
    return store, svc.load_case(store, cd.case_id), asset


def test_complaint_wait_starts_from_confirmed_sent_date():
    store, cd, asset = _claim()
    result = clock.complaint_sent(
        store,
        cd,
        cd.asset(asset["assetId"]),
        {"complaint": {"sent": True, "sentOn": "2026-09-01"}, "secondsPerDay": 86400},
    )

    saved = store.get(svc.pk(cd.case_id), f"ASSET#{asset['assetId']}")["clock"]
    assert saved["complaintSentOn"] == "2026-09-01"
    assert saved["replyDueDate"] == "2026-10-01"
    assert saved["stage"] == "waiting_bank_reply"
    assert result["replyDueAt"].startswith("2026-10-01T")


def test_state_machine_waits_for_family_to_send_complaint():
    path = Path(__file__).resolve().parents[1] / "statemachines" / "claim_clock.asl.json"
    states = json.loads(path.read_text(encoding="utf-8"))["States"]

    assert states["Late"]["Next"] == "AskComplaintSent"
    assert states["AskComplaintSent"]["Resource"].endswith(".waitForTaskToken")
    assert states["WaitBankReply"]["TimestampPath"] == "$.complaintResult.sent.replyDueAt"

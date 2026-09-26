"""Assistant jobs: PII scrubbed before saving, web failures fall back, polling returns only the caller's jobs."""
import json

import pytest

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws.authz import LocalAuthz
from euphatics.aws.store import MemoryStore
from handlers import api as api_mod
from handlers import assistant

LEAD, STRANGER = "riya@example.com", "x@example.com"


def event(email, method="POST", body=None, job_id=None):
    e = {"routeKey": f"{method} /assistant" + ("/{jobId}" if job_id else ""),
         "requestContext": {"authorizer": {"jwt": {"claims": {"email": email}}}},
         "body": json.dumps(body or {})}
    if job_id:
        e["pathParameters"] = {"jobId": job_id}
    return e


@pytest.fixture()
def world(monkeypatch):
    store, authz = MemoryStore(), LocalAuthz()
    monkeypatch.setattr(api_mod, "_store", store)
    monkeypatch.setattr(api_mod, "_authz", authz)
    monkeypatch.setattr(assistant.ai, "comprehend_pii", lambda text: [])
    case = svc.create_case(store, LEAD, {"deceasedName": "Ramesh Kumar Sharma", "dod": "2026-07-02"})
    return store, case["caseId"]


def ask(email, body):
    r = assistant.handler(event(email, body=body), None)  # no Lambda context → job runs inline
    return r["statusCode"], json.loads(r["body"])


def test_web_failure_falls_back_to_plain_answer_with_note(world, monkeypatch):
    store, case_id = world

    def broken(q, lang):
        raise TimeoutError("grounding timed out")

    monkeypatch.setattr(assistant.ai, "grounded_answer", broken)
    monkeypatch.setattr(assistant.ai, "explain", lambda ctx, q, lang: {"answer": "General steps.", "citations": [],
                                                                        "grounded": False, "usage": {"x": 1}})
    status, res = ask(LEAD, {"caseId": case_id, "mode": "web", "question": "Ramesh Kumar Sharma PAN ABCPS1234K EPF claim?"})
    assert status == 200 and res["status"] == "done"
    assert res["answer"] == "General steps." and "no live sources" in res["note"]
    assert "Ramesh" not in res["askedAs"] and "ABCPS1234K" not in res["askedAs"]
    assert "usage" not in res
    job = store.get(f"USER#{LEAD}", f"ASK#{res['jobId']}")
    assert job["ttl"] > 0 and "ABCPS1234K" not in json.dumps(job)


def test_model_down_gives_deterministic_answer(world, monkeypatch):
    _, case_id = world

    def down(*a, **k):
        raise RuntimeError("bedrock down")

    monkeypatch.setattr(assistant.ai, "explain", down)
    status, res = ask(LEAD, {"caseId": case_id, "mode": "explain", "question": "What next?"})
    assert status == 200 and res["fallback"] is True and res["answer"]


def test_poll_is_scoped_to_the_asker(world, monkeypatch):
    _, case_id = world
    monkeypatch.setattr(assistant.ai, "explain", lambda ctx, q, lang: {"answer": "ok", "citations": [], "grounded": False})
    _, res = ask(LEAD, {"caseId": case_id, "question": "What next?"})
    mine = assistant.handler(event(LEAD, "GET", job_id=res["jobId"]), None)
    assert mine["statusCode"] == 200 and json.loads(mine["body"])["answer"] == "ok"
    theirs = assistant.handler(event(STRANGER, "GET", job_id=res["jobId"]), None)
    assert theirs["statusCode"] == 404


def test_stranger_cannot_ask_about_a_case(world):
    _, case_id = world
    status, res = ask(STRANGER, {"caseId": case_id, "question": "Tell me about this case"})
    assert status == 403


def test_explain_settings_per_model(monkeypatch):
    """gpt-oss is a reasoning model: room for its thinking and light reasoning; Nova keeps the short cap."""
    calls = []

    class FakeBedrock:
        def converse(self, **kw):
            calls.append(kw)
            return {"output": {"message": {"content": [{"reasoningContent": {"reasoningText": {"text": "…"}}},
                                                       {"text": "Answer."}]}}, "usage": {}}

    monkeypatch.setattr(assistant.ai, "client", lambda *a, **k: FakeBedrock())
    r = assistant.ai.explain("ctx", "q", "hi", model="openai.gpt-oss-120b-1:0", region="ap-south-1")
    assert r["answer"] == "Answer."  # reasoning blocks are not shown to the family
    assert calls[0]["additionalModelRequestFields"] == {"reasoning_effort": "low"}
    assert calls[0]["inferenceConfig"]["maxTokens"] == 1200
    assert "आरबीआई" in calls[0]["system"][0]["text"]  # Hindi glossary keeps official terms right
    assistant.ai.explain("ctx", "q", "en", model="us.amazon.nova-2-lite-v1:0", region="us-east-1")
    assert "additionalModelRequestFields" not in calls[1] and calls[1]["inferenceConfig"]["maxTokens"] == 400


def test_explain_context_carries_the_official_form_facts():
    from euphatics.rules import evaluate_asset

    route = evaluate_asset({"asset_type": "term_deposit", "nomination": "none", "bank_type": "cooperative",
                            "amount": 320000, "non_claimant_heirs": 1}).to_dict()
    ctx = assistant._route_context({"assetType": "term_deposit", "institution": "Nandini Sahakari Bank", "route": route})
    assert "Annex I-D (letter of disclaimer / no objection)" in ctx and "must be stamped" in ctx
    assert "not related to the deceased or the heirs" in ctx
    assert "Limit for this route at this bank: Rs 500,000; this claim: Rs 320,000" in ctx

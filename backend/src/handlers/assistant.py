"""Assistant Lambda: 'explain this step' and 'search the web' with Amazon Nova 2 Lite.

Order of operations is the privacy story:
  1. Cedar check (UseAssistant) when a case is involved
  2. daily quota per user (cost guard)
  3. PII firewall: regex + checksum, known family names → roles, Comprehend second pass
  4. model call; web answers keep their citations
  5. fallbacks: web search fails → plain Nova answer (no live sources) → deterministic text

Web-grounded answers can take longer than API Gateway's hard 30-second limit, so the model runs as a job:
POST /assistant saves a pending job and re-invokes this function asynchronously; the app polls
GET /assistant/{jobId} until the answer is saved. Jobs live under the asking user's key and expire after a day.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws import ai
from euphatics.aws.clients import client
from euphatics.privacy import scrub

from .api import deps
from .http import api, body_of, email_of, params

log = logging.getLogger("euphatics")

DAILY_LIMIT = 40
JOB_TTL_SECONDS = 24 * 3600
RESULT_FIELDS = ("status", "answer", "citations", "grounded", "fallback", "model", "note", "removed", "askedAs",
                 "mode", "lang")

GENERAL_CONTEXT = (
    "General help for families claiming bank deposits, lockers, PF, insurance and investments after a death in "
    "India. RBI Directions 2025: nominee route (paras 8-9), simplified route below Rs 15 lakh or Rs 5 lakh for "
    "co-operative banks (para 10(a)), 15-day settlement (para 31), compensation at Bank Rate + 4% for delay "
    "(para 33).")


# What the official RBI annexes themselves say, so answers about signing and stamping come from the form text
FORM_FACTS = {
    "I-C": "Annex I-C (bond of indemnity) is signed by the claimants and must be stamped as per the Stamp Act of the "
           "State; the stamp paper value depends on the state (ask the branch).",
    "I-D": "Annex I-D (letter of disclaimer / no objection) is one letter signed by every legal heir who is not "
           "claiming, and must be stamped as per the Stamp Act of the State.",
    "I-E": "Annex I-E (declaration) is signed by an independent person who knows the family well, is not related to "
           "the deceased or the heirs and is not a claimant; it must be stamped as per the Stamp Act of the State.",
    "I-H": "Annex I-H (indemnity for locker / safe custody contents) must be stamped as per the Stamp Act of the State.",
}


def _route_context(asset: dict) -> str:
    r = asset.get("route") or {}
    lines = [f"Asset: {asset.get('assetType')} at {asset.get('institution') or 'a bank'}",
             f"Route: {(r.get('title') or {}).get('en', r.get('route', ''))}"]
    cit = r.get("citation") or {}
    if cit:
        lines.append(f"Rule: RBI Directions 2025 para {cit.get('para')}: \"{cit.get('quote')}\"")
    thr = r.get("threshold") or {}
    if thr.get("limit_inr"):
        lines.append(f"Limit for this route at this bank: Rs {thr['limit_inr']:,.0f}; this claim: Rs {float(thr.get('amount_inr') or 0):,.0f} (para 7(h)).")
    for f in r.get("forms") or []:
        if f in FORM_FACTS:
            lines.append(f"Form fact: {FORM_FACTS[f]}")
    if r.get("where"):
        lines.append(f"Where: {r['where']}")
    if (r.get("timeline") or {}).get("en"):
        lines.append(f"Timeline: {r['timeline']['en']}")
    for d in r.get("documents") or []:
        lines.append(f"Document needed: {d.get('en')}")
    for n in r.get("notes") or []:
        lines.append(f"Note (para {n.get('para')}): {n.get('en')}")
    for c in r.get("checklist") or []:
        lines.append(f"Step: {c.get('en')}")
    clock = asset.get("clock") or {}
    if clock.get("dueDate"):
        lines.append(f"Bank must settle by {clock['dueDate']} (para 31); late means interest at Bank Rate + 4% (para 33).")
    return "\n".join(lines)


def _fallback(route_title: str, para: str, lang: str) -> str:
    if not route_title:
        return ("I couldn't reach the AI model right now. Your claim steps and rules are still shown on each asset, "
                "with the RBI paragraph they come from.") if lang != "hi" else (
                "अभी एआई मॉडल उपलब्ध नहीं है। हर दावे के कदम और नियम, आरबीआई पैरा के साथ, दावे के पेज पर दिखते हैं।")
    return f"{route_title}. (RBI para {para})" if para else route_title


def start(event, context) -> tuple[int, dict]:
    store, authz = deps()
    email = email_of(event)
    body = body_of(event)
    question = (body.get("question") or "").strip()[:1200]
    mode = "web" if body.get("mode") == "web" else "explain"
    lang = "hi" if body.get("lang") == "hi" else "en"
    if not question:
        raise ApiError(400, "Type a question.", "invalid")

    cd, asset = None, None
    if body.get("caseId"):
        cd = svc.load_case(store, body["caseId"])
        svc.require(authz, email, "UseAssistant", cd)
        if body.get("assetId"):
            asset = cd.asset(body["assetId"])

    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    used = store.add(f"USER#{email}", f"QUOTA#{day}", "n", 1)
    if used > DAILY_LIMIT:
        raise ApiError(429, "Daily limit for the assistant reached. It resets tomorrow.", "quota")

    known = {}
    if cd:
        known[cd.meta.get("deceasedName", "")] = "the deceased" if lang != "hi" else "मृतक"
        for p in cd.people:
            if p.get("fullName"):
                known[p["fullName"]] = f"my {p.get('relation', 'relative').lower()}" if lang != "hi" else "परिवार का सदस्य"
    clean, removed = scrub(question, known)
    if mode == "web":  # the question leaves our account only in web mode, so it gets the second PII pass
        spans = ai.comprehend_pii(clean)
        clean, more = ai.redact_spans(clean, [s for s in spans if s["type"] not in {"DATE_TIME", "AGE", "URL"}])
        removed += more

    route = (asset or {}).get("route") or {}
    job_id = uuid.uuid4().hex[:16]
    job = {
        "PK": f"USER#{email}", "SK": f"ASK#{job_id}", "type": "ask", "status": "pending",
        "mode": mode, "lang": lang, "askedAs": clean, "removed": removed,
        "context": _route_context(asset) if asset else GENERAL_CONTEXT,
        "routeTitle": (route.get("title") or {}).get(lang, ""), "para": (route.get("citation") or {}).get("para", ""),
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ttl": int(time.time()) + JOB_TTL_SECONDS,
    }
    store.put(job)

    fn = getattr(context, "invoked_function_arn", None)
    if fn and not os.environ.get("ASSISTANT_INLINE"):
        client("lambda").invoke(FunctionName=fn, InvocationType="Event",
                                Payload=json.dumps({"assistantJob": {"email": email, "jobId": job_id}}).encode())
        return 202, {"jobId": job_id, **{k: job[k] for k in RESULT_FIELDS if k in job}}
    return 200, {"jobId": job_id, **_result(run_job(store, email, job_id))}


def run_job(store, email: str, job_id: str) -> dict:
    """Runs the model for a saved job and stores the answer. Never raises: the job always finishes."""
    pk, sk = f"USER#{email}", f"ASK#{job_id}"
    job = store.get(pk, sk)
    if not job or job.get("status") != "pending":
        return job or {}
    lang, question = job["lang"], job["askedAs"]
    res: dict
    try:
        if job["mode"] == "web":
            try:
                res = ai.grounded_answer(question, lang)
            except Exception:  # noqa: BLE001 - web grounding down or slow: answer without live sources
                log.exception("web grounding failed; answering without web search")
                res = ai.explain(GENERAL_CONTEXT, question, lang)
                res["note"] = ("Web search didn't respond, so this answer has no live sources. Please verify it."
                               if lang != "hi" else "वेब खोज ने जवाब नहीं दिया, इसलिए इस उत्तर के साथ स्रोत नहीं हैं। कृपया जांच लें।")
        else:
            res = ai.explain(job["context"], question, lang)
    except Exception:  # noqa: BLE001 - model unavailable → deterministic answer
        log.exception("assistant model call failed")
        res = {"answer": _fallback(job.get("routeTitle", ""), job.get("para", ""), lang), "citations": [],
               "grounded": False, "fallback": True}
    res.pop("usage", None)
    return store.update(pk, sk, {**res, "status": "done",
                                 "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")})


def poll(event) -> tuple[int, dict]:
    store, _ = deps()
    email = email_of(event)
    job = store.get(f"USER#{email}", f"ASK#{params(event).get('jobId', '')}")
    if not job:
        raise ApiError(404, "That answer has expired. Ask again, please.", "not_found")
    return 200, {"jobId": job["SK"].removeprefix("ASK#"), **_result(job)}


def _result(job: dict) -> dict:
    return {k: job[k] for k in RESULT_FIELDS if k in job}


@api
def _http(event, context):
    if event.get("routeKey", "").startswith("GET "):
        return poll(event)
    return start(event, context)


def handler(event, context):
    if isinstance(event, dict) and "assistantJob" in event:  # async self-invocation from start()
        store, _ = deps()
        job = event["assistantJob"]
        run_job(store, job["email"], job["jobId"])
        return {"ok": True}
    return _http(event, context)

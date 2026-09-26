"""Step Functions task Lambda for the claim clock (see backend/statemachines/claim_clock.asl.json).

Actions: schedule, remind, ask, settled, late, complaint_sent, resolved, ombudsman.
Demo mode: `secondsPerDay` < 86400 compresses days into seconds so the whole
15-day clock can run on camera. Dates in letters stay in real calendar terms
(documents-complete date + elapsed "days").
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

from euphatics.app import service as svc
from euphatics.aws import files, notify
from euphatics.aws.store import Store
from euphatics.forms import build_bank_delay_letter, build_ombudsman_draft

log = logging.getLogger("euphatics.clock")
log.setLevel(logging.INFO)
IST = timezone(timedelta(hours=5, minutes=30))
REAL_DAY = 86400


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _logical_today(inp: dict) -> date:
    spd = int(inp.get("secondsPerDay") or REAL_DAY)
    docs = date.fromisoformat(inp["docsCompleteDate"])
    if spd >= REAL_DAY:
        return datetime.now(IST).date()
    started = _parse(inp["sched"]["clock"]["startedAt"])
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return docs + timedelta(days=int(elapsed // spd))


def _notify(cd, subject: str, body: str) -> None:
    lead = cd.meta.get("leadEmail")
    if lead:
        notify.send(lead, subject, body)


def schedule(store, cd, asset, inp):
    spd = int(inp.get("secondsPerDay") or REAL_DAY)
    docs = date.fromisoformat(inp["docsCompleteDate"])
    if spd >= REAL_DAY:
        base = datetime.combine(docs, time(9, 0), tzinfo=IST)
        due = base + timedelta(days=16)  # ask on the morning after the 15th day
        ask_timeout = 3 * REAL_DAY
    else:
        base = datetime.now(timezone.utc)
        due = base + timedelta(seconds=15 * spd)
        ask_timeout = max(180, 3 * spd)
    clock = {
        "startedAt": _iso(base if spd < REAL_DAY else datetime.now(timezone.utc)),
        "reminder1At": _iso(base + timedelta(seconds=10 * spd)),
        "reminder2At": _iso(base + timedelta(seconds=14 * spd)),
        "dueAt": _iso(due),
        "askTimeoutSeconds": int(ask_timeout),
        "replyWaitSeconds": int(30 * spd),
    }
    store.update(svc.pk(cd.case_id), asset["SK"], {"clock": {**(asset.get("clock") or {}), **clock, "stage": "running"}})
    return clock


def remind(store, cd, asset, inp, day: int):
    inst = asset.get("institution") or "the bank"
    due = (asset.get("clock") or {}).get("dueDate")
    left = 15 - day
    svc.add_event(store, cd.case_id, "reminder",
                  f"Day {day}: {inst} has {left} day(s) left to settle (due {due}, RBI para 31).",
                  asset_id=asset["assetId"],
                  text_hi=f"दिन {day}: {inst} के पास निपटाने के लिए {left} दिन बाकी (अंतिम तिथि {due})।")
    _notify(cd, f"Day {day}: {inst} claim", f"{inst} must settle the claim by {due} (RBI Directions 2025, para 31).")
    return {"ok": True}


def ask(store, cd, asset, inp, stage: str, token: str):
    store.put({"PK": svc.pk(cd.case_id), "SK": f"TOKEN#{asset['assetId']}#{stage}", "type": "token",
               "taskToken": token, "stage": stage, "createdAt": svc.now_iso()})
    clock = {**(asset.get("clock") or {}), "stage": f"awaiting_{stage}"}
    store.update(svc.pk(cd.case_id), asset["SK"], {"clock": clock})
    inst = asset.get("institution") or "the bank"
    if stage == "settled":
        text, hi = (f"Day 15 is over. Has the money from {inst} arrived?", f"15 दिन पूरे। क्या {inst} से पैसा आया?")
    elif stage == "complaint_sent":
        text, hi = (f"Your complaint letter for {inst} is ready. Tell us after you send it so the 30-day response period starts.",
                    f"{inst} के लिए शिकायत पत्र तैयार है। भेजने के बाद बताएं, तभी 30 दिन की अवधि शुरू होगी।")
    else:
        text, hi = (f"30 days since you sent the complaint. Did {inst} resolve it?",
                    f"शिकायत भेजे 30 दिन हो गए। क्या {inst} ने समाधान किया?")
    svc.add_event(store, cd.case_id, "question", text, asset_id=asset["assetId"], text_hi=hi)
    _notify(cd, text, text + " Open the app to answer.")
    return {"ok": True}


def settled(store, cd, asset, inp):
    ans = inp.get("answer") or {}
    today = _logical_today(inp)
    paid_on = ans.get("paidOn") or today.isoformat()
    comp = svc.compensation_for(asset, inp["docsCompleteDate"], paid_on, paid=True)
    late = comp["delay_days"] > 0
    clock = {**(asset.get("clock") or {}), "stage": "done", "settledOn": paid_on,
             "amountReceived": float(ans.get("amountReceived") or asset.get("amount") or 0),
             "compensation": comp if late else {}}
    store.update(svc.pk(cd.case_id), asset["SK"], {"status": "settled_late" if late else "settled", "clock": clock})
    inst = asset.get("institution") or "the bank"
    if late:
        text = (f"{inst} settled {comp['delay_days']} day(s) late. Ask for Rs {comp['compensation_inr']:,.2f} "
                f"compensation (RBI para 33).")
    else:
        text = f"{inst} settled within 15 days."
    svc.add_event(store, cd.case_id, "settled", text, asset_id=asset["assetId"])
    store.delete(svc.pk(cd.case_id), f"TOKEN#{asset['assetId']}#settled")
    return {"ok": True, "late": late}


def late(store, cd, asset, inp):
    store.delete(svc.pk(cd.case_id), f"TOKEN#{asset['assetId']}#settled")
    today = _logical_today(inp)
    comp = svc.compensation_for(asset, inp["docsCompleteDate"], today.isoformat(), paid=False)
    ctx = svc.pack_context(cd, asset)
    pdf = build_bank_delay_letter(ctx, comp, today=today.isoformat())
    key = f"cases/{cd.case_id}/letters/{asset['assetId']}-bank-{svc.now_iso().replace(':', '')}.pdf"
    files.put_bytes(key, pdf, "application/pdf")
    doc = svc.record_generated_doc(store, cd.case_id, "letter", key,
                                   f"delay-letter-{(asset.get('institution') or 'bank').replace(' ', '-')}.pdf",
                                   asset["assetId"])
    clock = {**(asset.get("clock") or {}), "stage": "complaint_draft_ready", "compensation": comp,
             "bankLetterDraftedOn": today.isoformat(), "letterDocId": doc["docId"]}
    store.update(svc.pk(cd.case_id), asset["SK"], {"status": "late", "clock": clock})
    inst = asset.get("institution") or "the bank"
    svc.add_event(store, cd.case_id, "late",
                  f"{inst} missed the 15-day deadline. Compensation so far: Rs {comp.get('compensation_inr', 0):,.2f} "
                  f"({comp.get('formula', '')}). Your letter to the bank is ready.",
                  asset_id=asset["assetId"],
                  text_hi=f"{inst} ने 15 दिन की समय सीमा चूकी। अब तक मुआवज़ा: ₹{comp.get('compensation_inr', 0):,.2f}। बैंक के लिए पत्र तैयार है।")
    _notify(cd, f"{inst} is late: letter ready", "Open the app to download the letter to the bank.")
    return {"letterDocId": doc["docId"]}


def complaint_sent(store, cd, asset, inp):
    """Start the complaint-response period only after the family says the letter was sent."""
    answer = inp.get("complaint") or {}
    sent_on = answer.get("sentOn") or _logical_today(inp).isoformat()
    try:
        sent_day = date.fromisoformat(sent_on)
    except (TypeError, ValueError) as exc:
        raise ValueError("complaint sent date must be YYYY-MM-DD") from exc
    spd = int(inp.get("secondsPerDay") or REAL_DAY)
    if spd >= REAL_DAY:
        reply_due = datetime.combine(sent_day + timedelta(days=30), time(9, 0), tzinfo=IST)
    else:
        reply_due = datetime.now(timezone.utc) + timedelta(seconds=30 * spd)
    clock = {**(asset.get("clock") or {}), "stage": "waiting_bank_reply",
             "complaintSentOn": sent_day.isoformat(), "replyDueDate": (sent_day + timedelta(days=30)).isoformat()}
    store.update(svc.pk(cd.case_id), asset["SK"], {"clock": clock})
    inst = asset.get("institution") or "the bank"
    svc.add_event(store, cd.case_id, "complaint_sent",
                  f"Complaint sent to {inst} on {sent_day.isoformat()}. Follow up after 30 days if unresolved.",
                  asset_id=asset["assetId"],
                  text_hi=f"{inst} को शिकायत {sent_day.isoformat()} को भेजी गई। समाधान न हो तो 30 दिन बाद आगे बढ़ें।")
    return {"replyDueAt": _iso(reply_due), "complaintSentOn": sent_day.isoformat()}


def resolved(store, cd, asset, inp):
    store.update(svc.pk(cd.case_id), asset["SK"], {"status": "resolved",
                                                   "clock": {**(asset.get("clock") or {}), "stage": "done"}})
    svc.add_event(store, cd.case_id, "resolved", f"{asset.get('institution')} resolved the claim.", asset_id=asset["assetId"])
    store.delete(svc.pk(cd.case_id), f"TOKEN#{asset['assetId']}#resolved")
    return {"ok": True}


def ombudsman(store, cd, asset, inp):
    store.delete(svc.pk(cd.case_id), f"TOKEN#{asset['assetId']}#resolved")
    today = _logical_today(inp)
    comp = svc.compensation_for(asset, inp["docsCompleteDate"], today.isoformat(), paid=False)
    letter_date = (asset.get("clock") or {}).get("complaintSentOn") or today.isoformat()
    pdf = build_ombudsman_draft(svc.pack_context(cd, asset), comp, bank_letter_date=letter_date, today=today.isoformat())
    key = f"cases/{cd.case_id}/letters/{asset['assetId']}-ombudsman-{svc.now_iso().replace(':', '')}.pdf"
    files.put_bytes(key, pdf, "application/pdf")
    doc = svc.record_generated_doc(store, cd.case_id, "ombudsman", key, "rbi-ombudsman-complaint-draft.pdf",
                                   asset["assetId"])
    clock = {**(asset.get("clock") or {}), "stage": "ombudsman_draft_ready", "compensation": comp,
             "ombudsmanDocId": doc["docId"]}
    store.update(svc.pk(cd.case_id), asset["SK"], {"status": "ombudsman_ready", "clock": clock})
    svc.add_event(store, cd.case_id, "ombudsman",
                  f"No resolution from {asset.get('institution')}. Your RBI Ombudsman complaint draft is ready to file on "
                  f"cms.rbi.org.in. Compensation now: Rs {comp.get('compensation_inr', 0):,.2f}.",
                  asset_id=asset["assetId"])
    return {"ok": True, "ombudsmanDocId": doc["docId"]}


def handler(event, context):
    action = event["action"]
    inp = event.get("input") or {}
    store = Store()
    cd = svc.load_case(store, inp["caseId"])
    asset = cd.asset(inp["assetId"])
    log.info("clock action=%s case=%s asset=%s", action, cd.case_id, asset["assetId"])
    if action == "schedule":
        return schedule(store, cd, asset, inp)
    if action == "remind":
        return remind(store, cd, asset, inp, int(event.get("day", 10)))
    if action == "ask":
        return ask(store, cd, asset, inp, event.get("stage", "settled"), event["taskToken"])
    if action == "settled":
        return settled(store, cd, asset, inp)
    if action == "late":
        return late(store, cd, asset, inp)
    if action == "complaint_sent":
        return complaint_sent(store, cd, asset, inp)
    if action == "resolved":
        return resolved(store, cd, asset, inp)
    if action == "ombudsman":
        return ombudsman(store, cd, asset, inp)
    raise ValueError(f"unknown action {action}")

"""Live end-to-end test against the deployed stack (uses throwaway example.com users).

    python scripts/e2e.py            (credentials: exported from `aws login`)

Covers: auth → case → family → statement scan → lead → route → pack → Aadhaar
masking → Cedar denials → 15-day clock (demo speed) → late letter → Ombudsman
draft → assistant (explain + web grounding).
"""
from __future__ import annotations

import io
import json
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
OUT = json.loads((ROOT / "backend" / "stack-outputs.json").read_text(encoding="utf-8-sig"))
O = {o["OutputKey"]: o["OutputValue"] for o in OUT}
API, POOL, CLIENT, REGION = O["ApiUrl"], O["UserPoolId"], O["UserPoolClientId"], O["Region"]
USERS_FILE = Path.home() / ".euphatics" / "test-users.json"
cog = boto3.client("cognito-idp", region_name=REGION)
PASS = FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


def users():
    if USERS_FILE.exists():
        return json.loads(USERS_FILE.read_text())
    pw = "Demo-" + secrets.token_urlsafe(10) + "9a"
    u = {r: {"email": f"euphatics.{r}.{secrets.token_hex(3)}@example.com", "password": pw} for r in ("lead", "heir", "helper")}
    USERS_FILE.parent.mkdir(exist_ok=True)
    USERS_FILE.write_text(json.dumps(u, indent=2))
    return u


def ensure_user(u):
    try:
        cog.admin_create_user(UserPoolId=POOL, Username=u["email"], MessageAction="SUPPRESS",
                              UserAttributes=[{"Name": "email", "Value": u["email"]}, {"Name": "email_verified", "Value": "true"}])
    except cog.exceptions.UsernameExistsException:
        pass
    cog.admin_set_user_password(UserPoolId=POOL, Username=u["email"], Password=u["password"], Permanent=True)


def token(u):
    r = cog.initiate_auth(ClientId=CLIENT, AuthFlow="USER_PASSWORD_AUTH",
                          AuthParameters={"USERNAME": u["email"], "PASSWORD": u["password"]})
    return r["AuthenticationResult"]["IdToken"]


def call(tok, method, path, body=None, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    if tok:
        req.add_header("authorization", f"Bearer {tok}")
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            status, text = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode()
    out = json.loads(text) if text else {}
    if expect is not None and status != expect:
        print(f"    ! {method} {path} → {status} {text[:300]}")
    return status, out


def ask(tok, body):
    """POST /assistant starts a job; poll GET /assistant/{jobId} until the answer is saved."""
    s, r = call(tok, "POST", "/assistant", body)
    end = time.time() + 120
    while s in (200, 202) and r.get("status") == "pending" and time.time() < end:
        time.sleep(1.5)
        s, r = call(tok, "GET", f"/assistant/{r['jobId']}")
    return s, r


def put_file(url, data, ctype):
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("content-type", ctype)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def get_bytes(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def upload(tok, case_id, data, filename, ctype, kind, process=True):
    s, up = call(tok, "POST", f"/cases/{case_id}/uploads", {"kind": kind, "filename": filename, "contentType": ctype, "size": len(data)}, 201)
    put_file(up["uploadUrl"], data, ctype)
    if not process:
        return up["docId"], {}
    s, res = call(tok, "POST", f"/cases/{case_id}/documents/{up['docId']}/process", None, 200)
    return up["docId"], res


def sample_id_card() -> bytes:
    sys.path.insert(0, str(ROOT / "backend" / "src"))
    from euphatics.privacy.aadhaar import verhoeff_check_digit
    from PIL import Image, ImageDraw, ImageFont

    num = "73942816055"
    num += verhoeff_check_digit(num)
    img = Image.new("RGB", (1200, 700), "white")
    d = ImageDraw.Draw(img)
    try:
        f_big, f = ImageFont.truetype("arial.ttf", 64), ImageFont.truetype("arial.ttf", 40)
    except OSError:
        f_big = f = ImageFont.load_default()
    d.text((60, 50), "SAMPLE ID - NOT A REAL DOCUMENT", fill="red", font=f)
    d.text((60, 160), "Name: Sunita Sharma", fill="black", font=f)
    d.text((60, 230), "DOB: 14/03/1978", fill="black", font=f)
    d.text((60, 450), f"{num[:4]} {num[4:8]} {num[8:]}", fill="black", font=f_big)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main():
    u = users()
    for r in u.values():
        ensure_user(r)
    tl, th, tp = token(u["lead"]), token(u["heir"]), token(u["helper"])
    print("auth ok for lead/heir/helper")

    s, h = call(None, "GET", "/health")
    check("public health route", s == 200 and h.get("ok"))
    s, _ = call(None, "GET", "/me/cases")
    check("JWT required", s == 401, s)

    s, case = call(tl, "POST", "/cases", {"deceasedName": "Ramesh Kumar Sharma", "dod": "2026-07-02", "relation": "Daughter",
                                          "pan": "ABCPS1234K", "secondsPerDay": 2}, 201)
    cid = case["caseId"]
    check("create case", s == 201 and case["panLast4"] == "234K")
    call(tl, "POST", f"/cases/{cid}/members", {"email": u["heir"]["email"], "role": "heir"}, 201)
    call(tl, "POST", f"/cases/{cid}/members", {"email": u["helper"]["email"], "role": "helper"}, 201)
    s, _ = call(th, "POST", f"/cases/{cid}/members", {"email": "z@example.com", "role": "heir"})
    check("Cedar: heir cannot manage members (403)", s == 403, s)
    for p in [
        {"fullName": "Sunita Sharma", "relation": "Wife", "isClaimant": True, "age": 48, "address": "12, 4th Cross, Koramangala, Bengaluru", "idType": "Aadhaar", "idLast4": "0551"},
        {"fullName": "Riya Sharma", "relation": "Daughter", "isClaimant": True, "age": 20, "address": "12, 4th Cross, Koramangala, Bengaluru"},
        {"fullName": "Arjun Sharma", "relation": "Son", "isNonClaimantHeir": True, "age": 26, "address": "Flat 9B, Baner, Pune"},
        {"fullName": "K. Venkatesh Rao", "relation": "Family friend", "isDeclarant": True, "yearsKnown": 22, "address": "14, 5th Cross, Koramangala"},
    ]:
        call(tl, "PUT", f"/cases/{cid}/people/new", p, 200)
    call(tl, "PATCH", f"/cases/{cid}", {"payment": {"accountHolder": "Sunita Sharma", "accountNumber": "XXXXXX2210", "ifsc": "DEMO0001234"}}, 200)

    stmt = (ROOT / "samples" / "data" / "sample_statement.pdf").read_bytes()
    t0 = time.time()
    _, res = upload(tl, cid, stmt, "sample_statement.pdf", "application/pdf", "statement")
    check(f"statement scan → {len(res.get('leads', []))} leads in {time.time() - t0:.1f}s", len(res.get("leads", [])) == 16)

    s, view = call(tl, "GET", f"/cases/{cid}", None, 200)
    fd = next(l for l in view["leads"] if l["leadType"] == "deposit")
    s, asset = call(tl, "POST", f"/cases/{cid}/leads/{fd['leadId']}/confirm",
                    {"nomination": "none", "amount": 320000, "accountNumbers": "FD 00231", "branch": "Koramangala"}, 201)
    check("route = SIMPLIFIED with I-B, I-C, I-D, I-E", asset["route"]["route"] == "SIMPLIFIED" and asset["route"]["forms"] == ["I-B", "I-C", "I-D", "I-E"], asset.get("route", {}).get("forms"))
    aid = asset["assetId"]

    t0 = time.time()
    id_doc, masked = upload(tl, cid, sample_id_card(), "sunita-id.png", "image/png", "id_proof")
    check(f"Aadhaar masked on ID image ({masked.get('maskedCount')}) in {time.time() - t0:.1f}s; Comprehend: {masked.get('piiTypes')}", masked.get("maskedCount") == 1)
    s, _ = call(tp, "GET", f"/cases/{cid}/documents/{id_doc}/url?variant=original")
    check("Cedar: helper cannot download original (403)", s == 403, s)
    s, prev = call(tp, "GET", f"/cases/{cid}/documents/{id_doc}/url?variant=preview")
    check("helper can see masked preview", s == 200 and prev.get("variant") == "masked", s)
    s, orig = call(th, "GET", f"/cases/{cid}/documents/{id_doc}/url?variant=original")
    check("heir can download original", s == 200, s)

    s, hv = call(tp, "GET", f"/cases/{cid}", None, 200)
    check("helper view hides addresses, ID digits and the payee account",
          "payment" not in hv["case"] and all("address" not in p and "idLast4" not in p for p in hv["people"]))

    t0 = time.time()
    s, pack = call(tl, "POST", f"/cases/{cid}/assets/{aid}/pack", None, 201)
    pdf = get_bytes(pack["url"]) if s == 201 else b""
    check(f"claim pack PDF ({pack.get('pages')} pages) in {time.time() - t0:.1f}s", pdf[:5] == b"%PDF-")

    # choosing the people for this claim changes the forms, so the old pack is withdrawn
    ids = {p["fullName"]: p["personId"] for p in call(tl, "GET", f"/cases/{cid}")[1]["people"]}
    s, _ = call(tl, "PATCH", f"/cases/{cid}/assets/{aid}", {
        "claimantPersonIds": [ids["Sunita Sharma"], ids["Riya Sharma"]], "nomineePersonIds": [],
        "nonClaimantPersonIds": [ids["Arjun Sharma"]], "declarantPersonId": ids["K. Venkatesh Rao"]}, 200)
    s, old = call(tl, "GET", f"/cases/{cid}/documents/{pack['docId']}/url")
    check("old pack is outdated after the claim's people change (409)", s == 409, s)
    s, pack = call(tl, "POST", f"/cases/{cid}/assets/{aid}/pack", None, 201)
    pdf = get_bytes(pack["url"]) if s == 201 else b""
    check("fresh pack with the chosen people", pdf[:5] == b"%PDF-")
    (Path.home() / ".euphatics" / "e2e_pack.pdf").write_bytes(pdf)

    s, a = call(tl, "POST", f"/cases/{cid}/assets/{aid}/submit", {"docsCompleteDate": "2026-08-01"}, 200)
    check("clock started (due 2026-08-16)", s == 200 and a["clock"]["dueDate"] == "2026-08-16")

    def wait_for(stage, timeout=150):
        end = time.time() + timeout
        while time.time() < end:
            _, v = call(tl, "GET", f"/cases/{cid}")
            if any(w["assetId"] == aid and w["stage"] == stage for w in v.get("waitingFor", [])):
                return v
            time.sleep(3)
        return None

    t0 = time.time()
    v = wait_for("settled")
    check(f"day-15 question arrived after {time.time() - t0:.0f}s", v is not None)
    s, _ = call(tl, "POST", f"/cases/{cid}/assets/{aid}/answer", {"stage": "settled", "settled": False}, 200)
    check("answered: not paid", s == 200)
    t0 = time.time()
    v = wait_for("complaint_sent", 180)
    letter = [d for d in (v or {}).get("documents", []) if d["kind"] == "letter"]
    comp = next((x for x in (v or {}).get("assets", []) if x["assetId"] == aid), {}).get("clock", {}).get("compensation", {})
    check(f"late → bank letter + compensation Rs {comp.get('compensation_inr')} ({comp.get('formula')})", bool(letter) and comp.get("rate_pct") == 9.5)
    check("30-day wait does not start until the family says the letter was sent",
          not any(w["assetId"] == aid and w["stage"] == "resolved" for w in (v or {}).get("waitingFor", [])))
    today = time.strftime("%Y-%m-%d")
    s, _ = call(tl, "POST", f"/cases/{cid}/assets/{aid}/answer", {"stage": "complaint_sent", "sent": True, "sentOn": today}, 200)
    check("answered: complaint sent", s == 200)
    v = wait_for("resolved", 180)
    check(f"asked whether the bank resolved it, {time.time() - t0:.0f}s after the letter", v is not None)
    s, _ = call(tl, "POST", f"/cases/{cid}/assets/{aid}/answer", {"stage": "resolved", "resolved": False}, 200)
    end = time.time() + 60
    omb = []
    while time.time() < end and not omb:
        time.sleep(3)
        _, v = call(tl, "GET", f"/cases/{cid}")
        omb = [d for d in v.get("documents", []) if d["kind"] == "ombudsman"]
    status = next((x for x in v.get("assets", []) if x["assetId"] == aid), {}).get("status")
    check(f"not resolved → RBI Ombudsman draft ready (status {status})", bool(omb) and status == "ombudsman_ready")

    s, ans = ask(tl, {"caseId": cid, "assetId": aid, "mode": "explain", "lang": "en",
                                           "question": "Why don't we need a succession certificate for this FD?"})
    check(f"assistant explain ({'fallback' if ans.get('fallback') else ans.get('model')})", s == 200 and ans.get("answer"), ans)
    print("    →", (ans.get("answer") or "")[:220].replace("\n", " "))
    s, web = ask(tl, {"caseId": cid, "mode": "web", "lang": "en",
                                           "question": "My father Ramesh Kumar Sharma (PAN ABCPS1234K) had ITC shares. How do we claim unpaid dividends from IEPF?"})
    check(f"assistant web grounding with {len(web.get('citations', []))} citations; removed {[r['type'] for r in web.get('removed', [])]}",
          s == 200 and web.get("citations") and "ABCPS1234K" not in web.get("askedAs", ""), web if s != 200 else "")
    print("    asked as:", web.get("askedAs"))
    print("    →", (web.get("answer") or "")[:220].replace("\n", " "))

    print(f"\n{PASS} passed, {FAIL} failed. Case {cid}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())

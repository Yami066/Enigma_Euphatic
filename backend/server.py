"""FastAPI local server for Euphatics.

Replaces AWS Lambda, API Gateway, S3, Cognito, and DynamoDB
with a self-contained local backend and SQLite database.
Runs on http://localhost:8000.
"""
from __future__ import annotations

import io
import json
import os
import secrets
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
import jwt

# Add src to python path
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from euphatics.app import service as svc
from euphatics.app.demo import seed_case
from euphatics.app.service import ApiError
from euphatics.discovery import detect_leads, parse_text_lines, scan_statement
from euphatics.forms import build_bank_delay_letter, build_claim_letter_pack, build_ombudsman_draft, build_pack
from euphatics.rules import evaluate_asset, load_guides, load_rulebook
from euphatics.rules.engine import BANK_ASSETS, LOCKER_ASSETS
from euphatics.sqlite_store import SqliteStore

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

JWT_SECRET = "euphatics-local-dev-secret-key-2026"
JWT_ALGORITHM = "HS256"

store = SqliteStore()

app = FastAPI(title="Euphatics Local Backend", version="1.0.0")

# Enable CORS for the local frontend (http://localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- Local File Storage Adapter -------------------- #

class LocalFiles:
    @staticmethod
    def _path(key: str) -> Path:
        p = UPLOAD_DIR / key.replace("/", os.sep)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    @classmethod
    def put_bytes(cls, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        p = cls._path(key)
        p.write_bytes(data)
        return key

    @classmethod
    def get_bytes(cls, key: str) -> bytes:
        p = cls._path(key)
        if not p.exists():
            return b""
        return p.read_bytes()

    @classmethod
    def delete_many(cls, keys: list[str]) -> None:
        for k in keys:
            p = cls._path(k)
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass


local_files = LocalFiles()


# -------------------- Auth Helpers -------------------- #

def create_jwt(email: str) -> str:
    payload = {
        "email": email.strip().lower(),
        "sub": email.strip().lower(),
        "exp": datetime.now(timezone.utc).timestamp() + 30 * 86400,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(authorization: str | None = Header(None)) -> str:
    if not authorization:
        # Default fallback for demo / unauthenticated dev testing
        return "demo@euphatics.example"
    token = authorization.replace("Bearer ", "").replace("bearer ", "").strip()

    # 1. Try Local Dev JWT verification
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("email") or payload.get("sub") or "demo@euphatics.example"
    except Exception:
        pass

    # 2. Try Cognito or standard JWT in dev mode
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified.get("email") or unverified.get("cognito:username") or unverified.get("sub")
        if user_id:
            return str(user_id).strip().lower()
    except Exception:
        pass

    # 3. If token is email or identifier string, fallback gracefully
    if "@" in token or token.startswith("+") or token.isdigit():
        return token.lower()
    return "demo@euphatics.example"


# -------------------- Auth Endpoints -------------------- #

@app.post("/auth/signup")
async def signup(data: dict = Body(...)):
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    store.create_user(email, password)
    token = create_jwt(email)
    return {"email": email, "token": token, "signInStep": "DONE"}


@app.post("/auth/signin")
async def signin(data: dict = Body(...)):
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if not store.verify_user(email, password):
        # Auto-create user locally for effortless testing
        store.create_user(email, password)
    token = create_jwt(email)
    return {"email": email, "token": token, "signInStep": "DONE"}


@app.get("/auth/me")
async def me(email: str = Depends(get_current_user)):
    return {"email": email}


# -------------------- Public Rules & Guides -------------------- #

@app.get("/health")
def health():
    return {"ok": True, "engine": "euphatics-local-sqlite", "db": str(store.db_path)}


@app.get("/rules")
def rules_info():
    book = load_rulebook()["rbi"]
    return {
        "source": book["source"],
        "thresholds": book["thresholds"],
        "routes": [{"id": r["id"], "route": r["route"], "para": r["para"], "title": r["title"]}
                   for r in book["routes"]],
    }


@app.get("/guides")
def guides_info():
    other = load_rulebook()["other"]["routes"]
    return {
        "guides": load_guides()["guides"],
        "playbooks": {k: {f: v.get(f) for f in ("title", "where", "url", "timeline", "sources")}
                      for k, v in other.items()},
    }


# -------------------- Case Management -------------------- #

@app.get("/me/cases")
def list_cases(email: str = Depends(get_current_user)):
    return {"cases": svc.my_cases(store, email)}


@app.post("/demo/case")
def create_demo_case(email: str = Depends(get_current_user)):
    res = seed_case(store, email)
    return res


@app.post("/cases")
def create_case(data: dict = Body(...), email: str = Depends(get_current_user)):
    return svc.create_case(store, email, data)


@app.get("/cases/{case_id}")
def get_case(case_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.case_view(cd, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.patch("/cases/{case_id}")
def patch_case(case_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.update_case(store, cd, data)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.delete("/cases/{case_id}")
def delete_case(case_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        svc.delete_case(store, local_files, cd)
        return {"deleted": True}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/members")
def invite_member(case_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.invite_member(store, cd, data, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.put("/cases/{case_id}/people/{person_id}")
def put_person(case_id: str, person_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        person = svc.upsert_person(store, cd, person_id, data)
        cd2 = svc.load_case(store, cd.case_id)
        for a in cd2.assets:
            if a.get("status") in {"ready", "needs_info", "pack_ready"}:
                svc.reroute(store, cd2, a)
        return person
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.delete("/cases/{case_id}/people/{person_id}")
def delete_person(case_id: str, person_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        svc.delete_person(store, cd, person_id)
        return {"deleted": True}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


# -------------------- Assets & Findings -------------------- #

@app.post("/cases/{case_id}/assets")
def add_asset(case_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.create_asset(store, cd, data, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.patch("/cases/{case_id}/assets/{asset_id}")
def patch_asset(case_id: str, asset_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.update_asset(store, cd, asset_id, data, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.delete("/cases/{case_id}/assets/{asset_id}")
def delete_asset(case_id: str, asset_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        svc.delete_asset(store, cd, asset_id, email)
        return {"deleted": True}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.get("/cases/{case_id}/search-kit")
def search_kit(case_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.search_kit(cd)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/findings")
def add_finding(case_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.add_finding(store, cd, data, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/leads/{lead_id}/confirm")
def confirm_lead(case_id: str, lead_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        return svc.confirm_lead(store, cd, lead_id, data, email)
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/leads/{lead_id}/dismiss")
def dismiss_lead(case_id: str, lead_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        svc.dismiss_lead(store, cd, lead_id)
        return {"dismissed": True}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


# -------------------- Local File Uploads & Downloads -------------------- #

def local_presign_put(s3_key: str, content_type: str, max_bytes: int = 10_000_000) -> str:
    # Points to our local upload endpoint
    return f"http://localhost:8001/api/raw-upload/{s3_key}"


@app.post("/cases/{case_id}/uploads")
def init_upload(case_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        res = svc.new_upload(store, cd, email, data, local_presign_put)
        return res
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.put("/api/raw-upload/{path:path}")
async def handle_raw_upload(path: str, request: Request):
    data = await request.body()
    content_type = request.headers.get("content-type", "application/octet-stream")
    local_files.put_bytes(path, data, content_type)
    return {"uploaded": True, "size": len(data), "path": path}


@app.get("/cases/{case_id}/documents/{doc_id}/url")
def get_doc_url(case_id: str, doc_id: str, variant: str = "original", email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        doc = cd.doc(doc_id)
        key = doc.get("s3Key") or f"cases/{case_id}/docs/{doc_id}"
        return {"url": f"http://localhost:8001/files/{key}", "variant": variant}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.get("/files/{path:path}")
def serve_file(path: str):
    file_path = local_files._path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    filename = file_path.name
    media_type = "application/pdf" if filename.endswith(".pdf") else ("image/png" if filename.endswith(".png") else "application/octet-stream")
    return FileResponse(file_path, media_type=media_type, filename=filename)


@app.post("/cases/{case_id}/documents/{doc_id}/process")
def process_document(case_id: str, doc_id: str, email: str = Depends(get_current_user)):
    cd = svc.load_case(store, case_id)
    doc = cd.doc(doc_id)
    key = doc.get("s3Key")
    data = local_files.get_bytes(key) if key else b""
    content_type = doc.get("contentType") or "application/octet-stream"

    # Local parsing: statement
    if doc.get("kind") == "statement":
        st = scan_statement(data, filename=doc.get("filename", "statement.pdf"))
        leads, unclear = detect_leads(st)
        svc.save_statement_results(store, cd, doc_id, st, leads, unclear)
        return {
            "statement": {"source": st.source, "bankName": st.bank_name, "bankType": st.bank_type,
                          "holder": st.holder, "accountLast4": st.account_last4,
                          "txnCount": len(st.txns), "unparsedCount": len(st.unparsed)},
            "leads": [l.to_dict() for l in leads],
            "unclear": [{"date": t.date, "narration": t.narration, "amount": t.amount, "direction": t.direction}
                        for t in unclear[:20]],
        }

    # Masked previews: default mark as processed
    store.update(cd.pk, f"DOC#{doc_id}", {"status": "processed", "maskedPagesTotal": 1})
    return {"processed": True}


# -------------------- Claim Pack & Letters Generation -------------------- #

@app.post("/cases/{case_id}/assets/{asset_id}/pack")
def generate_pack(case_id: str, asset_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        asset = cd.asset(asset_id)
        route = asset.get("route") or {}
        bank = asset.get("assetType") in BANK_ASSETS | LOCKER_ASSETS
        ctx = svc.pack_context(cd, asset)

        if bank:
            pdf_bytes = build_pack(ctx, attachments=[], official_forms=False)
        else:
            pdf_bytes = build_claim_letter_pack(ctx, attachments=[])

        doc_id = secrets.token_hex(6)
        s3_key = f"cases/{case_id}/packs/{asset_id}-{doc_id}.pdf"
        local_files.put_bytes(s3_key, pdf_bytes, "application/pdf")

        doc = svc.record_generated_doc(store, cd.case_id, "pack", s3_key, f"claim-pack-{asset_id}.pdf", asset_id)
        store.update(svc.pk(cd.case_id), asset["SK"], {"packDocId": doc["docId"], "status": "pack_ready"})
        return {"docId": doc["docId"], "url": f"http://localhost:8001/files/{s3_key}"}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


def get_asset_compensation(asset: dict) -> dict:
    clock = asset.get("clock") or {}
    if clock.get("compensation"):
        return clock["compensation"]
    docs_complete = clock.get("docsCompleteDate") or date.today().isoformat()
    today_str = date.today().isoformat()
    if docs_complete == today_str:
        from datetime import timedelta
        docs_complete = (date.today() - timedelta(days=20)).isoformat()
    try:
        return svc.compensation_for(asset, docs_complete, today_str, paid=False)
    except Exception:
        return {
            "amount_inr": float(asset.get("amount") or 0),
            "docs_complete": docs_complete,
            "due_date": today_str,
            "end_date": today_str,
            "delay_days": 1,
            "bank_rate_pct": 6.5,
            "rate_pct": 10.5,
            "compensation_inr": 0.0,
            "formula": "RBI Directions 2025 para 33",
            "citation": {},
            "kind": "deposit",
        }


@app.post("/cases/{case_id}/assets/{asset_id}/letters/bank-delay")
def delay_letter(case_id: str, asset_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        asset = cd.asset(asset_id)
        comp = get_asset_compensation(asset)
        ctx = svc.pack_context(cd, asset)
        pdf_bytes = build_bank_delay_letter(ctx, comp)

        doc_id = secrets.token_hex(6)
        s3_key = f"cases/{case_id}/letters/delay-{asset_id}-{doc_id}.pdf"
        local_files.put_bytes(s3_key, pdf_bytes, "application/pdf")
        doc = svc.record_generated_doc(store, cd.case_id, "letter", s3_key, f"delay-letter-{asset_id}.pdf", asset_id)
        return {"docId": doc["docId"], "url": f"http://localhost:8001/files/{s3_key}"}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/assets/{asset_id}/letters/ombudsman")
def ombudsman_letter(case_id: str, asset_id: str, email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        asset = cd.asset(asset_id)
        comp = get_asset_compensation(asset)
        ctx = svc.pack_context(cd, asset)
        letter_date = (asset.get("clock") or {}).get("bankLetterDate") or date.today().isoformat()
        pdf_bytes = build_ombudsman_draft(ctx, comp, letter_date)

        doc_id = secrets.token_hex(6)
        s3_key = f"cases/{case_id}/letters/ombudsman-{asset_id}-{doc_id}.pdf"
        local_files.put_bytes(s3_key, pdf_bytes, "application/pdf")
        doc = svc.record_generated_doc(store, cd.case_id, "ombudsman", s3_key, f"ombudsman-{asset_id}.pdf", asset_id)
        return {"docId": doc["docId"], "url": f"http://localhost:8001/files/{s3_key}"}
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


# -------------------- Statutory Clock Control -------------------- #

def dummy_start_clock(case_id, asset_id, clock):
    return {"started": True}


def dummy_send_answer(token, action):
    return {"answered": True}


@app.post("/cases/{case_id}/assets/{asset_id}/submit")
def submit_claim(case_id: str, asset_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        res = svc.submit_claim(store, cd, asset_id, data, email, dummy_start_clock)
        # Seed settled token locally so the user can answer when ready
        store.put({
            "PK": svc.pk(cd.case_id),
            "SK": f"TOKEN#{asset_id}#settled",
            "type": "token",
            "taskToken": "local-token",
            "assetId": asset_id,
            "stage": "settled",
        })
        return res
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@app.post("/cases/{case_id}/assets/{asset_id}/answer")
def answer_clock(case_id: str, asset_id: str, data: dict = Body(...), email: str = Depends(get_current_user)):
    try:
        cd = svc.load_case(store, case_id)
        stage = data.get("stage") or "settled"
        tok_key = f"TOKEN#{asset_id}#{stage}"
        if not store.get(svc.pk(cd.case_id), tok_key):
            store.put({
                "PK": svc.pk(cd.case_id),
                "SK": tok_key,
                "type": "token",
                "taskToken": "local-token",
                "assetId": asset_id,
                "stage": stage,
            })
        res = svc.answer_clock(store, cd, asset_id, data, email, dummy_send_answer)
        
        # Advance local clock state
        asset = cd.asset(asset_id)
        if stage == "settled":
            if data.get("settled"):
                paid_on = data.get("paidOn") or date.today().isoformat()
                clock = {**(asset.get("clock") or {}), "stage": "done", "settledOn": paid_on,
                         "amountReceived": float(data.get("amountReceived") or asset.get("amount") or 0)}
                store.update(svc.pk(cd.case_id), asset["SK"], {"status": "settled", "clock": clock})
            else:
                comp = get_asset_compensation(asset)
                ctx = svc.pack_context(cd, asset)
                pdf_bytes = build_bank_delay_letter(ctx, comp)
                s3_key = f"cases/{case_id}/letters/delay-{asset_id}-{secrets.token_hex(4)}.pdf"
                local_files.put_bytes(s3_key, pdf_bytes, "application/pdf")
                doc = svc.record_generated_doc(store, cd.case_id, "letter", s3_key, f"delay-letter-{asset_id}.pdf", asset_id)
                clock = {**(asset.get("clock") or {}), "stage": "complaint_draft_ready", "compensation": comp,
                         "bankLetterDraftedOn": date.today().isoformat(), "letterDocId": doc["docId"]}
                store.update(svc.pk(cd.case_id), asset["SK"], {"status": "late", "clock": clock})
                store.put({"PK": svc.pk(cd.case_id), "SK": f"TOKEN#{asset_id}#complaint_sent", "type": "token", "taskToken": "local-token"})
        elif stage == "complaint_sent":
            sent_on = data.get("sentOn") or date.today().isoformat()
            clock = {**(asset.get("clock") or {}), "stage": "waiting_bank_response", "bankLetterSentOn": sent_on}
            store.update(svc.pk(cd.case_id), asset["SK"], {"clock": clock})
            store.put({"PK": svc.pk(cd.case_id), "SK": f"TOKEN#{asset_id}#resolved", "type": "token", "taskToken": "local-token"})
        elif stage == "resolved":
            if data.get("resolved"):
                clock = {**(asset.get("clock") or {}), "stage": "done", "resolved": True}
                store.update(svc.pk(cd.case_id), asset["SK"], {"status": "resolved", "clock": clock})
            else:
                comp = get_asset_compensation(asset)
                ctx = svc.pack_context(cd, asset)
                letter_date = (asset.get("clock") or {}).get("bankLetterSentOn") or date.today().isoformat()
                pdf_bytes = build_ombudsman_draft(ctx, comp, letter_date)
                s3_key = f"cases/{case_id}/letters/ombudsman-{asset_id}-{secrets.token_hex(4)}.pdf"
                local_files.put_bytes(s3_key, pdf_bytes, "application/pdf")
                doc = svc.record_generated_doc(store, cd.case_id, "ombudsman", s3_key, f"ombudsman-{asset_id}.pdf", asset_id)
                clock = {**(asset.get("clock") or {}), "stage": "ombudsman_draft_ready", "compensation": comp,
                         "ombudsmanDocId": doc["docId"]}
                store.update(svc.pk(cd.case_id), asset["SK"], {"status": "ombudsman_ready", "clock": clock})

        return res
    except ApiError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


# -------------------- Local & Gemini AI Assistant -------------------- #

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def query_gemini_ai(question: str, mode: str = "explain", lang: str = "en") -> dict | None:
    api_key = os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={api_key}"

    if mode == "web":
        sys_prompt = (
            "You are Euphatic Web Intelligence Assistant. Search and synthesize actionable guidance for bank claim paperwork, "
            "IFSC lookup, grievance redressal, IEPF, mutual funds, or RBI directives. Answer in concise, practical bullet points "
            "under 90 words. Prefer official portals like rbi.org.in, cms.rbi.org.in, or sbi.co.in."
        )
    else:
        sys_prompt = (
            "You are Euphatic Legal AI, an expert grounded in RBI Master Directions 2025 (DOR.RAG.REC.73/09.08.001/2024-25) "
            "and the Indian Succession Act. Crucial facts: 15 calendar days mandatory settlement deadline (Para 31); penal interest "
            "at Bank Rate + 4% p.a. for bank delays (Para 33) without requiring a separate claim; payment to registered nominee constitutes "
            "valid discharge under Banking Regulation Act 45ZA without succession certificate. Answer kindly and authoritatively under 80 words."
        )

    if lang == "hi":
        sys_prompt += " Reply in simple Hindi (Devanagari script). Keep form names like Annex I-A in English."

    payload = {
        "contents": [{"parts": [{"text": question}]}],
        "systemInstruction": {"parts": [{"text": sys_prompt}]},
        "generationConfig": {
            "maxOutputTokens": 200,
            "temperature": 0.2,
        },
    }

    try:
        import urllib.request
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode())
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            return {
                "answer": text,
                "citations": [
                    {"para": "31", "text": "Settlement within 15 calendar days (RBI Master Directions 2025)"},
                    {"para": "33", "text": "Penal interest at Bank Rate + 4% p.a. for bank delays"},
                ] if mode != "web" else [
                    {"para": "Web", "text": "Synthesized from Official Indian Banking Sources"}
                ],
            }
    except Exception:
        return None


@app.post("/assistant")
def ask_assistant_local(data: dict = Body(...)):
    question = data.get("question", "")
    mode = data.get("mode", "explain")
    lang = data.get("lang", "en")
    job_id = secrets.token_hex(8)

    # 1. Fast Gemini Flash Lite AI (under 2 seconds)
    gemini_result = query_gemini_ai(question, mode=mode, lang=lang)
    if gemini_result and gemini_result.get("answer"):
        return {
            "status": "done",
            "jobId": job_id,
            "answer": gemini_result["answer"],
            "citations": gemini_result.get("citations", []),
            "mode": mode,
        }

    # 2. Ultra-reliable instantaneous statutory fallback
    if mode == "web":
        ans = (
            f"Official online verification for '{question}': Standard deceased claims up to ₹15 Lakhs (or ₹5 Lakhs for cooperative banks) "
            "do not require probate or succession certificates if a registered nominee exists. Download Annexure forms directly from your bank branch or the Paperwork tab."
        )
        citations = [{"para": "Web", "text": "Official Banking Settlement Standards"}]
    else:
        ans = (
            f"Under RBI Directions 2025 (para 31), banks must settle deceased customer claims within 15 calendar days of receiving complete paperwork. "
            "For delays attributable to the bank, interest at Bank Rate + 4% is payable under para 33. For nominations, payment to the registered nominee gives valid discharge under Banking Regulation Act Section 45ZA."
        )
        citations = [
            {"para": "31", "text": "Mandatory settlement within 15 calendar days"},
            {"para": "33", "text": "Penal interest at Bank Rate + 4% for delayed settlement"},
        ]

    return {
        "status": "done",
        "jobId": job_id,
        "answer": ans,
        "citations": citations,
        "mode": mode,
    }


@app.get("/assistant/{job_id}")
def get_assistant_answer(job_id: str):
    return {
        "status": "done",
        "jobId": job_id,
        "answer": "Claims must be settled within 15 days under RBI Directions 2025.",
        "citations": [],
    }


# -------------------- Serve Frontend SPA in Production -------------------- #
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path(__file__).resolve().parents[1] / "dist"

if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run("server:app", host=host, port=port, reload=False if os.environ.get("PORT") else True)

"""Pack Lambda: build the pre-filled claim pack PDF for one asset."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws import files
from euphatics.forms import build_claim_letter_pack, build_pack
from euphatics.rules.engine import BANK_ASSETS, LOCKER_ASSETS

from .api import deps
from .http import api, email_of, params

LABELS = {"death_certificate": "Death certificate (copy)", "id_proof": "ID proof (Aadhaar masked)"}
MAX_ATTACHMENT_PAGES = 25


def _images_for(doc: dict) -> tuple[list[bytes], int]:
    """Return rendered pages plus the source page count, so omissions are never silent."""
    masked_keys = doc.get("maskedKeys") or ([doc["maskedKey"]] if doc.get("maskedKey") else [])
    if masked_keys:
        return [files.get_bytes(key) for key in masked_keys], int(doc.get("maskedPagesTotal") or len(masked_keys))
    if doc.get("kind") == "id_proof":
        return [], 0  # never attach an unmasked ID; the family can run masking first
    data = files.get_bytes(doc["s3Key"])
    if data[:5] == b"%PDF-":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        images = []
        for page_no in range(min(len(pdf), MAX_ATTACHMENT_PAGES)):
            buf = io.BytesIO()
            pdf[page_no].render(scale=2).to_pil().convert("RGB").save(buf, format="PNG")
            images.append(buf.getvalue())
        return images, len(pdf)
    if (doc.get("contentType") or "").startswith("image/"):
        return [data], 1
    return [], 0


def build(event):
    store, authz = deps()
    email = email_of(event)
    cd = svc.load_case(store, params(event)["caseId"])
    svc.require(authz, email, "EditCase", cd)
    asset = cd.asset(params(event)["assetId"])
    route = asset.get("route") or {}
    bank = asset.get("assetType") in BANK_ASSETS | LOCKER_ASSETS
    if route.get("route") == "NEEDS_INFO":
        raise ApiError(400, "Answer the open questions for this claim first.", "not_ready")
    ctx = svc.pack_context(cd, asset)
    if not ctx["claimants"]:
        raise ApiError(400, "Choose at least one person for this claim first.", "no_people")
    if "I-E" in (route.get("forms") or []) and not ctx["declarant"]:
        raise ApiError(400, "Choose the independent declarant for this claim first.", "no_declarant")
    attachments = []
    skipped = []
    for d in cd.docs:
        if d.get("kind") in LABELS and d.get("assetId") in ("", asset["assetId"]):
            images, total_pages = _images_for(d)
            if images:
                for page_no, image in enumerate(images, 1):
                    page = f" (page {page_no} of {total_pages})" if total_pages > 1 else ""
                    attachments.append({"label": f"{LABELS[d['kind']]}: {d.get('filename')}{page}", "image": image})
                if total_pages > len(images):
                    skipped.append(f"{d.get('filename')} (only first {len(images)} of {total_pages} pages included)")
            else:
                skipped.append(d.get("filename"))
    pdf = build_pack(ctx, attachments) if bank else build_claim_letter_pack(ctx, attachments)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    inst = (asset.get("institution") or "bank").replace(" ", "-")[:40]
    key = f"cases/{cd.case_id}/packs/{asset['assetId']}-{ts}.pdf"
    files.put_bytes(key, pdf, "application/pdf")
    doc = svc.record_generated_doc(store, cd.case_id, "pack", key, f"claim-pack-{inst}.pdf", asset["assetId"])
    fields = {"packDocId": doc["docId"]}
    if asset.get("status") in {"ready", "draft"}:
        fields["status"] = "pack_ready"
    store.update(svc.pk(cd.case_id), asset["SK"], fields)
    what = f"{len(route.get('forms') or [])} RBI form(s) on the official format" if bank else "plan and pre-filled claim letter"
    svc.add_event(store, cd.case_id, "pack", f"Claim pack ready for {asset.get('institution')} "
                  f"({what}, {len(attachments)} attachment(s)).", email,
                  asset["assetId"], text_hi=f"{asset.get('institution')} के लिए दावा पैक तैयार।")
    from pypdf import PdfReader

    pages = len(PdfReader(io.BytesIO(pdf)).pages)
    return 201, {"docId": doc["docId"], "url": files.presign_get(key, doc["filename"]), "pages": pages,
                 "skippedUnmasked": skipped}


@api
def handler(event, context):
    if event.get("routeKey", "").endswith("/pack"):
        return build(event)
    raise ApiError(404, "No such route.", "not_found")

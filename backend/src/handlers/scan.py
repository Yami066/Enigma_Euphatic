"""Scan Lambda: bank statement → leads; ID / death-certificate image → masked copy."""
from __future__ import annotations

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws import files, ocr
from euphatics.aws.ai import comprehend_pii
from euphatics.discovery import detect_leads, parse_passbook_lines, parse_text_lines, rows_from_words, scan_statement
from euphatics.privacy import mask_image

from .api import deps
from .http import api, email_of, params

MAX_MASK_PAGES = 25


def _pages_for_masking(data: bytes, content_type: str) -> tuple[list[bytes], int]:
    """Render every supported page before masking; never silently keep only PDF page one."""
    if data[:5] != b"%PDF-":
        return [ocr.to_png(data, content_type)], 1

    import io

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    pages = []
    for page_no in range(min(len(pdf), MAX_MASK_PAGES)):
        buf = io.BytesIO()
        pdf[page_no].render(scale=2).to_pil().convert("RGB").save(buf, format="PNG")
        pages.append(buf.getvalue())
    return pages, len(pdf)


def _ocr_statement(data: bytes, content_type: str) -> dict:
    """Scanned statement: render up to 3 pages, OCR each with Textract, parse the text lines."""
    lines: list[str] = []
    if data[:5] == b"%PDF-":
        import io

        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        for i in range(min(3, len(pdf))):
            buf = io.BytesIO()
            pdf[i].render(scale=2).to_pil().convert("RGB").save(buf, format="PNG")
            lines += ocr.detect_lines(buf.getvalue())
    else:
        lines = ocr.detect_lines(data)
    st = parse_text_lines(lines, source="textract")
    leads, unclear = detect_leads(st)
    return {
        "statement": {"source": st.source, "bankName": st.bank_name, "bankType": st.bank_type, "holder": st.holder,
                      "accountLast4": st.account_last4, "txnCount": len(st.txns), "unparsedCount": len(st.unparsed)},
        "leads": [l.to_dict() for l in leads],
        "unclear": [{"date": t.date, "narration": t.narration, "amount": t.amount, "direction": t.direction}
                    for t in unclear[:20]],
    }


def mask_document(store, cd, doc: dict) -> dict:
    data = files.get_bytes(doc["s3Key"])
    pages, total_pages = _pages_for_masking(data, doc.get("contentType", ""))
    masked_keys: list[str] = []
    words: list[dict] = []
    masked_count = 0
    for page_no, png in enumerate(pages, 1):
        page_words = ocr.detect_words(png)
        masked, count = mask_image(png, page_words)
        suffix = ".masked.png" if total_pages == 1 else f".page-{page_no}.masked.png"
        key = doc["s3Key"] + suffix
        files.put_bytes(key, masked, "image/png")
        masked_keys.append(key)
        words.extend(page_words)
        masked_count += count
    pii = sorted({e["type"] for e in comprehend_pii(" ".join(w["text"] for w in words))}) if words else []
    fields = {"maskedKey": masked_keys[0] if masked_keys else "", "maskedKeys": masked_keys,
              "maskedPagesTotal": total_pages, "maskedCount": masked_count, "status": "processed",
              "piiTypes": pii}
    store.update(svc.pk(cd.case_id), doc["SK"], fields)
    return {"maskedCount": masked_count, "maskedPages": len(masked_keys), "totalPages": total_pages,
            "piiTypes": pii}


def process(event):
    store, authz = deps()
    email = email_of(event)
    cd = svc.load_case(store, params(event)["caseId"])
    svc.require(authz, email, "UploadDocument", cd)
    doc = cd.doc(params(event)["docId"])
    kind = doc.get("kind")
    if kind == "statement":
        data = files.get_bytes(doc["s3Key"])
        out = scan_statement(data, doc.get("filename", ""), doc.get("contentType", ""), case_key=cd.case_id)
        if out["statement"]["txnCount"] == 0:  # scanned PDF or photo: fall back to Textract
            out = _ocr_statement(data, doc.get("contentType", ""))
        saved = svc.save_leads(store, cd, out["leads"], doc["docId"])
        st = out["statement"]
        store.update(svc.pk(cd.case_id), "META", {"statementBank": st.get("bankName") or "",
                                                  "statementBankType": st.get("bankType") or ""})
        store.update(svc.pk(cd.case_id), doc["SK"], {"status": "processed", "summary": st, "leadCount": len(saved)})
        svc.add_event(store, cd.case_id, "scan", f"Read {st['txnCount']} transactions from {doc.get('filename')} and "
                      f"found {len(saved)} possible asset(s).", email,
                      text_hi=f"{doc.get('filename')} से {st['txnCount']} लेन-देन पढ़े और {len(saved)} संभावित संपत्तियां मिलीं।")
        return 200, {"statement": st, "leads": saved, "unclear": out["unclear"]}
    if kind == "passbook":  # first page photo → prefill the bank account form; the family confirms
        data = files.get_bytes(doc["s3Key"])
        png = ocr.to_png(data, doc.get("contentType", ""))
        lines, words = ocr.detect_all(png)
        fields = parse_passbook_lines(rows_from_words(words) or lines)
        masked, count = mask_image(png, words)
        key = doc["s3Key"] + ".masked.png"
        files.put_bytes(key, masked, "image/png")
        store.update(svc.pk(cd.case_id), doc["SK"], {"status": "processed", "maskedKey": key, "maskedCount": count,
                                                     "fieldsFound": sorted(fields)})
        svc.add_event(store, cd.case_id, "passbook", f"Read the passbook photo {doc.get('filename')}: "
                      f"{fields.get('institution') or 'bank'} details filled in for you to check.", email,
                      text_hi=f"पासबुक फोटो {doc.get('filename')} पढ़ी गई: जांचने के लिए विवरण भरे गए।")
        return 200, {"fields": fields, "lineCount": len(lines), "maskedCount": count}
    if kind in {"id_proof", "death_certificate"}:
        res = mask_document(store, cd, doc)
        # These copies are embedded in generated packs. A newly processed copy makes any older pack incomplete.
        for asset in cd.assets:
            if doc.get("assetId") in ("", asset["assetId"]):
                svc.reroute(store, cd, asset)
        if res["maskedCount"]:
            svc.add_event(store, cd.case_id, "masked", f"Masked {res['maskedCount']} Aadhaar number(s) on "
                          f"{doc.get('filename')} (last 4 digits kept).", email)
        return 200, res
    store.update(svc.pk(cd.case_id), doc["SK"], {"status": "uploaded"})
    if kind == "acknowledgement":
        svc.add_event(store, cd.case_id, "ack_uploaded", f"Acknowledgement uploaded: {doc.get('filename')}.", email,
                      doc.get("assetId") or None)
    return 200, {"ok": True}


@api
def handler(event, context):
    if event.get("routeKey", "").endswith("/process"):
        return process(event)
    raise ApiError(404, "No such route.", "not_found")

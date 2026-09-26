from .detectors import Lead, detect_leads
from .passbook import parse_passbook_lines, rows_from_words
from .names import name_variants
from .searchkit import build_search_kit
from .statement import Statement, Txn, parse_csv, parse_pdf, parse_statement, parse_text_lines


def scan_statement(data: bytes, filename: str = "", content_type: str = "", case_key: str = "") -> dict:
    stmt = parse_statement(data, filename, content_type)
    leads, unclear = detect_leads(stmt, case_key)
    return {
        "statement": {
            "source": stmt.source,
            "bankName": stmt.bank_name,
            "bankType": stmt.bank_type,
            "holder": stmt.holder,
            "accountLast4": stmt.account_last4,
            "txnCount": len(stmt.txns),
            "unparsedCount": len(stmt.unparsed),
        },
        "leads": [l.to_dict() for l in leads],
        "unclear": [{"date": t.date, "narration": t.narration, "amount": t.amount, "direction": t.direction} for t in unclear[:20]],
    }


__all__ = [
    "Lead", "Statement", "Txn", "build_search_kit", "detect_leads", "name_variants", "parse_passbook_lines", "rows_from_words",
    "parse_csv", "parse_pdf", "parse_statement", "parse_text_lines", "scan_statement",
]

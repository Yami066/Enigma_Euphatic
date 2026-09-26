from pathlib import Path

import pytest

from euphatics.discovery import build_search_kit, name_variants, parse_text_lines, scan_statement
from euphatics.discovery.statement import parse_amount, parse_date

SAMPLES = Path(__file__).resolve().parents[2] / "samples" / "data"

EXPECTED = {
    ("pmjjby", None),
    ("pmsby", None),
    ("shares", "ITC Limited"),
    ("shares", "Infosys Limited"),
    ("shares", "Coal India Limited"),
    ("mutual_fund", "HDFC Mutual Fund"),
    ("mutual_fund", "SBI Mutual Fund"),
    ("life_insurance", "Life Insurance Corporation of India"),
    ("life_insurance", "HDFC Life Insurance"),
    ("deposit", "Nandini Sahakari Bank"),
    ("govt_scheme", "National Pension System (NPS)"),
    ("employer", "Deccan Tools Pvt Ltd"),
    ("broker", "Zerodha"),
    ("health_insurance", "Star Health and Allied Insurance"),
    ("loan", "LIC Housing Finance"),
    ("credit_card", "Credit card"),
}


@pytest.mark.parametrize("fname", ["sample_statement.pdf", "sample_statement.csv"])
def test_sample_statement_finds_every_planted_asset(fname):
    out = scan_statement((SAMPLES / fname).read_bytes(), fname)
    st = out["statement"]
    assert st["txnCount"] == 117
    assert st["bankName"].startswith("Deccan Example Bank")
    assert st["holder"] == "Ramesh Kumar Sharma"
    assert st["accountLast4"] == "4821"
    got = {(l["type"], l["institution"]) for l in out["leads"]}
    for typ, inst in EXPECTED:
        if inst is None:
            assert any(t == typ for t, _ in got), typ
        else:
            assert (typ, inst) in got, (typ, inst)
    assert len(out["leads"]) == len(EXPECTED)  # no false positives (UPI, ATM, bills, SB interest)


def test_sip_is_recurring_and_hidden_cover_comes_first():
    out = scan_statement((SAMPLES / "sample_statement.csv").read_bytes(), "s.csv")
    leads = out["leads"]
    assert leads[0]["type"] == "pmjjby"  # ₹2 lakh cover families usually miss
    hdfc = next(l for l in leads if l["institution"] == "HDFC Mutual Fund")
    assert hdfc["count"] == 12 and "same amount" in hdfc["reason"]["en"]
    fd = next(l for l in leads if l["type"] == "deposit")
    assert fd["asset_facts"]["bank_type"] == "cooperative"


def test_lic_housing_loan_is_not_mistaken_for_lic_insurance():
    out = scan_statement((SAMPLES / "sample_statement.pdf").read_bytes(), "s.pdf")
    loan = next(l for l in out["leads"] if l["type"] == "loan")
    assert loan["institution"] == "LIC Housing Finance"
    lic = next(l for l in out["leads"] if l["institution"] == "Life Insurance Corporation of India")
    assert lic["count"] == 1


def test_dates_and_amounts():
    assert parse_date("07-05-2026 NACH").isoformat() == "2026-05-07"
    assert parse_date("7 May 2026").isoformat() == "2026-05-07"
    assert parse_date("07-May-26").isoformat() == "2026-05-07"
    assert parse_date("2026-05-07").isoformat() == "2026-05-07"
    assert parse_date("hello") is None
    assert parse_amount("1,23,456.78") == (123456.78, None)
    assert parse_amount("436.00Cr") == (436.0, "CR")
    assert parse_amount("ICCL0925") is None


def test_ocr_text_lines_fallback():
    lines = [
        "DEMO URBAN CO-OP BANK LTD",
        "Account Holder: SITA DEVI",
        "01/04/2026 OPENING 10,000.00",
        "05/04/2026 ACH C- ITC LIMITED-DIV 1,200.00 11,200.00",
        "31/05/2026 PMJJBY PREMIUM 436.00 10,764.00",
    ]
    st = parse_text_lines(lines)
    assert st.bank_type == "cooperative"
    from euphatics.discovery import detect_leads
    leads, _ = detect_leads(st)
    types = {l.type for l in leads}
    assert {"shares", "pmjjby"} <= types


def test_name_variants_cover_initials_and_order():
    v = name_variants("Late Shri Ramesh Kumar Sharma")
    assert v[0] == "RAMESH KUMAR SHARMA"
    assert "R K SHARMA" in v
    assert "SHARMA RAMESH KUMAR" in v
    south = name_variants("K. Ramesh")
    assert "RAMESH K" in south


def test_search_kit_prefills_from_leads():
    out = scan_statement((SAMPLES / "sample_statement.csv").read_bytes(), "s.csv")
    kit = build_search_kit({"deceasedName": "Ramesh Kumar Sharma", "pan": "ABCPS1234K", "dob": "1968-03-14"}, out["leads"])
    ids = [p["id"] for p in kit["portals"]]
    assert ids[:4] == ["unified", "udgam", "mitra", "iepf"]
    iepf = next(p for p in kit["portals"] if p["id"] == "iepf")
    assert "ITC Limited" in iepf["prefill"]["companies"]
    udgam = next(p for p in kit["portals"] if p["id"] == "udgam")
    assert "Nandini Sahakari Bank" in udgam["prefill"]["banks"]
    assert udgam["dormant_only"] is True

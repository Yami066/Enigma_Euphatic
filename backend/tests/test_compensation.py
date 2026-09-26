from euphatics.rules import bank_rate_on, deposit_compensation, locker_compensation
from euphatics.rules.compensation import due_date


def test_due_date_is_15_calendar_days_after_documents_complete():
    assert due_date("2026-04-01").isoformat() == "2026-04-16"
    assert due_date("2026-04-01", "locker").isoformat() == "2026-04-16"


def test_paid_on_the_due_date_is_on_time():
    c = deposit_compensation(3_20_000, "2026-04-01", paid_on="2026-04-16")
    assert c["delay_days"] == 0
    assert c["compensation_inr"] == 0
    assert c["status"] == "on_time"


def test_ten_days_late_on_3_2_lakh():
    c = deposit_compensation(3_20_000, "2026-04-01", paid_on="2026-04-26")
    assert c["delay_days"] == 10
    assert c["bank_rate_pct"] == 5.50
    assert c["rate_pct"] == 9.5
    assert c["compensation_inr"] == 832.88  # 3,20,000 × 9.5% × 10/365
    assert c["citation"]["para"] == "33"
    assert c["clock_citation"]["para"] == "31"


def test_bank_rate_is_taken_on_the_documents_complete_date():
    # para 33: the reference date for the Bank Rate is the documents-complete date
    c = deposit_compensation(1_00_000, "2025-07-01", paid_on="2025-07-26")
    assert c["bank_rate_pct"] == 5.75
    assert c["rate_pct"] == 9.75


def test_bank_rate_lookup():
    assert bank_rate_on("2026-09-18")["rate_pct"] == 5.50
    assert bank_rate_on("2025-05-01")["rate_pct"] == 6.25
    assert bank_rate_on("2024-01-01")["rate_pct"] == 6.50  # before history → earliest known


def test_open_claim_accrues_until_today():
    c = deposit_compensation(1_00_000, "2026-04-01", today="2026-04-20")
    assert c["delay_days"] == 4
    assert c["status"] == "late"
    running = deposit_compensation(1_00_000, "2026-04-01", today="2026-04-10")
    assert running["status"] == "running" and running["compensation_inr"] == 0


def test_locker_compensation_is_5000_per_day():
    c = locker_compensation("2026-04-01", communicated_on="2026-04-20")
    assert c["delay_days"] == 4
    assert c["compensation_inr"] == 20_000
    assert c["citation"]["para"] == "34"

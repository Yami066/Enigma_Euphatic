"""Generate a SYNTHETIC bank statement (PDF + CSV) for tests and the demo.

Everything here is made up: the bank ("Deccan Example Bank"), the person, the
account number and every amount. The PDF carries a large SAMPLE watermark.
Real company / AMC / insurer names appear only inside narrations, the way they
would on a real statement, so the detectors can be exercised.

Usage:  python samples/make_statement.py  → samples/data/sample_statement.{pdf,csv}
"""
from __future__ import annotations

import csv
from datetime import date, timedelta
from pathlib import Path

from reportlab.lib.colors import Color, black, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent / "data"

HOLDER = "RAMESH KUMAR SHARMA"
BANK = "DECCAN EXAMPLE BANK LTD"
ACCOUNT = "XXXXXXXX4821"
START = date(2025, 9, 1)
END = date(2026, 8, 31)


def month_days(day: int):
    d = date(START.year, START.month, 1)
    while d <= END:
        try:
            yield d.replace(day=day)
        except ValueError:
            pass
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def build_rows() -> list[dict]:
    rows: list[dict] = []

    def add(d: date, narr: str, amount: float, cr: bool, ref: str = ""):
        rows.append({"date": d, "narration": narr, "ref": ref, "amount": amount, "cr": cr})

    for d in month_days(1):
        add(d, f"NEFT CR-DECCAN TOOLS PVT LTD-SALARY {d.strftime('%b%y').upper()}", 78500.00, True, "N" + d.strftime("%y%m") + "01")
    for d in month_days(5):
        add(d, "ACH D- HDFC MUTUAL FUND-SIP HDFC FLEXI CAP", 5000.00, False, "ACH" + d.strftime("%m%y"))
    for d in month_days(7):
        add(d, "NACH DR ICCL BSESTARMF SBI MF SIP", 2000.00, False, "ICCL" + d.strftime("%m%y"))
    for d in month_days(10):
        add(d, "NACH DR LIC HOUSING FIN-HL EMI 00451", 21340.00, False, "HL00451")
    for d in month_days(15):
        add(d, "BILLDESK CREDIT CARD PAYMENT XX9012", 8400.00, False, "BD" + d.strftime("%m%y"))
    for d in month_days(20):
        add(d, "UPI/DR/KIRANA STORES/GROCERY", 3250.00, False, "UPI" + d.strftime("%m%y"))
        add(d + timedelta(days=2), "ATM WDL SELF KORAMANGALA", 5000.00, False, "ATM" + d.strftime("%m%y"))
        add(d + timedelta(days=3), "BESCOM ELECTRICITY BILL", 1420.00, False, "BBPS" + d.strftime("%m%y"))
    for d in [date(2025, 12, 31), date(2026, 3, 31), date(2026, 6, 30)]:
        add(d, "NEFT CR-NANDINI SAHAKARI BANK-FD INT 00231", 6080.00, True, "NSB00231")
        add(d, "SB INT CREDIT", 412.00, True, "INT")
    for d in [date(2025, 10, 25), date(2026, 1, 25), date(2026, 4, 25), date(2026, 7, 25)]:
        add(d, "NPS TRUST CONTRIBUTION PRAN 110045XXXX", 2000.00, False, "NPS" + d.strftime("%m%y"))
    add(date(2025, 10, 28), "ACH C- INFOSYS LIMITED INTERIM DIV", 690.00, True, "DIV1025")
    add(date(2026, 6, 26), "ACH C- INFOSYS LIMITED FINAL DIV", 846.00, True, "DIV0626")
    add(date(2026, 7, 30), "ACH C- ITC LIMITED-DIV 2025-26", 1560.00, True, "DIV0726")
    add(date(2026, 2, 20), "ACH C- COAL INDIA LTD DIVIDEND", 702.50, True, "DIV0226")
    add(date(2026, 1, 12), "LIC OF INDIA PREMIUM POL 873412XXX", 12340.00, False, "LIC0126")
    add(date(2026, 3, 18), "ACH D- HDFC LIFE INSURANCE-PREM 21XXXX", 9800.00, False, "HDL0326")
    add(date(2026, 2, 9), "STAR HEALTH RENEWAL PREMIUM", 18900.00, False, "STH0226")
    add(date(2026, 5, 31), "PMJJBY PREMIUM RENEWAL", 436.00, False, "PMJJBY26")
    add(date(2026, 5, 31), "PMSBY PREMIUM", 20.00, False, "PMSBY26")
    add(date(2025, 11, 14), "NEFT DR-ZERODHA BROKING LTD-FUNDS", 10000.00, False, "ZRD1125")
    add(date(2026, 4, 3), "UPI/DR/SWIGGY/FOOD ORDER", 640.00, False, "UPI0426")

    rows.sort(key=lambda r: (r["date"], not r["cr"]))
    bal = 185000.00
    for r in rows:
        bal = round(bal + (r["amount"] if r["cr"] else -r["amount"]), 2)
        r["balance"] = bal
    return rows


def money(v: float) -> str:
    s = f"{v:,.2f}"
    whole, frac = s.split(".")
    digits = whole.replace(",", "")
    if len(digits) > 3:  # Indian grouping 12,34,567.89
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{whole}.{frac}"


def write_pdf(rows: list[dict], path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    xs = {"date": 36, "narr": 100, "ref": 330, "wd": 438, "dep": 508, "bal": 575}

    def header(page: int):
        c.setFillColor(Color(0.85, 0.85, 0.85))
        c.saveState()
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.setFont("Helvetica-Bold", 72)
        c.drawCentredString(0, 0, "SAMPLE")
        c.restoreState()
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(36, H - 40, BANK)
        c.setFont("Helvetica", 9)
        c.drawString(36, H - 55, "Statement of Account  (SAMPLE: synthetic data for testing, not a real account)")
        c.drawString(36, H - 70, f"Account Holder: {HOLDER}")
        c.drawString(36, H - 83, f"A/C No: {ACCOUNT}     Branch: KORAMANGALA     Type: SAVINGS")
        c.drawString(36, H - 96, f"Period: {START.strftime('%d-%m-%Y')} to {END.strftime('%d-%m-%Y')}")
        c.setFont("Helvetica-Bold", 8.5)
        y = H - 120
        c.drawString(xs["date"], y, "Date")
        c.drawString(xs["narr"], y, "Narration")
        c.drawString(xs["ref"], y, "Ref No")
        c.drawRightString(xs["wd"], y, "Withdrawal")
        c.drawRightString(xs["dep"], y, "Deposit")
        c.drawRightString(xs["bal"], y, "Balance")
        c.setStrokeColor(HexColor("#999999"))
        c.line(36, y - 4, W - 20, y - 4)
        c.setFont("Helvetica", 8)
        c.drawRightString(W - 20, 20, f"Page {page}")
        return y - 16

    page = 1
    y = header(page)
    c.setFont("Helvetica", 8)
    for r in rows:
        narr = r["narration"]
        lines = [narr[:44], narr[44:]] if len(narr) > 44 else [narr]
        needed = 12 * len(lines)
        if y - needed < 40:
            c.showPage()
            page += 1
            y = header(page)
            c.setFont("Helvetica", 8)
        c.drawString(xs["date"], y, r["date"].strftime("%d-%m-%Y"))
        c.drawString(xs["narr"], y, lines[0])
        c.drawString(xs["ref"], y, r["ref"][:14])
        if r["cr"]:
            c.drawRightString(xs["dep"], y, money(r["amount"]))
        else:
            c.drawRightString(xs["wd"], y, money(r["amount"]))
        c.drawRightString(xs["bal"], y, money(r["balance"]))
        y -= 12
        for extra in lines[1:]:
            c.drawString(xs["narr"], y, extra)
            y -= 12
    c.showPage()
    c.save()


def write_csv(rows: list[dict], path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Deccan Example Bank Ltd - SAMPLE synthetic statement"])
        w.writerow([f"Account Holder: {HOLDER}"])
        w.writerow([f"A/C No: {ACCOUNT}"])
        w.writerow([])
        w.writerow(["Txn Date", "Narration", "Ref No", "Withdrawal Amt", "Deposit Amt", "Balance"])
        for r in rows:
            w.writerow([
                r["date"].strftime("%d/%m/%Y"), r["narration"], r["ref"],
                f"{r['amount']:.2f}" if not r["cr"] else "",
                f"{r['amount']:.2f}" if r["cr"] else "",
                f"{r['balance']:.2f}",
            ])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    write_pdf(rows, OUT / "sample_statement.pdf")
    write_csv(rows, OUT / "sample_statement.csv")
    print(f"{len(rows)} rows → {OUT}")


if __name__ == "__main__":
    main()

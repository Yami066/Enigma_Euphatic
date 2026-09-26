from euphatics.discovery import parse_passbook_lines

SBI = [
    "STATE BANK OF INDIA",
    "Branch : KORAMANGALA",
    "IFSC : SBIN0005943   MICR : 560002017",
    "Name : MR RAMESH KUMAR SHARMA",
    "A/c No. 3012 4455 6671",
    "CIF No. 85412236601",
    "Account Type : SAVINGS BANK",
    "Nomination : Registered",
    "Mob : 98XXXXXX10",
]

COOP = [
    "NANDINI SAHAKARI BANK NIYAMIT",
    "BRANCH: Koramangala, Bengaluru",
    "IFSC NSBK0000231",
    "Customer ID: C0045120",
    "Name: Ramesh Kumar Sharma",
    "TERM DEPOSIT RECEIPT",
    "Account Number",
    "002310045120",
    "Nominee: NIL",
]


def test_commercial_bank_passbook():
    f = parse_passbook_lines(SBI)
    assert f["institution"] == "State Bank of India" and f["ifsc"] == "SBIN0005943"
    assert f["accountNumber"] == "301244556671" and f["customerId"] == "85412236601"
    assert f["holderName"] == "Ramesh Kumar Sharma" and f["branch"] == "Koramangala"
    assert (f["assetType"], f["accountType"], f["nomination"]) == ("bank_deposit", "SB", "nominee")
    assert "nomineeName" not in f


def test_cooperative_fd_without_nominee():
    f = parse_passbook_lines(COOP)
    assert f["bankType"] == "cooperative" and f["ifsc"] == "NSBK0000231"
    assert f["accountNumber"] == "002310045120" and f["customerId"] == "C0045120"
    assert (f["assetType"], f["nomination"]) == ("term_deposit", "none")
    assert "Sahakari" in f["institution"]


def test_rows_rebuilt_from_word_boxes():
    from euphatics.discovery import rows_from_words

    def w(text, left, top):
        return {"text": text, "box": {"left": left, "top": top, "width": 0.05, "height": 0.03}}

    # Textract lists the label column first, then the values
    words = [w("Branch", 0.06, 0.20), w("IFSC", 0.06, 0.27), w(":", 0.31, 0.205), w("KORAMANGALA", 0.33, 0.205),
             w(":", 0.31, 0.272), w("DEMO0001234", 0.33, 0.272)]
    assert rows_from_words(words) == ["Branch : KORAMANGALA", "IFSC : DEMO0001234"]
    f = parse_passbook_lines(rows_from_words(words))
    assert f["branch"] == "Koramangala" and f["ifsc"] == "DEMO0001234"

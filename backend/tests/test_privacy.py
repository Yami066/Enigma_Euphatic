import io

from PIL import Image

from euphatics.privacy import aadhaar_boxes, find_aadhaar_numbers, is_valid_aadhaar, mask_image, scrub
from euphatics.privacy.aadhaar import verhoeff_check_digit


def fake_aadhaar(prefix11: str = "23456789012") -> str:
    """A checksum-valid number for tests only (not a real person's)."""
    return prefix11 + verhoeff_check_digit(prefix11)


def test_verhoeff_rejects_typos_and_bad_starts():
    good = fake_aadhaar()
    assert is_valid_aadhaar(good)
    bad = good[:-1] + str((int(good[-1]) + 1) % 10)
    assert not is_valid_aadhaar(bad)
    zero_start = "0" + good[1:]
    assert not is_valid_aadhaar(zero_start)
    assert not is_valid_aadhaar("98765 43210")  # phone number shape


def test_find_in_text_with_spaces():
    n = fake_aadhaar()
    text = f"Aadhaar: {n[:4]} {n[4:8]} {n[8:]} issued"
    found = find_aadhaar_numbers(text)
    assert len(found) == 1 and found[0][2] == n


def test_mask_three_word_number_leaves_last_four():
    n = fake_aadhaar()
    words = [
        {"text": "Name", "box": {"left": 0.1, "top": 0.1, "width": 0.1, "height": 0.05}},
        {"text": n[:4], "box": {"left": 0.30, "top": 0.8, "width": 0.1, "height": 0.05}},
        {"text": n[4:8], "box": {"left": 0.42, "top": 0.8, "width": 0.1, "height": 0.05}},
        {"text": n[8:], "box": {"left": 0.54, "top": 0.8, "width": 0.1, "height": 0.05}},
    ]
    groups = aadhaar_boxes(words)
    assert len(groups) == 1 and len(groups[0]) == 2  # first two groups only
    img = Image.new("RGB", (1000, 600), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    masked, count = mask_image(buf.getvalue(), words)
    assert count == 1
    out = Image.open(io.BytesIO(masked))
    assert out.getpixel((350, 495)) == (0, 0, 0)       # inside first group → black
    assert out.getpixel((590, 495)) == (255, 255, 255)  # last 4 digits stay visible


def test_scrub_removes_identifiers_and_names():
    n = fake_aadhaar()
    q = (f"My father Ramesh Kumar Sharma (PAN ABCPS1234K, Aadhaar {n[:4]} {n[4:8]} {n[8:]}, "
         "phone 9876543210, a/c 123456789012345) had ITC shares. How do we claim IEPF dividends?")
    clean, findings = scrub(q, {"Ramesh Kumar Sharma": "my father"})
    kinds = {f["type"] for f in findings}
    assert {"AADHAAR", "PAN", "PHONE", "NAME"} <= kinds
    assert "ABCPS1234K" not in clean and "9876543210" not in clean and "Ramesh" not in clean
    assert "ITC shares" in clean and "IEPF" in clean

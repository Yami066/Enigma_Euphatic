import io

from pypdf import PdfWriter

from handlers import pack


def test_pdf_attachment_renders_every_page(monkeypatch):
    source = io.BytesIO()
    pdf = PdfWriter()
    for _ in range(3):
        pdf.add_blank_page(width=200, height=300)
    pdf.write(source)
    monkeypatch.setattr(pack.files, "get_bytes", lambda _key: source.getvalue())

    images, total = pack._images_for(
        {"s3Key": "synthetic.pdf", "kind": "death_certificate", "contentType": "application/pdf"}
    )

    assert total == 3
    assert len(images) == 3
    assert all(image.startswith(b"\x89PNG") for image in images)


def test_unmasked_id_is_never_attached(monkeypatch):
    monkeypatch.setattr(pack.files, "get_bytes", lambda _key: b"should-not-be-read")
    assert pack._images_for({"s3Key": "id.jpg", "kind": "id_proof", "contentType": "image/jpeg"}) == ([], 0)


def test_every_masked_page_is_attached(monkeypatch):
    monkeypatch.setattr(pack.files, "get_bytes", lambda key: key.encode())

    images, total = pack._images_for({
        "kind": "id_proof",
        "maskedKey": "page-1.png",
        "maskedKeys": ["page-1.png", "page-2.png"],
        "maskedPagesTotal": 2,
    })

    assert images == [b"page-1.png", b"page-2.png"]
    assert total == 2

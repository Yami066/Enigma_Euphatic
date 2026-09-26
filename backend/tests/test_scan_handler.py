import io

from pypdf import PdfWriter

from handlers import scan


def test_masking_renders_every_pdf_page():
    source = io.BytesIO()
    pdf = PdfWriter()
    for _ in range(3):
        pdf.add_blank_page(width=200, height=300)
    pdf.write(source)

    pages, total = scan._pages_for_masking(source.getvalue(), "application/pdf")

    assert total == 3
    assert len(pages) == 3
    assert all(page.startswith(b"\x89PNG") for page in pages)

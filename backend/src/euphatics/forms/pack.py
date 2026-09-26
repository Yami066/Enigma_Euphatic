"""Claim pack = cover sheet + pre-filled RBI forms + masked attachments, one PDF."""
from __future__ import annotations

from datetime import date

import io

from pypdf import PdfReader, PdfWriter

from . import official
from .annex import RENDERERS, annex_I_E
from .doc import AMBER, AMBER_TINT, Doc, rupees

STEPS = [
    "Check every pre-filled detail against the bank passbook and ID cards. Correct anything by hand if needed.",
    "Each person signs where their name is printed. All non-claiming heirs sign the one Annex I-D letter.",
    "Annex I-C, I-D and I-E must be stamped as per your State's Stamp Act (the official forms say so). Ask the branch "
    "which stamp paper value they need.",
    "Self-attest each ID copy (sign across it). Carry the originals for verification.",
    "Submit at ANY branch of the bank: you don't have to go to the home branch (para 29).",
    "Ask for a dated acknowledgement. If a document is missing, the bank must list it while acknowledging (para 29).",
    "Upload a photo of the acknowledgement in the app. When the bank confirms all documents are received, the 15-day "
    "settlement clock starts (para 31). If it's late, the bank owes interest at Bank Rate + 4% (para 33).",
]


def _cover(d: Doc, ctx: dict) -> None:
    c, a, route = ctx["case"], ctx["asset"], ctx["route"]
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d.title(f"Claim pack: {a.get('institution') or 'Bank'}",
            f"For the late {c.get('deceasedName')} (died {c.get('dod')})  ·  prepared by {brand} on "
            f"{ctx.get('generatedAt') or date.today().isoformat()}")
    d.heading(route.get("title", {}).get("en") or route.get("route", ""))
    cit = route.get("citation") or {}
    if cit:
        d.note_box(f"Why this route: RBI Directions 2025, para {cit.get('para')}: \"{cit.get('quote')}\"")
    thr = route.get("threshold")
    if thr and thr.get("limit_inr"):
        kind = "co-operative bank" if thr.get("bank_type") == "cooperative" else "commercial bank"
        d.para(f"Threshold for a {kind}: {rupees(thr['limit_inr'])} (para 7(h)). This claim: "
               f"{rupees(thr.get('amount_inr') or 0)}.")
    d.heading("What to do, in order")
    d.bullet([f"{i}. {s}" for i, s in enumerate(STEPS, 1)])
    d.heading("Documents in this claim")
    rows = []
    generated = set(route.get("forms") or [])
    for doc in route.get("documents") or []:
        form = doc.get("form")
        if form and form in generated:
            status = "Filled in this pack: sign"
        elif doc.get("at_branch"):
            status = "Done at the branch"
        elif doc["id"] in ("death_certificate", "ovd_nominee", "ovd_claimants"):
            status = "Copy attached if uploaded; bring original"
        else:
            status = "Arrange separately"
        rows.append([doc.get("en", doc["id"]), status])
    d.table(["Document", "Status"], rows, [340, 159])
    for n in route.get("notes") or []:
        if n.get("para") not in ("29",):
            d.note_box(f"{n.get('en')} (para {n.get('para')})")
    d.note_box(ctx.get("brand", {}).get("disclaimer") or "Not legal advice. Confirm with the bank before signing.",
               color=AMBER, fill=AMBER_TINT)


def build_pack(ctx: dict, attachments: list[dict] | None = None, official_forms: bool = True) -> bytes:
    """ctx: case, asset, route (engine RouteResult dict), claimants, nonClaimants, nominees,
    declarant, payment, brand. attachments: [{label, image: bytes}] (already masked).

    The RBI annexes are printed on the official form pages (forms/official.py). The reportlab
    re-typesetting in annex.py remains as a fallback when the template isn't available."""
    forms = list(ctx["route"].get("forms") or [])
    if official_forms and forms and official.available():
        brand = ctx.get("brand", {}).get("appName", "Euphatics")
        footer = f"{brand} claim pack · {ctx['asset'].get('institution') or ''} · Not legal advice; verify with the bank."
        cover = Doc(footer=footer)
        _cover(cover, ctx)
        surety = any(d.get("id") == "surety_I_C_if_asked" for d in ctx["route"].get("documents") or [])
        parts = [cover.finish(), official.fill(forms, ctx, with_surety=surety)]
        if attachments:
            att = Doc(footer=footer)
            for i, a in enumerate(attachments):
                att.image_page(a.get("label", "Attachment"), a["image"], a.get("note", ""), new=i > 0)
            parts.append(att.finish())
        out = PdfWriter()
        for part in parts:
            for page in PdfReader(io.BytesIO(part)).pages:
                out.add_page(page)
        buf = io.BytesIO()
        out.write(buf)
        return buf.getvalue()
    brand = ctx.get("brand", {}).get("appName", "Euphatics")
    d = Doc(footer=f"{brand} claim pack · {ctx['asset'].get('institution') or ''} · Not legal advice; verify with the bank.")
    _cover(d, ctx)
    forms = list(ctx["route"].get("forms") or [])
    affidavit = any(doc.get("variant") == "affidavit" for doc in ctx["route"].get("documents") or [])
    for form in forms:
        if form == "I-D" and not ctx.get("nonClaimants"):
            continue
        d.new_page()
        if form == "I-E":
            annex_I_E(d, ctx, affidavit=affidavit)
        elif form in RENDERERS:
            RENDERERS[form](d, ctx)
    for att in attachments or []:
        d.image_page(att.get("label", "Attachment"), att["image"], att.get("note", ""))
    return d.finish()

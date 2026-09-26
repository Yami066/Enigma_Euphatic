"""Main API Lambda: cases, family, leads, assets, documents, search kit and clock control."""
from __future__ import annotations

from euphatics.app import service as svc
from euphatics.app.service import ApiError
from euphatics.aws import files, workflow
from euphatics.aws.authz import default_authz
from euphatics.aws.store import Store

from .http import api, body_of, email_of, params, query

_store = None
_authz = None


def deps():
    global _store, _authz
    if _store is None:
        _store = Store()
        _authz = default_authz()
    return _store, _authz


def _case(event, action: str):
    store, authz = deps()
    email = email_of(event)
    cd = svc.load_case(store, params(event)["caseId"])
    svc.require(authz, email, action, cd)
    return store, authz, email, cd


# ------------------------------------------------------------------ handlers

def health(event):
    return 200, {"ok": True}


def list_cases(event):
    store, _ = deps()
    return 200, {"cases": svc.my_cases(store, email_of(event))}


def create_case(event):
    store, _ = deps()
    return 201, svc.create_case(store, email_of(event), body_of(event))


def get_case(event):
    _, _, email, cd = _case(event, "ViewCase")
    return 200, svc.case_view(cd, email)


def patch_case(event):
    store, _, _, cd = _case(event, "EditCase")
    return 200, svc.update_case(store, cd, body_of(event))


def delete_case(event):
    store, _, _, cd = _case(event, "ManageMembers")
    for a in cd.assets:
        arn = (a.get("clock") or {}).get("executionArn")
        if arn:
            workflow.stop(arn)
    svc.delete_case(store, files, cd)
    return 200, {"deleted": True}


def invite(event):
    store, _, email, cd = _case(event, "ManageMembers")
    return 201, svc.invite_member(store, cd, body_of(event), email)


def put_person(event):
    store, _, _, cd = _case(event, "EditCase")
    person = svc.upsert_person(store, cd, params(event)["personId"], body_of(event))
    cd2 = svc.load_case(store, cd.case_id)
    for a in cd2.assets:  # heirs affect which forms a route needs (e.g. Annex I-D)
        if a.get("status") in {"ready", "needs_info", "pack_ready"}:
            svc.reroute(store, cd2, a)
    return 200, person


def delete_person(event):
    store, _, _, cd = _case(event, "EditCase")
    svc.delete_person(store, cd, params(event)["personId"])
    return 200, {"deleted": True}


def upload(event):
    store, _, email, cd = _case(event, "UploadDocument")
    return 201, svc.new_upload(store, cd, email, body_of(event), files.presign_put)


def doc_url(event):
    store, authz, email, cd = svc_load_for_doc(event)
    doc = cd.doc(params(event)["docId"])
    variant = (query(event).get("variant") or "original").lower()
    generated = doc.get("kind") in {"pack", "letter", "ombudsman"}
    if doc.get("kind") == "pack" and doc.get("status") == "stale":
        raise ApiError(409, "This pack is outdated. Make a fresh pack from the claim page.", "stale_pack")
    if variant == "original" and not generated:
        svc.require(authz, email, "DownloadOriginal", cd, doc)
        return 200, {"url": files.presign_get(doc["s3Key"], doc.get("filename")), "variant": "original"}
    svc.require(authz, email, "ViewDocumentPreview", cd, doc)
    if generated:
        return 200, {"url": files.presign_get(doc["s3Key"], doc.get("filename")), "variant": "generated"}
    if not doc.get("maskedKey"):
        raise ApiError(404, "No masked copy of this document yet.", "no_preview")
    return 200, {"url": files.presign_get(doc["maskedKey"], "masked-" + (doc.get("filename") or "doc") + ".png"),
                 "variant": "masked"}


def svc_load_for_doc(event):
    store, authz = deps()
    email = email_of(event)
    cd = svc.load_case(store, params(event)["caseId"])
    return store, authz, email, cd


def confirm_lead(event):
    store, _, email, cd = _case(event, "EditCase")
    return 201, svc.confirm_lead(store, cd, params(event)["leadId"], body_of(event), email)


def dismiss_lead(event):
    store, _, _, cd = _case(event, "EditCase")
    svc.dismiss_lead(store, cd, params(event)["leadId"])
    return 200, {"dismissed": True}


def add_asset(event):
    store, _, email, cd = _case(event, "EditCase")
    return 201, svc.create_asset(store, cd, body_of(event), email)


def patch_asset(event):
    store, _, email, cd = _case(event, "EditCase")
    return 200, svc.update_asset(store, cd, params(event)["assetId"], body_of(event), email)


def delete_asset(event):
    store, _, email, cd = _case(event, "EditCase")
    svc.delete_asset(store, cd, params(event)["assetId"], email)
    return 200, {"deleted": True}


def search_kit(event):
    _, _, _, cd = _case(event, "ViewCase")
    return 200, svc.search_kit(cd)


def finding(event):
    store, _, email, cd = _case(event, "EditCase")
    return 201, svc.add_finding(store, cd, body_of(event), email)


def submit(event):
    store, _, email, cd = _case(event, "EditCase")
    return 200, svc.submit_claim(store, cd, params(event)["assetId"], body_of(event), email, workflow.start_clock)


def answer(event):
    store, _, email, cd = _case(event, "EditCase")
    return 200, svc.answer_clock(store, cd, params(event)["assetId"], body_of(event), email, workflow.send_answer)


def demo_case(event):
    """Create the ready-made sample case for whoever is signed in (used by 'Try the demo')."""
    from euphatics.app.demo import seed_case

    store, _ = deps()
    return 201, seed_case(store, email_of(event))


def rules_info(event):
    from euphatics.rules import load_rulebook

    book = load_rulebook()["rbi"]
    return 200, {"source": book["source"], "thresholds": book["thresholds"],
                 "routes": [{"id": r["id"], "route": r["route"], "para": r["para"], "title": r["title"]}
                            for r in book["routes"]]}


def guides_info(event):
    """Public: how to get each document, and the claim playbook summary for every asset type."""
    from euphatics.rules import load_guides, load_rulebook

    other = load_rulebook()["other"]["routes"]
    return 200, {
        "guides": load_guides()["guides"],
        "playbooks": {k: {f: v.get(f) for f in ("title", "where", "url", "timeline", "sources")}
                      for k, v in other.items()},
    }


ROUTES = {
    "GET /health": health,
    "GET /rules": rules_info,
    "GET /guides": guides_info,
    "GET /me/cases": list_cases,
    "POST /demo/case": demo_case,
    "POST /cases": create_case,
    "GET /cases/{caseId}": get_case,
    "PATCH /cases/{caseId}": patch_case,
    "DELETE /cases/{caseId}": delete_case,
    "POST /cases/{caseId}/members": invite,
    "PUT /cases/{caseId}/people/{personId}": put_person,
    "DELETE /cases/{caseId}/people/{personId}": delete_person,
    "POST /cases/{caseId}/uploads": upload,
    "GET /cases/{caseId}/documents/{docId}/url": doc_url,
    "POST /cases/{caseId}/leads/{leadId}/confirm": confirm_lead,
    "POST /cases/{caseId}/leads/{leadId}/dismiss": dismiss_lead,
    "POST /cases/{caseId}/assets": add_asset,
    "PATCH /cases/{caseId}/assets/{assetId}": patch_asset,
    "DELETE /cases/{caseId}/assets/{assetId}": delete_asset,
    "GET /cases/{caseId}/search-kit": search_kit,
    "POST /cases/{caseId}/findings": finding,
    "POST /cases/{caseId}/assets/{assetId}/submit": submit,
    "POST /cases/{caseId}/assets/{assetId}/answer": answer,
}


@api
def handler(event, context):
    fn = ROUTES.get(event.get("routeKey", ""))
    if not fn:
        raise ApiError(404, "No such route.", "not_found")
    return fn(event)

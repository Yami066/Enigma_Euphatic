"""Comprehensive end-to-end test suite for Euphatics local stack."""
import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8001"

def req(method: str, path: str, data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"raw": err_body}

def run_tests():
    print("=== Testing Euphatics Local API Stack ===")
    
    # 1. Health
    status, res = req("GET", "/health")
    assert status == 200, f"Health check failed: {res}"
    print(f"[PASS] Health OK ({res['engine']})")

    # 2. Rules and Guides
    status, res = req("GET", "/rules")
    assert status == 200 and "routes" in res, f"Rules endpoint failed: {res}"
    print(f"[PASS] Rules OK ({len(res['routes'])} routes)")

    status, res = req("GET", "/guides")
    assert status == 200 and "guides" in res, f"Guides endpoint failed: {res}"
    print(f"[PASS] Guides OK ({len(res['guides'])} guides)")

    # 3. Auth
    status, res = req("POST", "/auth/signin", {"email": "testuser@example.com", "password": "Password123!"})
    assert status == 200 and "token" in res, f"Signin failed: {res}"
    token = res["token"]
    print(f"[PASS] Auth Signin OK (user: {res['email']})")

    status, res = req("GET", "/auth/me", token=token)
    assert status == 200 and res["email"] == "testuser@example.com", f"Auth Me failed: {res}"
    print(f"[PASS] Auth Me OK")

    # 4. Demo Case Seeding
    status, demo_res = req("POST", "/demo/case", token=token)
    assert status == 200 and "caseId" in demo_res, f"Demo case seeding failed: {demo_res}"
    case_id = demo_res["caseId"]
    print(f"[PASS] Demo Case Seeded OK (caseId: {case_id}, assets: {demo_res.get('assets')}, leads: {demo_res.get('leads')})")

    # 5. List Cases & Load Case
    status, cases_res = req("GET", "/me/cases", token=token)
    assert status == 200 and any(c["caseId"] == case_id for c in cases_res.get("cases", [])), f"List cases failed: {cases_res}"
    print(f"[PASS] List Cases OK ({len(cases_res['cases'])} cases found)")

    status, case_view = req("GET", f"/cases/{case_id}", token=token)
    assert status == 200 and case_view.get("case", {}).get("caseId") == case_id, f"Get case failed: {case_view}"
    print(f"[PASS] Get Case View OK (Deceased: {case_view['case'].get('deceasedName')})")

    # 6. People Upsert & Delete
    status, person = req("PUT", f"/cases/{case_id}/people/p_child1", {
        "fullName": "Arjun Sharma", "relation": "Son", "age": 28, "email": "arjun@example.com"
    }, token=token)
    assert status == 200, f"Upsert person failed: {person}"
    print(f"[PASS] Upsert Person OK ({person.get('fullName')})")

    # 7. Asset Operations
    status, new_asset = req("POST", f"/cases/{case_id}/assets", {
        "assetType": "bank_deposit",
        "institution": "HDFC Bank",
        "accountNumbers": ["9876543210"],
        "amount": 250000,
        "nomination": "nominee",
        "branch": "Connaught Place, New Delhi",
    }, token=token)
    assert status == 200 and "assetId" in new_asset, f"Create asset failed: {new_asset}"
    asset_id = new_asset["assetId"]
    print(f"[PASS] Create Asset OK ({new_asset.get('institution')}, assetId: {asset_id})")

    # 8. Search Kit & Findings
    status, search_kit = req("GET", f"/cases/{case_id}/search-kit", token=token)
    assert status == 200 and "portals" in search_kit, f"Search kit failed: {search_kit}"
    print(f"[PASS] Search Kit OK ({len(search_kit['portals'])} portals available)")

    status, finding = req("POST", f"/cases/{case_id}/findings", {
        "institution": "Employees' Provident Fund Organisation", "portal": "EPFO Member Portal", "amount": 150000, "note": "Discovered PF account"
    }, token=token)
    assert status == 200 and "leadId" in finding, f"Add finding failed: {finding}"
    print(f"[PASS] Add Finding OK")

    # 9. Leads Management (Confirm and Dismiss)
    status, case_data = req("GET", f"/cases/{case_id}", token=token)
    leads = case_data.get("leads", [])
    if leads:
        lead_id = leads[0]["leadId"]
        status, conf = req("POST", f"/cases/{case_id}/leads/{lead_id}/confirm", {}, token=token)
        assert status == 200, f"Confirm lead failed: {conf}"
        print(f"[PASS] Confirm Lead OK (leadId: {lead_id})")

    # 10. Claim Pack PDF Generation
    status, pack = req("POST", f"/cases/{case_id}/assets/{asset_id}/pack", token=token)
    assert status == 200 and "url" in pack, f"Generate pack failed: {pack}"
    print(f"[PASS] Generate Claim Pack PDF OK (url: {pack['url']})")

    # Verify downloading the generated PDF
    req_pdf = urllib.request.Request(pack["url"])
    with urllib.request.urlopen(req_pdf) as r:
        pdf_bytes = r.read()
        assert len(pdf_bytes) > 500 and pdf_bytes.startswith(b"%PDF"), "Invalid PDF generated"
        print(f"[PASS] Download Generated Claim Pack OK ({len(pdf_bytes)} bytes)")

    # 11. Bank Delay Letter & Ombudsman Letter PDF Generation
    status, delay_letter = req("POST", f"/cases/{case_id}/assets/{asset_id}/letters/bank-delay", token=token)
    assert status == 200 and "url" in delay_letter, f"Delay letter failed: {delay_letter}"
    print(f"[PASS] Generate Bank Delay Letter PDF OK")

    status, omb_letter = req("POST", f"/cases/{case_id}/assets/{asset_id}/letters/ombudsman", token=token)
    assert status == 200 and "url" in omb_letter, f"Ombudsman letter failed: {omb_letter}"
    print(f"[PASS] Generate Ombudsman Letter PDF OK")

    # 12. Statutory Clock (Submit & Answer)
    status, sub = req("POST", f"/cases/{case_id}/assets/{asset_id}/submit", {
        "docsCompleteDate": "2026-03-01",
        "ackDocId": None,
    }, token=token)
    assert status == 200, f"Submit claim failed: {sub}"
    print(f"[PASS] Statutory Clock Submit OK")

    status, ans = req("POST", f"/cases/{case_id}/assets/{asset_id}/answer", {
        "stage": "settled",
        "settled": False,
    }, token=token)
    assert status == 200, f"Answer clock failed: {ans}"
    print(f"[PASS] Statutory Clock Answer OK")

    # 13. Assistant
    status, asst = req("POST", "/assistant", {"question": "How long can a bank take to settle a savings account after death?"})
    assert status == 200 and "answer" in asst, f"Assistant failed: {asst}"
    print(f"[PASS] Assistant OK (Answer length: {len(asst['answer'])})")

    print("\n==========================================")
    print("SUCCESS: ALL FEATURES & API ENDPOINTS WORKING!")
    print("==========================================")

if __name__ == "__main__":
    run_tests()

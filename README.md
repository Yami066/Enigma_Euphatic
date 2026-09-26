# Euphatics (एम्फैटिक्स)
> **Empathetic, Authoritative Estate Settlement & Deceased Asset Claim Platform**  
> *Fully Aligned with Reserve Bank of India (RBI) Master Directions 2025*

[![Compliance](https://img.shields.io/badge/Compliance-RBI%20Directions%202025-green.svg)](https://www.rbi.org.in)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20TypeScript%20%7C%20Vite-blue.svg)](https://react.dev/)
[![Styling](https://img.shields.io/badge/Styling-TailwindCSS%20v4-38bdf8.svg)](https://tailwindcss.com/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.11+-009688.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

---

## 👥 Team Information

* **Team Name:** **Euphatics**
* **Team Members:**
  1. **Maaz Qureshi**
  2. **Bhaumik Samala**
  3. **Chaitanya Gali**

---

## 📌 Problem Statement

In India, when an earning member or elderly parent passes away, the bereaved family faces immense emotional trauma that is quickly compounded by bureaucratic hurdles and administrative delays from financial institutions:

1. **Unlawful Demands for Succession Certificates:** Banks routinely demand court Succession Certificates or Letters of Administration—which take 1 to 2 years and significant legal fees—even when registered nominees exist or for small balance accounts where the law explicitly forbids banks from demanding court orders.
2. **Over ₹1.5 Lakh Crore in Unclaimed Assets:** Millions of bank deposits, provident fund balances (EPFO), life insurance payouts (LIC), and mutual fund units lie abandoned across India because legal heirs lack awareness of accounts or cannot navigate disparate bank claim processes.
3. **Ignored Statutory Deadlines:** Although the Reserve Bank of India mandates strict 15-day settlement timelines once paperwork is submitted, banks frequently drag out claims for months without paying the mandatory statutory penal interest owed to the heirs.
4. **Scattered Multi-Heir Coordination:** Coordinating No Objection Certificates (NOCs), survivorship declarations, and family tree affidavits across geographically dispersed Class-I legal heirs creates friction, disputes, and stalled settlements.

---

## 💡 The Solution: Euphatics

**Euphatics** is an empathetic, authoritative LegalTech platform designed to guide families through settling a deceased loved one's estate within statutory timelines.

### ✨ Key Features

* **Statutory Classification Engine:** Automatically routes each bank account, fixed deposit, or locker to its exact legal regime under **RBI Master Directions 2025**:
  * **Para 28:** Mandatory settlement to registered nominee within 15 calendar days without succession certificates.
  * **Para 30:** Simplified settlement for claims below bank board thresholds (up to ₹5 Lakhs) using standardized affidavits and NOCs.
  * **Para 32:** Documented route for claims above board thresholds.
  * **Para 35:** Locker access and joint inventory protocol.
* **Active Statutory Clocks & Penal Interest Calculator:** Real-time countdowns tracking statutory deadlines. Automatically calculates mandatory penal interest at **Bank Rate (6.5%) + 4.0% p.a. (10.5% p.a.)** under RBI Para 33 for delayed claims.
* **One-Click Official Paperwork Generation:** Automatically prepares pre-filled legal annexure packages:
  * **Annex I-A:** Registered Nominee Settlement Claim.
  * **Annex I-B:** Simplified Settlement Claim without Legal Representation.
  * **Annex I-C:** Family Tree & Legal Heir Declaration Affidavit.
  * **Annex I-D:** Heir No Objection Certificate (NOC) and Relinquishment Deed.
* **Multi-Source Discovery Engine:**
  * **Document OCR:** Scans death certificates and bank passbooks to auto-extract details.
  * **Inbox Statement Scanner:** Scans e-statements (CAMS, Karvy, EPFO, Zerodha, LIC) to uncover forgotten policies and Demat shares.
* **Family Access & Heir Role Assignment:** Securely invite legal heirs (Co-Claimants, Registered Nominees, Declarant Witnesses, or Heirs giving NOC) to collaborate and sign digital consent forms.
* **Bilingual Accessibility (English & Hindi):** Full pan-India linguistic accessibility with an instant `EN | हिं` switcher, using high-readability typography (`IBM Plex Sans` + `IBM Plex Serif`).
* **Instant AI Legal Assistant:** An on-demand legal co-pilot quoting RBI master directions, IRDAI regulations, and Indian succession acts to protect families from branch-level resistance.

---

## 🛠️ Tech Stack

### **Frontend**
* **Framework:** React 19 + TypeScript + Vite
* **Styling:** TailwindCSS v4 with warm, high-contrast empathetic palette (`#4F3F38`, `#6B6358`, `#FFB077`, `#B7C497`)
* **Typography:** IBM Plex Sans (Body/UI) & IBM Plex Serif (Headings) via `@fontsource`
* **Icons:** Lucide React
* **Localization:** Custom bilingual engine supporting English and Hindi (`EN | हिं`)

### **Backend & Services**
* **Core API:** FastAPI (Python 3.11+) + Uvicorn
* **PDF & OCR Processing:** PyPDF, PDFPlumber, PyPDFium2, ReportLab, RapidFuzz
* **Security & Auth:** Isolated per-user local storage vaults with AWS Cognito / JWT integration ready
* **AI Integration:** Google Gemini API integration for real-time legal statutory assistant

### **Cloud & Deployment**
* **Platform:** Render (Web Service & Static Site ready)
* **Configuration:** `render.yaml` infrastructure-as-code blueprint

---

## 🚀 Setup & Installation Instructions

### Prerequisites
* **Node.js** (v18.0.0 or higher)
* **npm** (v9.0.0 or higher)
* **Python** (v3.10 or higher — optional for local backend server)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/Yami066/Enigma_Euphatic.git
cd Enigma_Euphatic
```

---

### Step 2: Frontend Setup (Quickstart)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

---

### Step 3: Backend Setup (Optional API Server)

1. From the project root, set up a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # macOS/Linux:
   source .venv/bin/activate
   ```

2. Install Python dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Start the FastAPI backend server:
   ```bash
   uvicorn backend.server:app --reload --port 8000
   ```

4. The API docs will be available at `http://localhost:8000/docs`.

---

### Step 4: Build for Production / Render Deployment

To create an optimized production build:

```bash
# From the root directory:
npm run build
```

This compiles the TypeScript files and outputs static production assets to both `frontend/dist` and root `dist`.

#### Deploying on Render:
* **Option 1 (Blueprint):** Connect your GitHub repository to Render and choose **New +** → **Blueprint**. Render will automatically detect `render.yaml`.
* **Option 2 (Static Site):**
  * **Build Command:** `npm run build`
  * **Publish Directory:** `dist`
  * **Rewrite Rule:** `/*` ➔ `/index.html`

---

## 🧭 Judge Demonstration Flow

When demonstrating Euphatics to judges, follow this 5-step sequence:

1. **Home / Problem Statement (`Home / Overview`):** Show the hero banner, RBI 2025 compliance badge, and English/Hindi toggle.
2. **Guided Intake (`Guided Intake`):** Input deceased details and add an asset live. Show how Euphatics automatically categorizes the asset under **Para 28** (Nominee) or **Para 30** (Simplified claim under ₹5 Lakh).
3. **Case Overview & Statutory Clocks (`Case Overview`):** Click *"Load Sample Demo"* to reveal the full ₹71,15,000 estate. Highlight the 15-day countdown timers and the **Bank Rate + 4% Penal Interest** calculator for delayed accounts.
4. **Official Legal Packs (`Official Packs`):** View auto-generated, pre-filled RBI Annexure claim forms, indemnity letters, and No Objection Certificates.
5. **Ask Legal AI (`Ask Legal AI`):** Ask a real succession query (e.g., *"Can a bank refuse payout to a registered nominee without a succession certificate?"*) to demonstrate statutory legal co-pilot responses.

---

## 📜 Legal & Regulatory Foundation

Euphatics is architected around official Indian banking and financial regulations:
* **Reserve Bank of India (RBI):** Master Directions – Settlement of Claims in Respect of Deceased Depositors (2025).
* **Securities and Exchange Board of India (SEBI):** Master Circular on Transmission of Securities.
* **Insurance Regulatory and Development Authority of India (IRDAI):** Protection of Policyholders' Interests Regulations.
* **Employees' Provident Funds and Miscellaneous Provisions Act, 1952:** Para 70 & EDLI Scheme 1976.
* **Indian Succession Act, 1925 & Hindu Succession Act, 1956.**

---

<p align="center">
  Built with ❤️ by <strong>Team Euphatics</strong> — Maaz Qureshi, Bhaumik Samala, Chaitanya Gali
</p>

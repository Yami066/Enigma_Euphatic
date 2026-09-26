"""Amazon Bedrock calls: grounded web answers (Amazon Nova 2 Lite + Web Grounding, us-east-1) and plain
explanations (OpenAI gpt-oss-120b in ap-south-1, so explanation requests stay in India).

Rules for the model (the organisers' pattern: the model never decides):
  * it only explains or searches; routes, dates and money come from the rules engine
  * every outgoing text has passed the PII firewall first
  * web answers always carry their citations, marked official or not
  * if the model fails, callers fall back to deterministic text
"""
from __future__ import annotations

import os
from urllib.parse import urlparse

from .clients import client

WEB_MODEL = os.environ.get("MODEL_ID_WEB", "us.amazon.nova-2-lite-v1:0")
WEB_REGION = os.environ.get("MODEL_REGION_WEB", "us-east-1")
EXPLAIN_MODEL = os.environ.get("MODEL_ID_EXPLAIN", "openai.gpt-oss-120b-1:0")
EXPLAIN_REGION = os.environ.get("MODEL_REGION_EXPLAIN", "ap-south-1")

OFFICIAL_DOMAINS = (
    "rbi.org.in", "sebi.gov.in", "iepf.gov.in", "epfindia.gov.in", "irdai.gov.in", "incometax.gov.in",
    "unclaimedassetsportal.in", "gov.in", "nic.in", "mfcentral.com", "amfiindia.com", "npscra.nsdl.co.in",
    "licindia.in", "digilocker.gov.in", "policyholder.gov.in", "cms.rbi.org.in", "udgam.rbi.org.in",
)

SYSTEM_WEB = (
    "You help Indian families claim money and assets after a family member's death. "
    "Answer the question briefly (under 120 words) with practical steps. Prefer official sources such as "
    "rbi.org.in, sebi.gov.in, iepf.gov.in, epfindia.gov.in, irdai.gov.in, incometax.gov.in and "
    "unclaimedassetsportal.in. Never promise outcomes and never give legal advice; say what to verify with the "
    "institution. If you are not sure, say so."
)

SYSTEM_EXPLAIN = (
    "You explain one step of a bank claim to a grieving Indian family in very simple, kind words. Use only the "
    "facts given in the context; do not add rules, amounts or deadlines that are not in the context. Never say "
    "something is or isn't required unless the context says so. If the context doesn't answer the question, say "
    "that plainly and suggest asking the bank branch or using 'Search the web'. Keep it under 90 words. End with "
    "one line telling them what to do next."
)


def _lang_line(lang: str) -> str:
    if lang == "hi":  # a small glossary keeps official terms right (a model once wrote RBI as 'रबी', the crop season)
        return ("Answer in simple Hindi (Devanagari script). Write RBI as 'आरबीआई', succession certificate as "
                "'उत्तराधिकार प्रमाण पत्र', legal heir as 'कानूनी वारिस', stamp paper as 'स्टांप पेपर'; keep form "
                "names like 'Annex I-E' in English.")
    return "Answer in simple English."


def _is_official(domain: str) -> bool:
    d = (domain or "").lower()
    return any(d == o or d.endswith("." + o) for o in OFFICIAL_DOMAINS)


def grounded_answer(question: str, lang: str = "en") -> dict:
    br = client("bedrock-runtime", WEB_REGION, read_timeout=90)
    resp = br.converse(
        modelId=WEB_MODEL,
        system=[{"text": SYSTEM_WEB + " " + _lang_line(lang)}],
        messages=[{"role": "user", "content": [{"text": question}]}],
        toolConfig={"tools": [{"systemTool": {"name": "nova_grounding"}}]},
        inferenceConfig={"maxTokens": 700, "temperature": 0.2},
    )
    text, cites = "", []
    for part in resp["output"]["message"]["content"]:
        if "text" in part:
            text += part["text"]
        if "citationsContent" in part:
            for c in part["citationsContent"].get("citations", []):
                web = c.get("location", {}).get("web", {})
                url = web.get("url")
                if url and url not in [x["url"] for x in cites]:
                    domain = web.get("domain") or urlparse(url).netloc
                    cites.append({"url": url, "domain": domain, "official": _is_official(domain)})
    cites.sort(key=lambda c: not c["official"])
    return {"answer": text.strip(), "citations": cites[:8], "model": WEB_MODEL, "grounded": True,
            "usage": resp.get("usage", {})}


def explain(context: str, question: str, lang: str = "en", model: str | None = None, region: str | None = None) -> dict:
    model, region = model or EXPLAIN_MODEL, region or EXPLAIN_REGION
    br = client("bedrock-runtime", region, read_timeout=60)
    kw: dict = {}
    if "gpt-oss" in model:
        # a reasoning model: its thinking counts toward maxTokens, so allow room and keep reasoning light
        kw["additionalModelRequestFields"] = {"reasoning_effort": "low"}
    resp = br.converse(
        modelId=model,
        system=[{"text": SYSTEM_EXPLAIN + " " + _lang_line(lang)}],
        messages=[{"role": "user", "content": [{"text": f"Context:\n{context}\n\nQuestion: {question}"}]}],
        inferenceConfig={"maxTokens": 1200 if "gpt-oss" in model else 400, "temperature": 0.2},
        **kw,
    )
    text = "".join(p.get("text", "") for p in resp["output"]["message"]["content"])  # reasoning blocks are skipped
    return {"answer": text.strip(), "citations": [], "model": model, "grounded": False,
            "usage": resp.get("usage", {})}


def comprehend_pii(text: str) -> list[dict]:
    """Second-pass PII detection. Returns [{type, begin, end}]; empty on any error (regex pass already ran)."""
    try:
        r = client("comprehend").detect_pii_entities(Text=text[:4500], LanguageCode="en")
    except Exception:  # noqa: BLE001 - optional safety net, never blocks the user
        return []
    return [{"type": e["Type"], "begin": e["BeginOffset"], "end": e["EndOffset"], "score": e["Score"]}
            for e in r.get("Entities", []) if e.get("Score", 0) >= 0.7]


def redact_spans(text: str, spans: list[dict], keep: tuple = ("DATE_TIME", "AGE")) -> tuple[str, list[dict]]:
    found = []
    for s in sorted(spans, key=lambda s: -s["begin"]):
        if s["type"] in keep:
            continue
        found.append({"type": s["type"], "value": "…"})
        text = text[: s["begin"]] + f"[{s['type'].lower()} removed]" + text[s["end"]:]
    return text, found

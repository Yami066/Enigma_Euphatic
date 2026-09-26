// What to look for in a Gmail inbox, and how to turn message headers into findings.
// Pure functions (no network), so they can be tested with plain Node.

export type Source = {
  type: string;
  label: string;
  q: string;
  bySender?: boolean;
  /** A sender match is only supporting evidence when its subject also looks account-specific. */
  positive?: RegExp;
};

export type Meta = { id: string; from: string; subject: string; date: string };

export type Evidence = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  strength: "supporting" | "uncertain";
};

export type Finding = {
  key: string;
  type: string;
  institution: string;
  count: number;
  latest: string;
  accounts: string[];
  messageIds: string[];
  evidence: Evidence[];
  needsReview: boolean;
  sample?: string;
};

const MF_SUBJECT = /\b(consolidated account statement|cas|folio|mutual fund|portfolio|capital gains?|transaction statement|account statement)\b/i;
const DEMAT_SUBJECT = /\b(consolidated account statement|cas|demat|holding statement|transaction statement|contract note|ledger|funds statement|tax p&l|account statement)\b/i;
const INSURANCE_SUBJECT = /\b(policy|premium (?:receipt|paid|due|renewal)|renewal premium|maturity|claim|life insurance|unit statement|annual statement)\b/i;

// One search per institution, plus keyword searches grouped by sender.
export const SOURCES: Source[] = [
  { type: "mutual_fund", label: "Mutual funds (CAMS statements)", q: "from:camsonline.com", positive: MF_SUBJECT },
  { type: "mutual_fund", label: "Mutual funds (KFintech statements)", q: "from:(kfintech.com OR karvy.com) -subject:dividend", positive: MF_SUBJECT },
  { type: "mutual_fund", label: "Mutual funds (MF Central)", q: "from:mfcentral.com", positive: MF_SUBJECT },
  { type: "nps", label: "NPS pension account", q: "from:(npscra.nsdl.co.in OR proteantech.in)", positive: /\b(pran|nps|pension|contribution|transaction statement|holding statement|annual statement|withdrawal)\b/i },
  { type: "shares", label: "Demat account (NSDL statements)", q: "from:nsdl.co.in -from:npscra.nsdl.co.in", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Demat account (CDSL statements)", q: "from:(cdslindia.com OR cdslindia.co.in OR cdslstatement.com)", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Zerodha", q: "from:zerodha.com", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Groww", q: "from:groww.in", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Upstox", q: "from:upstox.com", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Angel One", q: "from:(angelone.in OR angelbroking.com)", positive: DEMAT_SUBJECT },
  { type: "shares", label: "ICICI Direct", q: "from:icicidirect.com", positive: DEMAT_SUBJECT },
  { type: "shares", label: "HDFC Securities", q: "from:hdfcsec.com", positive: DEMAT_SUBJECT },
  { type: "shares", label: "Kotak Securities", q: "from:kotaksecurities.com", positive: DEMAT_SUBJECT },
  { type: "life_insurance", label: "Life Insurance Corporation of India (LIC)", q: "from:licindia.in", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "HDFC Life", q: "from:hdfclife.com", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "ICICI Prudential Life", q: "from:iciciprulife.com", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "SBI Life", q: "from:sbilife.co.in", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "Axis Max Life", q: "from:(maxlifeinsurance.com OR axismaxlife.com)", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "Tata AIA Life", q: "from:tataaia.com", positive: INSURANCE_SUBJECT },
  { type: "life_insurance", label: "Bajaj Allianz Life", q: "from:(bajajallianzlife.co.in OR bajajlife.com)", positive: INSURANCE_SUBJECT },
  { type: "epf", label: "EPFO (PF / pension)", q: "from:epfindia.gov.in", positive: /\b(uan|epf|pf|provident fund|passbook|pension|claim|contribution|member)\b/i },
  { type: "post_office", label: "India Post savings", q: "from:indiapost.gov.in", positive: /\b(account|deposit|savings|interest certificate|statement|recurring|time deposit|ppf|nsc|mis)\b/i },
  { type: "shares", label: "Dividends", q: "subject:dividend", bySender: true, positive: /\bdividend\b/i },
  { type: "term_deposit", label: "Fixed / recurring deposits", q: 'subject:("fixed deposit" OR "term deposit" OR "FD receipt" OR "recurring deposit")', bySender: true, positive: /\b(fixed deposit|term deposit|fd receipt|recurring deposit)\b/i },
  { type: "life_insurance", label: "Insurance premiums", q: 'subject:("premium receipt" OR "premium paid" OR "renewal premium" OR "premium due")', bySender: true, positive: INSURANCE_SUBJECT },
  { type: "credit_card", label: "Credit card statements", q: 'subject:("credit card statement")', bySender: true, positive: /\bcredit card statement\b/i },
  { type: "loan", label: "Loan statements", q: 'subject:("loan account statement" OR "loan statement")', bySender: true, positive: /\bloan (?:account )?statement\b/i },
];

const MARKETING_SUBJECT = /\b(offer|sale|discount|cashback|reward|webinar|newsletter|limited time|exclusive|apply now|buy now|campaign|survey|tips?|introducing|launch)\b/i;

export function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** '"HDFC Bank InstaAlerts" <alerts@hdfcbank.net>' -> { name: "HDFC Bank", domain: "hdfcbank.net" } */
export function sender(from: string): { name: string; domain: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const addr = (m ? m[2] : from).trim().toLowerCase();
  const domain = addr.includes("@") ? addr.split("@")[1] : addr;
  const name = (m ? m[1] : "")
    .replace(/\b(insta ?alerts?|alerts?|e-?statements?|statements?|no-?reply|donotreply|do not reply|customer care|notifications?|updates?|mailer|service)\b/gi, "")
    .replace(/[|:\u2013-]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name, domain };
}

/** A company named in a dividend subject: 'Final dividend 2025-26 - ITC Limited' -> 'ITC Limited' */
export function companyIn(subject: string): string {
  const m = subject.match(/([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,5}\s+(?:Limited|Ltd\.?))/);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

const titleDomain = (d: string) => {
  const root = d.split(".").filter((x) => !["www", "mail", "email", "alerts", "co", "com", "in", "net", "org"].includes(x))[0] ?? d;
  return root.charAt(0).toUpperCase() + root.slice(1);
};

const isoDate = (d: string) => {
  const t = Date.parse(d);
  return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
};

function evidenceFor(src: Source, meta: Meta): Evidence {
  const positive = Boolean(src.positive?.test(meta.subject));
  // Concrete statement/policy language wins if a subject also contains a generic promotion word.
  const strength = positive && (!MARKETING_SUBJECT.test(meta.subject) || /\b(statement|receipt|policy|contract note|passbook)\b/i.test(meta.subject))
    ? "supporting"
    : "uncertain";
  return { messageId: meta.id, from: meta.from, subject: meta.subject, date: isoDate(meta.date), strength };
}

function uniqueMetas(metas: Meta[]): Meta[] {
  const seen = new Set<string>();
  return metas.filter((m) => {
    if (!m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function makeFinding(src: Source, institution: string, metas: Meta[], account: string): Finding {
  const allEvidence = uniqueMetas(metas).map((m) => evidenceFor(src, m));
  const supporting = allEvidence.filter((e) => e.strength === "supporting");
  const chosen = supporting.length ? supporting : allEvidence;
  const messageIds = chosen.map((e) => e.messageId);
  const latest = chosen.map((e) => e.date).sort().reverse()[0] ?? "";
  const needsReview = supporting.length === 0;
  const key = `${src.type}|${normName(institution) || institution.toLowerCase()}`;
  return {
    key,
    type: src.type,
    institution,
    count: messageIds.length,
    latest,
    accounts: [account],
    messageIds,
    evidence: chosen,
    needsReview,
    sample: chosen[0]?.subject,
  };
}

/** Findings from one search: a fixed source is one finding; keyword sources are grouped by who sent them. */
export function findingsFor(src: Source, metas: Meta[], _estimate: number, account: string): Finding[] {
  const unique = uniqueMetas(metas);
  if (!unique.length) return [];
  if (!src.bySender) return [makeFinding(src, src.label, unique, account)];

  const groups = new Map<string, Meta[]>();
  const names = new Map<string, string>();
  for (const m of unique) {
    const s = sender(m.from);
    const company = src.type === "shares" ? companyIn(m.subject) : "";
    const institution = company || s.name || titleDomain(s.domain);
    const key = normName(institution) || institution.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), m]);
    names.set(key, institution);
  }
  return [...groups].map(([key, ms]) => makeFinding(src, names.get(key) ?? key, ms, account));
}

function combineEvidence(a: Evidence[], b: Evidence[]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const e of [...a, ...b]) {
    const old = byId.get(e.messageId);
    if (!old || (old.strength === "uncertain" && e.strength === "supporting")) byId.set(e.messageId, e);
  }
  return [...byId.values()].sort((x, y) => {
    if (x.strength !== y.strength) return x.strength === "supporting" ? -1 : 1;
    return y.date.localeCompare(x.date);
  });
}

/** Same asset found in several accounts or overlapping searches becomes one row. */
export function merge(all: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const f of all) {
    // Asset type is part of identity: HDFC Bank, HDFC Life and HDFC Securities are separate assets.
    const prev = out.find((x) => x.type === f.type && (x.key === f.key || sameInstitution(x.institution, f.institution)));
    if (!prev) {
      out.push({ ...f, accounts: [...new Set(f.accounts)], messageIds: [...new Set(f.messageIds)], evidence: [...f.evidence] });
      continue;
    }
    const allEvidence = combineEvidence(prev.evidence, f.evidence);
    const supporting = allEvidence.filter((e) => e.strength === "supporting");
    const evidence = supporting.length ? supporting : allEvidence;
    const messageIds = evidence.map((e) => e.messageId);
    prev.messageIds = messageIds;
    prev.count = messageIds.length;
    prev.evidence = evidence;
    prev.needsReview = supporting.length === 0;
    prev.sample = evidence[0]?.subject ?? prev.sample;
    prev.latest = evidence.map((e) => e.date).sort().reverse()[0] ?? "";
    for (const a of f.accounts) if (!prev.accounts.includes(a)) prev.accounts.push(a);
  }
  const order = ["mutual_fund", "shares", "life_insurance", "epf", "nps", "post_office", "term_deposit", "credit_card", "loan"];
  return out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || Number(a.needsReview) - Number(b.needsReview) || b.count - a.count);
}

/** Normalized comparison keeps business lines distinct while ignoring legal suffixes and parenthetical acronyms. */
export const normName = (s: string) => (s || "")
  .toLowerCase()
  .replace(/\([^)]*\)/g, "")
  .replace(/\b(pvt|private|ltd|limited|company|co)\b/g, "")
  .replace(/[^a-z0-9]/g, "");

export function sameInstitution(a: string, b: string, aType?: string, bType?: string): boolean {
  if (aType && bType && aType !== bType) return false;
  const x = normName(a), y = normName(b);
  // Exact match, so short names such as SBI, LIC or PNB are safe to compare.
  return x.length >= 2 && x === y;
}

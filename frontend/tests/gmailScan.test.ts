// Run: node tests/gmailScan.test.ts   (Node 22.6+ strips the types)
import assert from "node:assert/strict";
import { companyIn, findingsFor, merge, sameInstitution, sender, SOURCES, type Finding, type Meta } from "../src/lib/gmailScan.ts";

assert.deepEqual(sender('"HDFC Bank InstaAlerts" <alerts@hdfcbank.net>'), { name: "HDFC Bank", domain: "hdfcbank.net" });
assert.deepEqual(sender("donotreply@camsonline.com"), { name: "", domain: "camsonline.com" });
assert.equal(companyIn("Final Dividend for FY 2025-26 - ITC Limited"), "ITC Limited");
assert.equal(companyIn("Intimation of dividend payment: Infosys Ltd."), "Infosys Ltd.");

const cams = SOURCES.find((s) => s.q === "from:camsonline.com")!;
const statement: Meta = {
  id: "gmail-001",
  from: "CAMS <donotreply@camsonline.com>",
  subject: "Consolidated Account Statement",
  date: "Tue, 12 May 2026 10:00:00 +0530",
};
const one = findingsFor(cams, [statement], 23, "a@gmail.com");
assert.equal(one.length, 1);
assert.equal(one[0].count, 1, "count is based on inspected evidence, not Gmail's approximate total");
assert.equal(one[0].latest, "2026-05-12");
assert.equal(one[0].needsReview, false);
assert.deepEqual(one[0].messageIds, ["gmail-001"]);
assert.equal(one[0].evidence[0].messageId, "gmail-001", "Gmail message id survives classification");

// A sender match alone is a lead to review, not proof of an account.
const marketing = findingsFor(cams, [{
  id: "gmail-ad",
  from: "CAMS <news@camsonline.com>",
  subject: "Exclusive webinar: investment tips for your future",
  date: "2026-08-10",
}], 1, "a@gmail.com");
assert.equal(marketing.length, 1);
assert.equal(marketing[0].needsReview, true);
assert.equal(marketing[0].evidence[0].strength, "uncertain");

const div = SOURCES.find((s) => s.label === "Dividends")!;
const grouped = findingsFor(div, [
  { id: "div-itc-1", from: "KFintech <einward@kfintech.com>", subject: "Final Dividend 2025-26 - ITC Limited", date: "2026-07-30" },
  { id: "div-itc-2", from: "KFintech <einward@kfintech.com>", subject: "Interim Dividend - ITC Limited", date: "2026-02-10" },
  { id: "div-infy-1", from: '"Infosys Limited" <investors@infosys.com>', subject: "Dividend credited", date: "2026-06-26" },
], 3, "a@gmail.com");
assert.deepEqual(grouped.map((g) => [g.institution, g.count, g.latest]), [["ITC Limited", 2, "2026-07-30"], ["Infosys Limited", 1, "2026-06-26"]]);

// The same message returned by overlapping Gmail searches is counted once.
const overlapping = merge([
  one[0],
  { ...one[0], accounts: ["a@gmail.com"], evidence: [...one[0].evidence], messageIds: ["gmail-001"] },
]);
assert.equal(overlapping.length, 1);
assert.equal(overlapping[0].count, 1);
assert.deepEqual(overlapping[0].messageIds, ["gmail-001"]);

// Separate messages from another connected inbox are retained while accounts are combined.
const merged = merge([...one, {
  ...one[0],
  count: 1,
  latest: "2026-08-01",
  accounts: ["b@gmail.com"],
  messageIds: ["gmail-002"],
  evidence: [{ ...one[0].evidence[0], messageId: "gmail-002", date: "2026-08-01" }],
}]);
assert.equal(merged.length, 1);
assert.equal(merged[0].count, 2);
assert.equal(merged[0].latest, "2026-08-01");
assert.deepEqual(merged[0].accounts, ["a@gmail.com", "b@gmail.com"]);

assert.ok(sameInstitution("Life Insurance Corporation of India (LIC)", "Life Insurance Corporation of India"));
assert.ok(sameInstitution("HDFC Bank Limited", "HDFC Bank"));
assert.ok(!sameInstitution("HDFC Bank", "HDFC Life"));
assert.ok(!sameInstitution("HDFC Bank", "HDFC Securities"));
assert.ok(!sameInstitution("HDFC Life", "HDFC Mutual Fund"));
assert.ok(!sameInstitution("HDFC Life", "HDFC Life", "life_insurance", "shares"));
assert.ok(sameInstitution("SBI", "SBI Ltd"), "short bank names still match exactly");
assert.ok(!sameInstitution("SBI", "SBI Life"));

// A short sender name found in two inboxes is one row.
const fd = SOURCES.find((s) => s.type === "term_deposit")!;
const sbiA = findingsFor(fd, [{ id: "fd-1", from: '"SBI" <alerts@sbi.co.in>', subject: "Fixed Deposit receipt", date: "2026-03-01" }], 1, "a@gmail.com");
const sbiB = findingsFor(fd, [{ id: "fd-2", from: '"SBI" <alerts@sbi.co.in>', subject: "Fixed Deposit renewal", date: "2026-04-01" }], 1, "b@gmail.com");
const sbi = merge([...sbiA, ...sbiB]);
assert.equal(sbi.length, 1);
assert.deepEqual(sbi[0].accounts, ["a@gmail.com", "b@gmail.com"]);

// Even identical institution text remains separate when the asset types differ.
const asOtherType: Finding = { ...one[0], key: "shares|mutualfunds", type: "shares" };
assert.equal(merge([one[0], asOtherType]).length, 2);

console.log("gmailScan: all checks passed");

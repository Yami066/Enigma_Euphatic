// Format checks shown while typing. They warn, they don't block: real documents have odd cases.

export type Check = { ok: boolean; en: string; hi: string } | null;

const ok = null;
const bad = (en: string, hi: string): Check => ({ ok: false, en, hi });

/** PAN: AAAAA9999A. 4th letter is the holder type (P = individual); 5th is usually the surname's first letter. */
export function checkPan(pan: string, surname = ""): Check {
  const p = pan.trim().toUpperCase();
  if (!p) return ok;
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return bad("PAN is 10 characters: 5 letters, 4 digits, 1 letter (like ABCPS1234K).", "पैन 10 अक्षरों का होता है: 5 अक्षर, 4 अंक, 1 अक्षर (जैसे ABCPS1234K)।");
  if (p[3] !== "P") return bad("The 4th letter of a person's PAN is 'P'. Please check it.", "किसी व्यक्ति के पैन का चौथा अक्षर 'P' होता है। कृपया जांचें।");
  const s = surname.trim().toUpperCase();
  if (s && /^[A-Z]/.test(s) && p[4] !== s[0])
    return bad(`The 5th letter is usually the surname's first letter (${s[0]}). Fine if the PAN card says otherwise.`, `पांचवां अक्षर आमतौर पर उपनाम का पहला अक्षर (${s[0]}) होता है।`);
  return ok;
}

export const isIfsc = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.trim().toUpperCase());
export function checkIfsc(v: string): Check {
  if (!v.trim()) return ok;
  return isIfsc(v) ? ok : bad("IFSC is 11 characters, like SBIN0001234 (the 5th is zero).", "IFSC 11 अक्षरों का होता है, जैसे SBIN0001234 (5वां शून्य)।");
}

export function checkMobile(v: string): Check {
  const d = v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!v.trim()) return ok;
  return /^[6-9]\d{9}$/.test(d) ? ok : bad("Mobile numbers have 10 digits and start with 6, 7, 8 or 9.", "मोबाइल नंबर 10 अंकों का होता है और 6-9 से शुरू होता है।");
}

export function checkPin(v: string): Check {
  if (!v.trim()) return ok;
  return /^[1-9]\d{5}$/.test(v.trim()) ? ok : bad("PIN code has 6 digits.", "पिन कोड 6 अंकों का होता है।");
}

export function checkLast4(v: string): Check {
  if (!v.trim()) return ok;
  return /^[A-Za-z0-9]{4}$/.test(v.trim()) ? ok : bad("Only the last 4 characters.", "केवल आखिरी 4 अक्षर।");
}

/** Demat BO ID: CDSL is 16 digits; NSDL is 'IN' + 6-digit DP ID + 8-digit client ID. */
export function checkBoId(v: string): Check {
  const s = v.replace(/\s/g, "").toUpperCase();
  if (!s) return ok;
  return /^\d{16}$/.test(s) || /^IN\d{14}$/.test(s)
    ? ok
    : bad("Demat ID: 16 digits (CDSL) or IN + 14 digits (NSDL).", "डीमैट आईडी: 16 अंक (सीडीएसएल) या IN + 14 अंक (एनएसडीएल)।");
}

export function checkDigits(v: string, n: number, en: string, hi: string): Check {
  const s = v.replace(/\s/g, "");
  if (!s) return ok;
  return new RegExp(`^\\d{${n}}$`).test(s) ? ok : bad(en, hi);
}
export const checkUan = (v: string) => checkDigits(v, 12, "UAN has 12 digits.", "यूएएन 12 अंकों का होता है।");
export const checkPran = (v: string) => checkDigits(v, 12, "PRAN has 12 digits.", "प्रान 12 अंकों का होता है।");

export function checkAccountNumber(v: string): Check {
  const s = v.replace(/\s/g, "");
  if (!s) return ok;
  return /^[A-Za-z0-9]{6,20}$/.test(s) ? ok : bad("Account numbers are usually 9–18 digits.", "खाता संख्या आमतौर पर 9–18 अंकों की होती है।");
}

export function checkDateOrder(earlier: string, later: string, en: string, hi: string): Check {
  if (!earlier || !later) return ok;
  return earlier <= later ? ok : bad(en, hi);
}

export function ageOn(dob: string, on: string): number | null {
  if (!dob || !on) return null;
  const a = new Date(dob), b = new Date(on);
  if (isNaN(+a) || isNaN(+b)) return null;
  let age = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

/** Law of succession usually applicable by religion (the form asks for it; the family can change it). */
export const RELIGIONS: { value: string; en: string; hi: string; law: string }[] = [
  { value: "Hindu", en: "Hindu", hi: "हिंदू", law: "Hindu Succession Act, 1956" },
  { value: "Muslim", en: "Muslim", hi: "मुस्लिम", law: "Muslim Personal Law (Shariat) Application Act, 1937" },
  { value: "Christian", en: "Christian", hi: "ईसाई", law: "Indian Succession Act, 1925" },
  { value: "Sikh", en: "Sikh", hi: "सिख", law: "Hindu Succession Act, 1956" },
  { value: "Jain", en: "Jain", hi: "जैन", law: "Hindu Succession Act, 1956" },
  { value: "Buddhist", en: "Buddhist", hi: "बौद्ध", law: "Hindu Succession Act, 1956" },
  { value: "Parsi", en: "Parsi", hi: "पारसी", law: "Indian Succession Act, 1925 (Parsi provisions)" },
  { value: "Other", en: "Other", hi: "अन्य", law: "Indian Succession Act, 1925" },
];

export const RELATIONS = ["Wife", "Husband", "Son", "Daughter", "Mother", "Father", "Brother", "Sister", "Grandson", "Granddaughter", "Daughter-in-law", "Other"];

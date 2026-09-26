import { isIfsc } from "./validate";

export type IfscInfo = { bank: string; branch: string; city: string; state: string; address: string };

const cache = new Map<string, IfscInfo | null>();

/** Looks up an IFSC in Razorpay's public IFSC directory (open data, CORS enabled). Only the code is sent. */
export async function lookupIfsc(code: string): Promise<IfscInfo | null> {
  const c = code.trim().toUpperCase();
  if (!isIfsc(c)) return null;
  if (cache.has(c)) return cache.get(c)!;
  try {
    const r = await fetch(`https://ifsc.razorpay.com/${c}`);
    const info = r.ok ? await r.json() : null;
    const out = info ? { bank: info.BANK, branch: info.BRANCH, city: info.CITY, state: info.STATE, address: info.ADDRESS } : null;
    cache.set(c, out);
    return out;
  } catch {
    return null; // offline or blocked: the family types it
  }
}

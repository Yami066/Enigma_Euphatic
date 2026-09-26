// Read-only Gmail search that runs entirely in this browser.
// Google Identity Services gives a short-lived access token (about 1 hour) for one account at a time.
// Tokens stay in memory, are never sent to our servers, and are revoked on disconnect.
import { config } from "./config";
import { type Finding, findingsFor, type Meta, SOURCES } from "./gmailScan";

declare global {
  interface Window {
    google?: any;
  }
}

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export type GmailAccount = { email: string; token: string; expiresAt: number };
export type GmailScanFailure = { source: string; message: string };
export type GmailScanProgress = { done: number; total: number; failed: number };
export type GmailScanResult = { findings: Finding[]; failures: GmailScanFailure[]; total: number };

export const gmailAvailable = () => Boolean(config.googleClientId);

let gisLoad: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoad ??= new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      gisLoad = null;
      fail(new Error("Couldn't load Google sign-in. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return gisLoad;
}

let client: any = null;
let pending: { ok: (r: any) => void; fail: (e: Error) => void } | null = null;

/** Load Google's script early, so the click can open the account chooser right away. */
export async function prepareGmail(): Promise<void> {
  if (!gmailAvailable() || client) return;
  await loadGis();
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: config.googleClientId,
    scope: GMAIL_SCOPE,
    callback: (resp: any) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (resp.error) p.fail(new Error(resp.error_description || resp.error));
      else if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, GMAIL_SCOPE))
        p.fail(new Error("Please allow 'Read your email' on Google's screen, so we can search it."));
      else p.ok(resp);
    },
    error_callback: (err: any) => {
      const p = pending;
      pending = null;
      p?.fail(new Error(err?.type === "popup_closed" ? "The Google window was closed." : err?.message || "Google sign-in didn't finish."));
    },
  });
}

/** Opens Google's account chooser. Call it straight from a click. */
export function connectGmail(): Promise<GmailAccount> {
  if (!client) return Promise.reject(new Error("Google sign-in is still loading. Try again in a second."));
  if (pending) return Promise.reject(new Error("A Google sign-in window is already open."));
  return new Promise((ok, fail) => {
    pending = {
      fail,
      ok: async (resp) => {
        try {
          const lifetime = (Number(resp.expires_in) || 3600) * 1000;
          const profile = await gget(resp.access_token, "profile", 0, undefined, Date.now() + lifetime);
          ok({ email: profile.emailAddress, token: resp.access_token, expiresAt: Date.now() + lifetime });
        } catch (e) {
          fail(e as Error);
        }
      },
    };
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export function disconnectGmail(acc: GmailAccount): void {
  if (!acc.token) return;
  try {
    window.google?.accounts?.oauth2?.revoke(acc.token, () => {});
  } catch {
    /* already expired or Google Identity Services has gone away */
  }
}

function abortError(): DOMException {
  return new DOMException("Gmail scan stopped.", "AbortError");
}

function ensureActive(signal?: AbortSignal, expiresAt?: number): void {
  if (signal?.aborted) throw abortError();
  if (expiresAt !== undefined && Date.now() >= expiresAt) throw new Error("Gmail access expired. Connect the account again.");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const id = window.setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      window.clearTimeout(id);
      reject(abortError());
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

async function gget(token: string, path: string, attempt = 0, signal?: AbortSignal, expiresAt?: number): Promise<any> {
  ensureActive(signal, expiresAt);
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  ensureActive(signal, expiresAt);
  if (r.status === 401) throw new Error("Gmail access expired. Connect the account again.");
  if ((r.status === 429 || r.status === 403 || r.status >= 500) && attempt < 4) {
    await delay(400 * 2 ** attempt + Math.random() * 200, signal);
    return gget(token, path, attempt + 1, signal, expiresAt);
  }
  if (!r.ok) throw new Error(`Gmail said ${r.status}. Try again in a minute.`);
  return r.json();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function messageDate(message: any, headers: any[]): string {
  const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "date")?.value;
  if (fromHeader) return fromHeader;
  const timestamp = Number(message.internalDate || 0);
  return timestamp > 0 ? new Date(timestamp).toISOString() : "";
}

/**
 * Runs every search on one account. It reads only a small set of message headers.
 * A failed search is reported while the other searches continue; disconnect aborts the entire scan.
 */
export async function scanGmail(
  acc: GmailAccount,
  onProgress?: (progress: GmailScanProgress) => void,
  signal?: AbortSignal,
): Promise<GmailScanResult> {
  ensureActive(signal, acc.expiresAt);
  let done = 0;
  let failed = 0;
  const failures: GmailScanFailure[] = [];
  const results = await mapLimit(SOURCES, 3, async (src) => {
    try {
      ensureActive(signal, acc.expiresAt);
      // Several headers are sampled for fixed senders so one promotional email cannot hide a real statement.
      const list = await gget(acc.token, `messages?q=${encodeURIComponent(src.q)}&maxResults=${src.bySender ? 15 : 5}`, 0, signal, acc.expiresAt);
      const ids: string[] = [...new Set<string>((list.messages ?? []).map((m: any) => String(m.id)).filter((id: string) => Boolean(id)))];
      const metas: Meta[] = await mapLimit(ids, 3, async (id) => {
        const m = await gget(acc.token, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, 0, signal, acc.expiresAt);
        const hs = m.payload?.headers ?? [];
        const get = (n: string) => hs.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
        return { id: String(m.id || id), from: get("From"), subject: get("Subject"), date: messageDate(m, hs) };
      });
      return findingsFor(src, metas, Number(list.resultSizeEstimate || ids.length), acc.email);
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw e;
      failed += 1;
      failures.push({ source: src.label, message: e instanceof Error ? e.message : String(e) });
      return [];
    } finally {
      done += 1;
      onProgress?.({ done, total: SOURCES.length, failed });
    }
  });
  ensureActive(signal, acc.expiresAt);
  return { findings: results.flat(), failures, total: SOURCES.length };
}

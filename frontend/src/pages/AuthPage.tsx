import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch, FileSignature, PlayCircle, Timer } from "lucide-react";
import { Button, ErrorNote, Field, inputCls } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { api } from "../lib/api";
import { brand, config, demoAvailable } from "../lib/config";
import { currentEmail, doConfirm, doResend, doSignIn, doSignOut, doSignUp } from "../lib/auth";

export default function AuthPage({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"in" | "up" | "code">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");

  async function finishSignIn() {
    const step = await doSignIn(email, password);
    if (step === "CONFIRM_SIGN_UP") {
      setMode("code");
      return;
    }
    const e = await currentEmail();
    if (e) onSignedIn(e);
  }

  // Signs in to the shared sandbox account and lands on a freshly built sample case.
  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      try {
        await doSignOut();
      } catch {
        /* nobody was signed in */
      }
      try {
        await doSignIn(config.demo.email, config.demo.password);
      } catch (authErr) {
        if (config.demo.email !== "demo@euphatics.example") {
          await doSignIn("demo@euphatics.example", config.demo.password);
        } else {
          throw authErr;
        }
      }
      const { caseId } = await api<{ caseId: string }>("POST", "/demo/case");
      window.location.assign(`/cases/${caseId}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "in") await finishSignIn();
      else if (mode === "up") {
        const step = await doSignUp(email, password);
        if (step === "CONFIRM_SIGN_UP") {
          setMode("code");
          setNote(t("auth.codeSent", "We emailed you a 6-digit code."));
        } else await finishSignIn();
      } else {
        await doConfirm(email, code);
        await finishSignIn();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const hi = i18n.language === "hi";
  const points = [
    { icon: <FileSearch className="size-5" />, title: t("auth.p1t", "Find"), text: t("auth.p1", "We read the family's bank statements and spot shares, mutual funds, insurance and deposits nobody knew about.") },
    { icon: <FileSignature className="size-5" />, title: t("auth.p2t", "Fill"), text: t("auth.p2", "RBI's standard claim forms, filled once from your family's details, ready to print and sign.") },
    { icon: <Timer className="size-5" />, title: t("auth.p3t", "Follow up"), text: t("auth.p3", "Banks must settle in 15 days. We track the clock, work out compensation and draft the letters.") },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <span className="text-lg font-semibold text-brand-800">{hi ? brand.appNameHi : brand.appName}</span>
        <LangToggle />
      </div>
      <div className="mx-auto grid max-w-5xl gap-8 px-5 pb-12 md:grid-cols-2 md:items-center md:pt-8">
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">
            {t("auth.headline", "When someone you love is gone, the paperwork shouldn't take the rest of you.")}
          </h1>
          <p className="mt-3 text-muted">{hi ? brand.taglineHi : brand.tagline}</p>
          <ul className="mt-6 space-y-4">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-100">
                  {p.icon}
                </span>
                <span>
                  <span className="font-semibold">{p.title}. </span>
                  <span className="text-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-line">
          <div className="mb-5 flex gap-2 rounded-xl bg-stone-100 p-1 text-sm">
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`focus-ring flex-1 rounded-lg py-2 font-medium ${mode === m || (mode === "code" && m === "up") ? "bg-white shadow-sm" : "text-muted"}`}
              >
                {m === "in" ? t("auth.signIn", "Sign in") : t("auth.create", "Create account")}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            <Field label={t("auth.email", "Email")}>
              <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {mode !== "code" && (
              <Field label={t("auth.password", "Password")} hint={mode === "up" ? t("auth.pwHint", "At least 8 characters with a number.") : undefined}>
                <input
                  className={inputCls}
                  type="password"
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
            {mode === "code" && (
              <>
                <Field label={t("auth.code", "Verification code")} hint={note}>
                  <input className={inputCls} inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <Field label={t("auth.password", "Password")}>
                  <input className={inputCls} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <button type="button" className="text-sm text-brand-700 underline" onClick={() => doResend(email).then(() => setNote(t("auth.resent", "Code sent again.")))}>
                  {t("auth.resend", "Send the code again")}
                </button>
              </>
            )}
            <ErrorNote error={error} />
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {mode === "in" ? t("auth.signIn", "Sign in") : mode === "up" ? t("auth.create", "Create account") : t("auth.verify", "Verify and continue")}
            </Button>
            {demoAvailable() && (
              <div className="space-y-2 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  loading={busy}
                  icon={<PlayCircle className="size-5" />}
                  onClick={startDemo}
                >
                  {t("auth.demo", "Open the demo, no sign-up")}
                </Button>
                <p className="text-center text-xs text-soft">
                  {t("auth.demoHint", "A sample case with an invented family, their accounts and findings. You can also open a new case inside it.")}
                </p>
              </div>
            )}
            <p className="text-center text-xs text-soft">{t("auth.privacy", "Your documents stay private to your family. Aadhaar numbers are masked automatically.")}</p>
          </div>
        </form>
      </div>
    </div>
  );
}

import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch, FileSignature, Mail, PlayCircle, Smartphone, Timer } from "lucide-react";
import { Button, ErrorNote, Field, inputCls } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { api } from "../lib/api";
import { brand, config, demoAvailable, isFirebaseConfigured } from "../lib/config";
import {
  currentEmail,
  doConfirm,
  doGoogleSignIn,
  doPasswordReset,
  doResend,
  doSendPhoneOtp,
  doSignIn,
  doSignOut,
  doSignUp,
  doVerifyPhoneOtp,
} from "../lib/auth";
import { formatFirebaseError } from "../lib/firebase";
import { checkMobile } from "../lib/validate";

export default function AuthPage({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const { t, i18n } = useTranslation();
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
  const [mode, setMode] = useState<"in" | "up" | "code" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");

  const hi = i18n.language === "hi";

  async function finishSignIn() {
    const step = await doSignIn(email, password);
    if (step === "CONFIRM_SIGN_UP") {
      setMode("code");
      return;
    }
    const e = await currentEmail();
    if (e) onSignedIn(e);
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const e = await doGoogleSignIn();
      if (e) onSignedIn(e);
    } catch (e) {
      setError(formatFirebaseError(e, hi));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendOtp(ev?: FormEvent) {
    if (ev) ev.preventDefault();
    const check = checkMobile(phone);
    if (check && !check.ok) {
      setError(hi ? check.hi : check.en);
      return;
    }
    if (!phone.trim()) {
      setError(hi ? "कृपया अपना 10 अंकों का मोबाइल नंबर दर्ज करें।" : "Please enter your 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await doSendPhoneOtp(phone, "recaptcha-container");
      setOtpSent(true);
      setNote(hi ? `${phone} पर 6 अंकों का OTP भेजा गया है।` : `6-digit OTP sent to ${phone}.`);
    } catch (e) {
      setError(formatFirebaseError(e, hi));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(ev?: FormEvent) {
    if (ev) ev.preventDefault();
    if (phoneOtp.trim().length !== 6) {
      setError(hi ? "कृपया 6 अंकों का OTP दर्ज करें।" : "Please enter the 6-digit OTP code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const verifiedPhone = await doVerifyPhoneOtp(phoneOtp);
      if (verifiedPhone) onSignedIn(verifiedPhone);
    } catch (e) {
      setError(formatFirebaseError(e, hi));
    } finally {
      setBusy(false);
    }
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
    if (authMethod === "phone") {
      if (otpSent) {
        await handleVerifyOtp();
      } else {
        await handleSendOtp();
      }
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (mode === "in") {
        await finishSignIn();
      } else if (mode === "up") {
        if (password.length < 6) {
          throw new Error(hi ? "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।" : "Password must be at least 6 characters.");
        }
        const step = await doSignUp(email, password);
        if (step === "CONFIRM_SIGN_UP") {
          setMode("code");
          setNote(t("auth.codeSent", "We emailed you a 6-digit code."));
        } else {
          await finishSignIn();
        }
      } else if (mode === "reset") {
        await doPasswordReset(email);
        setNote(hi ? "पासवर्ड रीसेट लिंक आपके ईमेल पर भेज दिया गया है।" : "Password reset email sent. Please check your inbox.");
        setMode("in");
      } else {
        await doConfirm(email, code);
        await finishSignIn();
      }
    } catch (e) {
      setError(formatFirebaseError(e, hi));
    } finally {
      setBusy(false);
    }
  }

  const mobileCheck = phone ? checkMobile(phone) : null;

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
          {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
          <div id="recaptcha-container"></div>

          {/* Toggle between Email and Phone OTP */}
          <div className="mb-4 flex border-b border-line pb-3 text-sm">
            <button
              type="button"
              onClick={() => {
                setAuthMethod("email");
                setError(null);
                setNote("");
              }}
              className={`flex items-center gap-1.5 pb-2 font-medium transition-colors border-b-2 -mb-[13px] ${
                authMethod === "email"
                  ? "border-brand-600 text-brand-700 font-semibold"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Mail className="size-4" />
              {t("auth.emailOption", "Email")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod("phone");
                setError(null);
                setNote("");
              }}
              className={`ml-5 flex items-center gap-1.5 pb-2 font-medium transition-colors border-b-2 -mb-[13px] ${
                authMethod === "phone"
                  ? "border-brand-600 text-brand-700 font-semibold"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Smartphone className="size-4" />
              {t("auth.phoneOption", "Mobile OTP")}
            </button>
          </div>

          {authMethod === "email" ? (
            <>
              <div className="mb-5 flex gap-2 rounded-xl bg-stone-100 p-1 text-sm">
                {(["in", "up"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(null);
                      setNote("");
                    }}
                    className={`focus-ring flex-1 rounded-lg py-2 font-medium ${mode === m || (mode === "code" && m === "up") ? "bg-white shadow-sm" : "text-muted"}`}
                  >
                    {m === "in" ? t("auth.signIn", "Sign in") : t("auth.create", "Create account")}
                  </button>
                ))}
              </div>
              {note && (
                <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
                  {note}
                </div>
              )}
              <div className="space-y-4">
                <Field label={t("auth.email", "Email")}>
                  <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                {mode !== "code" && mode !== "reset" && (
                  <Field label={t("auth.password", "Password")} hint={mode === "up" ? t("auth.pwHint", "At least 6 characters.") : undefined}>
                    <input
                      className={inputCls}
                      type="password"
                      autoComplete={mode === "up" ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                )}
                {mode === "in" && isFirebaseConfigured() && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-brand-700 hover:underline"
                      onClick={() => {
                        setMode("reset");
                        setError(null);
                      }}
                    >
                      {t("auth.forgotPassword", "Forgot password?")}
                    </button>
                  </div>
                )}
                {mode === "reset" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-brand-700 hover:underline"
                      onClick={() => {
                        setMode("in");
                        setError(null);
                      }}
                    >
                      {t("auth.backToSignIn", "Back to sign in")}
                    </button>
                  </div>
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
                  {mode === "in" ? t("auth.signIn", "Sign in") : mode === "up" ? t("auth.create", "Create account") : mode === "reset" ? t("auth.sendReset", "Send password reset link") : t("auth.verify", "Verify and continue")}
                </Button>
                {isFirebaseConfigured() && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={handleGoogleSignIn}
                    loading={busy}
                  >
                    <svg className="size-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    {t("auth.google", "Continue with Google")}
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* Phone Number OTP Flow */
            <div className="space-y-4">
              {note && (
                <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
                  {note}
                </div>
              )}
              {!otpSent ? (
                <>
                  <Field
                    label={t("auth.mobileNumber", "Mobile Number")}
                    hint={mobileCheck && !mobileCheck.ok ? (hi ? mobileCheck.hi : mobileCheck.en) : t("auth.mobileHint", "10-digit Indian mobile number")}
                  >
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-xl border border-r-0 border-line bg-stone-50 px-3 text-sm text-muted">
                        +91
                      </span>
                      <input
                        className={`${inputCls} rounded-l-none`}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="9876543210"
                        maxLength={10}
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      />
                    </div>
                  </Field>
                  <ErrorNote error={error} />
                  <Button type="submit" size="lg" className="w-full" loading={busy}>
                    {t("auth.sendOtp", "Send OTP via SMS")}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{t("auth.otpSentTo", "OTP sent to:")} <strong>+91 {phone}</strong></span>
                    <button
                      type="button"
                      className="text-brand-700 underline"
                      onClick={() => {
                        setOtpSent(false);
                        setPhoneOtp("");
                        setError(null);
                        setNote("");
                      }}
                    >
                      {t("auth.changeNumber", "Change number")}
                    </button>
                  </div>
                  <Field label={t("auth.enterOtp", "Enter 6-digit OTP")}>
                    <input
                      className={`${inputCls} text-center tracking-widest text-lg font-mono`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      autoFocus
                      required
                      value={phoneOtp}
                      onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-brand-700 underline"
                      onClick={handleSendOtp}
                    >
                      {t("auth.resendOtp", "Resend OTP")}
                    </button>
                  </div>
                  <ErrorNote error={error} />
                  <Button type="submit" size="lg" className="w-full" loading={busy}>
                    {t("auth.verifyAndSignIn", "Verify & Sign In")}
                  </Button>
                </>
              )}
            </div>
          )}

          {demoAvailable() && (
            <div className="mt-5 space-y-2 border-t border-line pt-4">
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
          <p className="mt-4 text-center text-xs text-soft">{t("auth.privacy", "Your documents stay private to your family. Aadhaar numbers are masked automatically.")}</p>
        </form>
      </div>
    </div>
  );
}

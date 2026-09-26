import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Lock, Mail, Phone, PlayCircle, ShieldCheck, UserPlus, X } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { config, demoAvailable } from "../../lib/config";
import {
  currentEmail,
  doConfirm,
  doResend,
  doSendPhoneOtp,
  doSignIn,
  doSignOut,
  doSignUp,
  doVerifyPhoneOtp,
} from "../../lib/auth";

export function SignInModal() {
  const { authModalOpen, setAuthModalOpen, loginUser, showToast, setCurrentView } = useApp();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [mode, setMode] = useState<"in" | "up" | "confirm">("in");
  const [useMockData, setUseMockData] = useState(false);

  // Email state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  // Phone state
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState(["", "", "", "", "", ""]);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  // Status state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const handleAuthSuccess = async (userEmail: string, loadMock: boolean = useMockData) => {
    loginUser(userEmail, loadMock);
    setAuthModalOpen(false);
    setCurrentView("dashboard");
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === "in") {
        const step = await doSignIn(email, password);
        if (step === "CONFIRM_SIGN_UP") {
          setMode("confirm");
          showToast("Please enter the verification code sent to your email.");
          return;
        }
        const activeEmail = (await currentEmail()) || email.trim().toLowerCase();
        await handleAuthSuccess(activeEmail);
      } else if (mode === "up") {
        const step = await doSignUp(email, password);
        if (step === "CONFIRM_SIGN_UP") {
          setMode("confirm");
          showToast("Account created. Please enter the verification code sent to your email.");
        } else {
          const activeEmail = (await currentEmail()) || email.trim().toLowerCase();
          await handleAuthSuccess(activeEmail);
        }
      } else if (mode === "confirm") {
        await doConfirm(email, code);
        await doSignIn(email, password);
        const activeEmail = (await currentEmail()) || email.trim().toLowerCase();
        await handleAuthSuccess(activeEmail);
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      await doSendPhoneOtp(phone);
      setPhoneOtpSent(true);
      showToast(`Verification code sent to ${phone}. (Dev OTP: 123456)`);
    } catch (err: any) {
      setError(err?.message || "Failed to send OTP.");
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const enteredOtp = phoneOtp.join("");
    if (enteredOtp.length < 6) {
      setError("Please enter the full 6-digit OTP.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const verifiedPhone = await doVerifyPhoneOtp(enteredOtp);
      await handleAuthSuccess(verifiedPhone);
    } catch (err: any) {
      setError(err?.message || "Invalid OTP. Use 123456 for local testing.");
    } finally {
      setBusy(false);
    }
  };

  const handleDemoSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await doSignOut();
      const demoEmail = config.demo.email || "demo@euphatics.example";
      const demoPw = config.demo.password || "SampleCase2026";
      try {
        await doSignIn(demoEmail, demoPw);
      } catch {
        localStorage.setItem("euphatics_token", "demo-token");
      }
      await handleAuthSuccess(demoEmail, true);
    } catch (err: any) {
      setError(err?.message || "Could not log into demo mode.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4F3F38]/40 p-4 backdrop-blur-sm">
      <div className="app-card relative w-full max-w-md shadow-modal animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={() => setAuthModalOpen(false)}
          className="absolute right-4 top-4 text-[#6B6358] hover:text-[#4F3F38]"
        >
          <X className="size-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-[#4F3F38] text-sm font-bold text-[#FFB077]">
            AL
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#4F3F38]">
              {mode === "up" ? "Create Euphatic Account" : mode === "confirm" ? "Confirm Account" : "Sign In to Euphatic"}
            </h2>
            <div className="inline-flex items-center gap-1 rounded-full bg-[#F5F3EC] px-2 py-0.5 text-[11px] font-semibold text-[#6B6358]">
              <ShieldCheck className="size-3 text-[#B7C497]" />
              {config.userPoolId ? "AWS Cognito Protected" : "RBI Directions 2025 Verified Vault"}
            </div>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Method Switcher */}
        {mode !== "confirm" && (
          <div className="mb-4 flex gap-2 rounded-lg bg-[#F5F3EC] p-1">
            <button
              type="button"
              onClick={() => {
                setMethod("email");
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                method === "email" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#6B6358]"
              }`}
            >
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod("phone");
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                method === "phone" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#6B6358]"
              }`}
            >
              Mobile Phone (OTP)
            </button>
          </div>
        )}

        {/* ── EMAIL METHOD ── */}
        {method === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode !== "confirm" && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode("in");
                    setError(null);
                  }}
                  className={`flex-1 border-b-2 py-1 font-semibold transition-colors ${
                    mode === "in" ? "border-[#FFB077] text-[#4F3F38]" : "border-transparent text-[#6B6358]"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("up");
                    setError(null);
                  }}
                  className={`flex-1 border-b-2 py-1 font-semibold transition-colors ${
                    mode === "up" ? "border-[#FFB077] text-[#4F3F38]" : "border-transparent text-[#6B6358]"
                  }`}
                >
                  Create New Account
                </button>
              </div>
            )}

            <div>
              <label className="app-label">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 size-4 text-[#6B6358]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="heir@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="app-input pl-10"
                  disabled={busy || mode === "confirm"}
                />
              </div>
            </div>

            <div>
              <label className="app-label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 size-4 text-[#6B6358]" />
                <input
                  type="password"
                  required
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  placeholder={mode === "up" ? "At least 8 characters" : "••••••••"}
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="app-input pl-10"
                  disabled={busy}
                />
              </div>
              {mode === "up" && (
                <span className="app-helper">Must be at least 8 characters with letters & numbers.</span>
              )}
            </div>

            {mode === "confirm" && (
              <div>
                <label className="app-label">Verification Code (Sent to email)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 size-4 text-[#6B6358]" />
                  <input
                    type="text"
                    required
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="app-input pl-10 font-mono tracking-widest"
                    disabled={busy}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => doResend(email).then(() => showToast("Verification code resent."))}
                    className="text-[#4F3F38] underline"
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("in")}
                    className="text-[#6B6358] hover:text-[#4F3F38]"
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#6B6358] hover:text-[#4F3F38]">
              <input
                type="checkbox"
                checked={useMockData}
                onChange={(e) => setUseMockData(e.target.checked)}
                className="size-4 rounded border-[#EDE9E2] text-[#4F3F38]"
              />
              <span>Pre-load sample mock estate data (SBI, HDFC, Nominees)</span>
            </label>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? (
                "Processing..."
              ) : mode === "in" ? (
                "Sign In"
              ) : mode === "up" ? (
                "Create Account"
              ) : (
                "Verify Code & Enter"
              )}
            </button>
          </form>
        )}

        {/* ── PHONE METHOD ── */}
        {method === "phone" && (
          <>
            {!phoneOtpSent ? (
              <form onSubmit={handlePhoneSendOtp} className="space-y-4">
                <div>
                  <label className="app-label">Indian Mobile Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 size-4 text-[#6B6358]" />
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="app-input pl-10 font-mono"
                      disabled={busy}
                    />
                  </div>
                  <span className="app-helper">Enter 10-digit mobile number for statutory OTP login.</span>
                </div>

                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? "Sending Code..." : "Send Verification OTP"}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePhoneVerifyOtp} className="space-y-5">
                <div className="rounded-lg bg-[#F5F3EC] p-3 text-xs text-[#6B6358]">
                  Enter 6-digit code sent to <strong className="text-[#4F3F38]">{phone}</strong>
                  <button
                    type="button"
                    onClick={() => setPhoneOtpSent(false)}
                    className="ml-2 font-semibold text-[#4F3F38] underline"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="app-label">Enter 6-Digit Security Code (Dev: 123456)</label>
                  <div className="flex justify-between gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        maxLength={1}
                        className="app-input size-12 text-center font-mono text-lg font-bold"
                        value={phoneOtp[i]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = [...phoneOtp];
                          next[i] = val;
                          setPhoneOtp(next);
                          if (val && i < 5) {
                            const nextInput = document.getElementById(`otp-${i + 1}`);
                            nextInput?.focus();
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#6B6358] hover:text-[#4F3F38]">
                  <input
                    type="checkbox"
                    checked={useMockData}
                    onChange={(e) => setUseMockData(e.target.checked)}
                    className="size-4 rounded border-[#EDE9E2] text-[#4F3F38]"
                  />
                  <span>Pre-load sample mock estate data (SBI, HDFC, Nominees)</span>
                </label>

                <button type="submit" disabled={busy} className="btn-primary w-full">
                  <CheckCircle2 className="size-4" />
                  {busy ? "Verifying..." : "Verify & Enter Workspace"}
                </button>
              </form>
            )}
          </>
        )}

        {/* Demo Account Quick Access */}
        <div className="mt-5 border-t border-[#EDE9E2] pt-4">
          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#ACA986]/40 bg-[#F5F3EC]/80 py-2 text-xs font-semibold text-[#4F3F38] hover:bg-[#F5F3EC] transition-colors"
          >
            <PlayCircle className="size-4 text-[#FFB077]" />
            Quick Sign In with Demo Sandbox
          </button>
        </div>

        <div className="mt-4 text-center text-[11px] text-[#6B6358]">
          By continuing, you confirm that you are a legal heir, executor, or nominee authorized under applicable Indian laws.
        </div>
      </div>
    </div>
  );
}

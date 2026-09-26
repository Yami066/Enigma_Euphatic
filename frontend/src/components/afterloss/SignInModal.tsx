import { useState } from "react";
import { CheckCircle2, Lock, Mail, Phone, ShieldCheck, X } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function SignInModal() {
  const { authModalOpen, setAuthModalOpen, setIsAuthenticated, showToast } = useApp();
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  if (!authModalOpen) return null;

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) return;
    setOtpSent(true);
    showToast(`Verification code sent to ${identifier}`);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticated(true);
    setAuthModalOpen(false);
    showToast("Successfully authenticated. Welcome back to AfterLoss.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4F3F38]/40 p-4 backdrop-blur-sm">
      <div className="app-card relative w-full max-w-md shadow-modal animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={() => setAuthModalOpen(false)}
          className="absolute right-4 top-4 text-[#8A7F76] hover:text-[#4F3F38]"
        >
          <X className="size-5" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-[#4F3F38] text-sm font-bold text-[#FFB077]">
            AL
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#4F3F38]">Sign In to AfterLoss</h2>
            <div className="inline-flex items-center gap-1 rounded-full bg-[#F5F3EC] px-2 py-0.5 text-[11px] font-semibold text-[#8A7F76]">
              <ShieldCheck className="size-3 text-[#B7C497]" />
              RBI Directions 2025 Verified Vault
            </div>
          </div>
        </div>

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="flex gap-2 rounded-lg bg-[#F5F3EC] p-1">
              <button
                type="button"
                onClick={() => setMethod("phone")}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  method === "phone" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#8A7F76]"
                }`}
              >
                Mobile Phone (OTP)
              </button>
              <button
                type="button"
                onClick={() => setMethod("email")}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  method === "email" ? "bg-white text-[#4F3F38] shadow-sm" : "text-[#8A7F76]"
                }`}
              >
                Work / Personal Email
              </button>
            </div>

            <div>
              <label className="app-label">
                {method === "phone" ? "Indian Mobile Number" : "Email Address"}
              </label>
              <div className="relative">
                {method === "phone" ? (
                  <Phone className="absolute left-3 top-3.5 size-4 text-[#8A7F76]" />
                ) : (
                  <Mail className="absolute left-3 top-3.5 size-4 text-[#8A7F76]" />
                )}
                <input
                  type={method === "phone" ? "tel" : "email"}
                  required
                  placeholder={method === "phone" ? "+91 98765 43210" : "heir@example.com"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="app-input pl-10"
                />
              </div>
              <span className="app-helper">
                Only authenticated heirs and claimants receive access to bank claim annexures.
              </span>
            </div>

            <button type="submit" className="btn-primary w-full">
              Send Verification OTP
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="rounded-lg bg-[#F5F3EC] p-3 text-xs text-[#8A7F76]">
              Enter the 6-digit code sent to <strong className="text-[#4F3F38]">{identifier}</strong>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="ml-2 font-semibold text-[#4F3F38] underline"
              >
                Change
              </button>
            </div>

            <div>
              <label className="app-label">Enter 6-Digit Security Code</label>
              <div className="flex justify-between gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    maxLength={1}
                    className="app-input size-12 text-center font-mono text-lg font-bold"
                    value={otp[i]}
                    onChange={(e) => {
                      const val = e.target.value;
                      const next = [...otp];
                      next[i] = val;
                      setOtp(next);
                      if (val && i < 5) {
                        const nextInput = document.getElementById(`otp-${i + 1}`);
                        nextInput?.focus();
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            <button type="submit" className="btn-primary w-full">
              <CheckCircle2 className="size-4" />
              Verify & Enter Workspace
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-[#EDE9E2] pt-4 text-center text-xs text-[#8A7F76]">
          By continuing, you confirm that you are a legal heir, executor, or nominee authorized under applicable Indian laws.
        </div>
      </div>
    </div>
  );
}

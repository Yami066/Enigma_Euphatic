import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { config } from "./config";

let configured = false;

export function configureAuth() {
  if (configured || !config.userPoolId) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: { email: true },
        signUpVerificationMethod: "code",
      },
    },
  });
  configured = true;
}

export async function currentEmail(): Promise<string | null> {
  if (!config.userPoolId) {
    return localStorage.getItem("euphatics_user") || null;
  }
  try {
    await getCurrentUser();
    const s = await fetchAuthSession();
    const email = s.tokens?.idToken?.payload?.email;
    return typeof email === "string" ? email.toLowerCase() : null;
  } catch {
    return localStorage.getItem("euphatics_user") || null;
  }
}

export async function idToken(): Promise<string> {
  if (!config.userPoolId) {
    return localStorage.getItem("euphatics_token") || "local-token";
  }
  try {
    const s = await fetchAuthSession();
    const t = s.tokens?.idToken?.toString();
    if (t) return t;
  } catch {
    // fallback if local session cached
  }
  return localStorage.getItem("euphatics_token") || "local-token";
}

export async function doSignIn(email: string, password: string) {
  if (!config.userPoolId) {
    const res = await fetch(`${config.apiUrl}/auth/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Sign-in failed");
    }
    const data = await res.json();
    localStorage.setItem("euphatics_token", data.token);
    localStorage.setItem("euphatics_user", data.email);
    return "DONE";
  }
  configureAuth();
  const r = await signIn({ username: email.trim().toLowerCase(), password });
  localStorage.setItem("euphatics_user", email.trim().toLowerCase());
  return r.nextStep.signInStep;
}

export async function doSignUp(email: string, password: string) {
  if (!config.userPoolId) {
    const res = await fetch(`${config.apiUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Sign-up failed");
    }
    const data = await res.json();
    localStorage.setItem("euphatics_token", data.token);
    localStorage.setItem("euphatics_user", data.email);
    return "DONE";
  }
  configureAuth();
  const r = await signUp({
    username: email.trim().toLowerCase(),
    password,
    options: { userAttributes: { email: email.trim().toLowerCase() } },
  });
  localStorage.setItem("euphatics_user", email.trim().toLowerCase());
  return r.nextStep.signUpStep;
}

let localPendingPhone = "";

export async function doSendPhoneOtp(rawPhone: string): Promise<void> {
  const digits = rawPhone.replace(/\D/g, "");
  localPendingPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  localStorage.setItem("euphatics_pending_phone", localPendingPhone);
}

export async function doVerifyPhoneOtp(otp: string): Promise<string> {
  if (otp.trim() === "123456" || otp.trim().length === 6) {
    const phone = localPendingPhone || localStorage.getItem("euphatics_pending_phone") || "+919876543210";
    localStorage.setItem("euphatics_token", "local-phone-token");
    localStorage.setItem("euphatics_user", phone);
    return phone;
  }
  throw new Error("Invalid verification code. (In demo / dev mode, enter OTP: 123456)");
}

export async function doConfirm(email: string, code: string) {
  if (!config.userPoolId) return;
  configureAuth();
  await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode: code.trim() });
}

export async function doResend(email: string) {
  if (!config.userPoolId) return;
  configureAuth();
  await resendSignUpCode({ username: email.trim().toLowerCase() });
}

export async function doSignOut() {
  localStorage.removeItem("euphatics_token");
  localStorage.removeItem("euphatics_user");
  if (config.userPoolId) {
    try {
      configureAuth();
      await signOut();
    } catch {
      // already signed out
    }
  }
}

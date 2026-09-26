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
import { config, isFirebaseConfigured } from "./config";
import {
  firebaseGoogleSignIn,
  firebaseResetPassword,
  firebaseSignIn,
  firebaseSignOut,
  firebaseSignUp,
  getFirebaseAuth,
  getFirebaseToken,
  getFirebaseUser,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "./firebase";

let configured = false;

export function configureAuth() {
  if (isFirebaseConfigured()) {
    getFirebaseAuth();
    return;
  }
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
  if (isFirebaseConfigured()) {
    const user = getFirebaseUser();
    if (user?.email) return user.email.toLowerCase();
    return localStorage.getItem("euphatics_user") || null;
  }
  if (!config.userPoolId) {
    return localStorage.getItem("euphatics_user") || null;
  }
  try {
    await getCurrentUser();
    const s = await fetchAuthSession();
    const email = s.tokens?.idToken?.payload?.email;
    return typeof email === "string" ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function idToken(): Promise<string> {
  if (isFirebaseConfigured()) {
    const t = await getFirebaseToken();
    if (t) return t;
    return localStorage.getItem("euphatics_token") || "local-token";
  }
  if (!config.userPoolId) {
    return localStorage.getItem("euphatics_token") || "local-token";
  }
  const s = await fetchAuthSession();
  const t = s.tokens?.idToken?.toString();
  if (!t) throw new Error("not signed in");
  return t;
}

export async function doSignIn(email: string, password: string) {
  if (isFirebaseConfigured()) {
    const res = await firebaseSignIn(email, password);
    localStorage.setItem("euphatics_token", res.token);
    localStorage.setItem("euphatics_user", res.email);
    return "DONE";
  }
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
  const r = await signIn({ username: email.trim().toLowerCase(), password });
  return r.nextStep.signInStep;
}

export async function doSignUp(email: string, password: string) {
  if (isFirebaseConfigured()) {
    const res = await firebaseSignUp(email, password);
    localStorage.setItem("euphatics_token", res.token);
    localStorage.setItem("euphatics_user", res.email);
    return "DONE";
  }
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
  const r = await signUp({
    username: email.trim().toLowerCase(),
    password,
    options: { userAttributes: { email: email.trim().toLowerCase() } },
  });
  return r.nextStep.signUpStep;
}

export async function doGoogleSignIn() {
  if (isFirebaseConfigured()) {
    const res = await firebaseGoogleSignIn();
    localStorage.setItem("euphatics_token", res.token);
    localStorage.setItem("euphatics_user", res.email);
    return res.email;
  }
  throw new Error("Google sign-in requires Firebase to be configured");
}

export async function doPasswordReset(email: string) {
  if (isFirebaseConfigured()) {
    await firebaseResetPassword(email);
    return;
  }
  throw new Error("Password reset requires Firebase to be configured");
}

let localPendingPhone = "";

export async function doSendPhoneOtp(rawPhone: string, containerId = "recaptcha-container"): Promise<void> {
  if (isFirebaseConfigured()) {
    await sendPhoneOtp(rawPhone, containerId);
    return;
  }
  // Local development fallback: simulates sending an OTP
  const digits = rawPhone.replace(/\D/g, "");
  localPendingPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  localStorage.setItem("euphatics_pending_phone", localPendingPhone);
}

export async function doVerifyPhoneOtp(otp: string): Promise<string> {
  if (isFirebaseConfigured()) {
    const res = await verifyPhoneOtp(otp);
    localStorage.setItem("euphatics_token", res.token);
    localStorage.setItem("euphatics_user", res.phone);
    return res.phone;
  }
  // Local development fallback
  if (otp.trim() === "123456" || otp.trim().length === 6) {
    const phone = localPendingPhone || localStorage.getItem("euphatics_pending_phone") || "+919876543210";
    localStorage.setItem("euphatics_token", "local-phone-token");
    localStorage.setItem("euphatics_user", phone);
    return phone;
  }
  throw new Error("Invalid verification code (In local dev mode, use OTP: 123456)");
}

export async function doConfirm(email: string, code: string) {
  if (isFirebaseConfigured()) return;
  if (!config.userPoolId) return;
  await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode: code.trim() });
}

export async function doResend(email: string) {
  if (isFirebaseConfigured()) return;
  if (!config.userPoolId) return;
  await resendSignUpCode({ username: email.trim().toLowerCase() });
}

export async function doSignOut() {
  if (isFirebaseConfigured()) {
    await firebaseSignOut();
    localStorage.removeItem("euphatics_token");
    localStorage.removeItem("euphatics_user");
    return;
  }
  if (!config.userPoolId) {
    localStorage.removeItem("euphatics_token");
    localStorage.removeItem("euphatics_user");
    return;
  }
  await signOut();
}

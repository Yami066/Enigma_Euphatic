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
    return null;
  }
}

export async function idToken(): Promise<string> {
  if (!config.userPoolId) {
    return localStorage.getItem("euphatics_token") || "local-token";
  }
  const s = await fetchAuthSession();
  const t = s.tokens?.idToken?.toString();
  if (!t) throw new Error("not signed in");
  return t;
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
  const r = await signIn({ username: email.trim().toLowerCase(), password });
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
  const r = await signUp({
    username: email.trim().toLowerCase(),
    password,
    options: { userAttributes: { email: email.trim().toLowerCase() } },
  });
  return r.nextStep.signUpStep;
}

export async function doConfirm(email: string, code: string) {
  if (!config.userPoolId) return;
  await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode: code.trim() });
}

export async function doResend(email: string) {
  if (!config.userPoolId) return;
  await resendSignUpCode({ username: email.trim().toLowerCase() });
}

export async function doSignOut() {
  if (!config.userPoolId) {
    localStorage.removeItem("euphatics_token");
    localStorage.removeItem("euphatics_user");
    return;
  }
  await signOut();
}

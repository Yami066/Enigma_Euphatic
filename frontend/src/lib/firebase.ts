import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type Auth,
  type User,
} from "firebase/auth";
import { config, isFirebaseConfigured } from "./config";

// Initialize Firebase App
export const app: FirebaseApp | null = isFirebaseConfigured()
  ? (getApps().length === 0 ? initializeApp(config.firebase) : getApps()[0])
  : null;

// Initialize Firebase Auth
export const auth: Auth | null = app ? getAuth(app) : null;

// Initialize Firebase Analytics (supports browser/vite environments)
export let analytics: Analytics | null = null;
if (typeof window !== "undefined" && app && config.firebase.measurementId) {
  isSupported()
    .then((supported) => {
      if (supported && app) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics unsupported in current environment
    });
}

const googleProvider = new GoogleAuthProvider();

let confirmationResult: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

export function getFirebaseAnalytics(): Analytics | null {
  return analytics;
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function formatFirebaseError(err: unknown, hi = false): string {
  const code = (err as { code?: string })?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return hi ? "कृपया एक मान्य ईमेल पता दर्ज करें।" : "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return hi ? "यह ईमेल पहले से पंजीकृत है। कृपया साइन इन करें।" : "This email is already registered. Please sign in instead.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return hi ? "अमान्य क्रेडेंशियल्स। कृपया पुनः प्रयास करें।" : "Invalid credentials. Please try again.";
    case "auth/weak-password":
      return hi ? "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।" : "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return hi ? "बहुत सारे प्रयास किए गए हैं। कृपया थोड़ी देर बाद पुनः प्रयास करें।" : "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":
      return hi ? "साइन इन विंडो बंद कर दी गई।" : "Google sign-in popup was closed before completing.";
    case "auth/invalid-phone-number":
      return hi ? "अमान्य फ़ोन नंबर। कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।" : "Invalid phone number. Please enter a valid 10-digit mobile number.";
    case "auth/invalid-verification-code":
      return hi ? "अमान्य OTP कोड। कृपया 6 अंकों का सही कोड दर्ज करें।" : "Incorrect OTP code. Please check and try again.";
    case "auth/code-expired":
      return hi ? "OTP कोड समाप्त हो गया है। कृपया नया कोड भेजें।" : "The OTP code has expired. Please request a new one.";
    case "auth/quota-exceeded":
      return hi ? "एसएमएस सीमा पार हो गई है। कृपया थोड़ी देर बाद प्रयास करें या परीक्षण नंबर का उपयोग करें।" : "SMS quota exceeded. Please try again later or use test phone numbers in Firebase.";
    case "auth/captcha-check-failed":
      return hi ? "सुरक्षा सत्यापन विफल रहा। कृपया पृष्ठ को रीफ़्रेश करें।" : "reCAPTCHA verification failed. Please refresh and try again.";
    default:
      return (err as Error)?.message || (hi ? "प्रमाणीकरण विफल रहा।" : "Authentication failed.");
  }
}

export async function firebaseSignIn(email: string, pass: string): Promise<{ email: string; token: string }> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase is not configured");
  const cred = await signInWithEmailAndPassword(a, email.trim().toLowerCase(), pass);
  const token = await cred.user.getIdToken();
  return { email: cred.user.email ?? email, token };
}

export async function firebaseSignUp(email: string, pass: string): Promise<{ email: string; token: string }> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase is not configured");
  const cred = await createUserWithEmailAndPassword(a, email.trim().toLowerCase(), pass);
  const token = await cred.user.getIdToken();
  return { email: cred.user.email ?? email, token };
}

export async function firebaseGoogleSignIn(): Promise<{ email: string; token: string }> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase is not configured");
  const cred = await signInWithPopup(a, googleProvider);
  const token = await cred.user.getIdToken();
  return { email: cred.user.email ?? "", token };
}

export async function firebaseSignOut(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await signOut(a);
  confirmationResult = null;
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // ignore
    }
    recaptchaVerifier = null;
  }
}

export async function firebaseResetPassword(email: string): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase is not configured");
  await sendPasswordResetEmail(a, email.trim());
}

/**
 * Initializes invisible reCAPTCHA on the given DOM element ID and sends OTP via SMS.
 */
export async function sendPhoneOtp(rawPhoneNumber: string, containerId = "recaptcha-container"): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error("Firebase is not configured");

  // Format with country code +91 if 10 digits
  const cleanDigits = rawPhoneNumber.replace(/\D/g, "");
  let formatted = rawPhoneNumber.trim();
  if (!formatted.startsWith("+")) {
    formatted = cleanDigits.length === 10 ? `+91${cleanDigits}` : `+${cleanDigits}`;
  }

  // Clear previous verifier if any
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // ignore
    }
    recaptchaVerifier = null;
  }

  recaptchaVerifier = new RecaptchaVerifier(a, containerId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved automatically
    },
  });

  confirmationResult = await signInWithPhoneNumber(a, formatted, recaptchaVerifier);
}

/**
 * Verifies the 6-digit OTP received via SMS and completes sign-in.
 */
export async function verifyPhoneOtp(otp: string): Promise<{ phone: string; token: string }> {
  if (!confirmationResult) {
    throw new Error("No OTP request found. Please request an OTP first.");
  }
  const cred = await confirmationResult.confirm(otp.trim());
  const token = await cred.user.getIdToken();
  const phone = cred.user.phoneNumber || "";
  confirmationResult = null;
  return { phone, token };
}

export async function getFirebaseToken(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a || !a.currentUser) return null;
  return a.currentUser.getIdToken();
}

export function getFirebaseUser(): User | null {
  const a = getFirebaseAuth();
  return a ? a.currentUser : null;
}

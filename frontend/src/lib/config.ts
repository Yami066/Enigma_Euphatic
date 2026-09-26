import brand from "../../config/brand.json";
import integrations from "../../config/integrations.json";

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  userPoolId: (import.meta.env.VITE_USER_POOL_ID as string | undefined) ?? "",
  userPoolClientId: (import.meta.env.VITE_USER_POOL_CLIENT_ID as string | undefined) ?? "",
  region: (import.meta.env.VITE_REGION as string | undefined) ?? "ap-south-1",
  // Public OAuth client ID for "Connect Gmail" (config/integrations.json); empty = the feature stays hidden
  googleClientId: ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || integrations.googleClientId || "").trim(),
  // Shared sandbox account behind "Try the demo". Public by design; it only ever holds invented data.
  demo: { email: (integrations.demo?.email ?? "").trim(), password: integrations.demo?.password ?? "" },
};

export const demoAvailable = () => Boolean(config.demo.email && config.demo.password);

export { brand };

export const isLocal = () => !config.userPoolId || config.apiUrl.includes("localhost") || config.apiUrl.includes("127.0.0.1");

export const isConfigured = () => Boolean(config.apiUrl && (isLocal() || (config.userPoolId && config.userPoolClientId)));

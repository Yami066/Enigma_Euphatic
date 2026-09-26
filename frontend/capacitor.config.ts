import type { CapacitorConfig } from "@capacitor/cli";
import brand from "../config/brand.json";

// Android later: `npm run build && npx cap add android && npx cap sync && npx cap open android`
const config: CapacitorConfig = {
  appId: `in.${brand.codeName}.app`,
  appName: brand.appName,
  webDir: "dist",
  android: { allowMixedContent: false },
};

export default config;

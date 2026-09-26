import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const brandPath = fileURLToPath(new URL("../config/brand.json", import.meta.url));
const brand = JSON.parse(readFileSync(brandPath, "utf-8"));

// Injects the product name from config/brand.json into index.html, so a rename is one line.
function brandHtml(): Plugin {
  return {
    name: "brand-html",
    transformIndexHtml: (html) =>
      html.replaceAll("%APP_NAME%", brand.appName).replaceAll("%TAGLINE%", brand.tagline).replaceAll("%PRIMARY%", brand.colors.primary),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHtml()],
  server: { port: 5173, fs: { allow: [".."] } },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
});

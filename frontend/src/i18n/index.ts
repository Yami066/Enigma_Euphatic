import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import hi from "./hi.json";

// English strings live inline as defaults: t("key", "English text"). Hindi comes from hi.json.
const saved = (() => {
  try {
    return localStorage.getItem("lang");
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { hi: { translation: hi } },
  lng: saved === "hi" ? "hi" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function setLang(lang: "en" | "hi") {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem("lang", lang);
  } catch {
    /* private mode: fine */
  }
}

document.documentElement.lang = i18n.language;

export default i18n;

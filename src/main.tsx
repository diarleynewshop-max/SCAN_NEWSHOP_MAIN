import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { applyLightModeClass, getLightModeEnabled } from "./lib/lightMode";
import { applySavedCompanyTheme } from "./lib/companyTheme";

applyLightModeClass(getLightModeEnabled());
applySavedCompanyTheme();

// Em deploy com chunks lazy do Vite, o browser pode segurar um bundle antigo
// e tentar abrir uma rota com arquivo hashado que ja nao existe mais.
// Quando isso acontece, forca um reload unico para pegar o manifest novo.
window.addEventListener("vite:preloadError", () => {
  try {
    const key = "vite-preload-error-reload-once";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {
    // sem sessionStorage, segue no reload best-effort
  }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="newshop-theme">
    <App />
  </ThemeProvider>
);

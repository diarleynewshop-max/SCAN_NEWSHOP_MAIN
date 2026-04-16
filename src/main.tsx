import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { applyLightModeClass, getLightModeEnabled } from "./lib/lightMode";

applyLightModeClass(getLightModeEnabled());

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="newshop-theme">
    <App />
  </ThemeProvider>
);

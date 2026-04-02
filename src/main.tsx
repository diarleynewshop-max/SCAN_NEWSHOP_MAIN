import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// 1. Importe o ThemeProvider que criamos
import { ThemeProvider } from "./components/theme-provider"; 

createRoot(document.getElementById("root")!).render(
  // 2. Envolva o App com o ThemeProvider
  <ThemeProvider defaultTheme="system" storageKey="newshop-theme">
    <App />
  </ThemeProvider>
);

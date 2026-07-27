type EmpresaTema = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";

const LOGIN_STORAGE_KEY = "scan_newshop_login";
const EMPRESA_CLASSES = ["empresa-newshop", "empresa-soye", "empresa-facil", "empresa-sefuly"];

const normalizarEmpresaTema = (empresa?: unknown): EmpresaTema => {
  const value = String(empresa ?? "").toUpperCase();
  if (value.includes("SEFULY")) return "SEFULY";
  if (value.includes("SOYE")) return "SOYE";
  if (value.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
};

export const applyCompanyTheme = (empresa?: unknown) => {
  if (typeof document === "undefined") return;

  const empresaTema = normalizarEmpresaTema(empresa);
  const root = document.documentElement;

  root.classList.remove(...EMPRESA_CLASSES);
  root.classList.add(`empresa-${empresaTema.toLowerCase()}`);
};

export const applySavedCompanyTheme = () => {
  try {
    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
    const login = raw ? JSON.parse(raw) : null;
    applyCompanyTheme(login?.empresa);
  } catch {
    applyCompanyTheme("NEWSHOP");
  }
};

export const getCompanyLogo = (empresa?: unknown): string => {
  const empresaTema = normalizarEmpresaTema(empresa);

  if (empresaTema === "SEFULY") return "/logo-sefuly.jpg";
  if (empresaTema === "FACIL") return "/logo-facil.png";
  if (empresaTema === "SOYE") return "/logo-soye.png";
  return "/logo-newshop.jpg";
};

export const getCompanyName = (empresa?: unknown): string => normalizarEmpresaTema(empresa);

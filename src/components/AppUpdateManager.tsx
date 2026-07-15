import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const PENDING_RETRY_MS = 15 * 1000;
const IDLE_DELAY_MS = 2500;
const UPDATE_PENDING_KEY = "scan:new-version-pending";

const ROTAS_SEGURAS = new Set([
  "/",
  "/dashboard",
  "/analytics",
  "/notificacoes",
  "/usuarios",
]);

function temInteracaoAberta(): boolean {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    active?.getAttribute("contenteditable") === "true"
  ) {
    return true;
  }

  return Boolean(
    document.querySelector('[role="dialog"], [data-radix-dialog-content], [data-state="open"]')
  );
}

function podeAtualizarAgora(pathname: string): boolean {
  return (
    document.visibilityState === "visible" &&
    ROTAS_SEGURAS.has(pathname) &&
    !temInteracaoAberta()
  );
}

export function AppUpdateManager() {
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const aplicarUpdateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const updatePendenteRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const limparTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const tentarAplicarUpdate = () => {
      if (!updatePendenteRef.current || !aplicarUpdateRef.current) return;
      limparTimer();

      timerRef.current = window.setTimeout(() => {
        if (!podeAtualizarAgora(pathnameRef.current)) return;
        updatePendenteRef.current = false;
        try {
          sessionStorage.removeItem(UPDATE_PENDING_KEY);
        } catch {
          // ignore
        }
        void aplicarUpdateRef.current?.(true);
      }, IDLE_DELAY_MS);
    };

    const marcarUpdatePendente = () => {
      updatePendenteRef.current = true;
      try {
        sessionStorage.setItem(UPDATE_PENDING_KEY, "1");
      } catch {
        // ignore
      }
      tentarAplicarUpdate();
    };

    aplicarUpdateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: marcarUpdatePendente,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        window.setInterval(() => {
          if (document.visibilityState === "visible") {
            void registration.update();
          }
        }, CHECK_INTERVAL_MS);
      },
      onRegisterError(error) {
        console.warn("[pwa] falha ao registrar service worker:", error);
      },
    });

    try {
      if (sessionStorage.getItem(UPDATE_PENDING_KEY) === "1") {
        updatePendenteRef.current = true;
      }
    } catch {
      // ignore
    }

    const onPossibleIdle = () => tentarAplicarUpdate();
    window.addEventListener("focus", onPossibleIdle);
    document.addEventListener("visibilitychange", onPossibleIdle);
    window.addEventListener("online", onPossibleIdle);
    retryRef.current = window.setInterval(onPossibleIdle, PENDING_RETRY_MS);

    tentarAplicarUpdate();

    return () => {
      limparTimer();
      if (retryRef.current != null) {
        window.clearInterval(retryRef.current);
        retryRef.current = null;
      }
      window.removeEventListener("focus", onPossibleIdle);
      document.removeEventListener("visibilitychange", onPossibleIdle);
      window.removeEventListener("online", onPossibleIdle);
    };
  }, []);

  useEffect(() => {
    if (!updatePendenteRef.current) return;
    const id = window.setTimeout(() => {
      if (podeAtualizarAgora(pathnameRef.current)) {
        updatePendenteRef.current = false;
        try {
          sessionStorage.removeItem(UPDATE_PENDING_KEY);
        } catch {
          // ignore
        }
        void aplicarUpdateRef.current?.(true);
      }
    }, IDLE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  return null;
}

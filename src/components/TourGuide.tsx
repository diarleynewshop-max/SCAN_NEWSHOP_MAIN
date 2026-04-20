import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";

type TourStep = {
  id: string;
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom";
};

const TOUR_STEPS_BY_ROUTE: Record<string, TourStep[]> = {
  "/": [
    { id: "login-empresa", target: "[data-tut='login-empresa']", title: "Selecione empresa", content: "Escolha a empresa e depois o perfil LOJA ou CD.", placement: "bottom" },
  ],
  "/scanner": [
    { id: "scanner-abrir", target: "[data-tut='abrir-lista']", title: "Abrir Lista", content: "Clique para criar uma lista", placement: "bottom" },
  ],
};

const getRouteKey = (pathname: string): string => {
  if (pathname.startsWith("/scanner")) {
    const idx = pathname.indexOf("?");
    const query = idx >= 0 ? pathname.substring(idx + 1) : "";
    const params = new URLSearchParams(query);
    return params.get("tab") === "list" ? "/scanner?tab=list" : "/scanner";
  }
  return pathname;
};

const TourGuide: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const routeKey = getRouteKey(location.pathname);
  const steps = TOUR_STEPS_BY_ROUTE[routeKey] || [];

  useEffect(() => {
    const handleStart = () => {
      if (steps.length > 0) {
        setIsOpen(true);
        setCurrentStep(0);
      }
    };
    window.addEventListener("start-tour", handleStart);
    return () => window.removeEventListener("start-tour", handleStart);
  }, [steps]);

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsOpen(false);
    }
  };

  const closeTour = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen || steps.length === 0) return;
    const currentStepData = steps[currentStep];
    if (!currentStepData) return;

    try {
      const prev = document.querySelector("[data-tut-highlight]");
      if (prev) prev.removeAttribute("data-tut-highlight");

      const el = document.querySelector(currentStepData.target) as HTMLElement | null;
      if (el) el.setAttribute("data-tut-highlight", "true");
    } catch (e) {
      // ignora erro de seletor
    }

    return () => {
      try {
        const h = document.querySelector("[data-tut-highlight]");
        if (h) h.removeAttribute("data-tut-highlight");
      } catch (e) { /* ignora */ }
    };
  }, [isOpen, currentStep, steps]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      [data-tut-highlight] { position: relative; z-index: 9998; }
      [data-tut-highlight]::after {
        content: ''; position: absolute; inset: -4px;
        border: 2px solid hsl(var(--primary));
        border-radius: 8px;
        animation: hp 1.5s ease-in-out infinite;
      }
      @keyframes hp {
        0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4); }
        50% { box-shadow: 0 0 0 8px hsl(var(--primary) / 0); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (!isOpen || steps.length === 0 || !steps[currentStep]) return null;

  const step = steps[currentStep];
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    try {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setPos({ top: r.bottom + 16, left: r.left + r.width / 2 });
      }
    } catch (e) {}
  }, [step.target]);

  return (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        padding: 14,
        minWidth: 220,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "hsl(var(--primary))", textTransform: "uppercase" }}>Tutorial</span>
        <button onClick={closeTour} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "hsl(var(--muted-foreground))" }}><X size={14} /></button>
      </div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 4 }}>{step.title}</h3>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12 }}>{step.content}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button onClick={closeTour} style={{ padding: "5px 8px", borderRadius: 4, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "hsl(var(--foreground))" }}>Fechar</button>
        <button onClick={goNext} style={{ padding: "5px 10px", borderRadius: 4, border: "none", background: "hsl(var(--primary))", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "hsl(var(--primary-foreground))", display: "flex", alignItems: "center", gap: 3 }}>
          {currentStep === steps.length - 1 ? "Concluir" : "Próximo"} <ChevronRight size={10} />
        </button>
      </div>
    </div>
  );
};

export default TourGuide;

export const openTour = () => window.dispatchEvent(new CustomEvent("start-tour"));

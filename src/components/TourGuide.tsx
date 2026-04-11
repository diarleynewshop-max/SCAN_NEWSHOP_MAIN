import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";

type TourStep = {
  id: string;
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
};

const TOUR_STEPS_BY_ROUTE: Record<string, TourStep[]> = {
  "/": [
    { id: "login-empresa", target: "[data-tut='login-empresa']", title: "1. Selecione a Loja", content: "Escolha qual é a loja do funcionário (NEWSHOP, SOYE ou FACIL)", placement: "bottom" },
    { id: "login-senha", target: "[data-tut='login-senha']", title: "2. Senha da Loja", content: "Digite a senha da loja para desbloquear a criação de listas", placement: "bottom" },
    { id: "login-lista", target: "[data-tut='login-lista']", title: "3. Nome da Lista", content: "Coloque o nome padrão da sua lista (ex: Utilidade)", placement: "bottom" },
    { id: "login-pessoa", target: "[data-tut='login-pessoa']", title: "4. Nome da Pessoa", content: "Informe o nome da pessoa responsável", placement: "bottom" },
    { id: "login-salvar", target: "[data-tut='login-salvar']", title: "5. Salvar Login", content: "Clique em Salvar Login para continuar", placement: "bottom" },
  ],
  "/scanner": [
    { id: "scanner-abrir-lista", target: "[data-tut='abrir-lista']", title: "1. Abrir Lista", content: "Clique no botão (+) para criar uma nova lista", placement: "bottom" },
    { id: "scanner-barcode", target: "[data-tut='barcode-input']", title: "2. Escanear Item", content: " Leia o código de barras do item ou digite manualmente", placement: "bottom" },
    { id: "scanner-descricao", target: "[data-tut='scanner-descricao']", title: "3. Descrição do Item", content: "Coloque a descrição do produto", placement: "top" },
    { id: "scanner-foto", target: "[data-tut='scanner-foto']", title: "4. Adicionar Foto", content: "Adicione uma foto da galeria ou tire na hora", placement: "top" },
    { id: "scanner-quantidade", target: "[data-tut='scanner-quantidade']", title: "5. Quantidade", content: "Informe a quantidade a ser pedida em unidade", placement: "bottom" },
    { id: "scanner-adicionar", target: "[data-tut='scanner-adicionar']", title: "6. Adicionar Item", content: "Clique para adicionar o item à lista", placement: "top" },
    { id: "scanner-fechar", target: "[data-tut='fechar-lista']", title: "7. Fechar Lista", content: "Ao terminar, clique em Fechar para finalizar a lista", placement: "bottom" },
  ],
  "/scanner?tab=list": [
    { id: "list-fechada", target: "[data-tut='fechar-lista']", title: "Lista Fechada", content: "Após fechar a lista, ela aparecerá aqui", placement: "bottom" },
  ],
};

const getRouteKey = (pathname: string): string => {
  if (pathname.startsWith("/scanner")) {
    const parts = pathname.split("?");
    const query = parts[1] || "";
    const params = new URLSearchParams(query);
    const tab = params.get("tab");
    if (tab === "list") return "/scanner?tab=list";
    return "/scanner";
  }
  return pathname;
};

const TourArrow: React.FC<{ placement: "top" | "bottom" }> = ({ placement }) => {
  const rotation = placement === "bottom" ? 180 : 0;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{
        position: "absolute",
        transform: `rotate(${rotation}deg)`,
        color: "hsl(var(--primary))",
      }}
    >
      <path d="M12 2L2 12h3v8h14v-8h3L12 2z" />
    </svg>
  );
};

const Particles: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}>
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          width: 3,
          height: 3,
          borderRadius: "50%",
          background: "hsl(var(--primary) / 0.5)",
          left: `${30 + i * 15}%`,
          top: `${30 + i * 10}%`,
          animation: `float ${2 + i * 0.5}s ease-in-out infinite`,
        }}
      />
    ))}
    <style>{`@keyframes float{0%,100%{opacity:0.4;transform:translateY(0)}50%{opacity:1;transform:translateY(-6px)}}`}</style>
  </div>
);

const TourBubble: React.FC<{
  step: TourStep;
  onNext: () => void;
  onClose: () => void;
  isLast: boolean;
}> = ({ step, onNext, onClose, isLast }) => {
  const [targetPos, setTargetPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const updatePos = () => {
      try {
        const el = document.querySelector(step.target) as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          setTargetPos({
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
            height: rect.height,
          });
        } else {
          setTargetPos(null);
        }
      } catch (e) {
        setTargetPos(null);
      }
    };
    updatePos();
    const timeoutId = setTimeout(updatePos, 100);
    window.addEventListener("resize", updatePos);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updatePos);
    };
  }, [step.target]);

  let bubbleTop = window.innerHeight * 0.3;
  let bubbleLeft = window.innerWidth * 0.5;

  if (targetPos) {
    if (step.placement === "bottom") {
      bubbleTop = targetPos.top + targetPos.height + 16;
      bubbleLeft = targetPos.left + targetPos.width / 2;
    } else {
      bubbleTop = targetPos.top - 140;
      bubbleLeft = targetPos.left + targetPos.width / 2;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: bubbleTop,
        left: bubbleLeft,
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        padding: 16,
        minWidth: 260,
        maxWidth: 320,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}
    >
      <Particles />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "hsl(var(--primary))", textTransform: "uppercase" }}>
          Tutorial
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "hsl(var(--muted-foreground))" }}>
          <X size={16} />
        </button>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 6 }}>{step.title}</h3>
      <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.4, marginBottom: 14 }}>{step.content}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "hsl(var(--foreground))" }}>
          Fechar
        </button>
        <button onClick={onNext} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "hsl(var(--primary))", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "hsl(var(--primary-foreground))", display: "flex", alignItems: "center", gap: 4 }}>
          {isLast ? "Concluir" : "Próximo"} <ChevronRight size={12} />
        </button>
      </div>
      {targetPos && step.placement && (
        <div style={{ position: "absolute", [step.placement === "bottom" ? "top" : "bottom"]: -10, left: "50%", transform: "translateX(-50%) rotate(" + (step.placement === "bottom" ? "180deg" : "0deg") + ")", pointerEvents: "none" }}>
          <TourArrow placement={step.placement} />
        </div>
      )}
    </div>
  );
};

const TourGuide: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const stepRef = useRef(0);
  const stepsRef = useRef<TourStep[]>([]);

  const routeKey = getRouteKey(location.pathname);
  const steps = TOUR_STEPS_BY_ROUTE[routeKey] || [];
  stepsRef.current = steps;

  useEffect(() => {
    const handleStartTour = () => {
      if (steps.length > 0) {
        setIsOpen(true);
        setCurrentStep(0);
        stepRef.current = 0;
      }
    };
    window.addEventListener("start-tour", handleStartTour);
    return () => window.removeEventListener("start-tour", handleStartTour);
  }, []);

  useEffect(() => {
    if (!isOpen || steps.length === 0) return;
    
    const currentStepData = steps[currentStep];
    if (!currentStepData) return;

    try {
      const prevHighlighted = document.querySelector("[data-tut-highlight]");
      if (prevHighlighted) {
        prevHighlighted.removeAttribute("data-tut-highlight");
      }
      
      const el = document.querySelector(currentStepData.target) as HTMLElement | null;
      if (el) {
        el.setAttribute("data-tut-highlight", "true");
      }
    } catch (e) {
      // Ignore selector errors
    }

    return () => {
      try {
        const highlighted = document.querySelector("[data-tut-highlight]");
        if (highlighted) {
          highlighted.removeAttribute("data-tut-highlight");
        }
      } catch (e) {
        // Ignore
      }
    };
  }, [isOpen, currentStep, steps]);

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      stepRef.current = currentStep + 1;
    } else {
      setIsOpen(false);
      stepRef.current = 0;
    }
  };

  const closeTour = () => {
    setIsOpen(false);
    stepRef.current = 0;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Enter" || e.key === "ArrowRight") goNext();
      if (e.key === "Escape") closeTour();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      [data-tut-highlight] { position: relative; z-index: 9998; }
      [data-tut-highlight]::after {
        content: '';
        position: absolute;
        inset: -4px;
        border: 2px solid hsl(var(--primary));
        border-radius: 8px;
        animation: highlight-pulse 1.5s ease-in-out infinite;
      }
      @keyframes highlight-pulse {
        0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4); }
        50% { box-shadow: 0 0 0 8px hsl(var(--primary) / 0); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (!isOpen || steps.length === 0) return null;

  const currentStepData = steps[currentStep];
  if (!currentStepData) return null;

  return (
    <TourBubble
      step={currentStepData}
      onNext={goNext}
      onClose={closeTour}
      isLast={currentStep === steps.length - 1}
    />
  );
};

export default TourGuide;

export const openTour = () => {
  window.dispatchEvent(new CustomEvent("start-tour"));
};
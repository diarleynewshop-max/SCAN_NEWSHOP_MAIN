import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, X, Play } from "lucide-react";

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
    { id: "list-clickup", target: "[data-tut='clickup-btn']", title: "2. Botão ClickUp", content: "Clique no botão ClickUp para enviar", placement: "top" },
    { id: "list-aguarde", target: "[data-tut='clickup-btn']", title: "3. Aguarde", content: "Espere até ficar verde", placement: "top" },
    { id: "list-sucesso", target: "[data-tut='clickup-btn']", title: "4. Parabéns!", content: "Pronto! Lista enviada com sucesso", placement: "top" },
  ],
};

const getRouteKey = (pathname: string): string => {
  if (pathname.startsWith("/scanner")) {
    const [path, query] = pathname.split("?");
    const params = new URLSearchParams(query || "");
    const tab = params.get("tab");
    if (tab === "list") return "/scanner?tab=list";
    return "/scanner";
  }
  return pathname;
};

const TourArrow: React.FC<{ placement: "top" | "bottom" | "left" | "right" }> = ({ placement }) => {
  const rotation: Record<string, number> = { top: 180, bottom: 0, left: 90, right: -90 };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{
        position: "absolute",
        transform: `rotate(${rotation[placement]}deg)`,
        color: "hsl(var(--primary))",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
      }}
    >
      <path d="M12 2L2 12h3v8h14v-8h3L12 2z" />
    </svg>
  );
};

const PulseGlow: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: -4,
      borderRadius: 12,
      background: "hsl(var(--primary) / 0.2)",
      animation: "pulse 2s ease-in-out infinite",
      zIndex: -1,
    }}
  >
    <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.05)}}`}</style>
  </div>
);

const Particles: React.FC = () => {
  const particles = Array.from({ length: 6 });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}>
      {particles.map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "hsl(var(--primary) / 0.6)",
            left: `${20 + Math.random() * 60}%`,
            top: `${20 + Math.random() * 60}%`,
            animation: `float ${2 + Math.random()}s ease-in-out infinite`,
            animationDelay: `${Math.random()}s`,
          }}
        />
      ))}
      <style>{`@keyframes float{0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(-8px);opacity:1}}`}</style>
    </div>
  );
};

const TourBubble: React.FC<{
  step: TourStep;
  onNext: () => void;
  onClose: () => void;
  isLast: boolean;
}> = ({ step, onNext, onClose, isLast }) => {
  const [targetPos, setTargetPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const updatePos = () => {
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
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos);
    };
  }, [step.target]);

  const bubbleStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 9999,
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    padding: 16,
    minWidth: 280,
    maxWidth: 340,
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
  };

  let bubbleTop = 0;
  let bubbleLeft = 0;

  if (targetPos) {
    switch (step.placement) {
      case "bottom":
        bubbleTop = targetPos.top + targetPos.height + 12;
        bubbleLeft = targetPos.left + targetPos.width / 2;
        break;
      case "top":
        bubbleTop = targetPos.top - 120;
        bubbleLeft = targetPos.left + targetPos.width / 2;
        break;
      case "left":
        bubbleTop = targetPos.top + targetPos.height / 2 - 60;
        bubbleLeft = targetPos.left - 300;
        break;
      case "right":
        bubbleTop = targetPos.top + targetPos.height / 2 - 60;
        bubbleLeft = targetPos.left + targetPos.width + 20;
        break;
      default:
        bubbleTop = targetPos.top + targetPos.height + 12;
        bubbleLeft = targetPos.left + targetPos.width / 2;
    }
  } else {
    bubbleTop = window.innerHeight * 0.3;
    bubbleLeft = window.innerWidth * 0.5;
  }

  return (
    <div style={{ ...bubbleStyle, top: bubbleTop, left: bubbleLeft, transform: "translateX(-50%)" }}>
      <Particles />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "hsl(var(--primary))", textTransform: "uppercase" }}>
          Tutorial
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "hsl(var(--muted-foreground))" }}>
          <X size={16} />
        </button>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 8 }}>{step.title}</h3>
      <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, marginBottom: 16 }}>{step.content}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid hsl(var(--border))", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "hsl(var(--foreground))" }}>
          Fechar
        </button>
        <button onClick={onNext} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "hsl(var(--primary))", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "hsl(var(--primary-foreground))", display: "flex", alignItems: "center", gap: 6 }}>
          {isLast ? "Concluir" : "Próximo"} <ChevronRight size={14} />
        </button>
      </div>
      {targetPos && step.placement && (
        <div style={{ position: "absolute", ...(step.placement === "bottom" ? { top: -12, left: "50%", transform: "translateX(-50%) rotate(180deg)" } : step.placement === "top" ? { bottom: -12, left: "50%", transform: "translateX(-50%)" } : {}), pointerEvents: "none" }}>
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
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);

  const routeKey = getRouteKey(location.pathname);
  const steps = TOUR_STEPS_BY_ROUTE[routeKey] || [];

  useEffect(() => {
    const handleStartTour = () => {
      if (steps.length > 0) {
        setIsOpen(true);
        setCurrentStep(0);
        setHighlightTarget(steps[0]?.target || null);
      }
    };
    window.addEventListener("start-tour", handleStartTour);
    return () => window.removeEventListener("start-tour", handleStartTour);
  }, [steps]);

  useEffect(() => {
    if (!isOpen || steps.length === 0) return;

    const currentStepData = steps[currentStep];
    if (!currentStepData) return;

    const applyHighlight = () => {
      const prevHighlighted = document.querySelector("[data-tut-highlight]");
      if (prevHighlighted) {
        prevHighlighted.removeAttribute("data-tut-highlight");
      }
      const el = document.querySelector(currentStepData.target) as HTMLElement | null;
      if (el) {
        el.setAttribute("data-tut-highlight", "true");
      }
    };
    applyHighlight();

    return () => {
      const highlighted = document.querySelector("[data-tut-highlight]");
      if (highlighted) {
        highlighted.removeAttribute("data-tut-highlight");
      }
    };
  }, [isOpen, currentStep, steps]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setIsOpen(false);
    }
  }, [currentStep, steps.length]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Enter" || e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handleClose]);

  if (!isOpen || steps.length === 0) return null;

  const currentStepData = steps[currentStep];
  if (!currentStepData) return null;

  return (
    <>
      {highlightTarget && (
        <style>{`
          [data-tut-highlight] {
            position: relative;
            z-index: 9998;
          }
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
        `}</style>
      )}
      <TourBubble
        step={currentStepData}
        onNext={handleNext}
        onClose={handleClose}
        isLast={currentStep === steps.length - 1}
      />
    </>
  );
};

export default TourGuide;

export const openTour = () => {
  window.dispatchEvent(new CustomEvent("start-tour"));
};
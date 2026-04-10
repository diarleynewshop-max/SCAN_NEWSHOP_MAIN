import React, { useEffect, useState } from "react";

type TourStep = {
  id: string;
  selector?: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
};

// Minimal steps anchored to selectors present in the app
const STEPS: TourStep[] = [
  {
    id: "step-login",
    selector: 'input[data-tut="login-senha"]',
    title: "Primeiro passo: Login",
    content: "Informe a loja, senha, o nome da lista e o nome da pessoa para iniciar.",
    placement: "bottom",
  },
  {
    id: "step-lista",
    selector: 'input[data-tut="login-lista"]',
    title: "Nome da lista",
    content: "Informe o nome da lista padrão para facilitar a identificação.",
    placement: "bottom",
  },
  {
    id: "step-pessoa",
    selector: 'input[data-tut="login-pessoa"]',
    title: "Nome da pessoa",
    content: "Informe o responsável pela lista.",
    placement: "bottom",
  },
  {
    id: "step-scan",
    selector: 'input[data-tut="barcode-input"]',
    title: "Escanear",
    content: "Leia o código de barras do item ou insira manualmente.",
    placement: "bottom",
  },
  {
    id: "step-quantidade",
    selector: 'input[data-tut="scanner-quantity"]',
    title: "Quantidade",
    content: "Informe a quantidade a ser pedida.",
    placement: "bottom",
  },
  {
    id: "step-add-item",
    selector: 'button[data-tut="scanner-add"]',
    title: "Adicionar item",
    content: "Clique para adicionar o item à lista.",
    placement: "bottom",
  },
  {
    id: "step-close-list",
    selector: 'button[aria-label="Fechar"]',
    title: "Encerrar lista",
    content: "Ao terminar, feche a lista para finalizar a etapa.",
    placement: "bottom",
  },
];

const TourBubble: React.FC<{ top: number; left: number; content: string; title: string }>=({ top, left, content, title }) => {
  const style: React.CSSProperties = {
    position: "fixed",
    top,
    left,
    transform: "translate(-50%, -110%)",
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 10,
    padding: 12,
    minWidth: 240,
    zIndex: 9999,
    boxShadow: "var(--shadow-md)",
  };
  return (
    <div style={style}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{content}</div>
    </div>
  );
};

const TourGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  // Position bubble near target element when available
  const [pos, setPos] = useState<{top: number; left: number}>({ top: window.innerHeight * 0.5, left: window.innerWidth * 0.5 });

  useEffect(() => {
    // Listen for a trigger from localStorage or internal toggle
    const handler = () => {
      const v = localStorage.getItem("start_tour");
      if (v === "1") {
        setOpen(true); setIndex(0); localStorage.removeItem("start_tour");
      }
    };
    window.addEventListener("storage", handler);
    // Also listen for a custom event to start tour from same tab
    const onStart = () => {
      setOpen(true); setIndex(0);
    };
    window.addEventListener("start-tour", onStart as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("start-tour", onStart as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open || !step?.selector) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      // Position bubble near the element; fallback to center if off-screen
      const t = r.top + window.scrollY;
      const l = r.left + r.width / 2 + window.scrollX;
      setPos({ top: t, left: l });
    } else {
      // center if not found
      setPos({ top: window.innerHeight * 0.4, left: window.innerWidth * 0.5 });
    }
  }, [open, index, step?.selector]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index]);

  const next = () => {
    if (index < STEPS.length - 1) setIndex(i => i + 1);
  };
  const close = () => {
    setOpen(false);
  };

  // Expose a simple toggle button via localStorage trigger (consumed by TutorialButton)
  // Show a placeholder overlay if no step selector is found for the current step
  if (!open || !step) return null;

  // If the target element is off-screen or not found, still render a centered bubble
  const showBubble = true;
  return (
    <div>
      {showBubble && (
        <TourBubble
          top={pos.top}
          left={pos.left}
          title={step.title}
          content={step.content}
        />
      )}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: 'flex', gap: 8, zIndex: 9999 }}>
        {index < STEPS.length - 1 ? (
          <button onClick={next} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Próximo</button>
        ) : (
          <button onClick={close} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer' }}>Concluído</button>
        )}
        <button onClick={close} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>Fechar</button>
      </div>
    </div>
  );
};

export default TourGuide;

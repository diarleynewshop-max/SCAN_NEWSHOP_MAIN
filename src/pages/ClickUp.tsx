import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import KanbanAdmin from "@/components/KanbanAdmin";

export default function ClickUp() {
  const navigate = useNavigate();
  const loginSalvo = obterLoginSalvo();
  const modoDesktop = localStorage.getItem("modoDesktop") === "true";
  const empresa = loginSalvo?.empresa ?? "NEWSHOP";
  const flag = loginSalvo?.flag ?? "loja";

  if (empresa !== "NEWSHOP") {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center ${modoDesktop ? "max-w-5xl mx-auto" : "max-w-md mx-auto"}`}
        style={{ background: "hsl(var(--background))", padding: 24 }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "hsl(var(--foreground))", marginBottom: 8 }}>
          ClickUp indisponível
        </h1>
        <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textAlign: "center", marginBottom: 16 }}>
          O quadro espelho do ClickUp só está disponível para NEWSHOP no momento.
        </p>
        <button
          onClick={() => navigate("/")}
          style={{
            height: 40,
            padding: "0 16px",
            borderRadius: 10,
            border: "1.5px solid hsl(var(--border))",
            background: "transparent",
            color: "hsl(var(--foreground))",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-5xl mx-auto" : "max-w-md mx-auto"}`}
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Header */}
      <div
        style={{
          padding: modoDesktop ? "20px 32px" : "12px 16px",
          borderBottom: "1px solid hsl(var(--border))",
          display: "flex",
          alignItems: "center",
          gap: 10,
          position: "sticky",
          top: 0,
          background: "hsl(var(--background))",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => navigate("/")}
          aria-label="Voltar"
          style={{
            height: 36,
            width: 36,
            borderRadius: 8,
            border: "1.5px solid hsl(var(--border))",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "hsl(var(--foreground))",
            flexShrink: 0,
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1.1 }}>
            ClickUp
          </h1>
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
            Quadro espelho da lista — {empresa} {flag.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Kanban */}
      <KanbanAdmin empresa={empresa} flag={flag} />
    </div>
  );
}

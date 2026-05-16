import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Package, CheckCircle2, Clock, AlertTriangle, ChevronDown } from "lucide-react";
import { obterLoginSalvo } from "@/hooks/useAuth";

interface Resumo {
  separado: number;
  naoTem: number;
  parcial: number;
  pendente: number;
}

interface Pedido {
  id: string;
  nome: string;
  titulo: string;
  pessoa: string;
  statusClickUp: string;
  statusLabel: "pedido_no_cd" | "pronto_conferencia" | "concluido";
  dataCriacao: string;
  dataAtualizacao: string;
  resumo: Resumo | null;
}

const PROXY_URL = "/api/clickup-proxy";

const STATUS_CONFIG = {
  pedido_no_cd: {
    label: "Pedido chegou ao CD",
    color: "hsl(var(--warning))",
    bg: "hsl(var(--warning) / 0.1)",
    border: "hsl(var(--warning) / 0.25)",
    Icon: Package,
  },
  pronto_conferencia: {
    label: "Pedido pronto para Conferência",
    color: "hsl(var(--primary))",
    bg: "hsl(var(--primary) / 0.1)",
    border: "hsl(var(--primary) / 0.25)",
    Icon: Clock,
  },
  concluido: {
    label: "Pedido Concluído",
    color: "hsl(var(--success))",
    bg: "hsl(var(--success) / 0.1)",
    border: "hsl(var(--success) / 0.25)",
    Icon: CheckCircle2,
  },
} as const;

function formatarData(ts: string): string {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MeusPedidos() {
  const navigate = useNavigate();
  const loginSalvo = obterLoginSalvo();
  const modoDesktop = localStorage.getItem("modoDesktop") === "true";

  const [todosPedidos, setTodosPedidos] = useState<Pedido[]>([]);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroPessoa, setFiltroPessoa] = useState<string>("todos");
  const [mostrarSeletor, setMostrarSeletor] = useState(false);

  const buscarPedidos = useCallback(async () => {
    if (!loginSalvo) return;
    setLoading(true);
    setErro(null);

    try {
      const params = new URLSearchParams({
        action: "buscar-meus-pedidos",
        empresa: loginSalvo.empresa,
        flag: loginSalvo.flag ?? "loja",
      });

      const res = await fetch(`${PROXY_URL}?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      const data = await res.json();
      setTodosPedidos(Array.isArray(data.pedidos) ? data.pedidos : []);
      setPessoas(Array.isArray(data.pessoas) ? data.pessoas : []);
    } catch (e: any) {
      setErro(e.message ?? "Erro ao buscar pedidos");
      setTodosPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [loginSalvo]);

  useEffect(() => {
    buscarPedidos();
  }, [buscarPedidos]);

  // Filtro local — sem nova requisição
  const pedidosFiltrados = filtroPessoa === "todos"
    ? todosPedidos
    : todosPedidos.filter((p) => p.pessoa.toLowerCase() === filtroPessoa.toLowerCase());

  const pedidosAbertos = pedidosFiltrados.filter((p) => p.statusLabel !== "concluido");
  const pedidosConcluidos = pedidosFiltrados.filter((p) => p.statusLabel === "concluido");

  const labelFiltro = filtroPessoa === "todos" ? `Todos (${todosPedidos.length})` : `${filtroPessoa} (${pedidosFiltrados.length})`;

  return (
    <div
      className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-3xl mx-auto" : "max-w-md mx-auto"}`}
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Header */}
      <header
        style={{ padding: modoDesktop ? "20px 32px 24px" : "16px 20px 20px", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
      >
        <button
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "inherit", cursor: "pointer", marginBottom: 12, opacity: 0.85, fontWeight: 600, fontSize: 14 }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} /> Voltar
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Package style={{ width: 24, height: 24 }} />
            </div>
            <div>
              <h1 style={{ fontSize: modoDesktop ? 24 : 20, fontWeight: 800, lineHeight: 1.1 }}>Meus Pedidos</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{loginSalvo?.empresa} · {(loginSalvo?.flag ?? "loja").toUpperCase()}</p>
            </div>
          </div>
          <button
            onClick={buscarPedidos}
            disabled={loading}
            style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.15)", border: "none", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <RefreshCw style={{ width: 18, height: 18, animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Filtro por pessoa */}
      {!loading && todosPedidos.length > 0 && (
        <div style={{ padding: modoDesktop ? "16px 32px 0" : "12px 16px 0" }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMostrarSeletor(!mostrarSeletor)}
              style={{
                width: "100%", height: 48, padding: "0 16px",
                borderRadius: 12, background: "hsl(var(--card))",
                border: "1.5px solid hsl(var(--border))",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", fontWeight: 700, fontSize: 14,
                color: "hsl(var(--foreground))",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>Pessoa</span>
                <span>{labelFiltro}</span>
              </span>
              <ChevronDown style={{ width: 16, height: 16, color: "hsl(var(--muted-foreground))", transform: mostrarSeletor ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>

            {mostrarSeletor && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
                  borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  zIndex: 50, overflow: "hidden",
                }}
              >
                {[{ key: "todos", label: `Todos (${todosPedidos.length})` }, ...pessoas.map((p) => ({
                  key: p,
                  label: `${p} (${todosPedidos.filter((x) => x.pessoa.toLowerCase() === p.toLowerCase()).length})`,
                }))].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setFiltroPessoa(key); setMostrarSeletor(false); }}
                    style={{
                      width: "100%", padding: "14px 16px", textAlign: "left",
                      background: filtroPessoa === key ? "hsl(var(--primary) / 0.08)" : "transparent",
                      border: "none", borderBottom: "1px solid hsl(var(--border))",
                      cursor: "pointer", fontWeight: filtroPessoa === key ? 700 : 500,
                      fontSize: 14, color: filtroPessoa === key ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div
        style={{ flex: 1, padding: modoDesktop ? "16px 32px 32px" : "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}
        onClick={() => mostrarSeletor && setMostrarSeletor(false)}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "hsl(var(--muted-foreground))" }}>
            <RefreshCw style={{ width: 28, height: 28, margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Carregando pedidos...</p>
          </div>
        )}

        {!loading && erro && (
          <div style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.25)", borderRadius: 12, padding: "16px", display: "flex", gap: 10 }}>
            <AlertTriangle style={{ width: 18, height: 18, color: "hsl(var(--destructive))", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--destructive))" }}>Erro ao buscar</p>
              <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{erro}</p>
            </div>
          </div>
        )}

        {!loading && !erro && todosPedidos.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "hsl(var(--muted-foreground))" }}>
            <Package style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 15, fontWeight: 600 }}>Nenhum pedido encontrado</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Nenhuma task na lista desta empresa/flag.</p>
          </div>
        )}

        {/* Pedidos em andamento */}
        {pedidosAbertos.length > 0 && (
          <>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              Em andamento · {pedidosAbertos.length}
            </p>
            {pedidosAbertos.map((pedido) => {
              const cfg = STATUS_CONFIG[pedido.statusLabel];
              const { Icon } = cfg;
              return (
                <div key={pedido.id} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: cfg.color + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 20, height: 20, color: cfg.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pedido.titulo}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.color + "20", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{pedido.pessoa}</span>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                      {formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}
                    </p>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Pedidos concluídos */}
        {pedidosConcluidos.length > 0 && (
          <>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginTop: pedidosAbertos.length > 0 ? 8 : 4 }}>
              Concluídos · {pedidosConcluidos.length}
            </p>
            {pedidosConcluidos.map((pedido) => {
              const cfg = STATUS_CONFIG.concluido;
              return (
                <div key={pedido.id} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: pedido.resumo ? 12 : 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: cfg.color + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <CheckCircle2 style={{ width: 20, height: 20, color: cfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pedido.titulo}</p>
                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.color + "20", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{pedido.pessoa}</span>
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                      <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                        {formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}
                      </p>
                    </div>
                  </div>

                  {pedido.resumo && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: "1px solid hsl(var(--border))", paddingTop: 10 }}>
                      {[
                        { label: "Separado", value: pedido.resumo.separado, color: "hsl(var(--success))" },
                        { label: "Não tem", value: pedido.resumo.naoTem, color: "hsl(var(--destructive))" },
                        { label: "Parcial", value: pedido.resumo.parcial, color: "hsl(var(--warning))" },
                        { label: "Pendente", value: pedido.resumo.pendente, color: "hsl(var(--muted-foreground))" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: "hsl(var(--secondary))", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>{label}</p>
                          <p style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Package, CheckCircle2, Clock, AlertTriangle, User, Filter } from "lucide-react";
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
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MeusPedidos() {
  const navigate = useNavigate();
  const loginSalvo = obterLoginSalvo();
  const modoDesktop = localStorage.getItem("modoDesktop") === "true";

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [totalTasks, setTotalTasks] = useState<number | null>(null);
  const nomePadrao = (loginSalvo?.nomePessoa ?? "").trim();
  const [filtroPessoa, setFiltroPessoa] = useState(nomePadrao);
  const [inputPessoa, setInputPessoa] = useState(nomePadrao);

  const buscarPedidos = useCallback(async (pessoa: string) => {
    if (!pessoa.trim() || !loginSalvo) return;
    setLoading(true);
    setErro(null);

    try {
      const params = new URLSearchParams({
        action: "buscar-meus-pedidos",
        empresa: loginSalvo.empresa,
        flag: loginSalvo.flag ?? "loja",
        pessoa: pessoa.trim(),
      });

      const res = await fetch(`${PROXY_URL}?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      const data = await res.json();
      setPedidos(Array.isArray(data.pedidos) ? data.pedidos : []);
      setTotalTasks(typeof data.totalTasks === "number" ? data.totalTasks : null);
    } catch (e: any) {
      setErro(e.message ?? "Erro ao buscar pedidos");
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [loginSalvo]);

  useEffect(() => {
    if (filtroPessoa) buscarPedidos(filtroPessoa);
  }, [filtroPessoa, buscarPedidos]);

  const pedidosAbertos = pedidos.filter((p) => p.statusLabel !== "concluido");
  const pedidosConcluidos = pedidos.filter((p) => p.statusLabel === "concluido");

  return (
    <div
      className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-3xl mx-auto" : "max-w-md mx-auto"}`}
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Header */}
      <header
        className="relative overflow-hidden"
        style={{ padding: modoDesktop ? "20px 32px 24px" : "16px 20px 20px", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
      >
        <button
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "inherit", cursor: "pointer", marginBottom: 12, opacity: 0.85, fontWeight: 600, fontSize: 14 }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} /> Voltar
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package style={{ width: 24, height: 24 }} />
          </div>
          <div>
            <h1 style={{ fontSize: modoDesktop ? 24 : 20, fontWeight: 800, lineHeight: 1.1 }}>Meus Pedidos</h1>
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{loginSalvo?.empresa} · {(loginSalvo?.flag ?? "loja").toUpperCase()}</p>
          </div>
        </div>
      </header>

      {/* Filtro de pessoa */}
      <div style={{ padding: modoDesktop ? "20px 32px 0" : "16px 16px 0" }}>
        <div style={{ background: "hsl(var(--card))", borderRadius: 14, border: "1px solid hsl(var(--border))", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Filter style={{ width: 15, height: 15, color: "hsl(var(--muted-foreground))" }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "hsl(var(--muted-foreground))" }}>
              Filtrar por pessoa
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={inputPessoa}
              onChange={(e) => setInputPessoa(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") setFiltroPessoa(inputPessoa); }}
              placeholder="Ex: LEO"
              style={{
                flex: 1, height: 44, padding: "0 14px", borderRadius: 10,
                border: "1.5px solid hsl(var(--border))",
                background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                fontSize: 15, fontWeight: 600, outline: "none",
              }}
            />
            <button
              onClick={() => setFiltroPessoa(inputPessoa)}
              style={{ height: 44, padding: "0 16px", borderRadius: 10, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              <User style={{ width: 15, height: 15 }} /> Ver
            </button>
            <button
              onClick={() => buscarPedidos(filtroPessoa)}
              disabled={loading}
              style={{ height: 44, width: 44, borderRadius: 10, background: "hsl(var(--secondary))", border: "1.5px solid hsl(var(--border))", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <RefreshCw style={{ width: 16, height: 16, color: "hsl(var(--muted-foreground))", animation: loading ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: modoDesktop ? "20px 32px 32px" : "14px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Quando nome não está preenchido */}
        {!loading && !filtroPessoa && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "hsl(var(--muted-foreground))" }}>
            <User style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 15, fontWeight: 600 }}>Digite seu nome para buscar</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Use o campo acima para filtrar os pedidos pelo seu nome.</p>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "hsl(var(--muted-foreground))" }}>
            <RefreshCw style={{ width: 28, height: 28, margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Buscando pedidos de {filtroPessoa}...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

        {!loading && !erro && pedidos.length === 0 && filtroPessoa && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "hsl(var(--muted-foreground))" }}>
            <Package style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 15, fontWeight: 600 }}>Nenhum pedido encontrado</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Não há pedidos para "{filtroPessoa}" no momento.</p>
            {totalTasks !== null && (
              <p style={{ fontSize: 11, marginTop: 8, color: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}>
                {totalTasks} tasks buscadas na lista · nenhuma com este nome
              </p>
            )}
          </div>
        )}

        {/* Pedidos em andamento */}
        {pedidosAbertos.length > 0 && (
          <>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
              Em andamento · {pedidosAbertos.length}
            </p>
            {pedidosAbertos.map((pedido) => {
              const cfg = STATUS_CONFIG[pedido.statusLabel];
              const { Icon } = cfg;
              return (
                <div
                  key={pedido.id}
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 14, padding: "16px", display: "flex", gap: 12 }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.color + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 20, height: 20, color: cfg.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 2 }}>{pedido.titulo}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                      Atualizado: {formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}
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
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginTop: pedidosAbertos.length > 0 ? 8 : 0 }}>
              Concluídos · {pedidosConcluidos.length}
            </p>
            {pedidosConcluidos.map((pedido) => {
              const cfg = STATUS_CONFIG.concluido;
              return (
                <div
                  key={pedido.id}
                  style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "16px" }}
                >
                  <div style={{ display: "flex", gap: 12, marginBottom: pedido.resumo ? 14 : 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.color + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <CheckCircle2 style={{ width: 20, height: 20, color: cfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 2 }}>{pedido.titulo}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
                      <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                        {formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}
                      </p>
                    </div>
                  </div>

                  {pedido.resumo && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: "1px solid hsl(var(--border))", paddingTop: 12 }}>
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

                  {!pedido.resumo && (
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 8, fontStyle: "italic" }}>
                      Resumo não disponível (pedido anterior à atualização)
                    </p>
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

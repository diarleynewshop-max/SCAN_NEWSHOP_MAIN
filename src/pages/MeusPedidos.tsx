import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Package, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, User, Calendar, Search, X, ScanBarcode,
} from "lucide-react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import BarcodeScanner from "@/components/BarcodeScanner";

interface ItemConferencia {
  codigo: string;
  sku: string;
  secao?: string | null;
  quantidadePedida: number;
  quantidadeReal: number | null;
  status: "separado" | "nao_tem" | "nao_tem_tudo" | "pendente";
}

const ITEM_STATUS = {
  separado:     { label: "Separado", color: "hsl(var(--success))",          emoji: "✅" },
  nao_tem:      { label: "Não tem",  color: "hsl(var(--destructive))",       emoji: "❌" },
  nao_tem_tudo: { label: "Parcial",  color: "hsl(var(--warning))",           emoji: "⚠️" },
  pendente:     { label: "Pendente", color: "hsl(var(--muted-foreground))",  emoji: "⏳" },
} as const;

interface Resumo { separado: number; naoTem: number; parcial: number; pendente: number; }

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
  itens?: ItemConferencia[];
}

const PROXY_URL = "/api/clickup-proxy";

const STATUS_CONFIG = {
  pedido_no_cd:        { label: "Pedido chegou ao CD",             color: "hsl(var(--warning))",   bg: "hsl(var(--warning) / 0.1)",   border: "hsl(var(--warning) / 0.25)",   Icon: Package       },
  pronto_conferencia:  { label: "Pedido pronto para Conferência",  color: "hsl(var(--primary))",   bg: "hsl(var(--primary) / 0.1)",   border: "hsl(var(--primary) / 0.25)",   Icon: Clock         },
  concluido:           { label: "Pedido Concluído",                color: "hsl(var(--success))",   bg: "hsl(var(--success) / 0.1)",   border: "hsl(var(--success) / 0.25)",   Icon: CheckCircle2  },
} as const;

function formatarData(ts: string): string {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function tsParaDate(ts: string): Date | null {
  const n = Number(ts);
  if (!n) return null;
  return new Date(n);
}

export default function MeusPedidos() {
  const navigate = useNavigate();
  const loginSalvo = obterLoginSalvo();
  const modoDesktop = localStorage.getItem("modoDesktop") === "true";
  const pad = modoDesktop ? "20px 32px" : "12px 16px";

  const CACHE_TTL = 10 * 60 * 1000;
  const cacheKey = loginSalvo ? `meus_pedidos_${loginSalvo.empresa}_${loginSalvo.flag ?? "loja"}` : null;

  function lerCache(): { pedidos: Pedido[]; pessoas: string[] } | null {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.savedAt > CACHE_TTL) { localStorage.removeItem(cacheKey); return null; }
      return { pedidos: parsed.pedidos, pessoas: parsed.pessoas };
    } catch { return null; }
  }

  function salvarCache(pedidos: Pedido[], pessoas: string[]) {
    if (!cacheKey) return;
    try { localStorage.setItem(cacheKey, JSON.stringify({ pedidos, pessoas, savedAt: Date.now() })); } catch { /**/ }
  }

  const [todosPedidos, setTodosPedidos]     = useState<Pedido[]>(() => lerCache()?.pedidos  ?? []);
  const [pessoas,      setPessoas]          = useState<string[]>(() => lerCache()?.pessoas   ?? []);
  const [loading,      setLoading]          = useState(false);
  const [erro,         setErro]             = useState<string | null>(null);
  const [expandidoId,  setExpandidoId]      = useState<string | null>(null);

  // filtros
  const [filtroPessoa,   setFiltroPessoa]   = useState("todos");
  const [filtroDataDe,   setFiltroDataDe]   = useState("");
  const [filtroDataAte,  setFiltroDataAte]  = useState("");
  const [filtroProduto,  setFiltroProduto]  = useState("");
  const [filtroAtivo,    setFiltroAtivo]    = useState<"pessoa" | "data" | "produto" | null>(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [filtroPeriodo,  setFiltroPeriodo]  = useState<"dia" | "semana" | "mes">("semana");

  const buscarPedidos = useCallback(async (forceFetch = false) => {
    if (!loginSalvo) return;
    if (!forceFetch) {
      const cache = lerCache();
      if (cache) { setTodosPedidos(cache.pedidos); setPessoas(cache.pessoas); return; }
    }
    setLoading(true); setErro(null);
    try {
      const params = new URLSearchParams({ action: "buscar-meus-pedidos", empresa: loginSalvo.empresa, flag: loginSalvo.flag ?? "loja" });
      const res = await fetch(`${PROXY_URL}?${params}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erro ${res.status}`); }
      const data = await res.json();
      const pedidos: Pedido[] = Array.isArray(data.pedidos) ? data.pedidos : [];
      const pss: string[]     = Array.isArray(data.pessoas) ? data.pessoas : [];
      setTodosPedidos(pedidos); setPessoas(pss); salvarCache(pedidos, pss);
    } catch (e: any) { setErro(e.message ?? "Erro ao buscar pedidos"); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSalvo, cacheKey]);

  useEffect(() => { buscarPedidos(false); }, [buscarPedidos]);

  const toggleExpansao = useCallback((id: string) => setExpandidoId((p) => p === id ? null : id), []);
  const toggleFiltro   = (f: "pessoa" | "data" | "produto") => setFiltroAtivo((p) => p === f ? null : f);

  // --- lógica de filtro ---
  function matchPessoa(p: Pedido) {
    return filtroPessoa === "todos" || p.pessoa.toLowerCase() === filtroPessoa.toLowerCase();
  }
  function matchData(p: Pedido) {
    if (!filtroDataDe && !filtroDataAte) return true;
    const d = tsParaDate(p.dataCriacao);
    if (!d) return true;
    if (filtroDataDe && d < new Date(filtroDataDe + "T00:00:00")) return false;
    if (filtroDataAte && d > new Date(filtroDataAte + "T23:59:59")) return false;
    return true;
  }
  function matchProduto(p: Pedido) {
    const q = filtroProduto.trim().toLowerCase();
    if (!q) return true;
    if (p.titulo.toLowerCase().includes(q)) return true;
    return p.itens?.some(i => i.codigo.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)) ?? false;
  }
  function dentroDoperiodo(ts: string): boolean {
    const diff = Date.now() - (Number(ts) || 0);
    if (filtroPeriodo === "dia")    return diff <= 86400000;
    if (filtroPeriodo === "semana") return diff <= 7 * 86400000;
    return diff <= 30 * 86400000;
  }

  const filtrados       = todosPedidos.filter(matchPessoa).filter(matchData).filter(matchProduto);
  const pedidosAbertos  = filtrados.filter(p => p.statusLabel !== "concluido");
  const pedidosConcluidos = filtrados.filter(p => p.statusLabel === "concluido").filter(p => dentroDoperiodo(p.dataAtualizacao || p.dataCriacao));

  // Auto-expandir e destacar quando busca por produto está ativa
  useEffect(() => {
    const q = filtroProduto.trim();
    if (!q) return;
    // Expande o primeiro pedido que tem itens matching
    const primeiro = filtrados.find(p => p.itens?.some(i => i.codigo.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase())));
    if (primeiro) setExpandidoId(primeiro.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroProduto]);

  function itemDestacado(item: ItemConferencia): boolean {
    const q = filtroProduto.trim().toLowerCase();
    if (!q) return false;
    return item.codigo.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
  }

  const temFiltroAtivo = filtroPessoa !== "todos" || filtroDataDe || filtroDataAte || filtroProduto;

  // chips de filtro
  const chips = [
    { key: "pessoa"  as const, Icon: User,       label: "Pessoa",  ativo: filtroPessoa !== "todos"       },
    { key: "data"    as const, Icon: Calendar,   label: "Data",    ativo: !!(filtroDataDe || filtroDataAte) },
    { key: "produto" as const, Icon: Search,     label: "Produto", ativo: !!filtroProduto                },
  ];

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-3xl mx-auto" : "max-w-md mx-auto"}`} style={{ background: "hsl(var(--background))" }}>

      {/* Scanner popup */}
      {mostrarScanner && (
        <BarcodeScanner
          onDetected={(code) => { setFiltroProduto(code); setMostrarScanner(false); setFiltroAtivo("produto"); }}
          onClose={() => setMostrarScanner(false)}
        />
      )}

      {/* Header */}
      <header style={{ padding: modoDesktop ? "20px 32px 24px" : "16px 20px 20px", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
        <button onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "inherit", cursor: "pointer", marginBottom: 12, opacity: 0.85, fontWeight: 600, fontSize: 14 }}>
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
          <button onClick={() => buscarPedidos(true)} disabled={loading} style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.15)", border: "none", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw style={{ width: 18, height: 18, animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Chips de filtro */}
      {!loading && todosPedidos.length > 0 && (
        <div style={{ padding: `12px ${modoDesktop ? "32px" : "16px"} 0`, display: "flex", flexDirection: "column", gap: 0 }}>

          {/* linha de chips */}
          <div style={{ display: "flex", gap: 8 }}>
            {chips.map(({ key, Icon, label, ativo }) => (
              <button
                key={key}
                onClick={() => toggleFiltro(key)}
                style={{
                  flex: 1, height: 40, borderRadius: 10, border: "1.5px solid",
                  borderColor: filtroAtivo === key ? "hsl(var(--primary))" : ativo ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))",
                  background: filtroAtivo === key ? "hsl(var(--primary))" : ativo ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
                  color: filtroAtivo === key ? "hsl(var(--primary-foreground))" : ativo ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  fontWeight: 700, fontSize: 12,
                }}
              >
                <Icon style={{ width: 13, height: 13 }} />
                {label}
                {ativo && filtroAtivo !== key && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--primary))", display: "inline-block" }} />}
              </button>
            ))}
            {/* limpar todos */}
            {temFiltroAtivo && (
              <button
                onClick={() => { setFiltroPessoa("todos"); setFiltroDataDe(""); setFiltroDataAte(""); setFiltroProduto(""); setFiltroAtivo(null); }}
                style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--card))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))", flexShrink: 0 }}
                title="Limpar filtros"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          {/* Painel: Pessoa */}
          {filtroAtivo === "pessoa" && (
            <div style={{ marginTop: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
              {[{ key: "todos", label: `Todos (${todosPedidos.length})` }, ...pessoas.map(p => ({ key: p, label: `${p} (${todosPedidos.filter(x => x.pessoa.toLowerCase() === p.toLowerCase()).length})` }))].map(({ key, label }) => (
                <button key={key} onClick={() => { setFiltroPessoa(key); setFiltroAtivo(null); }} style={{ width: "100%", padding: "13px 16px", textAlign: "left", background: filtroPessoa === key ? "hsl(var(--primary) / 0.08)" : "transparent", border: "none", borderBottom: "1px solid hsl(var(--border))", cursor: "pointer", fontWeight: filtroPessoa === key ? 700 : 500, fontSize: 14, color: filtroPessoa === key ? "hsl(var(--primary))" : "hsl(var(--foreground))", display: "flex", alignItems: "center", gap: 8 }}>
                  <User style={{ width: 13, height: 13, opacity: 0.5 }} /> {label}
                </button>
              ))}
            </div>
          )}

          {/* Painel: Data */}
          {filtroAtivo === "data" && (
            <div style={{ marginTop: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Data do pedido</p>
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>De</span>
                  <input type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} style={{ height: 40, borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", padding: "0 10px", fontSize: 13, width: "100%" }} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Até</span>
                  <input type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} style={{ height: 40, borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", padding: "0 10px", fontSize: 13, width: "100%" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setFiltroDataDe(""); setFiltroDataAte(""); }} style={{ flex: 1, height: 36, borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>Limpar</button>
                <button onClick={() => setFiltroAtivo(null)} style={{ flex: 1, height: 36, borderRadius: 8, border: "none", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Aplicar</button>
              </div>
            </div>
          )}

          {/* Painel: Produto */}
          {filtroAtivo === "produto" && (
            <div style={{ marginTop: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Código ou Descrição</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={filtroProduto}
                  onChange={e => setFiltroProduto(e.target.value)}
                  placeholder="Código ou descrição..."
                  autoFocus
                  style={{ flex: 1, height: 44, borderRadius: 10, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", padding: "0 14px", fontSize: 14 }}
                />
                <button
                  onClick={() => setMostrarScanner(true)}
                  title="Escanear código de barras"
                  style={{ width: 44, height: 44, borderRadius: 10, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--card))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--primary))", flexShrink: 0 }}
                >
                  <ScanBarcode style={{ width: 20, height: 20 }} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setFiltroProduto("")} style={{ flex: 1, height: 36, borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>Limpar</button>
                <button onClick={() => setFiltroAtivo(null)} style={{ flex: 1, height: 36, borderRadius: 8, border: "none", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Aplicar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: modoDesktop ? "16px 32px 32px" : "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }} onClick={() => filtroAtivo === "pessoa" && setFiltroAtivo(null)}>

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

        {!loading && !erro && todosPedidos.length > 0 && filtrados.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "hsl(var(--muted-foreground))" }}>
            <Search style={{ width: 28, height: 28, margin: "0 auto 10px", opacity: 0.35 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum pedido com esses filtros</p>
          </div>
        )}

        {/* Pedidos em andamento */}
        {pedidosAbertos.length > 0 && (
          <>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              Em aberto · {pedidosAbertos.length}
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
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>{formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Pedidos concluídos */}
        {filtrados.some(p => p.statusLabel === "concluido") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: pedidosAbertos.length > 0 ? 8 : 4 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>Concluídos</p>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {(["dia", "semana", "mes"] as const).map((p) => (
                <button key={p} onClick={() => setFiltroPeriodo(p)} style={{ height: 28, padding: "0 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: filtroPeriodo === p ? "hsl(var(--foreground))" : "transparent", color: filtroPeriodo === p ? "hsl(var(--background))" : "hsl(var(--muted-foreground))", borderColor: filtroPeriodo === p ? "hsl(var(--foreground))" : "hsl(var(--border))", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {p === "dia" ? "Hoje" : p === "semana" ? "7 dias" : "30 dias"}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtrados.some(p => p.statusLabel === "concluido") && pedidosConcluidos.length === 0 && (
          <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "16px 0" }}>Nenhum concluído no período selecionado.</p>
        )}

        {pedidosConcluidos.map((pedido) => {
          const cfg = STATUS_CONFIG.concluido;
          const expandido = expandidoId === pedido.id;
          const itens = pedido.itens ?? [];
          const itensPorStatus = {
            nao_tem: itens.filter(i => i.status === "nao_tem"),
            nao_tem_tudo: itens.filter(i => i.status === "nao_tem_tudo"),
            pendente: itens.filter(i => i.status === "pendente"),
            separado: itens.filter(i => i.status === "separado"),
          };
          return (
            <div key={pedido.id} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, overflow: "hidden" }}>
              <button onClick={() => toggleExpansao(pedido.id)} style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: cfg.color + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CheckCircle2 style={{ width: 20, height: 20, color: cfg.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pedido.titulo}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.color + "20", borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{pedido.pessoa}</span>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>{formatarData(pedido.dataAtualizacao || pedido.dataCriacao)}</p>
                  </div>
                  <div style={{ alignSelf: "center", flexShrink: 0, color: "hsl(var(--muted-foreground))" }}>
                    {expandido ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
                  </div>
                </div>
                {pedido.resumo && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 12 }}>
                    {[
                      { label: "Separado", value: pedido.resumo.separado, color: "hsl(var(--success))" },
                      { label: "Não tem",  value: pedido.resumo.naoTem,   color: "hsl(var(--destructive))" },
                      { label: "Parcial",  value: pedido.resumo.parcial,  color: "hsl(var(--warning))" },
                      { label: "Pendente", value: pedido.resumo.pendente, color: "hsl(var(--muted-foreground))" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: "hsl(var(--secondary))", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                        <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                        <p style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </button>
              {expandido && (
                <div style={{ borderTop: "1px solid hsl(var(--border))", padding: "12px 16px 14px" }}>
                  {itens.length === 0 && <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "8px 0" }}>Itens não disponíveis nesta task.</p>}
                  {itens.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {(["nao_tem", "nao_tem_tudo", "pendente", "separado"] as const).filter(s => itensPorStatus[s].length > 0).map((status) => {
                        const { label, color, emoji } = ITEM_STATUS[status];
                        return (
                          <div key={status}>
                            <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>{emoji} {label} ({itensPorStatus[status].length})</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {itensPorStatus[status].map((item) => (
                                <div key={item.codigo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: itemDestacado(item) ? "hsl(var(--warning) / 0.15)" : color + "0D", border: itemDestacado(item) ? "2px solid hsl(var(--warning))" : `1px solid ${color}22` }}>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>{item.codigo}</p>
                                    {item.sku   && <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>SKU: {item.sku}</p>}
                                    {item.secao && <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{item.secao}</p>}
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Pedido: <strong>{item.quantidadePedida}</strong></p>
                                    {item.quantidadeReal !== null && <p style={{ fontSize: 11, color }}>Real: <strong>{item.quantidadeReal}</strong></p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

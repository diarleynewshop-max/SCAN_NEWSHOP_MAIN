import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, FileJson, FileX, ChevronRight, ChevronsRight } from "lucide-react";

interface KanbanTask {
  id: string;
  titulo: string;
  pessoa: string;
  statusClickUp: string;
  statusLabel: "pedido_no_cd" | "pronto_conferencia" | "concluido";
  dataCriacao: string;
  dataAtualizacao: string;
  temAnexo: boolean;
  semJsonTag: boolean;
}

interface KanbanAdminProps {
  empresa: string;
  flag: string;
}

const PROXY_URL = "/api/clickup-proxy";

function formatarData(ts: string): string {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const COL_CONFIG = {
  pedido_no_cd:       { label: "Pendente",  color: "hsl(var(--warning))",  bg: "hsl(var(--warning) / 0.07)",  border: "hsl(var(--warning) / 0.2)"  },
  pronto_conferencia: { label: "Analisado", color: "hsl(var(--primary))",  bg: "hsl(var(--primary) / 0.05)",  border: "hsl(var(--primary) / 0.15)" },
  concluido:          { label: "Concluído", color: "hsl(var(--success))",  bg: "hsl(var(--success) / 0.05)",  border: "hsl(var(--success) / 0.15)" },
} as const;

export default function KanbanAdmin({ empresa, flag }: KanbanAdminProps) {
  const [tasks, setTasks]       = useState<KanbanTask[]>([]);
  const [loading, setLoading]   = useState(false);
  const [erro, setErro]         = useState<string | null>(null);
  const [movendo, setMovendo]   = useState<Set<string>>(new Set());
  const [marcando, setMarcando] = useState(false);

  const buscar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const params = new URLSearchParams({ action: "buscar-kanban-admin", empresa, flag });
      const res = await fetch(`${PROXY_URL}?${params}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erro ${res.status}`); }
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e: any) { setErro(e.message ?? "Erro ao carregar"); }
    finally { setLoading(false); }
  }, [empresa, flag]);

  useEffect(() => { buscar(); }, [buscar]);

  async function moverStatus(taskId: string, novoStatus: string) {
    setMovendo(p => new Set(p).add(taskId));
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mover-status-pedido", empresa, flag, taskId, novoStatus }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erro ${res.status}`); }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, statusLabel: "pronto_conferencia", statusClickUp: "analisado" } : t));
    } catch (e: any) { alert(`Erro ao mover: ${(e as Error).message}`); }
    finally { setMovendo(p => { const s = new Set(p); s.delete(taskId); return s; }); }
  }

  async function moverTodos() {
    const pendentes = tasks.filter(t => t.statusLabel === "pedido_no_cd");
    if (pendentes.length === 0) return;
    if (!confirm(`Mover ${pendentes.length} pedido(s) para Analisado?`)) return;
    setMovendo(new Set(pendentes.map(t => t.id)));
    try {
      await Promise.all(pendentes.map(t => fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mover-status-pedido", empresa, flag, taskId: t.id, novoStatus: "analisado" }),
      })));
      setTasks(prev => prev.map(t => t.statusLabel === "pedido_no_cd" ? { ...t, statusLabel: "pronto_conferencia", statusClickUp: "analisado" } : t));
    } catch (e: any) { alert(`Erro: ${(e as Error).message}`); }
    finally { setMovendo(new Set()); }
  }

  async function marcarSemJson() {
    const semAnexo = tasks.filter(t => !t.temAnexo && !t.semJsonTag);
    if (semAnexo.length === 0) { alert("Nenhum pedido sem JSON encontrado."); return; }
    if (!confirm(`Marcar ${semAnexo.length} pedido(s) sem anexo com etiqueta "SEM JSON" no ClickUp?`)) return;
    setMarcando(true);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "marcar-sem-json", empresa, flag, taskIds: semAnexo.map(t => t.id) }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setTasks(prev => prev.map(t => !t.temAnexo ? { ...t, semJsonTag: true } : t));
    } catch (e: any) { alert(`Erro: ${(e as Error).message}`); }
    finally { setMarcando(false); }
  }

  const cols: Array<"pedido_no_cd" | "pronto_conferencia" | "concluido"> = ["pedido_no_cd", "pronto_conferencia", "concluido"];

  if (loading) return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: "hsl(var(--muted-foreground))" }}>
      <RefreshCw style={{ width: 28, height: 28, margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
      <p style={{ fontSize: 14, fontWeight: 600 }}>Carregando Kanban...</p>
    </div>
  );

  if (erro) return (
    <div style={{ margin: 16, background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.25)", borderRadius: 12, padding: 16, display: "flex", gap: 10 }}>
      <AlertTriangle style={{ width: 18, height: 18, color: "hsl(var(--destructive))", flexShrink: 0 }} />
      <div>
        <p style={{ fontWeight: 700, fontSize: 14, color: "hsl(var(--destructive))" }}>Erro ao carregar</p>
        <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{erro}</p>
      </div>
    </div>
  );

  const semAnexoCount = tasks.filter(t => !t.temAnexo && !t.semJsonTag).length;
  const pendentesCount = tasks.filter(t => t.statusLabel === "pedido_no_cd").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Barra de ações */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid hsl(var(--border))" }}>
        <button onClick={buscar} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw style={{ width: 13, height: 13 }} /> Atualizar
        </button>
        {pendentesCount > 0 && (
          <button onClick={moverTodos} disabled={movendo.size > 0} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: "hsl(var(--warning))", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, opacity: movendo.size > 0 ? 0.6 : 1 }}>
            <ChevronsRight style={{ width: 13, height: 13 }} /> Mover todos ({pendentesCount}) → Analisado
          </button>
        )}
        {semAnexoCount > 0 && (
          <button onClick={marcarSemJson} disabled={marcando} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid hsl(var(--destructive) / 0.4)", background: "transparent", color: "hsl(var(--destructive))", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, opacity: marcando ? 0.6 : 1 }}>
            <FileX style={{ width: 13, height: 13 }} /> Marcar SEM JSON ({semAnexoCount})
          </button>
        )}
      </div>

      {/* Colunas Kanban */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, overflowX: "auto", minHeight: 200 }}>
        {cols.map(col => {
          const cfg = COL_CONFIG[col];
          const colTasks = tasks.filter(t => t.statusLabel === col);
          return (
            <div key={col} style={{ borderRight: col !== "concluido" ? "1px solid hsl(var(--border))" : "none", display: "flex", flexDirection: "column" }}>
              {/* Header coluna */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid hsl(var(--border))", background: cfg.bg, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{cfg.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>{colTasks.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                {colTasks.length === 0 && (
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "16px 0" }}>Vazio</p>
                )}
                {colTasks.map(task => {
                  const emMovimento = movendo.has(task.id);
                  return (
                    <div key={task.id} style={{ background: "hsl(var(--card))", border: `1px solid ${task.semJsonTag ? "hsl(var(--destructive) / 0.35)" : "hsl(var(--border))"}`, borderRadius: 10, padding: "10px 12px", opacity: emMovimento ? 0.5 : 1, transition: "opacity 0.2s" }}>
                      {/* Título */}
                      <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.3, marginBottom: 4, wordBreak: "break-word" }}>{task.titulo || task.pessoa}</p>

                      {/* Pessoa + data */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.color + "18", borderRadius: 5, padding: "1px 6px" }}>{task.pessoa}</span>
                        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{formatarData(task.dataAtualizacao || task.dataCriacao)}</span>
                      </div>

                      {/* Indicador de anexo */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {task.temAnexo ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--success))", background: "hsl(var(--success) / 0.1)", borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                            <FileJson style={{ width: 10, height: 10 }} /> JSON
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--destructive))", background: "hsl(var(--destructive) / 0.1)", borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                            <FileX style={{ width: 10, height: 10 }} /> {task.semJsonTag ? "SEM JSON ✓" : "SEM JSON"}
                          </span>
                        )}

                        {/* Botão mover para Analisado */}
                        {col === "pedido_no_cd" && (
                          <button
                            onClick={() => moverStatus(task.id, "analisado")}
                            disabled={emMovimento}
                            style={{ marginLeft: "auto", height: 24, padding: "0 8px", borderRadius: 6, border: "none", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}
                          >
                            {emMovimento ? <RefreshCw style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : <ChevronRight style={{ width: 10, height: 10 }} />}
                            Analisado
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

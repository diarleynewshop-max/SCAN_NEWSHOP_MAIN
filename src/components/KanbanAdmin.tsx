import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, AlertTriangle, FileJson, FileX, ChevronRight } from "lucide-react";

interface KanbanTask {
  id: string;
  titulo: string;
  pessoa: string;
  statusClickUp: string;
  statusLabel: string;
  dataCriacao: string;
  dataAtualizacao: string;
  temAnexo: boolean;
  semJsonTag: boolean;
}

interface ClickUpStatus {
  status: string;
  color: string;
  orderindex: number;
  type: string;
}

interface KanbanAdminProps {
  empresa: string;
  flag: string;
}

const PROXY_URL = "/api/clickup-proxy";
const CONCLUIDO_DIAS = 7;

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

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r)) return "128,128,128";
  return `${r},${g},${b}`;
}

export default function KanbanAdmin({ empresa, flag }: KanbanAdminProps) {
  const [tasks,    setTasks]    = useState<KanbanTask[]>([]);
  const [statuses, setStatuses] = useState<ClickUpStatus[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const [movendo,  setMovendo]  = useState<Set<string>>(new Set());

  const buscar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const params = new URLSearchParams({ action: "buscar-kanban-admin", empresa, flag });
      const res = await fetch(`${PROXY_URL}?${params}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erro ${res.status}`); }
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
    } catch (e: any) { setErro(e.message ?? "Erro ao carregar"); }
    finally { setLoading(false); }
  }, [empresa, flag]);

  useEffect(() => { buscar(); }, [buscar]);

  function proxyPost(action: string, body: object) {
    const params = new URLSearchParams({ action, empresa, flag });
    return fetch(`${PROXY_URL}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function moverStatus(taskId: string, novoStatus: string) {
    setMovendo(p => new Set(p).add(taskId));
    try {
      const res = await proxyPost("mover-status-pedido", { taskId, novoStatus });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Erro ${res.status}`); }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, statusClickUp: novoStatus, statusLabel: novoStatus } : t));
    } catch (e: any) { alert(`Erro ao mover: ${(e as Error).message}`); }
    finally { setMovendo(p => { const s = new Set(p); s.delete(taskId); return s; }); }
  }

  async function marcarSemJson(colStatus: string) {
    const semAnexo = tasks.filter(t => t.statusClickUp === colStatus && !t.temAnexo && !t.semJsonTag);
    if (semAnexo.length === 0) { alert("Nenhum pedido sem JSON nesta coluna."); return; }
    if (!confirm(`Marcar ${semAnexo.length} pedido(s) sem anexo com etiqueta "SEM JSON"?`)) return;
    try {
      const res = await proxyPost("marcar-sem-json", { taskIds: semAnexo.map(t => t.id) });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setTasks(prev => prev.map(t => !t.temAnexo && t.statusClickUp === colStatus ? { ...t, semJsonTag: true } : t));
    } catch (e: any) { alert(`Erro: ${(e as Error).message}`); }
  }

  const cols = useMemo(() => {
    if (statuses.length === 0) return [];
    return [...statuses].sort((a, b) => {
      if (a.type === "closed" && b.type !== "closed") return 1;
      if (b.type === "closed" && a.type !== "closed") return -1;
      return a.orderindex - b.orderindex;
    });
  }, [statuses]);

  const nextStatusMap = useMemo(() => {
    const map: Record<string, ClickUpStatus | null> = {};
    cols.forEach((col, i) => { map[col.status] = i < cols.length - 1 ? cols[i + 1] : null; });
    return map;
  }, [cols]);

  const tasksPorColuna = useMemo(() => {
    const cutoff = Date.now() - CONCLUIDO_DIAS * 86400000;
    const map: Record<string, KanbanTask[]> = {};
    cols.forEach(col => {
      let colTasks = tasks.filter(t => t.statusClickUp === col.status);
      if (col.type === "closed" || col.type === "done") {
        colTasks = colTasks.filter(t => Number(t.dataAtualizacao || t.dataCriacao) >= cutoff);
      }
      map[col.status] = colTasks;
    });
    return map;
  }, [tasks, cols]);

  if (loading) return (
    <div style={{ textAlign: "center", padding: "48px 16px", color: "hsl(var(--muted-foreground))" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

  const temConcluido = cols.some(c => c.type === "closed" || c.type === "done");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Barra de ações */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid hsl(var(--border))", alignItems: "center" }}>
        <button
          onClick={buscar}
          style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid hsl(var(--border))", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center", gap: 5 }}
        >
          <RefreshCw style={{ width: 13, height: 13 }} /> Atualizar
        </button>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {tasks.length} pedido{tasks.length !== 1 ? "s" : ""} · {cols.length} coluna{cols.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grade de colunas com scroll horizontal */}
      <div style={{ overflowX: "auto", display: "flex", gap: 0, minHeight: 200, alignItems: "stretch" }}>
        {cols.map((col, colIdx) => {
          const rgb = hexToRgb(col.color);
          const colTasks = tasksPorColuna[col.status] ?? [];
          const isClosed = col.type === "closed" || col.type === "done";
          const semAnexoCount = colTasks.filter(t => !t.temAnexo && !t.semJsonTag).length;
          const nextCol = nextStatusMap[col.status];

          return (
            <div
              key={col.status}
              style={{
                minWidth: 220,
                maxWidth: 260,
                flex: "0 0 240px",
                borderRight: colIdx < cols.length - 1 ? "1px solid hsl(var(--border))" : "none",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div style={{ padding: "9px 12px", borderBottom: "1px solid hsl(var(--border))", background: `rgba(${rgb},0.07)`, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: col.color, textTransform: "uppercase", letterSpacing: "0.08em", flex: 1 }}>
                  {col.status}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>
                  {colTasks.length}{isClosed ? "*" : ""}
                </span>
                {semAnexoCount > 0 && (
                  <button
                    onClick={() => marcarSemJson(col.status)}
                    title={`Marcar ${semAnexoCount} sem JSON`}
                    style={{ height: 20, padding: "0 6px", borderRadius: 5, border: "1px solid hsl(var(--destructive) / 0.4)", background: "transparent", color: "hsl(var(--destructive))", cursor: "pointer", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 2 }}
                  >
                    <FileX style={{ width: 9, height: 9 }} /> {semAnexoCount}
                  </button>
                )}
              </div>

              {/* Cards */}
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                {colTasks.length === 0 && (
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "16px 0" }}>
                    {isClosed ? `Vazio (${CONCLUIDO_DIAS}d)` : "Vazio"}
                  </p>
                )}
                {colTasks.map(task => {
                  const emMovimento = movendo.has(task.id);
                  return (
                    <div
                      key={task.id}
                      style={{
                        background: "hsl(var(--card))",
                        border: `1px solid ${task.semJsonTag ? "hsl(var(--destructive) / 0.35)" : "hsl(var(--border))"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        opacity: emMovimento ? 0.5 : 1,
                        transition: "opacity 0.2s",
                      }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.3, marginBottom: 4, wordBreak: "break-word" }}>
                        {task.titulo || task.pessoa}
                      </p>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: col.color, background: `rgba(${rgb},0.12)`, borderRadius: 5, padding: "1px 6px" }}>
                          {task.pessoa}
                        </span>
                        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                          {formatarData(task.dataAtualizacao || task.dataCriacao)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        {task.temAnexo ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--success))", background: "hsl(var(--success) / 0.1)", borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                            <FileJson style={{ width: 10, height: 10 }} /> JSON
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--destructive))", background: "hsl(var(--destructive) / 0.1)", borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                            <FileX style={{ width: 10, height: 10 }} /> {task.semJsonTag ? "SEM JSON ✓" : "SEM JSON"}
                          </span>
                        )}

                        {!isClosed && nextCol && (
                          <button
                            onClick={() => moverStatus(task.id, nextCol.status)}
                            disabled={emMovimento}
                            style={{
                              marginLeft: "auto",
                              height: 24,
                              padding: "0 8px",
                              borderRadius: 6,
                              border: "none",
                              background: nextCol.color,
                              color: "#fff",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                              opacity: emMovimento ? 0.6 : 1,
                            }}
                          >
                            {emMovimento
                              ? <RefreshCw style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
                              : <ChevronRight style={{ width: 10, height: 10 }} />
                            }
                            {nextCol.status}
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

      {temConcluido && (
        <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", padding: "4px 16px 8px", textAlign: "right" }}>
          * Concluídos: últimos {CONCLUIDO_DIAS} dias
        </p>
      )}
    </div>
  );
}

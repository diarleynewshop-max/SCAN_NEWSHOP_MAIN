import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScanBarcode, ClipboardList, GitCompare,
  BadgeDollarSign, Package, CheckCircle2, AlertCircle, TrendingUp,
  RefreshCw, CheckCheck, XCircle, AlertTriangle, Clock,
} from "lucide-react";
import type { LoginData } from "@/hooks/useAuth";
import { listarRelatoriosSalvos, type RelatorioSalvo, type EmpresaKey, type FlagKey } from "@/lib/clickupApi";

const STORAGE_KEY = "scan_newshop_lists";
const DAYS = 7;

type StoredList = {
  id?: string;
  status?: string;
  sentToClickUp?: boolean;
  createdAt?: string | number;
  products?: unknown[];
};

interface DashStats {
  paraConferir: number;
  conferidas: number;
  totalItens: number;
  conferidasUltimos7: number;
  porDia: { dia: string; valor: number }[];
}

function computeStats(): DashStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { paraConferir: 0, conferidas: 0, totalItens: 0, conferidasUltimos7: 0, porDia: emptyDays() };
    const lists = JSON.parse(raw) as StoredList[];

    const paraConferir = lists.filter(l => l.status === "open").length;
    const conferidas = lists.filter(l => l.sentToClickUp === true || l.status === "green").length;
    const totalItens = lists.reduce((a, l) => a + (l.products?.length ?? 0), 0);

    const agora = Date.now();
    const corte = agora - DAYS * 24 * 60 * 60 * 1000;
    const ultimas = lists.filter(l => {
      const t = typeof l.createdAt === "string" ? new Date(l.createdAt).getTime() : (l.createdAt ?? 0);
      return t >= corte && (l.sentToClickUp === true || l.status === "green");
    });

    const porDia = buildPorDiaLocal(ultimas);
    return { paraConferir, conferidas, totalItens, conferidasUltimos7: ultimas.length, porDia };
  } catch {
    return { paraConferir: 0, conferidas: 0, totalItens: 0, conferidasUltimos7: 0, porDia: emptyDays() };
  }
}

function emptyDays() {
  const out: { dia: string; valor: number }[] = [];
  const hoje = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    out.push({ dia: diaLabel(d), valor: 0 });
  }
  return out;
}

function buildPorDiaLocal(lists: StoredList[]) {
  const out = emptyDays();
  for (const l of lists) {
    const t = typeof l.createdAt === "string" ? new Date(l.createdAt).getTime() : (l.createdAt ?? 0);
    const d = new Date(t);
    const label = diaLabel(d);
    const slot = out.find(o => o.dia === label);
    if (slot) slot.valor += 1;
  }
  return out;
}

function buildPorDiaFromRelatorios(relatorios: RelatorioSalvo[]): { dia: string; valor: number }[] {
  const out = emptyDays();
  for (const r of relatorios) {
    // r.data é "YYYY-MM-DD"
    const parts = r.data.split("-");
    if (parts.length !== 3) continue;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const label = diaLabel(d);
    const slot = out.find(o => o.dia === label);
    if (slot) slot.valor = r.totalConferencias;
  }
  return out;
}

function diaLabel(d: Date) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
}

const LABEL_MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "hsl(var(--muted-foreground))",
};

interface KpiProps {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: number | string;
  hint: string;
  accent?: string;
}

function Kpi({ icon: Icon, label, value, hint, accent = "hsl(var(--foreground))" }: KpiProps) {
  return (
    <div style={{
      flex: 1,
      minWidth: 180,
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 16,
      padding: "20px 22px",
      boxShadow: "var(--shadow-sm)",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={LABEL_MONO}>{label}</p>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "hsl(var(--secondary))",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <p style={{
        fontFamily: "var(--font-serif)",
        fontSize: 38,
        fontWeight: 900,
        color: "hsl(var(--foreground))",
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </p>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{hint}</p>
    </div>
  );
}

function BarChart7Dias({ data, loading }: { data: { dia: string; valor: number }[]; loading?: boolean }) {
  const max = Math.max(1, ...data.map(d => d.valor));
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-end",
      gap: 12,
      height: 160,
      padding: "0 4px",
      opacity: loading ? 0.4 : 1,
      transition: "opacity 0.3s",
    }}>
      {data.map((d) => {
        const h = (d.valor / max) * 100;
        return (
          <div key={d.dia} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            height: "100%",
          }}>
            <div style={{
              flex: 1,
              width: "100%",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}>
              <div style={{
                width: "100%",
                maxWidth: 36,
                height: `${Math.max(h, 4)}%`,
                background: d.valor > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                borderRadius: "6px 6px 0 0",
                transition: "height 0.3s ease",
                position: "relative",
              }}>
                {d.valor > 0 && (
                  <span style={{
                    position: "absolute",
                    top: -18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "hsl(var(--foreground))",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {d.valor}
                  </span>
                )}
              </div>
            </div>
            <p style={{
              fontSize: 10,
              color: "hsl(var(--muted-foreground))",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
            }}>
              {d.dia}
            </p>
          </div>
        );
      })}
    </div>
  );
}

const QUICK_ACTIONS = [
  { icon: ScanBarcode, label: "Escanear", desc: "Ler código de barras", path: "/scanner" },
  { icon: ClipboardList, label: "Lista", desc: "Ver histórico", path: "/scanner?tab=list" },
  { icon: GitCompare, label: "Conferência", desc: "Importar e conferir", path: "/scanner?tab=conference" },
  { icon: BadgeDollarSign, label: "Consulta Preço", desc: "Varejo · Atacado · Grupo", path: "/consulta-preco" },
];

interface ClickUpSummary {
  separado: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  totalItens: number;
  totalConferencias: number;
  porDia: { dia: string; valor: number }[];
}

export function ErpDashboard({ loginSalvo }: { loginSalvo: LoginData | null }) {
  const navigate = useNavigate();
  const stats = useMemo(computeStats, []);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const nome = loginSalvo?.nomePessoa || "usuário";

  const [cuSummary, setCuSummary] = useState<ClickUpSummary | null>(null);
  const [cuLoading, setCuLoading] = useState(false);
  const [cuError, setCuError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState(0);

  const fetchClickUp = () => {
    if (!loginSalvo?.empresa) return;
    setCuLoading(true);
    setCuError(null);

    listarRelatoriosSalvos(loginSalvo.empresa as EmpresaKey, (loginSalvo.flag ?? "loja") as FlagKey)
      .then(relatorios => {
        const ultimos7 = relatorios.slice(0, DAYS);
        const resumo = ultimos7.reduce(
          (acc, r) => ({
            separado: acc.separado + (r.resumo?.separado ?? 0),
            naoTem: acc.naoTem + (r.resumo?.naoTem ?? 0),
            parcial: acc.parcial + (r.resumo?.parcial ?? 0),
            pendente: acc.pendente + (r.resumo?.pendente ?? 0),
            totalItens: acc.totalItens + (r.resumo?.totalItens ?? 0),
            totalConferencias: acc.totalConferencias + (r.totalConferencias ?? 0),
          }),
          { separado: 0, naoTem: 0, parcial: 0, pendente: 0, totalItens: 0, totalConferencias: 0 }
        );
        setCuSummary({ ...resumo, porDia: buildPorDiaFromRelatorios(ultimos7) });
        setLastFetch(Date.now());
      })
      .catch(err => setCuError(err.message ?? "Erro ao buscar dados do ClickUp"))
      .finally(() => setCuLoading(false));
  };

  useEffect(() => {
    fetchClickUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSalvo?.empresa, loginSalvo?.flag]);

  const porDia = cuSummary ? cuSummary.porDia : stats.porDia;
  const totalChart = cuSummary ? cuSummary.totalConferencias : stats.conferidasUltimos7;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1400 }}>
      {/* Saudação */}
      <div>
        <p style={{ ...LABEL_MONO, marginBottom: 6 }}>Painel Principal</p>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 900,
          color: "hsl(var(--foreground))",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}>
          {saudacao}, {nome}.
        </h1>
        <p style={{
          fontSize: 14,
          color: "hsl(var(--muted-foreground))",
          marginTop: 8,
          maxWidth: 560,
          lineHeight: 1.5,
        }}>
          Resumo das listas, conferências e atividade dos últimos {DAYS} dias.
        </p>
      </div>

      {/* KPIs locais */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <Kpi
          icon={AlertCircle}
          label="Para Conferir"
          value={stats.paraConferir}
          hint={stats.paraConferir === 1 ? "lista em aberto" : "listas em aberto"}
          accent="hsl(var(--warning))"
        />
        <Kpi
          icon={CheckCircle2}
          label="Conferidas"
          value={stats.conferidas}
          hint="enviadas ao ClickUp"
          accent="hsl(var(--success))"
        />
        <Kpi
          icon={TrendingUp}
          label={`Últimos ${DAYS} dias`}
          value={stats.conferidasUltimos7}
          hint="conferências locais"
          accent="hsl(var(--foreground))"
        />
        <Kpi
          icon={Package}
          label="Itens Acumulados"
          value={stats.totalItens}
          hint="produtos escaneados"
          accent="hsl(var(--muted-foreground))"
        />
      </div>

      {/* Gráfico + Ações rápidas */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 20,
      }}>
        {/* Gráfico 7 dias */}
        <div style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 16,
          padding: "22px 24px",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 22,
          }}>
            <div>
              <p style={LABEL_MONO}>
                {cuSummary ? "ClickUp — " : ""}Atividade — Últimos {DAYS} dias
              </p>
              <p style={{
                fontFamily: "var(--font-serif)",
                fontSize: 20,
                fontWeight: 700,
                color: "hsl(var(--foreground))",
                marginTop: 4,
              }}>
                Conferências por dia
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "hsl(var(--muted-foreground))",
                padding: "4px 10px",
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
              }}>
                {totalChart} total
              </span>
              {loginSalvo?.empresa && (
                <button
                  onClick={fetchClickUp}
                  disabled={cuLoading}
                  title="Atualizar dados do ClickUp"
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: "hsl(var(--secondary))",
                    border: "1px solid hsl(var(--border))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: cuLoading ? "default" : "pointer",
                    opacity: cuLoading ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} style={{
                    color: "hsl(var(--muted-foreground))",
                    animation: cuLoading ? "spin 1s linear infinite" : "none",
                  }} />
                </button>
              )}
            </div>
          </div>
          {cuError && (
            <p style={{ fontSize: 11, color: "hsl(var(--destructive))", marginBottom: 12 }}>
              ⚠ {cuError}
            </p>
          )}
          <BarChart7Dias data={porDia} loading={cuLoading} />
          {lastFetch > 0 && (
            <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 10, fontFamily: "var(--font-mono)" }}>
              ClickUp · atualizado {new Date(lastFetch).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {/* Ações rápidas */}
        <div style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 16,
          padding: "22px 22px",
          boxShadow: "var(--shadow-sm)",
        }}>
          <p style={{ ...LABEL_MONO, marginBottom: 14 }}>Acesso Rápido</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {QUICK_ACTIONS.map(({ icon: Icon, label, desc, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 12px",
                  borderRadius: 10,
                  background: "transparent",
                  border: "1px solid hsl(var(--border))",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "all 0.13s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--secondary))"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "hsl(var(--secondary))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={16} style={{ color: "hsl(var(--foreground))" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "hsl(var(--foreground))",
                    lineHeight: 1.2,
                  }}>
                    {label}
                  </p>
                  <p style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 2,
                  }}>
                    {desc}
                  </p>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs do ClickUp — últimos 7 relatórios */}
      {loginSalvo?.empresa && (
        <div>
          <p style={{ ...LABEL_MONO, marginBottom: 14 }}>
            Status ClickUp — últimos {DAYS} dias ({loginSalvo.empresa})
          </p>
          {cuLoading && !cuSummary && (
            <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Carregando dados do ClickUp…</p>
          )}
          {cuSummary && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Kpi
                icon={CheckCheck}
                label="Separado"
                value={cuSummary.separado}
                hint="itens separados"
                accent="hsl(var(--success))"
              />
              <Kpi
                icon={XCircle}
                label="Não Tem"
                value={cuSummary.naoTem}
                hint="sem estoque"
                accent="hsl(var(--destructive))"
              />
              <Kpi
                icon={AlertTriangle}
                label="Parcial"
                value={cuSummary.parcial}
                hint="quantidade parcial"
                accent="hsl(var(--warning))"
              />
              <Kpi
                icon={Clock}
                label="Pendente"
                value={cuSummary.pendente}
                hint="aguardando"
                accent="hsl(var(--muted-foreground))"
              />
              <Kpi
                icon={Package}
                label="Total Itens"
                value={cuSummary.totalItens}
                hint="no período"
                accent="hsl(var(--foreground))"
              />
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

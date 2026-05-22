import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScanBarcode, ClipboardList, GitCompare,
  BadgeDollarSign, Package, BarChart3,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { LoginData } from "@/hooks/useAuth";

const STORAGE_KEY = "scan_newshop_lists";

function getStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { total: 0, itens: 0, fechadas: 0, kb: 0 };
    const lists = JSON.parse(raw) as Array<{ status?: string; products?: unknown[] }>;
    return {
      total: lists.length,
      itens: lists.reduce((a, l) => a + (l.products?.length ?? 0), 0),
      fechadas: lists.filter(l => l.status !== 'open').length,
      kb: Math.round((raw.length * 2) / 1024),
    };
  } catch {
    return { total: 0, itens: 0, fechadas: 0, kb: 0 };
  }
}

function Spark({ color, up }: { color: string; up: boolean }) {
  const id = `sp${color.replace('#', '')}`;
  const p = up
    ? "M0,28 C16,24 28,17 38,13 C48,9 58,6 68,4 C78,2 88,1 96,1"
    : "M0,4 C16,8 28,14 38,18 C48,22 58,25 68,27 C78,28 88,29 96,30";
  return (
    <svg width="96" height="32" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${p} L96,32 L0,32 Z`} fill={`url(#${id})`} />
      <path d={p} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, color, up = true,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string; value: string | number; sub: string; color: string; up?: boolean;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 180,
      background: "#fff", borderRadius: 12,
      padding: "16px 18px", border: "1px solid #e5e7eb",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} style={{ color }} />
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, flex: 1 }}>{label}</p>
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: up ? "#059669" : "#d97706",
          background: up ? "#ecfdf5" : "#fffbeb",
          padding: "2px 7px", borderRadius: 4,
        }}>
          {up ? "↑ ativo" : "↓ vazio"}
        </span>
      </div>
      <p style={{ fontSize: 30, fontWeight: 800, color: "#111827", lineHeight: 1, marginBottom: 8 }}>{value}</p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <p style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</p>
        <Spark color={color} up={up} />
      </div>
    </div>
  );
}

const WEEK_DATA = [
  { d: "Seg", v: 14 }, { d: "Ter", v: 22 }, { d: "Qua", v: 11 },
  { d: "Qui", v: 28 }, { d: "Sex", v: 35 }, { d: "Sab", v: 18 }, { d: "Dom", v: 7 },
];

const QUICK_ACTIONS = [
  { icon: ScanBarcode, label: "Escanear", desc: "Ler código de barras", path: "/scanner", color: "#4f6ef7" },
  { icon: ClipboardList, label: "Lista", desc: "Ver histórico de listas", path: "/scanner?tab=list", color: "#10b981" },
  { icon: GitCompare, label: "Conferência", desc: "Importar e conferir NF", path: "/scanner?tab=conference", color: "#ef4444" },
  { icon: BadgeDollarSign, label: "Consulta Preço", desc: "Varejo · Atacado · Grupo", path: "/consulta-preco", color: "#f59e0b" },
];

export function ErpDashboard({ loginSalvo }: { loginSalvo: LoginData | null }) {
  const navigate = useNavigate();
  const stats = useMemo(getStats, []);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const nome = loginSalvo?.nomePessoa || "usuário";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400 }}>
      {/* Saudação */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0 }}>
          {saudacao}, {nome}!
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 5 }}>
          Resumo do sistema de pedidos, conferências e compras.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <KpiCard icon={ClipboardList} label="Total de Listas" value={stats.total} sub="no dispositivo" color="#4f6ef7" up={stats.total > 0} />
        <KpiCard icon={Package} label="Itens Escaneados" value={stats.itens} sub="total acumulado" color="#8b5cf6" up={stats.itens > 0} />
        <KpiCard icon={GitCompare} label="Listas Fechadas" value={stats.fechadas} sub="concluídas" color="#10b981" up={stats.fechadas > 0} />
        <KpiCard icon={BarChart3} label="Cache Local" value={`${stats.kb} KB`} sub="armazenado" color="#f59e0b" up={false} />
      </div>

      {/* Gráfico + Acesso Rápido */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 20 }}>
        {/* Gráfico de barras */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 20px 12px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Atividade semanal</p>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>Itens escaneados por dia (estimativa)</p>
            </div>
            <span style={{ fontSize: 11, color: "#4f6ef7", fontWeight: 600, background: "#eff4ff", padding: "4px 10px", borderRadius: 6 }}>
              Esta semana
            </span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={WEEK_DATA} barSize={30}>
              <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#1a1f36", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                cursor={{ fill: "#f3f4f6" }}
              />
              <Bar dataKey="v" fill="#4f6ef7" radius={[6, 6, 0, 0]} name="Itens" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Acesso Rápido */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 14, marginTop: 0 }}>Acesso Rápido</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {QUICK_ACTIONS.map(({ icon: Icon, label, desc, path, color }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "11px 12px", borderRadius: 9,
                  background: "#f9fafb", border: "1px solid #f3f4f6",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "all 0.13s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${color}0d`; e.currentTarget.style.borderColor = `${color}2a`; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#f3f4f6"; }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", lineHeight: 1.2, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, marginBottom: 0 }}>{desc}</p>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

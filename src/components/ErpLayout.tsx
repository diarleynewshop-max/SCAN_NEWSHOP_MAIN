import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ScanBarcode, ClipboardList, GitCompare, BadgeDollarSign,
  Package, ShoppingCart, BarChart3, Kanban, User, Settings,
  ChevronDown, ChevronRight, LogOut, Menu, Home,
} from "lucide-react";
import { hasAnyRoleAccess } from "@/components/ProtectedRoute";
import type { LoginData } from "@/hooks/useAuth";

const S = {
  bg: "#1a1f36",
  hover: "#252b46",
  active: "#4f6ef7",
  text: "rgba(255,255,255,0.72)" as string,
  textActive: "#ffffff" as string,
  group: "rgba(255,255,255,0.35)" as string,
  border: "rgba(255,255,255,0.07)" as string,
};

interface NavItemDef {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  path?: string;
  onClick?: () => void;
}

interface ErpLayoutProps {
  children: React.ReactNode;
  loginSalvo: LoginData | null;
  logoEmpresa: string;
  nomeEmpresaLogo: string;
  setMostrarPerfil: (v: boolean) => void;
  setMostrarConfiguracoes: (v: boolean) => void;
  fazerLogout: () => void;
  pageTitle?: string;
}

export function ErpLayout({
  children,
  loginSalvo,
  logoEmpresa,
  nomeEmpresaLogo,
  setMostrarPerfil,
  setMostrarConfiguracoes,
  fazerLogout,
  pageTitle = "Início",
}: ErpLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    operacional: true,
    gestao: true,
    admin: true,
  });

  const currentPath = location.pathname + location.search;
  const isPriv = !!loginSalvo?.role && hasAnyRoleAccess(loginSalvo.role, ['compras', 'admin', 'super']);
  const isAdm = !!loginSalvo?.role && hasAnyRoleAccess(loginSalvo.role, ['admin', 'super']);
  const flag = loginSalvo?.flag ?? 'loja';

  const groups: { key: string; label: string; items: NavItemDef[] }[] = [
    {
      key: "operacional",
      label: "Operacional",
      items: [
        { icon: Home, label: "Início", path: "/" },
        { icon: ScanBarcode, label: "Escanear", path: "/scanner" },
        { icon: ClipboardList, label: "Lista", path: "/scanner?tab=list" },
        ...((flag === 'cd' || isPriv) ? [{ icon: GitCompare, label: "Conferência", path: "/scanner?tab=conference" }] : []),
        { icon: BadgeDollarSign, label: "Consulta Preço", path: "/consulta-preco" },
        ...((flag === 'loja' || isPriv) ? [{ icon: Package, label: "Meus Pedidos", path: "/meus-pedidos" }] : []),
      ],
    },
    ...(isPriv ? [{
      key: "gestao",
      label: "Gestão",
      items: [
        { icon: ShoppingCart, label: "Compras", path: "/compras" },
        { icon: BarChart3, label: "Dashboard", path: "/dashboard" },
      ],
    }] : []),
    ...(isAdm ? [{
      key: "admin",
      label: "Admin",
      items: [{ icon: Kanban, label: "ClickUp", path: "/clickup" }],
    }] : []),
  ];

  function active(path?: string) {
    if (!path) return false;
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path.split('?')[0]);
  }

  function NavBtn({ icon: Icon, label, path, onClick }: NavItemDef) {
    const on = active(path);
    return (
      <button
        onClick={() => { onClick ? onClick() : path && navigate(path); }}
        title={collapsed ? label : undefined}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "9px 0" : "9px 14px",
          borderRadius: 7,
          background: on ? S.active : "transparent",
          border: "none", cursor: "pointer", marginBottom: 1,
          transition: "background 0.12s",
        }}
        onMouseEnter={e => { if (!on) e.currentTarget.style.background = S.hover; }}
        onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
      >
        <Icon size={17} style={{ color: on ? S.textActive : S.text, flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, color: on ? S.textActive : S.text }}>
            {label}
          </span>
        )}
      </button>
    );
  }

  const sideW = collapsed ? 58 : 230;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "#f1f3f9" }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: sideW, minWidth: sideW, height: "100vh",
        background: S.bg, display: "flex", flexDirection: "column",
        overflow: "hidden", transition: "width 0.2s ease", flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? "16px 10px" : "16px 14px",
          display: "flex", alignItems: "center", gap: 10,
          borderBottom: `1px solid ${S.border}`, marginBottom: 8,
        }}>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <img src={logoEmpresa} alt={nomeEmpresaLogo}
                style={{ height: 26, objectFit: "contain", maxWidth: "100%" }} />
              <p style={{ fontSize: 9, color: S.group, marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Sistema de Pedidos
              </p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{ background: "none", border: "none", cursor: "pointer", color: S.text, padding: 5, borderRadius: 6, flexShrink: 0, display: "flex" }}
          >
            <Menu size={16} />
          </button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "0 8px", overflowY: "auto" }}>
          {groups.map(g => (
            <div key={g.key} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <button
                  onClick={() => setOpenGroups(p => ({ ...p, [g.key]: !p[g.key] }))}
                  style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", padding: "3px 6px 5px", background: "none", border: "none", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.group, flex: 1, textAlign: "left" }}>
                    {g.label}
                  </span>
                  {openGroups[g.key] !== false
                    ? <ChevronDown size={10} style={{ color: S.group }} />
                    : <ChevronRight size={10} style={{ color: S.group }} />
                  }
                </button>
              )}
              {(openGroups[g.key] !== false || collapsed) && g.items.map(it => (
                <NavBtn key={it.label} {...it} />
              ))}
            </div>
          ))}

          <div style={{ marginTop: 4 }}>
            {!collapsed && (
              <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.group, padding: "3px 6px 5px" }}>
                Conta
              </p>
            )}
            <NavBtn icon={User} label="Perfil" onClick={() => setMostrarPerfil(true)} />
            <NavBtn icon={Settings} label="Configurações" onClick={() => setMostrarConfiguracoes(true)} />
          </div>
        </div>

        {/* User footer */}
        {loginSalvo && (
          <div style={{ padding: collapsed ? "10px 6px" : "10px 12px", borderTop: `1px solid ${S.border}` }}>
            {!collapsed ? (
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: S.active, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    {(loginSalvo.nomePessoa || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {loginSalvo.nomePessoa || "Usuário"}
                  </p>
                  <p style={{ fontSize: 10, color: S.group }}>{loginSalvo.role || "operador"}</p>
                </div>
                <button onClick={fazerLogout} title="Sair"
                  style={{ background: "none", border: "none", cursor: "pointer", color: S.text, padding: 4, display: "flex" }}>
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: S.active, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    {(loginSalvo.nomePessoa || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <header style={{
          height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", padding: "0 24px",
          flexShrink: 0, gap: 12,
        }}>
          <p style={{ flex: 1, fontSize: 11, color: "#9ca3af" }}>
            Início{pageTitle !== "Início" && (
              <> &rsaquo; <span style={{ color: "#374151", fontWeight: 500 }}>{pageTitle}</span></>
            )}
          </p>
          {loginSalvo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: S.active, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{(loginSalvo.nomePessoa || "U").charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", lineHeight: 1 }}>{loginSalvo.nomePessoa || "Usuário"}</p>
                <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1, marginTop: 2 }}>{loginSalvo.empresa} · {loginSalvo.role || "operador"}</p>
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

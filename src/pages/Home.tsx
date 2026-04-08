import { useNavigate } from "react-router-dom";
import { ScanBarcode, ClipboardList, GitCompare, Trash2, AlertTriangle, Eye, EyeOff, Store, User, ShoppingCart, BarChart3, Settings, Moon, Sun, Monitor, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { hasAnyRoleAccess } from "@/components/ProtectedRoute";

const LOGO = "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAABkAAD/4QMwaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA5LjEtYzAwMiA3OS5hNmE2Mzk2OGEsIDIwMjQvMDMvMDYtMTE6NTI6MDUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNS4xMSAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QjIwNEU4RUM4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QjIwNEU4RUQ4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpCMjA0RThFQTgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpCMjA0RThFQjgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pv/uAA5BZG9iZQBkwAAAAAH/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAMgAyADASIAAhEBAxEB/8QAHgABAAICAwEBAQAAAAAAAAAAAAgJBwoEBQYCAwH/xABYEAEAAQMDAgIEBgwKBwQJBQAAAQIDBAUGBwgREiEJEzFBGSJRV2F2FDI2OEJxdZWztNHTFRYjN1JigZGUlhcYWHJzscMkM0PUJVN0goOSoaOyNFRVk9L/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/9k=";

const STORAGE_KEY = "scan_newshop_lists";
const ACTIVE_KEY  = "scan_newshop_active_list";

function getStorageSize(): { kb: number; hasData: boolean; listCount: number; hasPhotos: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kb: 0, hasData: false, listCount: 0, hasPhotos: false };
    const kb = Math.round((raw.length * 2) / 1024); // UTF-16 aprox
    const parsed = JSON.parse(raw);
    const listCount = Array.isArray(parsed) ? parsed.filter((l: Record<string, unknown>) => l.status !== "open").length : 0;
    const hasPhotos = Array.isArray(parsed) && parsed.some((l: Record<string, unknown>) =>
      (l.products as Array<Record<string, unknown>> | undefined)?.some((p: Record<string, unknown>) => !!p.photo)
    );
    return { kb, hasData: kb > 0, listCount, hasPhotos };
  } catch {
    return { kb: 0, hasData: false, listCount: 0, hasPhotos: false };
  }
}

// Menu base (sempre visível)
const baseMenuItems = [
  { Icon: ScanBarcode,  label: "Escanear",    description: "Leia códigos e registre produtos",    path: "/scanner",                  accent: "hsl(var(--primary))"     },
  { Icon: ClipboardList, label: "Lista",       description: "Visualize e gerencie o histórico",    path: "/scanner?tab=list",          accent: "hsl(var(--success))"     },
  { Icon: GitCompare,   label: "Conferência", description: "Importe e confira listas do ERP",     path: "/scanner?tab=conference",    accent: "hsl(var(--destructive))" },
  { Icon: User,         label: "Perfil",      description: "Visualize seus dados de login",       path: null, accent: "hsl(var(--warning))" },
  { Icon: Settings,     label: "Configuração", description: "Modo escuro e layout desktop/mobile", path: null, accent: "hsl(var(--indigo))" },
];

// Menu para compras (compras, admin, super)
const comprasMenuItems = [
  { Icon: ShoppingCart, label: "Compras",     description: "Gestão de reposição e itens faltantes", path: "/compras", accent: "hsl(var(--indigo))" },
];

// Menu para analytics (admin, super)
const analyticsMenuItems = [
  { Icon: BarChart3,    label: "Analytics",   description: "Dashboard executivo e métricas",        path: "/analytics", accent: "hsl(var(--violet))" },
];

// Componente de card do menu
interface MenuCardProps {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  description: string;
  path: string | null;
  accent: string;
  navigate: (path: string) => void;
  setMostrarPerfil: (show: boolean) => void;
  setMostrarConfiguracoes: (show: boolean) => void;
}

const MenuCard: React.FC<MenuCardProps> = ({ 
  Icon, label, description, path, accent, navigate, setMostrarPerfil, setMostrarConfiguracoes 
}) => {
  const isDesktop = window.innerWidth >= 768; // Simples check para desktop
  
  return (
    <button onClick={() => {
      if (path === null) {
        if (label === "Perfil") {
          setMostrarPerfil(true);
        } else if (label === "Configuração") {
          setMostrarConfiguracoes(true);
        }
      } else {
        navigate(path);
      }
    }}
      style={{
        width: "100%", 
        display: "flex", 
        alignItems: isDesktop ? "flex-start" : "center", 
        gap: isDesktop ? 20 : 16,
        padding: isDesktop ? "24px" : "16px 18px", 
        borderRadius: isDesktop ? 20 : 16,
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: isDesktop ? "var(--shadow-md)" : "var(--shadow-sm)", 
        cursor: "pointer", 
        textAlign: "left",
        transition: "all 0.18s",
        height: isDesktop ? "auto" : "auto",
        minHeight: isDesktop ? "140px" : "auto",
      }}
    >
      <div style={{ 
        width: isDesktop ? 64 : 52, 
        height: isDesktop ? 64 : 52, 
        borderRadius: isDesktop ? 16 : 14, 
        flexShrink: 0, 
        background: accent + (isDesktop ? "20" : "14"), 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}>
        <Icon style={{ width: isDesktop ? 28 : 24, height: isDesktop ? 28 : 24, color: accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ 
          fontSize: isDesktop ? 18 : 15, 
          fontWeight: 700, 
          color: "hsl(var(--foreground))", 
          marginBottom: isDesktop ? 8 : 2 
        }}>
          {label}
        </p>
        <p style={{ 
          fontSize: isDesktop ? 13 : 12, 
          color: "hsl(var(--muted-foreground))", 
          lineHeight: 1.5,
          marginBottom: isDesktop ? 12 : 0
        }}>
          {description}
        </p>
        {isDesktop && path && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: accent,
            fontWeight: 600,
            marginTop: "auto",
          }}>
            <span>Acessar</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
      {!isDesktop && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const [storage, setStorage] = useState(getStorageSize());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);

  // Autenticação
  const { 
    loginSalvo, 
    mostrarModalLogin, 
    setMostrarModalLogin, 
    fazerLogin,
    fazerLogout,
    senhasCorretas 
  } = useAuth();

  // Estados para o formulário de login
  const [empresa, setEmpresa] = useState<"NEWSHOP" | "SOYE" | "FACIL">("NEWSHOP");
  const [senha, setSenha] = useState("");
  const [tituloPadrao, setTituloPadrao] = useState("");
  const [nomePessoa, setNomePessoa] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState(false);
  const [roleDetectado, setRoleDetectado] = useState<string | null>(null); // NOVO: para mostrar role detectado
  
  // Estados para configurações
  const [modoEscuro, setModoEscuro] = useState(() => {
    return localStorage.getItem('modoEscuro') === 'true';
  });
  const [modoDesktop, setModoDesktop] = useState(() => {
    return localStorage.getItem('modoDesktop') === 'true';
  });
  const [mostrarConfiguracoes, setMostrarConfiguracoes] = useState(false);

  useEffect(() => { setStorage(getStorageSize()); }, []);

  // Aplicar tema ao carregar
  useEffect(() => {
    if (modoEscuro) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [modoEscuro]);

  // Funções para configurações
  const toggleModoEscuro = () => {
    const novoModo = !modoEscuro;
    setModoEscuro(novoModo);
    localStorage.setItem('modoEscuro', novoModo.toString());
    // Aplicar tema escuro/claro
    if (novoModo) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleModoDesktop = () => {
    const novoModo = !modoDesktop;
    setModoDesktop(novoModo);
    localStorage.setItem('modoDesktop', novoModo.toString());
    // Aqui você pode adicionar lógica para alternar entre layouts mobile/desktop
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    setStorage(getStorageSize());
    setConfirmOpen(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  };

  const handleLogin = () => {
    if (!senha.trim()) {
      setErroSenha(true);
      setRoleDetectado(null);
      return;
    }
    
    // Primeiro valida a senha para detectar o role
    const { valido, role } = validarSenha(empresa, senha);
    
    if (!valido) {
      setErroSenha(true);
      setRoleDetectado(null);
      return;
    }
    
    // Mostra o role detectado antes de fazer login
    setRoleDetectado(role);
    
    // Faz o login
    const sucesso = fazerLogin({
      empresa,
      senha,
      tituloPadrao: tituloPadrao.trim(),
      nomePessoa: nomePessoa.trim(),
      role // Adiciona o role aos dados
    });
    
    if (!sucesso) {
      setErroSenha(true);
      setRoleDetectado(null);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? 'max-w-6xl mx-auto' : 'max-w-md mx-auto'}`} style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
      <header className={`relative overflow-hidden ${modoDesktop ? 'pt-6 pb-8 px-8' : 'pt-5 pb-7 px-5'} bg-primary text-primary-foreground border-b border-border`}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "currentColor", opacity: 0.05, pointerEvents: "none" }} />
        <div className={`${modoDesktop ? 'flex items-center justify-between' : ''}`}>
          <div>
            {/* AQUI ESTÁ A MÁGICA DA LOGO. Ela inverte a cor dependendo do tema! */}
            <img 
              src={LOGO} 
              alt="Newshop" 
              className={`${modoDesktop ? 'h-9' : 'h-7'} object-contain brightness-0 invert dark:invert-0`} 
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-60 mt-2">
              Sistema de Pedido
            </p>
          </div>
          
          {modoDesktop && loginSalvo && (
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-primary-foreground/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">{loginSalvo.nomePessoa || "Usuário"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Store className="h-3 w-3" />
                  <span className="text-xs opacity-80">{loginSalvo.empresa}</span>
                  <span className="text-xs px-2 py-0.5 bg-primary-foreground/20 rounded">
                    {loginSalvo.role ? loginSalvo.role.charAt(0).toUpperCase() + loginSalvo.role.slice(1) : "Operador"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Greeting ── */}
      <div style={{ padding: modoDesktop ? "32px 32px 16px" : "28px 20px 8px" }}>
        <div className={`${modoDesktop ? 'flex items-end justify-between' : ''}`}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6 }}>
              Menu Principal
            </p>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: modoDesktop ? 32 : 26, fontWeight: 900, color: "hsl(var(--foreground))", lineHeight: 1.15 }}>
              O que deseja fazer?
            </h2>
            {modoDesktop && (
              <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", marginTop: 8, maxWidth: "600px" }}>
                Acesse todas as funcionalidades do sistema de pedidos, conferência e gestão de compras em uma interface otimizada para desktop.
              </p>
            )}
          </div>
          
          {modoDesktop && (
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${modoEscuro ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`}>
                {modoEscuro ? '🌙 Modo Escuro' : '☀️ Modo Claro'}
              </div>
              <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                🖥️ Modo Desktop
              </div>
            </div>
          )}
        </div>
      </div>

       {/* ── Menu Cards ── */}
        <div style={{ 
          flex: 1, 
          padding: modoDesktop ? "16px 32px 24px" : "12px 16px 8px", 
          display: "flex", 
          flexDirection: modoDesktop ? "row" : "column",
          flexWrap: modoDesktop ? "wrap" : "nowrap",
          gap: modoDesktop ? 20 : 12 
        }}>
          {/* Cards base (sempre visíveis) */}
          {baseMenuItems.map(({ Icon, label, description, path, accent }) => (
            <div key={label} style={{ flex: modoDesktop ? "1 1 calc(33.333% - 20px)" : "auto", minWidth: modoDesktop ? "300px" : "auto" }}>
              <MenuCard 
                Icon={Icon}
                label={label}
                description={description}
                path={path}
                accent={accent}
                navigate={navigate}
                setMostrarPerfil={setMostrarPerfil}
                setMostrarConfiguracoes={setMostrarConfiguracoes}
              />
            </div>
          ))}
          
          {/* Cards para compras (se tiver acesso) */}
          {loginSalvo?.role && hasAnyRoleAccess(loginSalvo.role, ['compras', 'admin', 'super']) && (
            comprasMenuItems.map(({ Icon, label, description, path, accent }) => (
              <div key={label} style={{ flex: modoDesktop ? "1 1 calc(33.333% - 20px)" : "auto", minWidth: modoDesktop ? "300px" : "auto" }}>
                <MenuCard 
                  Icon={Icon}
                  label={label}
                  description={description}
                  path={path}
                  accent={accent}
                  navigate={navigate}
                  setMostrarPerfil={setMostrarPerfil}
                  setMostrarConfiguracoes={setMostrarConfiguracoes}
                />
              </div>
            ))
          )}
          
          {/* Cards para analytics (se tiver acesso) */}
          {loginSalvo?.role && hasAnyRoleAccess(loginSalvo.role, ['admin', 'super']) && (
            analyticsMenuItems.map(({ Icon, label, description, path, accent }) => (
              <div key={label} style={{ flex: modoDesktop ? "1 1 calc(33.333% - 20px)" : "auto", minWidth: modoDesktop ? "300px" : "auto" }}>
                <MenuCard 
                  Icon={Icon}
                  label={label}
                  description={description}
                  path={path}
                  accent={accent}
                  navigate={navigate}
                  setMostrarPerfil={setMostrarPerfil}
                  setMostrarConfiguracoes={setMostrarConfiguracoes}
                />
              </div>
            ))
          )}
        </div>

      {/* ── Storage Card ── */}
      <div style={{ padding: modoDesktop ? "16px 32px 32px" : "8px 16px 24px" }}>
        <div style={{
          background: "hsl(var(--card))",
          borderRadius: modoDesktop ? 20 : 16, 
          border: "1px solid hsl(var(--border))",
          padding: modoDesktop ? "24px" : "16px 18px", 
          boxShadow: modoDesktop ? "var(--shadow-md)" : "var(--shadow-sm)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 3 }}>
                Armazenamento Local
              </p>
              {storage.hasData ? (
                <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 900 }}>{storage.kb}</span>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginLeft: 4 }}>KB · {storage.listCount} lista(s) no histórico</span>
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Nenhum dado salvo</p>
              )}
              {storage.hasPhotos && (
                <p style={{ fontSize: 11, color: "hsl(var(--warning))", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertTriangle style={{ width: 11, height: 11 }} /> Contém fotos (pesado)
                </p>
              )}
            </div>

            {storage.hasData && (
              <button onClick={() => setConfirmOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10,
                  background: "hsl(var(--destructive) / 0.08)",
                  color: "hsl(var(--destructive))",
                  border: "1px solid hsl(var(--destructive) / 0.2)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                <Trash2 style={{ width: 14, height: 14 }} /> Limpar
              </button>
            )}
          </div>

          {/* barra de uso */}
          {storage.hasData && (
            <div style={{ height: 4, background: "hsl(var(--muted))", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.4s ease",
                width: `${Math.min((storage.kb / 5000) * 100, 100)}%`,
                background: storage.kb > 2000 ? "hsl(var(--destructive))" : storage.kb > 500 ? "hsl(var(--warning))" : "hsl(var(--success))",
              }} />
            </div>
          )}
        </div>

        {/* Toast de sucesso */}
        {cleared && (
          <div style={{
            marginTop: 10, padding: "10px 16px", borderRadius: 10,
            background: "hsl(var(--success) / 0.1)", border: "1px solid hsl(var(--success) / 0.2)",
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 13, fontWeight: 600, color: "hsl(var(--success))",
          }}>
            ✅ Cache limpo com sucesso!
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ 
        padding: modoDesktop ? "0 32px 32px" : "0 20px 24px", 
        textAlign: "center",
        borderTop: modoDesktop ? "1px solid hsl(var(--border))" : "none",
        marginTop: modoDesktop ? 16 : 0,
        paddingTop: modoDesktop ? 24 : 0
      }}>
        <div className={`${modoDesktop ? 'flex items-center justify-between' : ''}`}>
          <p style={{ 
            fontFamily: "var(--font-mono)", 
            fontSize: modoDesktop ? 11 : 10, 
            color: "hsl(var(--muted-foreground))", 
            letterSpacing: "0.1em" 
          }}>
            Diarley Duarte © 2025
          </p>
          {modoDesktop && (
            <div className="flex items-center gap-6">
              <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                Versão 2.1.0
              </span>
              <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                {loginSalvo?.empresa || "NEWSHOP"}
              </span>
              <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                {modoEscuro ? "Modo Escuro" : "Modo Claro"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Confirmação ── */}
      {confirmOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", display: "flex",
            alignItems: "flex-end", justifyContent: "center", zIndex: 100,
          }}
        >
          <div style={{
            background: "hsl(var(--card))", /* 👈 CORRIGIDO AQUI */
            width: "100%", maxWidth: 430,
            borderRadius: "20px 20px 0 0", padding: "24px 20px 36px",
            animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
          }}>
            <style>{`@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
            <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 20px" }} />

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "hsl(var(--destructive) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 style={{ width: 22, height: 22, color: "hsl(var(--destructive))" }} />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))" }}>Limpar cache?</p>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <div style={{ background: "hsl(var(--destructive) / 0.06)", border: "1px solid hsl(var(--destructive) / 0.15)", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "hsl(var(--foreground))", lineHeight: 1.6 }}>
                Serão apagados: <strong>{storage.listCount} lista(s)</strong> do histórico e todos os dados salvos no celular (<strong>{storage.kb} KB</strong>).
                {storage.hasPhotos && <span style={{ color: "hsl(var(--destructive))" }}> Inclui fotos.</span>}
              </p>
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
                ⚠️ Listas já enviadas ao ClickUp <strong>não</strong> serão afetadas.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setConfirmOpen(false)}
                style={{ height: 50, borderRadius: 12, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button onClick={handleClear}
                style={{ height: 50, borderRadius: 12, background: "hsl(var(--destructive))", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 14px hsl(var(--destructive) / 0.3)" }}
              >
                Limpar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Login ── */}
      {mostrarModalLogin && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarModalLogin(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", display: "flex",
            alignItems: modoDesktop ? "center" : "flex-end", 
            justifyContent: "center", 
            zIndex: 1000,
          }}
        >
          <div style={{
            background: "hsl(var(--card))",
            width: "100%", 
            maxWidth: modoDesktop ? 500 : 430,
            borderRadius: modoDesktop ? 20 : "20px 20px 0 0", 
            padding: modoDesktop ? "32px" : "24px 20px 36px",
             animation: modoDesktop ? "fadeIn 0.28s ease" : "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
            margin: modoDesktop ? "auto" : "0",
            maxHeight: modoDesktop ? "90vh" : "auto",
            overflowY: modoDesktop ? "auto" : "visible",
          }}>
            <style>{`
              @keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
              @keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
            `}</style>
            {!modoDesktop && <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 20px" }} />}

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Store style={{ width: 22, height: 22, color: "hsl(var(--primary))" }} />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))" }}>Faça seu login</p>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Configure seus dados para começar</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Empresa */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Empresa</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["NEWSHOP", "SOYE", "FACIL"] as const).map((emp) => (
                    <button key={emp} onClick={() => setEmpresa(emp)}
                      style={{
                        height: 46, borderRadius: 12, fontWeight: 700, fontSize: 13,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", transition: "all 0.18s",
                        background: empresa === emp ? "hsl(var(--foreground))" : "hsl(var(--secondary))",
                        color: empresa === emp ? "hsl(var(--background))" : "hsl(var(--foreground))",
                        border: empresa === emp ? "2px solid hsl(var(--foreground))" : "2px solid hsl(var(--border))",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {emp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Senha */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Senha — {empresa}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      inputMode="numeric"
                      placeholder="Digite a senha"
                      value={senha}
                      onChange={(e) => { setSenha(e.target.value); setErroSenha(false); }}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      autoFocus
                      style={{
                        width: "100%", height: 48, padding: "0 16px",
                        borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                        background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                        fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                        outline: "none", boxSizing: "border-box",
                        borderColor: erroSenha ? "hsl(var(--destructive))" : "hsl(var(--border))",
                        paddingRight: 44,
                      }}
                    />
                    <button
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", display: "flex" }}
                    >
                      {mostrarSenha ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
                {erroSenha && (
                  <p style={{ fontSize: 12, color: "hsl(var(--destructive))", marginTop: 5, fontWeight: 600 }}>❌ Senha incorreta</p>
                )}
              </div>

              {/* Título padrão */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Nome de lista padrão</label>
                <input
                  type="text"
                  placeholder="Ex: Utilidade"
                  value={tituloPadrao}
                  onChange={(e) => setTituloPadrao(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  style={{
                    width: "100%", height: 48, padding: "0 16px",
                    borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                    background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                    fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Nome da pessoa */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Nome da pessoa</label>
                <input
                  type="text"
                  placeholder="Ex: LUCAS"
                  value={nomePessoa}
                  onChange={(e) => setNomePessoa(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  style={{
                    width: "100%", height: 48, padding: "0 16px",
                    borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                    background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                    fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Botão de login */}
              <button onClick={handleLogin}
                style={{
                  width: "100%", height: 52, background: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))", border: "none",
                  borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, transition: "all 0.18s",
                  boxShadow: "var(--shadow-md)", marginTop: 8,
                }}
              >
                <Store style={{ width: 18, height: 18 }} /> Salvar Login
              </button>

              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", marginTop: 8 }}>
                Os dados serão salvos localmente e usados automaticamente ao criar novas listas.
              </p>
            </div>
          </div>
        </div>
      )}

       {/* ── Modal de Perfil ── */}
      {mostrarPerfil && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarPerfil(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", display: "flex",
            alignItems: modoDesktop ? "center" : "flex-end", 
            justifyContent: "center", 
            zIndex: 1000,
          }}
        >
          <div style={{
            background: "hsl(var(--card))",
            width: "100%", 
            maxWidth: modoDesktop ? 500 : 430,
            borderRadius: modoDesktop ? 20 : "20px 20px 0 0", 
            padding: modoDesktop ? "32px" : "24px 20px 36px",
            animation: modoDesktop ? "fadeIn 0.28s ease" : "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
            margin: modoDesktop ? "auto" : "0",
            maxHeight: modoDesktop ? "90vh" : "auto",
            overflowY: modoDesktop ? "auto" : "visible",
          }}>
            {!modoDesktop && <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 20px" }} />}

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "hsl(var(--warning) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User style={{ width: 22, height: 22, color: "hsl(var(--warning))" }} />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))" }}>Seu Perfil</p>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Dados salvos para uso automático</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              
              {/* Dados do perfil */}
              {loginSalvo ? (
                <>
                  <div style={{ background: "hsl(var(--success) / 0.08)", border: "1px solid hsl(var(--success) / 0.2)", borderRadius: 10, padding: "14px 16px" }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--success))", marginBottom: 4 }}>Login configurado ✅</p>
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Seus dados estão salvos e serão usados automaticamente.</p>
                  </div>

                  <div>
                    <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Empresa</label>
                    <div style={{
                      width: "100%", height: 48, padding: "0 16px",
                      borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                      background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                      fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                      display: "flex", alignItems: "center",
                    }}>
                      {loginSalvo.empresa}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Nome de lista padrão</label>
                    <div style={{
                      width: "100%", height: 48, padding: "0 16px",
                      borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                      background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                      fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                      display: "flex", alignItems: "center",
                    }}>
                      {loginSalvo.tituloPadrao || "(não definido)"}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block" }}>Nome da pessoa</label>
                    <div style={{
                      width: "100%", height: 48, padding: "0 16px",
                      borderRadius: 10, border: "1.5px solid hsl(var(--border))",
                      background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
                      fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                      display: "flex", alignItems: "center",
                    }}>
                      {loginSalvo.nomePessoa || "(não definido)"}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                    <button onClick={() => { setMostrarPerfil(false); setMostrarModalLogin(true); }}
                      style={{
                        width: "100%", height: 48, background: "hsl(var(--primary))",
                        color: "hsl(var(--primary-foreground))", border: "none",
                        borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                        cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 8,
                      }}
                    >
                      <Store style={{ width: 18, height: 18 }} /> Editar Login
                    </button>

                    <button onClick={() => { fazerLogout(); setMostrarPerfil(false); }}
                      style={{
                        width: "100%", height: 48, background: "hsl(var(--destructive) / 0.08)",
                        color: "hsl(var(--destructive))", border: "1.5px solid hsl(var(--destructive) / 0.3)",
                        borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                        cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 8,
                      }}
                    >
                      <Trash2 style={{ width: 18, height: 18 }} /> Remover Login
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 16px" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <User style={{ width: 28, height: 28, color: "hsl(var(--muted-foreground))" }} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 6 }}>Nenhum login salvo</p>
                  <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 20 }}>Configure seu login para uso automático das listas.</p>
                  <button onClick={() => { setMostrarPerfil(false); setMostrarModalLogin(true); }}
                    style={{
                      width: "100%", height: 48, background: "hsl(var(--primary))",
                      color: "hsl(var(--primary-foreground))", border: "none",
                      borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                      cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 8,
                    }}
                  >
                    <Store style={{ width: 18, height: 18 }} /> Configurar Login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

       {/* ── Modal de Configurações ── */}
      {mostrarConfiguracoes && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarConfiguracoes(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", display: "flex",
            alignItems: modoDesktop ? "center" : "flex-end", 
            justifyContent: "center", 
            zIndex: 1000,
          }}
        >
          <div style={{
            background: "hsl(var(--card))",
            width: "100%", 
            maxWidth: modoDesktop ? 600 : 430,
            borderRadius: modoDesktop ? 20 : "20px 20px 0 0", 
            padding: modoDesktop ? "32px" : "24px 20px 36px",
            animation: modoDesktop ? "fadeIn 0.28s ease" : "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)",
            margin: modoDesktop ? "auto" : "0",
            maxHeight: modoDesktop ? "90vh" : "auto",
            overflowY: modoDesktop ? "auto" : "visible",
          }}>
            {!modoDesktop && <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 20px" }} />}

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Settings style={{ width: 22, height: 22, color: "hsl(var(--primary))" }} />
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))" }}>Configurações</p>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Personalize sua experiência no app</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              
              {/* Modo Escuro/Claro */}
              <div style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {modoEscuro ? <Moon style={{ width: 18, height: 18, color: "hsl(var(--primary))" }} /> : <Sun style={{ width: 18, height: 18, color: "hsl(var(--primary))" }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--foreground))" }}>Modo {modoEscuro ? "Escuro" : "Claro"}</p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Alternar entre tema escuro e claro</p>
                    </div>
                  </div>
                  <button onClick={toggleModoEscuro}
                    style={{
                      width: 52, height: 28, borderRadius: 14,
                      background: modoEscuro ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      border: "none", cursor: "pointer", position: "relative",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: modoEscuro ? 26 : 2,
                      width: 24, height: 24, borderRadius: "50%",
                      background: "white", transition: "left 0.2s",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
                  {modoEscuro ? "Tema escuro ativado para melhor visualização noturna" : "Tema claro ativado para melhor legibilidade diurna"}
                </p>
              </div>

              {/* Modo Desktop/Mobile */}
              <div style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {modoDesktop ? <Monitor style={{ width: 18, height: 18, color: "hsl(var(--primary))" }} /> : <Smartphone style={{ width: 18, height: 18, color: "hsl(var(--primary))" }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--foreground))" }}>Modo {modoDesktop ? "Desktop" : "Mobile"}</p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Otimizar layout para {modoDesktop ? "telas grandes" : "dispositivos móveis"}</p>
                    </div>
                  </div>
                  <button onClick={toggleModoDesktop}
                    style={{
                      width: 52, height: 28, borderRadius: 14,
                      background: modoDesktop ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      border: "none", cursor: "pointer", position: "relative",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: modoDesktop ? 26 : 2,
                      width: 24, height: 24, borderRadius: "50%",
                      background: "white", transition: "left 0.2s",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
                  {modoDesktop ? "Layout otimizado para uso em computadores e telas grandes" : "Layout otimizado para smartphones e tablets"}
                </p>
              </div>

               {/* Alterar Perfil */}
               <div style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "16px" }}>
                 <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 12 }}>Alterar Perfil</p>
                 <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12 }}>
                   Digite uma senha especial para alterar seu perfil de acesso:
                 </p>
                 <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                   <input
                     type="password"
                     placeholder="Digite a senha especial"
                     style={{
                       flex: 1,
                       padding: "12px 14px",
                       borderRadius: 8,
                       border: "1px solid hsl(var(--border))",
                       background: "hsl(var(--background))",
                       color: "hsl(var(--foreground))",
                       fontSize: 14,
                       fontFamily: "var(--font-sans)",
                     }}
                     onChange={(e) => {
                       const senha = e.target.value;
                       // Verificar se é senha especial
                       if (senha === 'Compras1148') {
                         setRoleDetectado('compras');
                       } else if (senha === 'Diretoria1148') {
                         setRoleDetectado('admin');
                       } else if (senha === 'Admin1148') {
                         setRoleDetectado('super');
                       } else {
                         setRoleDetectado(null);
                       }
                     }}
                   />
                 </div>
                 
                 {roleDetectado && (
                   <div style={{ 
                     background: "hsl(var(--primary) / 0.1)", 
                     border: "1px solid hsl(var(--primary) / 0.3)",
                     borderRadius: 8,
                     padding: "12px",
                     marginBottom: 12,
                   }}>
                     <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--primary))", marginBottom: 4 }}>
                       Perfil detectado: {roleDetectado.charAt(0).toUpperCase() + roleDetectado.slice(1)}
                     </p>
                     <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                       Clique em "Salvar Configurações" para aplicar o novo perfil
                     </p>
                   </div>
                 )}
                 
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                   <div style={{ textAlign: "center", padding: "8px", background: "hsl(var(--muted) / 0.3)", borderRadius: 6 }}>
                     <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Compras</p>
                     <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))" }}>Compras1148</p>
                   </div>
                   <div style={{ textAlign: "center", padding: "8px", background: "hsl(var(--muted) / 0.3)", borderRadius: 6 }}>
                     <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Diretoria</p>
                     <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))" }}>Diretoria1148</p>
                   </div>
                   <div style={{ textAlign: "center", padding: "8px", background: "hsl(var(--muted) / 0.3)", borderRadius: 6 }}>
                     <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Super Admin</p>
                     <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))" }}>Admin1148</p>
                   </div>
                   <div style={{ textAlign: "center", padding: "8px", background: "hsl(var(--muted) / 0.3)", borderRadius: 6 }}>
                     <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Operador</p>
                     <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))" }}>Senha padrão</p>
                   </div>
                 </div>
               </div>

               {/* Informações do Sistema */}
               <div style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "16px" }}>
                 <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 8 }}>Informações do Sistema</p>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                   <div>
                     <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Versão</p>
                     <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>2.1.0</p>
                   </div>
                   <div>
                     <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Empresa</p>
                     <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{loginSalvo?.empresa || "Não configurado"}</p>
                   </div>
                   <div>
                     <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Perfil Atual</p>
                     <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{loginSalvo?.role ? loginSalvo.role.charAt(0).toUpperCase() + loginSalvo.role.slice(1) : "Não logado"}</p>
                   </div>
                   <div>
                     <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>Interface</p>
                     <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{modoDesktop ? "Desktop" : "Mobile"}</p>
                   </div>
                 </div>
               </div>

               {/* Botões de ação */}
               <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                 <button onClick={() => { 
                   // Aplicar novo perfil se detectado
                   if (roleDetectado && loginSalvo) {
                     const novoLogin = {
                       ...loginSalvo,
                       role: roleDetectado as 'operador' | 'compras' | 'admin' | 'super'
                     };
                     localStorage.setItem(STORAGE_KEY, JSON.stringify(novoLogin));
                     // Atualizar estado
                     setLoginSalvo(novoLogin);
                     setRoleDetectado(null);
                   }
                   setMostrarConfiguracoes(false); 
                 }}
                   style={{
                     width: "100%", height: 48, background: "hsl(var(--primary))",
                     color: "hsl(var(--primary-foreground))", border: "none",
                     borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                     cursor: "pointer", display: "flex", alignItems: "center",
                     justifyContent: "center", gap: 8,
                   }}
                 >
                   <Settings style={{ width: 18, height: 18 }} /> Salvar Configurações
                 </button>

                <button onClick={() => { 
                  setModoEscuro(false); 
                  setModoDesktop(false); 
                  localStorage.removeItem('modoEscuro');
                  localStorage.removeItem('modoDesktop');
                  document.documentElement.classList.remove('dark');
                  setMostrarConfiguracoes(false); 
                }}
                  style={{
                    width: "100%", height: 48, background: "hsl(var(--secondary))",
                    color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))",
                    borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8,
                  }}
                >
                  <Trash2 style={{ width: 18, height: 18 }} /> Restaurar Padrões
                </button>
              </div>

              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", marginTop: 8 }}>
                As configurações são salvas automaticamente no seu dispositivo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

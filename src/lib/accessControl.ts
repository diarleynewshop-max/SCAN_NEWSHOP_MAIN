import type { UserRole } from "@/hooks/useAuth";

export const ACCESS_PERMISSIONS = [
  "scanner",
  "lista",
  "fazer_pedido",
  "conferencia",
  "consulta_preco",
  "chat",
  "notificacoes",
  "compras",
  "sugestao_cd",
  "dashboard",
  "analytics",
  "usuarios",
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number];
export type AccessPermissionMap = Partial<Record<AccessPermission, boolean>>;

export const ACCESS_PERMISSION_LABELS: Record<AccessPermission, string> = {
  scanner: "Escanear",
  lista: "Acesso a lista",
  fazer_pedido: "Fazer pedido",
  conferencia: "Conferencia",
  consulta_preco: "Consulta de preco",
  chat: "Chat",
  notificacoes: "Notificacoes",
  compras: "Tela de compras",
  sugestao_cd: "Sugestao do CD",
  dashboard: "Dashboard",
  analytics: "Analytics",
  usuarios: "Tela de usuarios",
};

export const ACCESS_PERMISSION_GROUPS: Array<{
  titulo: string;
  permissoes: AccessPermission[];
}> = [
  { titulo: "Operacional", permissoes: ["scanner", "lista", "fazer_pedido", "conferencia", "consulta_preco", "chat", "notificacoes"] },
  { titulo: "Gestao", permissoes: ["compras", "sugestao_cd", "dashboard", "analytics"] },
  { titulo: "Admin", permissoes: ["usuarios"] },
];

const ALL_FALSE = ACCESS_PERMISSIONS.reduce<Record<AccessPermission, boolean>>((acc, permission) => {
  acc[permission] = false;
  return acc;
}, {} as Record<AccessPermission, boolean>);

const ALL_TRUE = ACCESS_PERMISSIONS.reduce<Record<AccessPermission, boolean>>((acc, permission) => {
  acc[permission] = true;
  return acc;
}, {} as Record<AccessPermission, boolean>);

export const ROLE_PERMISSION_DEFAULTS: Record<UserRole, Record<AccessPermission, boolean>> = {
  operador: {
    ...ALL_FALSE,
    scanner: true,
    lista: true,
    fazer_pedido: true,
    conferencia: true,
    consulta_preco: true,
    chat: true,
    notificacoes: true,
  },
  compras: {
    ...ALL_FALSE,
    scanner: true,
    lista: true,
    fazer_pedido: true,
    conferencia: true,
    consulta_preco: true,
    chat: true,
    notificacoes: true,
    compras: true,
    sugestao_cd: true,
    dashboard: true,
  },
  admin: {
    ...ALL_FALSE,
    scanner: true,
    lista: true,
    fazer_pedido: true,
    conferencia: true,
    consulta_preco: true,
    chat: true,
    notificacoes: true,
    compras: true,
    sugestao_cd: true,
    dashboard: true,
    analytics: true,
    usuarios: true,
  },
  super: { ...ALL_TRUE },
};

type LoginLike = {
  role?: string | null;
  grupoAcessoId?: string | null;
  permissoes?: AccessPermissionMap | null;
};

function normalizarRole(role: unknown): UserRole {
  const valor = String(role ?? "").toLowerCase();
  if (valor === "compras" || valor === "admin" || valor === "super") return valor;
  return "operador";
}

export function normalizarPermissoes(values: unknown): AccessPermissionMap {
  const origem = values && typeof values === "object" ? (values as Record<string, unknown>) : {};
  const permissoes: AccessPermissionMap = {};
  for (const permission of ACCESS_PERMISSIONS) {
    if (permission in origem) permissoes[permission] = origem[permission] === true;
  }
  return permissoes;
}

export function resolverPermissoes(role: UserRole, permissoes?: AccessPermissionMap | null, usarPermissoesCustomizadas = false): Record<AccessPermission, boolean> {
  if (role === "super") return { ...ALL_TRUE };
  if (!usarPermissoesCustomizadas) return { ...ROLE_PERMISSION_DEFAULTS[role] };

  const base = { ...ALL_FALSE };
  const custom = normalizarPermissoes(permissoes);
  for (const permission of ACCESS_PERMISSIONS) {
    base[permission] = custom[permission] === true;
  }
  return base;
}

export function hasPermission(login: LoginLike | null | undefined, permission: AccessPermission): boolean {
  if (!login) return false;
  const role = normalizarRole(login.role);
  const usarPermissoesCustomizadas = !!String(login.grupoAcessoId ?? "").trim();
  const permissoes = resolverPermissoes(role, login.permissoes, usarPermissoesCustomizadas);
  return permissoes[permission] === true;
}

export function hasAnyPermission(login: LoginLike | null | undefined, permissions: AccessPermission[]): boolean {
  return permissions.some((permission) => hasPermission(login, permission));
}

export function contarPermissoesAtivas(permissoes?: AccessPermissionMap | null): number {
  return ACCESS_PERMISSIONS.reduce((count, permission) => count + (permissoes?.[permission] === true ? 1 : 0), 0);
}

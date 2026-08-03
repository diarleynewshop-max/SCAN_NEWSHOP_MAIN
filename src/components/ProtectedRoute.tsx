import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/hooks/useAuth";
import { hasAnyPermission, hasPermission, type AccessPermission } from "@/lib/accessControl";
import { loginEhSefuly, loginTemFeature, type LojaFeature } from "@/lib/lojaFeatures";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: AccessPermission | AccessPermission[];
  /** Recurso que a LOJA precisa operar (independente do role/permissao). */
  requiredLojaFeature?: LojaFeature;
  fallbackPath?: string;
}

/**
 * Componente para proteger rotas baseado no role do usuário
 * 
 * Exemplos de uso:
 * <ProtectedRoute requiredRole="admin">...</ProtectedRoute>
 * <ProtectedRoute requiredRole={['admin', 'super']}>...</ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
  requiredLojaFeature,
  fallbackPath = "/"
}: ProtectedRouteProps) {
  const { loginSalvo } = useAuth();
  const location = useLocation();

  // Se nao estiver logado, redireciona para a pagina de login.
  if (!loginSalvo || !loginSalvo.role) {
    return <Navigate to="/login" replace />;
  }

  const sefulyAllowedPaths = new Set(["/", "/scanner", "/consulta-preco", "/clientes", "/perfil"]);
  if (loginEhSefuly(loginSalvo) && !sefulyAllowedPaths.has(location.pathname)) {
    return <Navigate to="/scanner" replace />;
  }

  // Trava por loja: mesmo com permissao, a loja pode nao operar o recurso
  // (ex.: SEFULY nao tem Sugestao do CD). Vale inclusive para `super`.
  if (requiredLojaFeature && !loginTemFeature(loginSalvo, requiredLojaFeature)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Verifica se o usuário tem o role necessário
  let hasAccess = true;
  if (requiredPermission) {
    hasAccess = Array.isArray(requiredPermission)
      ? hasAnyPermission(loginSalvo, requiredPermission)
      : hasPermission(loginSalvo, requiredPermission);
  } else if (requiredRole) {
    hasAccess = Array.isArray(requiredRole)
      ? requiredRole.includes(loginSalvo.role)
      : loginSalvo.role === requiredRole;
  }
    
  // Se não tiver acesso, redireciona
  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }
  
  // Se tiver acesso, renderiza os children
  return <>{children}</>;
}

/**
 * Helper para verificar se um role tem acesso a outro
 * Hierarquia: super > admin > compras > operador
 */
export function hasRoleAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    'operador': 1,
    'compras': 2,
    'admin': 3,
    'super': 4
  };
  
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

/**
 * Helper para verificar se um role tem acesso a múltiplos roles
 */
export function hasAnyRoleAccess(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.some(requiredRole => hasRoleAccess(userRole, requiredRole));
}

import { useState, useEffect } from "react";

type Empresa = "NEWSHOP" | "SOYE" | "FACIL";
type UserRole = 'operador' | 'compras' | 'admin' | 'super';

export interface LoginData {
  empresa: Empresa;
  senha: string; // senha digitada (não armazenar a correta)
  tituloPadrao: string;
  nomePessoa: string;
  role: UserRole; // NOVO: perfil do usuário
}

const STORAGE_KEY = "scan_newshop_login";

// Senhas fixas para operadores (não devem ser expostas no frontend, mas como é um app offline, ficam aqui)
const SENHAS_OPERADOR: Record<Empresa, string> = {
  "NEWSHOP": "1148",
  "SOYE": "1090", 
  "FACIL": "2461"
};

// Senhas especiais para perfis avançados (todas NEWSHOP por enquanto)
const SENHAS_ESPECIAIS: Record<string, { role: UserRole; empresa: Empresa }> = {
  'Compras1148': { role: 'compras', empresa: 'NEWSHOP' },
  'Diretoria1148': { role: 'admin', empresa: 'NEWSHOP' },
  'Admin1148': { role: 'super', empresa: 'NEWSHOP' },
  // Adicionar mais senhas especiais conforme necessário
};

// Validação de senha e detecção de role
export function validarSenha(empresa: Empresa, senhaDigitada: string): { valido: boolean; role: UserRole } {
  // Primeiro verifica se é senha especial
  const senhaEspecial = SENHAS_ESPECIAIS[senhaDigitada];
  if (senhaEspecial) {
    // Verifica se a empresa selecionada corresponde à empresa da senha especial
    if (senhaEspecial.empresa === empresa) {
      return { valido: true, role: senhaEspecial.role };
    }
    return { valido: false, role: 'operador' };
  }
  
  // Depois verifica se é senha de operador normal
  const valido = SENHAS_OPERADOR[empresa] === senhaDigitada;
  return { valido, role: 'operador' };
}

// Salvar login no localStorage
export function salvarLogin(data: LoginData): void {
  try {
    // Não armazenar a senha correta, apenas marcar que a senha foi validada
    const { senha, ...dadosParaSalvar } = data;
    console.log('Salvando login:', dadosParaSalvar);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dadosParaSalvar));
  } catch (err) {
    console.error('Erro ao salvar login:', err);
  }
}

// Obter login salvo
export function obterLoginSalvo(): Omit<LoginData, 'senha'> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const dados = JSON.parse(raw);
    
    // Backward compatibility: se não tiver role, assume 'operador'
    if (!dados.role) {
      dados.role = 'operador';
    }
    
    return dados;
  } catch {
    return null;
  }
}

// Remover login (logout)
export function removerLogin(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Hook para gerenciar autenticação
export function useAuth() {
  const [loginSalvo, setLoginSalvo] = useState<Omit<LoginData, 'senha'> | null>(() => obterLoginSalvo());
  const [mostrarModalLogin, setMostrarModalLogin] = useState(false);

  // Verificar se precisa mostrar modal de login ao montar o componente
  useEffect(() => {
    // Se não há login salvo, mostrar modal imediatamente
    if (!loginSalvo) {
      setMostrarModalLogin(true);
    }
  }, [loginSalvo]);

  const fazerLogin = (data: LoginData): boolean => {
    console.log('fazerLogin chamado com:', { empresa: data.empresa, senha: '[HIDDEN]', tituloPadrao: data.tituloPadrao, nomePessoa: data.nomePessoa });
    const { valido, role } = validarSenha(data.empresa, data.senha);
    console.log('validação:', { valido, role });
    if (!valido) {
      console.log('Senha inválida');
      return false;
    }
    
    // Adiciona o role detectado aos dados de login
    const dadosComRole = { ...data, role };
    salvarLogin(dadosComRole);
    setLoginSalvo({ 
      empresa: data.empresa, 
      tituloPadrao: data.tituloPadrao, 
      nomePessoa: data.nomePessoa,
      role // NOVO: incluir role no estado
    });
    setMostrarModalLogin(false);
    console.log('Login salvo com sucesso');
    return true;
  };

  const fazerLogout = (): void => {
    removerLogin();
    setLoginSalvo(null);
    setMostrarModalLogin(true); // Mostrar modal de login novamente
  };

  return {
    loginSalvo,
    mostrarModalLogin,
    setMostrarModalLogin,
    fazerLogin,
    fazerLogout,
    senhasOperador: SENHAS_OPERADOR, // Para referência (não exibir na UI)
    senhasEspeciais: SENHAS_ESPECIAIS // Para referência (não exibir na UI)
  };
}
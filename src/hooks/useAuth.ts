import { useState, useEffect } from "react";

type Empresa = "NEWSHOP" | "SOYE" | "FACIL";

export interface LoginData {
  empresa: Empresa;
  senha: string; // senha digitada (não armazenar a correta)
  tituloPadrao: string;
  nomePessoa: string;
}

const STORAGE_KEY = "scan_newshop_login";

// Senhas fixas (não devem ser expostas no frontend, mas como é um app offline, ficam aqui)
const SENHAS: Record<Empresa, string> = {
  "NEWSHOP": "1148",
  "SOYE": "1090", 
  "FACIL": "2461"
};

// Validação de senha
export function validarSenha(empresa: Empresa, senhaDigitada: string): boolean {
  return SENHAS[empresa] === senhaDigitada;
}

// Salvar login no localStorage
export function salvarLogin(data: LoginData): void {
  try {
    // Não armazenar a senha correta, apenas marcar que a senha foi validada
    const { senha, ...dadosParaSalvar } = data;
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
    return JSON.parse(raw);
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
    // Se não há login salvo, mostrar modal após um breve delay
    const timer = setTimeout(() => {
      if (!loginSalvo) {
        setMostrarModalLogin(true);
      }
    }, 500); // Delay para carregar a interface primeiro
    return () => clearTimeout(timer);
  }, [loginSalvo]);

  const fazerLogin = (data: LoginData): boolean => {
    if (!validarSenha(data.empresa, data.senha)) {
      return false;
    }
    salvarLogin(data);
    setLoginSalvo({ empresa: data.empresa, tituloPadrao: data.tituloPadrao, nomePessoa: data.nomePessoa });
    setMostrarModalLogin(false);
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
    senhasCorretas: SENHAS // Para referência (não exibir na UI)
  };
}
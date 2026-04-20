/**
 * clickupApi.ts
 * Chamadas diretas à API do ClickUp feitas pelo frontend.
 * Usado na tela de Conferência para buscar tasks do status "Analisado".
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";
export type FlagKey    = "loja" | "cd";

export interface ClickUpTask {
  id:          string;
  name:        string;
  status:      string;
  date_created: string;
  attachments: ClickUpAttachment[];
}

export interface ClickUpAttachment {
  id:       string;
  title:    string;
  url:      string;
  mimetype: string;
}

// ── Configuração por empresa/flag ─────────────────────────────────────────────
interface EmpresaConfig {
  token:    string; // VITE_CLICKUP_TOKEN_xxx
  listId:   string;
  todoListId: string; // Nova: lista de compras/TODO
  senha:    string;
}

// Tokens e IDs vêm das variáveis de ambiente (VITE_ para ficar acessível no frontend)
const CONFIGS: Record<EmpresaKey, EmpresaConfig> = {
  NEWSHOP: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_NEWSHOP as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_NEWSHOP    ?? "901325900510",
    todoListId: import.meta.env.VITE_CLICKUP_TODO_LIST_ID_NEWSHOP ?? "901326684020", // Lista de compras
    senha:    "n91",
  },
  SOYE: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_SF as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_SOYE    ?? "901326461924",
    todoListId: import.meta.env.VITE_CLICKUP_TODO_LIST_ID_SOYE ?? "901326684020",
    senha:    "s91",
  },
  FACIL: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_SF as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_FACIL    ?? "901326461915",
    todoListId: import.meta.env.VITE_CLICKUP_TODO_LIST_ID_FACIL ?? "901326684020",
    senha:    "f91",
  },
};

function getConfig(empresa: EmpresaKey, flag: FlagKey): EmpresaConfig & { resolvedListId: string } {
  const cfg = CONFIGS[empresa];
  return { ...cfg, resolvedListId: cfg.listId };
}

// ── Validação de senha ────────────────────────────────────────────────────────
export function validarSenha(empresa: EmpresaKey, senha: string): boolean {
  return CONFIGS[empresa]?.senha === senha;
}

// ── Buscar tasks do status "Analisado" ────────────────────────────────────────
export async function buscarTasksAnalisado(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<ClickUpTask[]> {
  const response = await fetch(`/api/clickup-proxy?action=buscar-tasks&empresa=${empresa}&flag=${flag}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar tasks`);
  const data = await response.json();
  return data.tasks ?? [];
}

// ── Buscar tasks da lista de Compras/TODO ─────────────────────────────────────
export async function buscarTasksCompras(
  empresa: EmpresaKey
): Promise<ClickUpTask[]> {
  const response = await fetch(`/api/clickup-proxy?action=buscar-tasks-compras&empresa=${empresa}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar tasks de compras`);
  const data = await response.json();
  return data.tasks ?? [];
}

// ── Baixar o JSON de uma task ─────────────────────────────────────────────────
export async function baixarJsonDaTask(
  empresa: EmpresaKey,
  task: ClickUpTask
): Promise<object | null> {
  const taskId = task.id;
  const response = await fetch(`/api/clickup-proxy?action=baixar-json&taskId=${taskId}&empresa=${empresa}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao baixar JSON`);
  const data = await response.json();
  return data;
}

// ── Buscar attachments de uma task ───────────────────────────────────────────
export async function buscarAttachmentsDaTask(
  empresa: EmpresaKey,
  taskId: string,
  flag: FlagKey = "loja"
): Promise<ClickUpAttachment[]> {
  // Como o proxy já retorna attachments na buscar-tasks, esta função pode ser simplificada
  // ou você pode adicionar uma action específica no proxy se precisar
  const response = await fetch(`/api/clickup-proxy?action=buscar-tasks&empresa=${empresa}&flag=${flag}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar attachments`);
  const data = await response.json();
  // Procure a task específica nos resultados
  const task = data.tasks?.find((t: any) => t.id === taskId);
  return task?.attachments ?? [];
}

// ── Deletar uma task ──────────────────────────────────────────────────────────
export async function deletarTask(
  empresa: EmpresaKey,
  taskId: string
): Promise<void> {
  const response = await fetch(`/api/clickup-proxy?action=deletar-task&taskId=${taskId}&empresa=${empresa}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao deletar task`);
}

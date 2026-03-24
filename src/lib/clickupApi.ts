/**
 * clickupApi.ts
 * Chamadas diretas à API do ClickUp feitas pelo frontend.
 * Usado na tela de Conferência para buscar tasks do status "Analisado".
 */

// ── Configuração por empresa/flag ─────────────────────────────────────────────
export type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";
export type FlagKey    = "loja" | "cd";

interface EmpresaConfig {
  token:    string; // VITE_CLICKUP_TOKEN_xxx
  listId:   string;
  cdListId: string;
  senha:    string;
}

// Tokens e IDs vêm das variáveis de ambiente (VITE_ para ficar acessível no frontend)
const CONFIGS: Record<EmpresaKey, EmpresaConfig> = {
  NEWSHOP: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_NEWSHOP as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_NEWSHOP    ?? "901325900510",
    cdListId: import.meta.env.VITE_CLICKUP_CD_LIST_ID_NEWSHOP ?? "901325900510",
    senha:    "n91",
  },
  SOYE: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_SF as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_SOYE    ?? "901326461924",
    cdListId: import.meta.env.VITE_CLICKUP_CD_LIST_ID_SOYE ?? "901326461924",
    senha:    "s91",
  },
  FACIL: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_SF as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_FACIL    ?? "901326461915",
    cdListId: import.meta.env.VITE_CLICKUP_CD_LIST_ID_FACIL ?? "901326461915",
    senha:    "f91",
  },
};

export function validarSenha(empresa: EmpresaKey, senha: string): boolean {
  return CONFIGS[empresa]?.senha === senha;
}

function getConfig(empresa: EmpresaKey, flag: FlagKey): EmpresaConfig & { resolvedListId: string } {
  const cfg = CONFIGS[empresa];
  return { ...cfg, resolvedListId: flag === "cd" ? cfg.cdListId : cfg.listId };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
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

// ── Buscar tasks do status "Analisado" ────────────────────────────────────────
export async function buscarTasksAnalisado(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<ClickUpTask[]> {
  const { token, resolvedListId } = getConfig(empresa, flag);

  if (!token) throw new Error(`Token ClickUp não configurado para ${empresa}. Verifique o .env`);

  const url = `https://api.clickup.com/api/v2/list/${resolvedListId}/task?statuses[]=Analisado&include_closed=false`;

  const res = await fetch(url, {
    headers: { Authorization: token },
  });

  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar tasks do ClickUp`);

  const data = await res.json();
  const tasks: ClickUpTask[] = (data.tasks ?? []).map((t: any) => ({
    id:           t.id,
    name:         t.name,
    status:       t.status?.status ?? "",
    date_created: t.date_created ?? "",
    attachments:  t.attachments ?? [],
  }));

  return tasks;
}

// ── Baixar o JSON de uma task (primeiro .json nos attachments) ─────────────────
export async function baixarJsonDaTask(
  empresa: EmpresaKey,
  task: ClickUpTask
): Promise<object | null> {
  const { token } = getConfig(empresa, "loja"); // token é igual para loja/cd da mesma empresa

  const jsonAttachment = task.attachments.find(
    (a) => a.title.endsWith(".json") || a.mimetype === "application/json"
  );

  if (!jsonAttachment) return null;

  const res = await fetch(jsonAttachment.url, {
    headers: { Authorization: token },
  });

  if (!res.ok) throw new Error(`Erro ${res.status} ao baixar JSON da task`);

  return res.json();
}

// ── Buscar attachments de uma task (caso não venham no list) ──────────────────
export async function buscarAttachmentsDaTask(
  empresa: EmpresaKey,
  taskId: string
): Promise<ClickUpAttachment[]> {
  const { token } = getConfig(empresa, "loja");

  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token },
  });

  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar task`);

  const data = await res.json();
  return data.attachments ?? [];
}

// ── Deletar uma task ──────────────────────────────────────────────────────────
export async function deletarTask(
  empresa: EmpresaKey,
  taskId: string
): Promise<void> {
  const { token } = getConfig(empresa, "loja");

  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });

  if (!res.ok) throw new Error(`Erro ${res.status} ao deletar task ${taskId}`);
}

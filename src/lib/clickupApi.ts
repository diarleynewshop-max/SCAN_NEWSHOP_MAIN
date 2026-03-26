export type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';
export type FlagKey    = 'loja' | 'cd';

const SENHAS: Record<EmpresaKey, string> = { NEWSHOP: 'n91', SOYE: 's91', FACIL: 'f91' };

export function validarSenha(empresa: EmpresaKey, senha: string): boolean {
  return SENHAS[empresa] === senha;
}

export interface ClickUpTask {
  id: string; name: string; status: string;
  date_created: string; attachments: ClickUpAttachment[];
}
export interface ClickUpAttachment {
  id: string; title: string; url: string; mimetype: string;
}

// Chama a API Route da Vercel — sem CORS
async function proxy(action: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/clickup-proxy?${qs}`);
  if (!res.ok) throw new Error(`Proxy erro ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function buscarTasksAnalisado(empresa: EmpresaKey, flag: FlagKey): Promise<ClickUpTask[]> {
  const data = await proxy('buscar-tasks', { empresa, flag });
  return data.tasks ?? [];
}

export async function baixarJsonDaTask(empresa: EmpresaKey, taskId: string): Promise<object | null> {
  return proxy('baixar-json', { empresa, taskId });
}

export async function deletarTask(empresa: EmpresaKey, taskId: string): Promise<void> {
  await proxy('deletar-task', { empresa, taskId });
}
/**
 * clickupApi.ts
 * Chamadas diretas à API do ClickUp feitas pelo frontend.
 * Usado na tela de Conferência para buscar tasks do status "Analisado".
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";
export type FlagKey    = "loja" | "cd";

export interface ClickUpTask {
  id:           string;
  name:         string;
  status:       string;
  date_created: string;
  date_updated?: string;
  description?: string;
  tags?:        string[];
  attachments:  ClickUpAttachment[];
  emAndamento?: boolean;
}

export interface ClickUpAttachment {
  id:       string;
  title:    string;
  url:      string;
  mimetype: string;
}

export interface RelatorioDiarioItem {
  codigo: string;
  sku: string;
  secao: string;
  pedido: number;
  real: number | null;
  status: "nao_tem" | "parcial" | string;
  conferente: string;
  taskId: string;
  photo?: string | null;
}

export interface RelatorioDiarioConferente {
  nome: string;
  conferencias: number;
  totalItens: number;
  separado: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  tempoTotalMinutos?: number;
  tempoConfs?: number;
}

export interface RelatorioDiarioSecao {
  nome: string;
  total: number;
  naoTem: number;
  parcial: number;
}

export interface RelatorioDiario {
  type: "daily-conference-report";
  empresa: EmpresaKey;
  flag: FlagKey;
  data: string;
  geradoEm: string;
  totalConferencias: number;
  resumo: {
    totalItens: number;
    separado: number;
    naoTem: number;
    parcial: number;
    pendente: number;
  };
  porConferente: RelatorioDiarioConferente[];
  porSecao: RelatorioDiarioSecao[];
  itens?: RelatorioDiarioItem[];
  itensCriticos: RelatorioDiarioItem[];
  conferencias: Array<{ taskId: string; name: string; conferente: string; totalItens: number }>;
  ignoradas: Array<{ taskId: string; name: string; motivo: string }>;
  clickupTaskId: string | null;
}

export interface RelatorioDataOption {
  data: string;
  label: string;
  total: number;
  relatorioGerado: boolean;
}

export interface RelatorioSalvo {
  taskId: string;
  data: string;
  label: string;
  totalConferencias: number;
  resumo: {
    totalItens: number;
    separado: number;
    naoTem: number;
    parcial: number;
    pendente: number;
  };
  geradoEm: string | null;
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
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_SOYE    ?? "901326607319",
    todoListId: import.meta.env.VITE_CLICKUP_TODO_LIST_ID_SOYE ?? "901326607319",
    senha:    "s91",
  },
  FACIL: {
    token:    import.meta.env.VITE_CLICKUP_TOKEN_SF as string,
    listId:   import.meta.env.VITE_CLICKUP_LIST_ID_FACIL    ?? "901326607320",
    todoListId: import.meta.env.VITE_CLICKUP_TODO_LIST_ID_FACIL ?? "901326607320",
    senha:    "f91",
  },
};

function getConfig(empresa: EmpresaKey, flag: FlagKey): EmpresaConfig & { resolvedListId: string } {
  const cfg = CONFIGS[empresa];
  return { ...cfg, resolvedListId: cfg.listId };
}

// ── Validação de senha ────────────────────────────────────────────────────────
export function obterSenhaPadrao(empresa: EmpresaKey, _flag: FlagKey = "loja"): string {
  return CONFIGS[empresa]?.senha ?? "";
}

export function validarSenha(empresa: EmpresaKey, senha: string, flag: FlagKey = "loja"): boolean {
  return obterSenhaPadrao(empresa, flag) === senha;
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
  if (response.status === 404) throw new Error("Esta task não tem lista de conferência anexada. Só tasks enviadas pelo scanner podem ser abertas aqui.");
  if (!response.ok) throw new Error(`Erro ${response.status} ao baixar JSON`);
  const data = await response.json();
  return data;
}

// ── Buscar attachments de uma task ───────────────────────────────────────────
export async function consolidarJsonsAnalisados(
  empresa: EmpresaKey,
  flag: FlagKey,
  nome?: string,
  taskIds?: string[]
): Promise<object> {
  const params = new URLSearchParams({
    action: "consolidar-jsons",
    empresa,
    flag,
  });
  if (nome) params.set("nome", nome);
  if (taskIds?.length) params.set("taskIds", taskIds.join(","));

  const response = await fetch(`/api/clickup-proxy?${params.toString()}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao consolidar JSONs`);
  return await response.json();
}

export async function gerarRelatorioDiario(
  empresa: EmpresaKey,
  flag: FlagKey,
  data?: string
): Promise<RelatorioDiario> {
  const params = new URLSearchParams({
    action: "gerar-relatorio-diario",
    empresa,
    flag,
  });
  if (data) params.set("data", data);

  const response = await fetch(`/api/clickup-proxy?${params.toString()}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao gerar relatorio diario`);
  return await response.json();
}

export async function listarDatasRelatorio(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<RelatorioDataOption[]> {
  const params = new URLSearchParams({
    action: "listar-datas-relatorio",
    empresa,
    flag,
  });

  const response = await fetch(`/api/clickup-proxy?${params.toString()}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar datas de relatorio`);
  const data = await response.json();
  return data.datas ?? [];
}

export async function salvarRelatorioDashboard(
  empresa: EmpresaKey,
  flag: FlagKey,
  data: string
): Promise<RelatorioDiario> {
  const params = new URLSearchParams({ action: 'salvar-relatorio-dashboard', empresa, flag, data });
  const response = await fetch(`/api/clickup-proxy?${params}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Erro ${response.status} ao salvar relatorio dashboard`);
  return await response.json();
}

export async function listarRelatoriosSalvos(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<RelatorioSalvo[]> {
  const params = new URLSearchParams({ action: 'listar-relatorios-salvos', empresa, flag });
  const response = await fetch(`/api/clickup-proxy?${params}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao listar relatorios salvos`);
  const data = await response.json();
  return data.relatorios ?? [];
}

export async function buscarRelatorioSalvo(
  empresa: EmpresaKey,
  flag: FlagKey,
  data: string
): Promise<RelatorioDiario | null> {
  const params = new URLSearchParams({ action: 'buscar-relatorio-salvo', empresa, flag, data });
  const response = await fetch(`/api/clickup-proxy?${params}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar relatorio salvo`);
  return await response.json();
}

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
export async function reservarTasksConferencia(
  empresa: EmpresaKey,
  taskIds: string[],
  forcar = false
): Promise<void> {
  const response = await fetch(`/api/clickup-proxy?action=reservar-conferencia&empresa=${empresa}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskIds, forcar }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.reason || data?.error || `Erro ${response.status} ao reservar pedido`);
  }
}

export async function liberarTasksConferencia(
  empresa: EmpresaKey,
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) return;

  const response = await fetch(`/api/clickup-proxy?action=liberar-conferencia&empresa=${empresa}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskIds }),
  });

  if (!response.ok) throw new Error(`Erro ${response.status} ao liberar pedido`);
}

export async function deletarTask(
  empresa: EmpresaKey,
  taskId: string
): Promise<void> {
  const response = await fetch(`/api/clickup-proxy?action=deletar-task&taskId=${taskId}&empresa=${empresa}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao deletar task`);
}

export interface HistoricoItemOcorrencia {
  data: string;
  dataFormatada: string;
  status: string;
  listeiro: string;
}

export interface DashboardKpis {
  paraConferir: number;
  conferidas: number;
  ultimos7Dias: number;
  itensPendentes: number;
  porDia: { data: string; valor: number }[];
}

export async function buscarDashboardKpis(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<DashboardKpis> {
  const params = new URLSearchParams({ action: 'buscar-dashboard-kpis', empresa, flag });
  const response = await fetch(`/api/clickup-proxy?${params}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar KPIs do dashboard`);
  return await response.json();
}

export interface AnaliseAutomaticaConfig {
  ativo: boolean;
  modo: "tempo" | "quantidade";
  intervaloMinutos: number;
  quantidadeMinima: number;
  atualizadoPor: string;
  atualizadoEm: string;
  ultimaExecucaoEm: string | null;
  ultimoProcessado: number;
}

export async function obterConfigAnaliseAutomatica(empresa: EmpresaKey): Promise<AnaliseAutomaticaConfig> {
  const params = new URLSearchParams({ action: "obter-config-analise-automatica", empresa });
  const response = await fetch(`/api/clickup-proxy?${params}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar configuração de análise automática`);
  const data = await response.json();
  return data.config;
}

export async function salvarConfigAnaliseAutomatica(
  empresa: EmpresaKey,
  partial: Partial<Pick<AnaliseAutomaticaConfig, "ativo" | "modo" | "intervaloMinutos" | "quantidadeMinima">>,
  atualizadoPor: string
): Promise<AnaliseAutomaticaConfig> {
  const params = new URLSearchParams({ action: "salvar-config-analise-automatica", empresa });
  const response = await fetch(`/api/clickup-proxy?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...partial, atualizadoPor }),
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao salvar configuração de análise automática`);
  const data = await response.json();
  return data.config;
}

export interface ExecutarAnaliseAutomaticaResultado {
  executado: boolean;
  motivo?: string;
  processado?: number;
  total?: number;
  config: AnaliseAutomaticaConfig;
}

export async function executarAnaliseAutomaticaAgora(
  empresa: EmpresaKey,
  flag: FlagKey = "loja"
): Promise<ExecutarAnaliseAutomaticaResultado> {
  const params = new URLSearchParams({ action: "executar-analise-automatica", empresa, flag });
  const response = await fetch(`/api/clickup-proxy?${params}`, { method: "POST" });
  if (!response.ok) throw new Error(`Erro ${response.status} ao executar análise automática`);
  return await response.json();
}

export async function buscarHistoricoItem(
  empresa: EmpresaKey,
  flag: FlagKey,
  barcode: string
): Promise<HistoricoItemOcorrencia[]> {
  const url = `/api/clickup-proxy?action=buscar-historico-item&empresa=${empresa}&flag=${flag}&barcode=${encodeURIComponent(barcode)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro ${response.status} ao buscar histórico`);
  const data = await response.json();
  return Array.isArray(data.ocorrencias) ? data.ocorrencias : [];
}

// ── Editar Pedentes (admin/super) ─────────────────────────────────────────────

export interface PendenteItem {
  codigo: string;
  sku: string;
  secao: string | null;
  quantidadePedida: number;
}

export interface PendenteTask {
  id: string;
  name: string;
  dateKey: string | null;
  dataFormatada: string;
  conferente: string;
  listeiro: string;
  totalItens: number;
  itens: PendenteItem[];
}

export interface AnaliseItemEncontrado {
  codigo: string;
  sku: string;
  quantidadePedida: number;
  quantidadeReal: number | null;
  encontradoEm: { taskId: string; taskName: string; dateKey: string };
}

export interface AnaliseItemNaoEncontrado {
  codigo: string;
  sku: string;
  quantidadePedida: number;
}

export interface AnaliseResultado {
  taskId: string;
  taskName: string;
  dateKey: string | null;
  totalItens: number;
  encontrados: AnaliseItemEncontrado[];
  naoEncontrados: AnaliseItemNaoEncontrado[];
}

export interface AplicarAnaliseProcessado {
  taskId: string;
  removidos: number;
  restantes: number;
  deleted: boolean;
}

export async function listarTasksPendentes(
  empresa: EmpresaKey,
  flag: FlagKey
): Promise<PendenteTask[]> {
  const params = new URLSearchParams({ action: 'listar-tasks-pendentes', empresa, flag });
  const response = await fetch(`/api/clickup-proxy?${params}`);
  if (!response.ok) throw new Error(`Erro ${response.status} ao listar pendentes`);
  const data = await response.json();
  return data.pendentes ?? [];
}

export async function editarPendente(
  empresa: EmpresaKey,
  taskId: string,
  itens: PendenteItem[]
): Promise<{ deleted?: boolean; updated?: boolean; totalItens?: number }> {
  const response = await fetch(`/api/clickup-proxy?action=editar-pendente&empresa=${empresa}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, itens }),
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao editar pendente`);
  return await response.json();
}

export async function excluirPendente(empresa: EmpresaKey, taskId: string): Promise<void> {
  return deletarTask(empresa, taskId);
}

export async function juntarPendentes(
  empresa: EmpresaKey,
  taskIds: string[]
): Promise<{ created: { id: string; name: string; totalItens: number } }> {
  const response = await fetch(`/api/clickup-proxy?action=juntar-pendentes&empresa=${empresa}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskIds }),
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao juntar pendentes`);
  return await response.json();
}

export async function analisarPendentes(
  empresa: EmpresaKey,
  flag: FlagKey,
  taskIds: string[],
  itemCodigos?: Record<string, string[]>
): Promise<AnaliseResultado[]> {
  const response = await fetch(`/api/clickup-proxy?action=analisar-pendentes&empresa=${empresa}&flag=${flag}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskIds, itemCodigos }),
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao analisar pendentes`);
  const data = await response.json();
  return data.resultados ?? [];
}

export async function aplicarAnalisePendentes(
  empresa: EmpresaKey,
  resultados: Array<{ taskId: string; codigosParaRemover: string[] }>
): Promise<AplicarAnaliseProcessado[]> {
  const response = await fetch(`/api/clickup-proxy?action=aplicar-analise-pendentes&empresa=${empresa}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultados }),
  });
  if (!response.ok) throw new Error(`Erro ${response.status} ao aplicar analise`);
  const data = await response.json();
  return data.processados ?? [];
}

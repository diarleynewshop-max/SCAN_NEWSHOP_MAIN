import { VercelRequest, VercelResponse } from '@vercel/node';

type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';
type FlagKey = 'loja' | 'cd';
type ListaKey = FlagKey | 'compras';

type RelatorioItem = {
  codigo: string;
  sku: string;
  secao: string;
  pedido: number;
  real: number | null;
  status: string;
  conferente: string;
  taskId: string;
  photo?: string | null;
};
const CONFERENCIA_LOCK_TAG = 'pedido em andamento';
const RELATORIO_DETAIL_CONCURRENCY = 6;

const DEFAULT_LIST_IDS: Record<EmpresaKey, Record<ListaKey, string>> = {
  NEWSHOP: { loja: '901325900510', cd: '901325900510', compras: '901326684020' },
  SOYE: { loja: '901326607319', cd: '901326461924', compras: '901326607319' },
  FACIL: { loja: '901326607320', cd: '901326461915', compras: '901326607320' },
};

function getSingle(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

function normalizeEmpresa(value: unknown): EmpresaKey {
  const empresa = getSingle(value).trim().toUpperCase();
  if (empresa.includes('SOYE')) return 'SOYE';
  if (empresa.includes('FACIL')) return 'FACIL';
  return 'NEWSHOP';
}

function normalizeFlag(value: unknown): FlagKey {
  return getSingle(value).trim().toLowerCase() === 'cd' ? 'cd' : 'loja';
}

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function getToken(empresa: EmpresaKey): string {
  if (empresa === 'NEWSHOP') {
    return (
      process.env.CLICKUP_TOKEN ||
      process.env.CLICKUP_API_TOKEN ||
      process.env.VITE_CLICKUP_TOKEN_NEWSHOP ||
      ''
    );
  }

  return (
    process.env.CLICKUP_TOKEN_SF ||
    process.env.CLICKUP_API_TOKEN_SF ||
    process.env.CLICKUP_API_TOKEN ||
    process.env.VITE_CLICKUP_TOKEN_SF ||
    ''
  );
}

function protectLojaFromCdEnv(
  empresa: EmpresaKey,
  envListId: string | undefined,
  defaultLojaId: string,
  cdListId: string
): string {
  if (!envListId) return defaultLojaId;

  if (empresa !== 'NEWSHOP' && envListId === cdListId) {
    console.warn(`[clickup-proxy] CLICKUP_LIST_ID_${empresa} aponta para CD. Usando LOJA padrao.`);
    return defaultLojaId;
  }

  return envListId;
}

function getListId(empresa: EmpresaKey, lista: ListaKey): string {
  const defaults = DEFAULT_LIST_IDS[empresa];

  if (lista === 'compras') {
    if (empresa === 'NEWSHOP') {
      return getEnv(
        'CLICKUP_TODO_LIST_ID_NEWSHOP',
        'CLICKUP_TODO_LIST_ID',
        'CLICKUP_LIST_ID_COMPRAS_NEWSHOP',
        'CLICKUP_LIST_ID_COMPRAS'
      ) ?? defaults.compras;
    }

    return getEnv(
      `CLICKUP_TODO_LIST_ID_${empresa}`,
      `CLICKUP_LIST_ID_COMPRAS_${empresa}`,
      'CLICKUP_LIST_ID_COMPRAS_SF',
      'CLICKUP_TODO_LIST_ID_SF'
    ) ?? defaults.compras;
  }

  if (lista === 'cd') {
    if (empresa === 'NEWSHOP') {
      return getEnv('CLICKUP_CD_LIST_ID_NEWSHOP', 'CLICKUP_LIST_ID_NEWSHOP', 'CLICKUP_LIST_ID') ?? defaults.cd;
    }

    return getEnv(`CLICKUP_CD_LIST_ID_${empresa}`) ?? defaults.cd;
  }

  if (empresa === 'NEWSHOP') {
    return getEnv('CLICKUP_LIST_ID_NEWSHOP', 'CLICKUP_LIST_ID') ?? defaults.loja;
  }

  return protectLojaFromCdEnv(
    empresa,
    getEnv(`CLICKUP_LIST_ID_${empresa}_LOJA`, `CLICKUP_LOJA_LIST_ID_${empresa}`, `CLICKUP_LIST_ID_${empresa}`),
    defaults.loja,
    getListId(empresa, 'cd')
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeStatus(status: unknown): string {
  return String(status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function fetchTasksFromList(listId: string, token: string, includeClosed = false): Promise<any[]> {
  const allTasks: any[] = [];

  for (let page = 0; page < 5; page++) {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=${includeClosed ? 'true' : 'false'}&page=${page}`,
      { headers: { Authorization: token } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ClickUp ${response.status} na lista ${listId}: ${errorText}`);
    }

    const data = await response.json();
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    allTasks.push(...tasks);

    if (tasks.length < 100) break;
  }

  return allTasks;
}

function mapClickUpTask(task: any, listId: string) {
  return {
    id: task.id,
    name: task.name,
    status: task.status?.status ?? '',
    date_created: task.date_created ?? '',
    date_updated: task.date_updated ?? '',
    description: task.description ?? task.text_content ?? '',
    listId,
    tags: (task.tags ?? []).map((tag: any) => String(tag?.name ?? tag ?? '')),
    attachments: (task.attachments ?? []).map((attachment: any) => ({
      id: attachment.id,
      title: attachment.title ?? attachment.file_name ?? '',
      url: attachment.url,
      mimetype: attachment.mimetype ?? '',
    })),
  };
}

async function fetchTaskDetail(taskId: string, token: string): Promise<any> {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao buscar task ${taskId}: ${await response.text()}`);
  }

  return await response.json();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

function formatDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formatDatePtBr(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

function taskMatchesDate(task: any, dateKey: string): boolean {
  const datePtBr = formatDatePtBr(dateKey);
  const name = String(task?.name ?? '');
  const description = String(task?.description ?? task?.text_content ?? '');

  if (name.includes(datePtBr) || description.includes(`Data: ${datePtBr}`)) {
    return true;
  }

  const timestamp = Number(task?.date_updated || task?.date_created || 0);
  if (!timestamp) return false;
  return formatDateKey(new Date(timestamp)) === dateKey;
}

function extractDateKeyFromText(value: string): string | null {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function taskTimestampDateKey(task: any): string | null {
  const timestamp = Number(task?.date_done || task?.date_closed || task?.date_updated || task?.date_created || 0);
  if (!timestamp) return null;
  return formatDateKey(new Date(timestamp));
}

function taskReportDateKey(task: any, description = ''): string | null {
  return (
    extractDateKeyFromText(description) ||
    extractDateKeyFromText(String(task?.name ?? '')) ||
    extractDateKeyFromText(String(task?.description ?? task?.text_content ?? '')) ||
    taskTimestampDateKey(task) ||
    null
  );
}

function taskHasTag(task: any, tagName: string): boolean {
  const tagNorm = normalizeText(tagName).trim();
  return Array.isArray(task?.tags) && task.tags.some((tag: any) => normalizeText(tag?.name ?? tag).trim() === tagNorm);
}

async function addTaskTag(token: string, taskId: string, tagName: string): Promise<void> {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/tag/${encodeURIComponent(tagName)}`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`ClickUp ${response.status} ao aplicar tag ${tagName}: ${await response.text()}`);
  }
}

async function removeTaskTag(token: string, taskId: string, tagName: string): Promise<void> {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/tag/${encodeURIComponent(tagName)}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`ClickUp ${response.status} ao remover tag ${tagName}: ${await response.text()}`);
  }
}

function getTaskIds(req: VercelRequest, taskId: string): string[] {
  const bodyIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
  const queryIds = getSingle(req.query.taskIds)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return unique([
    taskId,
    ...bodyIds.map((id: unknown) => String(id ?? '').trim()),
    ...queryIds,
  ]);
}

async function reservarTasksConferencia(taskIds: string[], token: string) {
  const reservadas: string[] = [];

  for (const id of taskIds) {
    const task = await fetchTaskDetail(id, token);
    const status = normalizeStatus(task.status?.status);

    if (status !== 'analisado') {
      for (const reservada of reservadas) {
        await removeTaskTag(token, reservada, CONFERENCIA_LOCK_TAG).catch(() => undefined);
      }
      return {
        ok: false,
        lockedByOther: false,
        taskId: id,
        reason: `Task nao esta mais em ANALISADO. Status atual: ${task.status?.status ?? '-'}`,
      };
    }

    if (taskHasTag(task, CONFERENCIA_LOCK_TAG)) {
      for (const reservada of reservadas) {
        await removeTaskTag(token, reservada, CONFERENCIA_LOCK_TAG).catch(() => undefined);
      }
      return {
        ok: false,
        lockedByOther: true,
        taskId: id,
        reason: 'Pedido ja esta em conferencia por outra pessoa.',
      };
    }

    await addTaskTag(token, id, CONFERENCIA_LOCK_TAG);
    reservadas.push(id);
  }

  return { ok: true, taskIds: reservadas };
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractConferente(task: any, description: string): string {
  const fromDescription = description.match(/^Conferente:\s*(.+)$/im)?.[1]?.trim();
  if (fromDescription) return fromDescription;

  return String(task?.name ?? '')
    .replace(/^[^\wÀ-ÿ]+/u, '')
    .split(/[—-]/)[0]
    .trim() || 'Sem conferente';
}

function extractResumoValue(description: string, label: string): number {
  const labelNorm = normalizeText(label);
  const line = description
    .split(/\r?\n/)
    .find((item) => normalizeText(item).includes(labelNorm));

  const value = line?.match(/:\s*(\d+)/)?.[1];
  return value ? Number(value) : 0;
}

function normalizeReportStatus(value: string): string {
  const text = normalizeText(value);
  if (text.includes('parcial')) return 'parcial';
  if (text.includes('nao tem') || text.includes('não tem')) return 'nao_tem';
  if (text.includes('pendente')) return 'pendente';
  return 'separado';
}

function parseConferenceItems(description: string, conferente: string, taskId: string): RelatorioItem[] {
  const items: RelatorioItem[] = [];
  let secaoAtual = 'Sem categoria';

  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === '{S}' || line === '{M}' || normalizeText(line) === 'sem categoria') {
      secaoAtual = normalizeText(line) === 'sem categoria' ? 'Sem categoria' : line;
      continue;
    }

    const secaoMatch = line.match(/^Se[cç][aã]o:\s*(.+)$/i);
    if (secaoMatch?.[1]) {
      secaoAtual = secaoMatch[1].trim();
      continue;
    }

    const itemMatch = line.match(/Codigo:\s*([^|]+)\|\s*SKU:\s*([^|]+)\|\s*Pedido:\s*(\d+)\s*\|\s*Real:\s*([^|]+)\|\s*(.+)$/i);
    if (!itemMatch) continue;

    const status = normalizeReportStatus(itemMatch[5]);
    const realText = itemMatch[4].trim();
    items.push({
      codigo: itemMatch[1].trim(),
      sku: itemMatch[2].trim(),
      secao: secaoAtual,
      pedido: Number(itemMatch[3]),
      real: /^\d+$/.test(realText) ? Number(realText) : null,
      status,
      conferente,
      taskId,
    });
  }

  return items;
}

const RELATORIO_DASHBOARD_STATUS_CANDIDATES = ['Relatorio', 'RELATORIO', 'Relatório', 'RELATÓRIO'];

function buildRelatorioDescription(report: any, dataPtBr: string, empresa: EmpresaKey, flag: FlagKey): string {
  const lines: string[] = [
    `Relatorio de Conferencia`,
    `Data: ${dataPtBr}`,
    `Empresa: ${empresa}`,
    `Flag: ${flag.toUpperCase()}`,
    `Total Conferencias: ${report.totalConferencias}`,
    `Total Itens: ${report.resumo.totalItens}`,
    `Separado: ${report.resumo.separado}`,
    `Nao Tem: ${report.resumo.naoTem}`,
    `Parcial: ${report.resumo.parcial}`,
    `Pendente: ${report.resumo.pendente}`,
    `Gerado Em: ${report.geradoEm}`,
    ``,
  ];

  for (const conf of Array.isArray(report.conferencias) ? report.conferencias : []) {
    lines.push(`--- ${conf.conferente ?? 'Sem conferente'} ---`);
    lines.push(`Task: ${conf.taskId}`);
    lines.push(`Total: ${conf.totalItens}`);
    if (conf.resumo) {
      lines.push(`Separado: ${conf.resumo.separado} | Nao Tem: ${conf.resumo.naoTem} | Parcial: ${conf.resumo.parcial} | Pendente: ${conf.resumo.pendente}`);
    }
    lines.push(``);
  }

  // Itens críticos agrupados por seção
  const itens: any[] = Array.isArray(report.itens) ? report.itens : [];
  const criticos = itens.filter((i) => i.status === 'nao_tem' || i.status === 'parcial');

  if (criticos.length > 0) {
    lines.push(`=== ITENS CRITICOS (${criticos.length}) ===`);
    let secaoAtual = '';
    for (const item of criticos) {
      const secao = String(item.secao ?? 'Sem categoria');
      if (secao !== secaoAtual) {
        secaoAtual = secao;
        lines.push(secao);
      }
      const statusLabel = item.status === 'nao_tem' ? 'Nao tem' : 'Parcial';
      lines.push(`Codigo: ${item.codigo} | SKU: ${item.sku || '-'} | Pedido: ${item.pedido} | Real: ${item.real ?? '-'} | ${statusLabel}`);
    }
    lines.push(``);
  }

  // Todos os itens (separados incluídos)
  const todos = itens.filter((i) => i.status !== 'nao_tem' && i.status !== 'parcial');
  if (todos.length > 0) {
    lines.push(`=== SEPARADOS / PENDENTES (${todos.length}) ===`);
    let secaoAtual2 = '';
    for (const item of todos) {
      const secao = String(item.secao ?? 'Sem categoria');
      if (secao !== secaoAtual2) {
        secaoAtual2 = secao;
        lines.push(secao);
      }
      const statusLabel = item.status === 'pendente' ? 'Pendente' : 'Separado';
      lines.push(`Codigo: ${item.codigo} | SKU: ${item.sku || '-'} | Pedido: ${item.pedido} | Real: ${item.real ?? '-'} | ${statusLabel}`);
    }
  }

  return lines.join('\n');
}

async function salvarRelatorioDashboard(
  empresa: EmpresaKey,
  flag: FlagKey,
  token: string,
  dateKey: string
): Promise<any> {
  const t0 = Date.now();
  console.log(`[DASH][1] INICIO | empresa=${empresa} flag=${flag} data=${dateKey}`);

  // PASSO 1 — verifica se já existe
  let existente: any = null;
  try {
    existente = await buscarRelatorioSalvo(empresa, flag, token, dateKey);
  } catch (err: any) {
    console.warn(`[DASH][1] buscarRelatorioSalvo falhou (ignorando): ${err.message}`);
  }
  if (existente) {
    console.log(`[DASH][1] Relatorio existente encontrado (+${Date.now() - t0}ms) — retornando`);
    return existente;
  }
  console.log(`[DASH][1] Nenhum relatorio existente (+${Date.now() - t0}ms)`);

  // PASSO 2 — gera relatório do zero
  console.log(`[DASH][2] gerarRelatorioDiario...`);
  let report: any;
  try {
    report = await gerarRelatorioDiario(empresa, flag, token, dateKey);
    console.log(`[DASH][2] OK (+${Date.now() - t0}ms) | conferencias=${report.totalConferencias} | itens=${report.resumo?.totalItens} | ignoradas=${report.ignoradas?.length ?? 0}`);
  } catch (err: any) {
    console.error(`[DASH][2] ERRO gerarRelatorioDiario: ${err.message}`);
    throw new Error(`Falha ao gerar relatorio: ${err.message}`);
  }

  // PASSO 3 — cria task no ClickUp
  const listId = getListId(empresa, flag);
  const dataPtBr = formatDatePtBr(dateKey);
  const nome = `Relatorio - ${dataPtBr} - ${empresa} ${flag.toUpperCase()}`;
  const descricao = buildRelatorioDescription(report, dataPtBr, empresa, flag).slice(0, 12000);
  console.log(`[DASH][3] Criando task | lista=${listId} | nome="${nome}" | desc_chars=${descricao.length}`);

  let taskId: string | null = null;
  let lastError = '';
  for (const status of RELATORIO_DASHBOARD_STATUS_CANDIDATES) {
    const r = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, description: descricao, status }),
    });
    if (r.ok) {
      taskId = (await r.json()).id as string;
      console.log(`[DASH][3] OK (+${Date.now() - t0}ms) | task=${taskId} | status="${status}"`);
      break;
    }
    lastError = await r.text();
    console.warn(`[DASH][3] status="${status}" recusado: ${lastError.slice(0, 120)}`);
  }

  if (!taskId) {
    const msg = `Status "Relatorio" nao existe na lista ${listId}. Crie o status no ClickUp. Ultimo erro: ${lastError}`;
    console.error(`[DASH][3] ERRO: ${msg}`);
    throw new Error(msg);
  }

  // PASSO 4 — anexa JSON
  const reportWithId = { ...report, clickupTaskId: taskId };
  const jsonString = JSON.stringify(reportWithId);
  const fileName = `relatorio_dashboard_${empresa}_${flag}_${dateKey}.json`;
  console.log(`[DASH][4] Anexando JSON | task=${taskId} | arquivo=${fileName} | bytes=${Buffer.byteLength(jsonString)}`);

  const boundary = `ClickUpBound${Date.now()}`;
  const nl = '\r\n';
  const bodyBuf = Buffer.concat([
    Buffer.from(`--${boundary}${nl}`),
    Buffer.from(`Content-Disposition: form-data; name="attachment"; filename="${fileName}"${nl}`),
    Buffer.from(`Content-Type: application/json${nl}${nl}`),
    Buffer.from(jsonString, 'utf-8'),
    Buffer.from(`${nl}--${boundary}--${nl}`),
  ]);

  let attachResponse: Response;
  try {
    attachResponse = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/attachment`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuf,
    });
  } catch (err: any) {
    console.error(`[DASH][4] ERRO fetch attachment: ${err.message}`);
    await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
      method: 'DELETE', headers: { Authorization: token },
    }).catch(() => {});
    throw new Error(`Erro de rede ao anexar JSON: ${err.message}`);
  }

  if (!attachResponse.ok) {
    const attachError = await attachResponse.text();
    console.error(`[DASH][4] ERRO HTTP ${attachResponse.status}: ${attachError}`);
    await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
      method: 'DELETE', headers: { Authorization: token },
    }).catch(() => {});
    throw new Error(`ClickUp ${attachResponse.status} ao anexar JSON: ${attachError}`);
  }

  console.log(`[DASH][4] OK (+${Date.now() - t0}ms) | JSON anexado`);
  console.log(`[DASH][FIM] Relatorio salvo com sucesso | task=${taskId} | total=${Date.now() - t0}ms`);
  return reportWithId;
}

async function listarRelatoriosSalvos(
  empresa: EmpresaKey,
  flag: FlagKey,
  token: string
): Promise<any[]> {
  const listId = getListId(empresa, flag);
  const rawTasks = await fetchTasksFromList(listId, token, true);
  const empresaFlag = `${empresa} ${flag.toUpperCase()}`;

  return rawTasks
    .filter((task) => {
      const statusNorm = normalizeStatus(task.status?.status);
      const name = String(task.name ?? '');
      return (
        (statusNorm.includes('relatorio') || statusNorm.includes('relatório')) &&
        name.startsWith('Relatorio - ') &&
        name.includes(empresaFlag)
      );
    })
    .map((task) => {
      const name = String(task.name ?? '');
      const matchDate = name.match(/Relatorio - (\d{2}\/\d{2}\/\d{4})/);
      const dataPtBr = matchDate?.[1] ?? '';
      const dateKey = dataPtBr
        ? `${dataPtBr.slice(6)}-${dataPtBr.slice(3, 5)}-${dataPtBr.slice(0, 2)}`
        : '';
      const desc = String(task.description ?? task.text_content ?? '');
      return {
        taskId: task.id,
        data: dateKey,
        label: dataPtBr,
        totalConferencias: Number(desc.match(/^Total Conferencias:\s*(\d+)/im)?.[1] ?? 0),
        resumo: {
          totalItens: Number(desc.match(/^Total Itens:\s*(\d+)/im)?.[1] ?? 0),
          separado: Number(desc.match(/^Separado:\s*(\d+)/im)?.[1] ?? 0),
          naoTem: Number(desc.match(/^Nao Tem:\s*(\d+)/im)?.[1] ?? 0),
          parcial: Number(desc.match(/^Parcial:\s*(\d+)/im)?.[1] ?? 0),
          pendente: Number(desc.match(/^Pendente:\s*(\d+)/im)?.[1] ?? 0),
        },
        geradoEm: desc.match(/^Gerado Em:\s*(.+)$/im)?.[1]?.trim() ?? null,
      };
    })
    .filter((r) => r.data)
    .sort((a, b) => b.data.localeCompare(a.data));
}

async function buscarRelatorioSalvo(
  empresa: EmpresaKey,
  flag: FlagKey,
  token: string,
  dateKey: string
): Promise<any | null> {
  const listId = getListId(empresa, flag);
  const dataPtBr = formatDatePtBr(dateKey);
  const nomeBuscado = `Relatorio - ${dataPtBr} - ${empresa} ${flag.toUpperCase()}`;

  const rawTasks = await fetchTasksFromList(listId, token, true);
  const task = rawTasks.find((t) => String(t.name ?? '') === nomeBuscado);
  if (!task) return null;

  return await baixarJsonRelatorioDaTask(task.id, token).catch(() => null);
}

async function listarDatasRelatorio(empresa: EmpresaKey, flag: FlagKey, token: string) {
  const listId = getListId(empresa, flag);
  const rawTasks = await fetchTasksFromList(listId, token, true);
  const concluidas = rawTasks.filter((task) => {
    const status = normalizeStatus(task.status?.status);
    return status === 'concluido' || status === 'complete';
  });

  const dateMap = new Map<string, { data: string; label: string; total: number; relatorioGerado: boolean }>();

  const addDate = (dateKey: string, task: any) => {
    const current = dateMap.get(dateKey) ?? {
      data: dateKey,
      label: formatDatePtBr(dateKey),
      total: 0,
      relatorioGerado: true,
    };
    current.total += 1;
    dateMap.set(dateKey, current);
  };

  for (const task of concluidas) {
    const dateKey = taskReportDateKey(task);
    if (dateKey) addDate(dateKey, task);
  }

  return Array.from(dateMap.values()).sort((a, b) => b.data.localeCompare(a.data));
}
function sortByTotalDesc<T extends { total?: number; totalItens?: number }>(items: T[]): T[] {
  return items.sort((a, b) => Number(b.total ?? b.totalItens ?? 0) - Number(a.total ?? a.totalItens ?? 0));
}

async function gerarRelatorioDiario(empresa: EmpresaKey, flag: FlagKey, token: string, dateKey: string) {
  const listId = getListId(empresa, flag);
  const rawTasks = await fetchTasksFromList(listId, token, true);
  const concluidas = rawTasks.filter((task) => {
    const status = normalizeStatus(task.status?.status);
    const name = normalizeText(task.name);
    return (status === 'concluido' || status === 'complete') && !name.includes('relatorio diario');
  });

  const conferencias: any[] = [];
  const ignoradas: Array<{ taskId: string; name: string; motivo: string }> = [];
  const itens: RelatorioItem[] = [];

  const candidatas = concluidas.filter((task) => {
    const taskDateKey = taskReportDateKey(task);
    return taskDateKey ? taskDateKey === dateKey : taskMatchesDate(task, dateKey);
  });

  await mapWithConcurrency(candidatas, RELATORIO_DETAIL_CONCURRENCY, async (task) => {
    try {
      const detail = await fetchTaskDetail(task.id, token);
      const description = String(detail.description ?? detail.text_content ?? task.description ?? '');
      const detailDateKey = taskReportDateKey(detail, description);
      if (detailDateKey ? detailDateKey !== dateKey : !taskMatchesDate(task, dateKey)) {
        return;
      }

      if (!description || !normalizeText(description).includes('resumo')) {
        ignoradas.push({ taskId: task.id, name: task.name, motivo: 'Descricao fora do padrao da conferencia' });
        return;
      }

      const conferente = extractConferente(task, description);
      const resumo = {
        separado: extractResumoValue(description, 'Separado'),
        naoTem: extractResumoValue(description, 'Nao tem'),
        parcial: extractResumoValue(description, 'Parcial'),
        pendente: extractResumoValue(description, 'Pendente'),
      };
      const totalItens = Number(description.match(/^Total:\s*(\d+)/im)?.[1] ?? 0);
      const json = await baixarJsonDaTask(task.id, token).catch(() => null);
      const photoMap = new Map<string, string>();
      if (Array.isArray(json?.items)) {
        for (const rawItem of json.items) {
          const codigo = normalizeCodigo(rawItem?.codigo ?? rawItem?.barcode);
          const photo = typeof rawItem?.photo === 'string' ? rawItem.photo.trim() : '';
          if (codigo && photo && !photoMap.has(codigo)) photoMap.set(codigo, photo);
        }
      }

      conferencias.push({
        taskId: task.id,
        name: task.name,
        conferente,
        totalItens,
        resumo,
      });
      const itensTask = parseConferenceItems(description, conferente, task.id).map((item) => ({
        ...item,
        photo: photoMap.get(item.codigo) ?? null,
      }));
      itens.push(...itensTask);
    } catch (error: any) {
      ignoradas.push({ taskId: task.id, name: task.name, motivo: error?.message ?? 'Erro ao ler task' });
    }
  });

  const resumo = conferencias.reduce(
    (acc, item) => {
      acc.totalItens += item.totalItens;
      acc.separado += item.resumo.separado;
      acc.naoTem += item.resumo.naoTem;
      acc.parcial += item.resumo.parcial;
      acc.pendente += item.resumo.pendente;
      return acc;
    },
    { totalItens: 0, separado: 0, naoTem: 0, parcial: 0, pendente: 0 }
  );

  const conferenteMap = new Map<string, any>();
  for (const item of conferencias) {
    const current = conferenteMap.get(item.conferente) ?? {
      nome: item.conferente,
      conferencias: 0,
      totalItens: 0,
      separado: 0,
      naoTem: 0,
      parcial: 0,
      pendente: 0,
    };
    current.conferencias += 1;
    current.totalItens += item.totalItens;
    current.separado += item.resumo.separado;
    current.naoTem += item.resumo.naoTem;
    current.parcial += item.resumo.parcial;
    current.pendente += item.resumo.pendente;
    conferenteMap.set(item.conferente, current);
  }

  const secaoMap = new Map<string, any>();
  for (const item of itens) {
    if (item.status !== 'nao_tem' && item.status !== 'parcial') continue;
    const current = secaoMap.get(item.secao) ?? { nome: item.secao, total: 0, naoTem: 0, parcial: 0 };
    current.total += 1;
    if (item.status === 'nao_tem') current.naoTem += 1;
    if (item.status === 'parcial') current.parcial += 1;
    secaoMap.set(item.secao, current);
  }

  const report = {
    type: 'daily-conference-report',
    empresa,
    flag,
    data: dateKey,
    geradoEm: new Date().toISOString(),
    totalConferencias: conferencias.length,
    resumo,
    porConferente: sortByTotalDesc(Array.from(conferenteMap.values())),
    porSecao: sortByTotalDesc(Array.from(secaoMap.values())),
    itens,
    itensCriticos: itens.filter((item) => item.status === 'nao_tem' || item.status === 'parcial'),
    conferencias,
    ignoradas,
    clickupTaskId: null as string | null,
  };

  return report;
}

function isJsonAttachment(attachment: any): boolean {
  const title = String(attachment?.title ?? attachment?.file_name ?? '').toLowerCase();
  const mimetype = String(attachment?.mimetype ?? '').toLowerCase();
  return title.endsWith('.json') || mimetype === 'application/json';
}

function countJsonPhotos(json: any): number {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.filter((item: any) => typeof item?.photo === 'string' && item.photo.trim()).length;
}

function countJsonItems(json: any): number {
  return Array.isArray(json?.items) ? json.items.length : 0;
}

async function baixarJsonsDeTask(taskId: string, token: string): Promise<any[]> {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao buscar task ${taskId}: ${await response.text()}`);
  }

  const taskData = await response.json();
  const attachments = (taskData.attachments ?? []).filter(isJsonAttachment);
  if (attachments.length === 0) return [];

  const jsons: any[] = [];

  for (const attachment of attachments) {
    if (!attachment?.url) continue;

    const title = String(attachment?.title ?? attachment?.file_name ?? 'arquivo.json');
    const fileResponse = await fetch(attachment.url, { headers: { Authorization: token } });
    if (!fileResponse.ok) {
      console.warn(`[clickup-proxy] JSON ignorado (${fileResponse.status}) task=${taskId} title=${title}`);
      continue;
    }

    try {
      jsons.push(await fileResponse.json());
    } catch {
      console.warn(`[clickup-proxy] JSON invalido ignorado task=${taskId} title=${title}`);
    }
  }

  return jsons;
}

// Baixa o JSON de conferência de uma task (type === "conference-file")
async function baixarJsonDaTask(taskId: string, token: string): Promise<any | null> {
  const jsons = await baixarJsonsDeTask(taskId, token);
  const candidates = jsons
    .filter((json) => json?.type === 'conference-file')
    .map((json) => ({ json, photos: countJsonPhotos(json), items: countJsonItems(json) }));

  if (candidates.length === 0) {
    if (jsons.length > 0) {
      console.warn(`[clickup-proxy] Task ${taskId} tem JSON mas nenhum é conference-file (tipos: ${jsons.map(j => j?.type).join(', ')})`);
    }
    return null;
  }

  candidates.sort((a, b) => {
    if (b.photos !== a.photos) return b.photos - a.photos;
    return b.items - a.items;
  });

  return candidates[0].json;
}

// Baixa o JSON de relatório de uma task (qualquer tipo)
async function baixarJsonRelatorioDaTask(taskId: string, token: string): Promise<any | null> {
  const jsons = await baixarJsonsDeTask(taskId, token);
  return jsons.find((j) => j?.type === 'daily-conference-report') ?? jsons[0] ?? null;
}

function normalizeCodigo(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeQuantidade(value: unknown): number {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
  return Math.round(numberValue);
}

function normalizeTaskName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function consolidarJsonsAnalisados(
  empresa: EmpresaKey,
  flag: FlagKey,
  token: string,
  nomeFiltro = '',
  taskIdsFiltro: string[] = []
) {
  const tasks = taskIdsFiltro.length > 0
    ? await Promise.all(
        taskIdsFiltro.map(async (id) => {
          const task = await fetchTaskDetail(id, token);
          return mapClickUpTask(task, String(task?.list?.id ?? getListId(empresa, flag)));
        })
      )
    : await buscarTasksAnalisado(empresa, flag, token);
  const nomeNormalizado = normalizeTaskName(nomeFiltro);
  const tasksFiltradas = nomeNormalizado
    ? tasks.filter((task) => normalizeTaskName(task.name) === nomeNormalizado)
    : tasks;
  const itemsMap = new Map<string, any>();
  const pedidos: Array<{ taskId: string; name: string; itens: number }> = [];
  const ignorados: Array<{ taskId: string; name: string; motivo: string }> = [];
  let linhasOriginais = 0;

  for (const task of tasksFiltradas) {
    try {
      const json = await baixarJsonDaTask(task.id, token);
      const items = Array.isArray(json?.items) ? json.items : [];

      if (items.length === 0) {
        ignorados.push({ taskId: task.id, name: task.name, motivo: 'JSON sem items' });
        continue;
      }

      pedidos.push({ taskId: task.id, name: task.name, itens: items.length });

      for (const item of items) {
        const codigo = normalizeCodigo(item.codigo ?? item.barcode);
        const quantidade = normalizeQuantidade(item.quantidade ?? item.quantity);
        if (!codigo || quantidade <= 0) continue;

        const sku = String(item.sku ?? '').trim();
        const secao = String(item.secao ?? '').trim();
        const key = `${codigo}::${sku}::${secao}`;
        const existing = itemsMap.get(key);

        linhasOriginais += 1;

        if (existing) {
          existing.quantidade += quantidade;
          existing._origens.push(task.id);
          if (!existing.photo && item.photo) existing.photo = item.photo;
          continue;
        }

        itemsMap.set(key, {
          codigo,
          sku,
          secao: secao || null,
          quantidade,
          photo: item.photo || null,
          _origens: [task.id],
        });
      }
    } catch (error: any) {
      ignorados.push({ taskId: task.id, name: task.name, motivo: error?.message ?? 'Erro ao baixar JSON' });
    }
  }

  const items = Array.from(itemsMap.values()).map((item) => ({
    codigo: item.codigo,
    sku: item.sku,
    secao: item.secao,
    quantidade: item.quantidade,
    photo: item.photo,
  }));

  return {
    type: 'conference-file',
    empresa,
    flag,
    geradoEm: new Date().toISOString(),
    items,
    _meta: {
      origem: 'clickup-consolidado',
      statusOrigem: 'ANALISADO',
      totalPedidos: pedidos.length,
      totalTasksAnalisadas: tasks.length,
      totalTasksFiltradas: tasksFiltradas.length,
      nomeFiltro: nomeFiltro || null,
      totalLinhasOriginais: linhasOriginais,
      totalItensConsolidados: items.length,
      pedidos,
      ignorados,
    },
  };
}

async function buscarTasksAnalisado(
  empresa: EmpresaKey,
  flag: FlagKey,
  token: string
) {
  const primaryListId = getListId(empresa, flag);
  const primaryRawTasks = await fetchTasksFromList(primaryListId, token);
  const primaryTasks = primaryRawTasks
    .filter((task) => normalizeStatus(task.status?.status) === 'analisado' && !taskHasTag(task, CONFERENCIA_LOCK_TAG))
    .map((task) => mapClickUpTask(task, primaryListId));

  console.log(
    '[clickup-proxy] buscar-tasks',
    JSON.stringify({
      empresa,
      flag,
      primaryListId,
      primaryCount: primaryTasks.length,
      returnedStatuses: primaryRawTasks.map((task) => task.status?.status),
    })
  );

  if (primaryTasks.length > 0 || empresa === 'NEWSHOP') {
    return primaryTasks;
  }

  const fallbackListIds = unique([
    getListId(empresa, flag === 'cd' ? 'loja' : 'cd'),
    DEFAULT_LIST_IDS[empresa].loja,
    DEFAULT_LIST_IDS[empresa].cd,
  ]).filter((listId) => listId !== primaryListId);

  const fallbackTasks: any[] = [];
  for (const listId of fallbackListIds) {
    const rawTasks = await fetchTasksFromList(listId, token);
    fallbackTasks.push(
      ...rawTasks
        .filter((task) => normalizeStatus(task.status?.status) === 'analisado')
        .filter((task) => !taskHasTag(task, CONFERENCIA_LOCK_TAG))
        .map((task) => mapClickUpTask(task, listId))
    );
  }

  console.log(
    '[clickup-proxy] fallback SOYE/FACIL',
    JSON.stringify({ empresa, flag, fallbackListIds, fallbackCount: fallbackTasks.length })
  );

  return fallbackTasks;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = getSingle(req.query.action).trim();
  const empresa = normalizeEmpresa(req.query.empresa);
  const flag = normalizeFlag(req.query.flag);
  const taskId = getSingle(req.query.taskId).trim();
  const nome = getSingle(req.query.nome).trim();
  const dataRelatorio = getSingle(req.query.data || req.body?.data).trim() || formatDateKey();
  const token = getToken(empresa);

  if (!token) {
    return res.status(500).json({ error: 'Token ClickUp nao configurado', empresa });
  }

  try {
    if (action === 'buscar-tasks') {
      const tasks = await buscarTasksAnalisado(empresa, flag, token);
      return res.status(200).json({ tasks, empresa, flag });
    }

    if (action === 'buscar-tasks-compras') {
      const listId = getListId(empresa, 'compras');
      const rawTasks = await fetchTasksFromList(listId, token);
      const tasks = rawTasks.map((task) => mapClickUpTask(task, listId));
      return res.status(200).json({ tasks, empresa, listId });
    }

    if (action === 'baixar-json') {
      const json = await baixarJsonDaTask(taskId, token);
      if (!json) return res.status(404).json({ error: 'JSON nao encontrado na task' });
      return res.status(200).json(json);
    }

    if (action === 'reservar-conferencia') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });
      const taskIds = getTaskIds(req, taskId);
      if (taskIds.length === 0) return res.status(400).json({ error: 'taskId/taskIds obrigatorio' });

      const result = await reservarTasksConferencia(taskIds, token);
      if (!result.ok) return res.status(409).json(result);
      return res.status(200).json(result);
    }

    if (action === 'liberar-conferencia') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });
      const taskIds = getTaskIds(req, taskId);
      if (taskIds.length === 0) return res.status(400).json({ error: 'taskId/taskIds obrigatorio' });

      await Promise.all(taskIds.map((id) => removeTaskTag(token, id, CONFERENCIA_LOCK_TAG)));
      return res.status(200).json({ released: true, taskIds });
    }

    if (action === 'consolidar-jsons') {
      const json = await consolidarJsonsAnalisados(empresa, flag, token, nome, getTaskIds(req, taskId));
      return res.status(200).json(json);
    }

    if (action === 'gerar-relatorio-diario') {
      const relatorio = await gerarRelatorioDiario(empresa, flag, token, dataRelatorio);
      return res.status(200).json(relatorio);
    }

    if (action === 'listar-datas-relatorio') {
      const datas = await listarDatasRelatorio(empresa, flag, token);
      return res.status(200).json({ datas, empresa, flag });
    }

    if (action === 'salvar-relatorio-dashboard') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });
      const relatorio = await salvarRelatorioDashboard(empresa, flag, token, dataRelatorio);
      return res.status(200).json(relatorio);
    }

    if (action === 'listar-relatorios-salvos') {
      const relatorios = await listarRelatoriosSalvos(empresa, flag, token);
      return res.status(200).json({ relatorios, empresa, flag });
    }

    if (action === 'buscar-relatorio-salvo') {
      const relatorio = await buscarRelatorioSalvo(empresa, flag, token, dataRelatorio);
      if (!relatorio) return res.status(404).json({ error: 'Relatorio nao encontrado' });
      return res.status(200).json(relatorio);
    }

    if (action === 'buscar-meus-pedidos') {
      const pessoa = getSingle(req.query.pessoa).trim();
      if (!pessoa) return res.status(400).json({ error: 'pessoa obrigatorio' });

      const listId = getListId(empresa, flag);
      const [abertas, fechadas] = await Promise.all([
        fetchTasksFromList(listId, token, false),
        fetchTasksFromList(listId, token, true),
      ]);

      const todasTasks = [...abertas, ...fechadas];
      const pessoaLower = pessoa.toLowerCase();

      function extrairListeiroDaDescricao(desc: string): string {
        const match = desc.match(/listeiro:\s*(.+)/i);
        return match ? match[1].trim() : '';
      }

      function extrairResumoDescricao(desc: string): { separado: number; naoTem: number; parcial: number; pendente: number } | null {
        const sep = desc.match(/separado:\s*(\d+)/i);
        const naoTem = desc.match(/n[aã]o\s*tem:\s*(\d+)/i);
        const parcial = desc.match(/parcial:\s*(\d+)/i);
        const pendente = desc.match(/pendente:\s*(\d+)/i);
        if (!sep && !naoTem && !parcial && !pendente) return null;
        return {
          separado: sep ? parseInt(sep[1]) : 0,
          naoTem: naoTem ? parseInt(naoTem[1]) : 0,
          parcial: parcial ? parseInt(parcial[1]) : 0,
          pendente: pendente ? parseInt(pendente[1]) : 0,
        };
      }

      const pedidos: any[] = [];

      for (const task of todasTasks) {
        const statusNorm = normalizeStatus(task.status?.status);
        const nome: string = task.name ?? '';
        const desc: string = task.description ?? task.text_content ?? '';

        // Task 1: "📦 Titulo — PESSOA" em to do ou analisado
        if (statusNorm === 'to do' || statusNorm === 'analisado') {
          const partes = nome.split(' — ');
          const nomePessoa = partes.length >= 2 ? partes[partes.length - 1].trim().toLowerCase() : '';
          if (nomePessoa === pessoaLower || nomePessoa.startsWith(pessoaLower)) {
            const statusLabel = statusNorm === 'to do' ? 'pedido_no_cd' : 'pronto_conferencia';
            pedidos.push({
              id: task.id,
              nome: nome,
              titulo: partes.length >= 2 ? partes.slice(0, -1).join(' — ').replace(/^📦\s*/, '').trim() : nome,
              statusClickUp: statusNorm,
              statusLabel,
              dataCriacao: task.date_created ?? '',
              dataAtualizacao: task.date_updated ?? '',
              resumo: null,
            });
          }
        }

        // Task 2: conferência com listeiro na descrição (status complete/concluido)
        if (statusNorm === 'complete' || statusNorm === 'concluido' || statusNorm === 'concluído') {
          const listeiro = extrairListeiroDaDescricao(desc).toLowerCase();
          if (listeiro && (listeiro === pessoaLower || listeiro.startsWith(pessoaLower))) {
            const resumo = extrairResumoDescricao(desc);
            pedidos.push({
              id: task.id,
              nome: nome,
              titulo: nome.replace(/^✅\s*/, '').trim(),
              statusClickUp: statusNorm,
              statusLabel: 'concluido',
              dataCriacao: task.date_created ?? '',
              dataAtualizacao: task.date_updated ?? '',
              resumo,
            });
          }
        }
      }

      pedidos.sort((a, b) => Number(b.dataAtualizacao || b.dataCriacao) - Number(a.dataAtualizacao || a.dataCriacao));
      return res.status(200).json({ pedidos, pessoa, empresa, flag });
    }

    if (action === 'deletar-task') {
      if (!taskId) return res.status(400).json({ error: 'taskId obrigatorio' });

      const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: token },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `ClickUp ${response.status} ao deletar task ${taskId}`,
          details: await response.text(),
        });
      }

      return res.status(200).json({ deleted: response.ok });
    }

    return res.status(400).json({ error: 'Action invalida' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, empresa, flag });
  }
}

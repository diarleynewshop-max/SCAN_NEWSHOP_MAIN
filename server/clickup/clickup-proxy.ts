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
};

const RELATORIO_GERADO_TAG = 'RELATORIO GERADO';
const RELATORIO_DETAIL_CONCURRENCY = 6;

const DEFAULT_LIST_IDS: Record<EmpresaKey, Record<ListaKey, string>> = {
  NEWSHOP: { loja: '901325900510', cd: '901325900510', compras: '901326684020' },
  SOYE: { loja: '901326607319', cd: '901326461924', compras: '901326684020' },
  FACIL: { loja: '901326607320', cd: '901326461915', compras: '901326684020' },
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
      'CLICKUP_TODO_LIST_ID_SF',
      'CLICKUP_TODO_LIST_ID',
      `CLICKUP_LIST_ID_COMPRAS_${empresa}`,
      'CLICKUP_LIST_ID_COMPRAS_SF',
      'CLICKUP_LIST_ID_COMPRAS'
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

function buildRelatorioDescription(report: any): string {
  const porConferente = report.porConferente
    .map((item: any) => `- ${item.nome}: ${item.totalItens} itens | Separado ${item.separado} | Parcial ${item.parcial} | Nao tem ${item.naoTem}`)
    .join('\n') || '- Sem dados';

  const porSecao = report.porSecao
    .map((item: any) => `- ${item.nome}: ${item.total} faltante/parcial`)
    .join('\n') || '- Sem faltas/parciais';

  const faltas = report.itensCriticos
    .slice(0, 80)
    .map((item: RelatorioItem, index: number) =>
      `${index + 1}. ${item.codigo} | SKU: ${item.sku || '-'} | ${item.secao} | Pedido: ${item.pedido} | Real: ${item.real ?? '-'} | ${item.status} | ${item.conferente}`
    )
    .join('\n') || 'Nenhum item faltante/parcial.';

  return `Relatorio diario de conferencia
Empresa: ${report.empresa}
Tipo: ${String(report.flag).toUpperCase()}
Data: ${formatDatePtBr(report.data)}
Conferencias: ${report.totalConferencias}
Tasks ignoradas: ${report.ignoradas.length}

RESUMO GERAL
Total de itens: ${report.resumo.totalItens}
Separado: ${report.resumo.separado}
Nao tem: ${report.resumo.naoTem}
Parcial: ${report.resumo.parcial}
Pendente: ${report.resumo.pendente}

POR CONFERENTE
${porConferente}

POR SECAO
${porSecao}

ITENS FALTANTES/PARCIAIS
${faltas}`;
}

async function listarDatasRelatorio(empresa: EmpresaKey, flag: FlagKey, token: string) {
  const listId = getListId(empresa, flag);
  const rawTasks = await fetchTasksFromList(listId, token, true);
  const concluidas = rawTasks.filter((task) => {
    const status = normalizeStatus(task.status?.status);
    const name = normalizeText(task.name);
    return (status === 'concluido' || status === 'complete') && !name.includes('relatorio diario');
  });

  const dateMap = new Map<string, { data: string; label: string; total: number; relatorioGerado: boolean }>();

  const addDate = (dateKey: string, task: any) => {
    const current = dateMap.get(dateKey) ?? {
      data: dateKey,
      label: formatDatePtBr(dateKey),
      total: 0,
      relatorioGerado: false,
    };
    current.total += 1;
    current.relatorioGerado = current.relatorioGerado || taskHasTag(task, RELATORIO_GERADO_TAG);
    dateMap.set(dateKey, current);
  };

  for (const task of concluidas) {
    const dateKey = taskReportDateKey(task);
    if (dateKey) addDate(dateKey, task);
  }

  return Array.from(dateMap.values()).sort((a, b) => b.data.localeCompare(a.data));
}

async function criarTarefaClickUp(listId: string, token: string, name: string, description: string, status = 'complete') {
  const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description, status }),
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao criar relatorio: ${await response.text()}`);
  }

  return await response.json();
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

      conferencias.push({
        taskId: task.id,
        name: task.name,
        conferente,
        totalItens,
        resumo,
      });
      itens.push(...parseConferenceItems(description, conferente, task.id));
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

  if (conferencias.length > 0) {
    const task = await criarTarefaClickUp(
      listId,
      token,
      `Relatorio Diario - ${empresa} - ${formatDatePtBr(dateKey)}`,
      buildRelatorioDescription(report),
      'complete'
    );
    report.clickupTaskId = task.id ?? null;

    await Promise.allSettled(conferencias.map((item) => addTaskTag(token, item.taskId, RELATORIO_GERADO_TAG)));
  }

  return report;
}

function isJsonAttachment(attachment: any): boolean {
  const title = String(attachment?.title ?? attachment?.file_name ?? '').toLowerCase();
  const mimetype = String(attachment?.mimetype ?? '').toLowerCase();
  return title.endsWith('.json') || mimetype === 'application/json';
}

async function baixarJsonDaTask(taskId: string, token: string): Promise<any | null> {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao buscar task ${taskId}: ${await response.text()}`);
  }

  const taskData = await response.json();
  const attachment = (taskData.attachments ?? []).find(isJsonAttachment);
  if (!attachment?.url) return null;

  const fileResponse = await fetch(attachment.url, { headers: { Authorization: token } });
  if (!fileResponse.ok) {
    throw new Error(`ClickUp ${fileResponse.status} ao baixar JSON da task ${taskId}`);
  }

  return await fileResponse.json();
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
  nomeFiltro = ''
) {
  const tasks = await buscarTasksAnalisado(empresa, flag, token);
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
    .filter((task) => normalizeStatus(task.status?.status) === 'analisado')
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

    if (action === 'consolidar-jsons') {
      const json = await consolidarJsonsAnalisados(empresa, flag, token, nome);
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

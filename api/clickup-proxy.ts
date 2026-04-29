import { VercelRequest, VercelResponse } from '@vercel/node';

type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';
type FlagKey = 'loja' | 'cd';
type ListaKey = FlagKey | 'compras';

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

async function fetchTasksFromList(listId: string, token: string): Promise<any[]> {
  const allTasks: any[] = [];

  for (let page = 0; page < 5; page++) {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false&page=${page}`,
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
    listId,
    attachments: (task.attachments ?? []).map((attachment: any) => ({
      id: attachment.id,
      title: attachment.title ?? attachment.file_name ?? '',
      url: attachment.url,
      mimetype: attachment.mimetype ?? '',
    })),
  };
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

    if (action === 'deletar-task') {
      if (!taskId) return res.status(400).json({ error: 'taskId obrigatorio' });

      const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: token },
      });
      return res.status(200).json({ deleted: response.ok });
    }

    return res.status(400).json({ error: 'Action invalida' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, empresa, flag });
  }
}

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
      const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: { Authorization: token },
      });
      const taskData = await response.json();
      const attachment = (taskData.attachments ?? []).find(
        (item: any) =>
          (item.title ?? item.file_name ?? '').endsWith('.json') ||
          item.mimetype === 'application/json'
      );

      if (!attachment) return res.status(404).json({ error: 'JSON nao encontrado na task' });

      const fileResponse = await fetch(attachment.url, { headers: { Authorization: token } });
      const json = await fileResponse.json();
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

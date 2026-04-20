type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';

type CompraStatusApp = 'todo' | 'produto_bom' | 'produto_ruim' | 'fazer_pedido' | 'concluido';

interface ZimaRequestInit extends RequestInit {
  timeoutMs?: number;
}

interface UpsertCompraTaskInput {
  id: string;
  empresa: EmpresaKey;
  codigo: string;
  descricao: string;
  sku?: string | null;
  foto?: string | null;
  status_app?: CompraStatusApp;
  status_clickup?: string | null;
  date_created?: string | null;
  source?: string | null;
}

interface UpdateCompraStatusInput {
  taskId: string;
  empresa: EmpresaKey;
  status_novo: CompraStatusApp;
  status_clickup?: string | null;
  acao?: string | null;
  origem?: string | null;
  payload?: unknown;
}

interface CompraEventoInput {
  task_id: string;
  empresa: EmpresaKey;
  acao: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  origem?: string | null;
  payload?: unknown;
}

function getBaseUrl(): string {
  return String(process.env.ZIMA_COMPRAS_BASE_URL || '').trim().replace(/\/+$/, '');
}

function getApiToken(): string {
  return String(process.env.ZIMA_COMPRAS_API_TOKEN || '').trim();
}

function getTimeoutMs(): number {
  const parsed = Number(process.env.ZIMA_COMPRAS_TIMEOUT_MS || 15000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

export function isZimaComprasConfigured(): boolean {
  return Boolean(getBaseUrl() && getApiToken());
}

async function readJsonSafe(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function getErrorDetail(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return String(body || '');
  }

  const candidate = body as Record<string, unknown>;
  return String(candidate.error || candidate.raw || '');
}

async function zimaRequest(path: string, init: ZimaRequestInit = {}) {
  if (!isZimaComprasConfigured()) {
    throw new Error('ZIMA_COMPRAS nao configurado');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? getTimeoutMs());

  try {
    return await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: {
        'x-api-token': getApiToken(),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureOk(response: Response, context: string) {
  if (response.ok) return;

  const body = await readJsonSafe(response);
  throw new Error(
    `[${context}] HTTP ${response.status}: ${getErrorDetail(body) || response.statusText}`
  );
}

export async function fetchZimaComprasTasks(
  empresa: EmpresaKey,
  status?: CompraStatusApp | null
) {
  const search = new URLSearchParams({ empresa });
  if (status) {
    search.set('status', status);
  }

  const response = await zimaRequest(`/compras/tasks?${search.toString()}`);
  await ensureOk(response, 'zima-fetch-tasks');
  return await readJsonSafe(response);
}

export async function upsertZimaCompraTask(input: UpsertCompraTaskInput) {
  const response = await zimaRequest('/compras/tasks/upsert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  await ensureOk(response, 'zima-upsert-task');
  return await readJsonSafe(response);
}

export async function updateZimaCompraStatus(input: UpdateCompraStatusInput) {
  const response = await zimaRequest(
    `/compras/tasks/${encodeURIComponent(input.taskId)}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empresa: input.empresa,
        status_novo: input.status_novo,
        status_clickup: input.status_clickup ?? null,
        acao: input.acao ?? 'ALTERAR_STATUS',
        origem: input.origem ?? 'scan-backend',
        payload: input.payload ?? null,
      }),
    }
  );

  await ensureOk(response, 'zima-update-status');
  return await readJsonSafe(response);
}

export async function postZimaCompraEvento(input: CompraEventoInput) {
  const response = await zimaRequest('/compras/eventos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  await ensureOk(response, 'zima-post-evento');
  return await readJsonSafe(response);
}

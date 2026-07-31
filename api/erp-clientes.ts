import type { VercelRequest, VercelResponse } from "@vercel/node";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RATE_LIMITED_MARKER = "ERP_RATE_LIMITED";
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchErpWithRetry(input: string | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);
    if (response.status !== 429) return response;

    await response.text().catch(() => "");
    if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new Error(RATE_LIMITED_MARKER);

    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
    await sleep(backoffMs);
  }
}

type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE" | "SEFULY";

type ErpAuth = {
  token: string;
  configured: boolean;
};

type ErpCliente = {
  id?: number;
  nome?: string;
  fantasia?: string;
  numeroDoDocumento?: string;
  tipoDePessoa?: "FISICA" | "JURIDICA" | "ESTRANGEIRO";
  telefone1?: string;
  telefone2?: string;
  email?: string;
  enderecos?: ErpEndereco[];
};

type ErpEndereco = {
  cep?: string;
  uf?: string;
  codigoIbge?: number | string;
  municipio?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  codigoDoPais?: number | string;
};

type ErpListResponse<T> = {
  items?: T[];
};

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
  SEFULY: "sefuly.varejofacil.com",
};

const tokenCache = new Map<string, string>();

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeEmpresa(value: string | string[] | undefined): EmpresaKey {
  const normalized = getSingle(value).trim().toUpperCase();
  if (normalized.includes("SEFULY")) return "SEFULY";
  if (normalized.includes("SOYE")) return "SOYE";
  if (normalized.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function erpBaseEmpresa(empresa: EmpresaKey): EmpresaKey {
  if (empresa === "SEFULY") return "NEWSHOP";
  return empresa === "SOYE" ? "FACIL" : empresa;
}

function getEnv(empresa: EmpresaKey, key: "URL" | "USERNAME" | "PASSWORD" | "TOKEN" | "KEY"): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_${key}_${empresa}`] ||
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`VITE_ERP_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}_${baseEmpresa}`] ||
    process.env[`ERP_${key}_${baseEmpresa}`] ||
    process.env[`VITE_ERP_API_${key}_${baseEmpresa}`] ||
    process.env[`VITE_ERP_${key}_${baseEmpresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`ERP_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    process.env[`VITE_ERP_${key}`] ||
    ""
  );
}

function getIntEnv(empresa: EmpresaKey, key: string, fallback: number): number {
  const baseEmpresa = erpBaseEmpresa(empresa);
  const raw = (
    process.env[`${key}_${empresa}`] ||
    process.env[`${key}_${baseEmpresa}`] ||
    process.env[key] ||
    ""
  ).trim();
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function resolveBaseUrl(empresa: EmpresaKey): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[baseEmpresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function resolveTokenFromAuth(data: Record<string, unknown>): string {
  return (
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.token === "string" && data.token) ||
    (typeof data.jwt === "string" && data.jwt) ||
    ""
  );
}

async function getAccessToken(empresa: EmpresaKey, baseUrl: string): Promise<ErpAuth> {
  const configuredToken = getEnv(empresa, "TOKEN") || getEnv(empresa, "KEY");
  if (configuredToken) return { token: configuredToken, configured: true };

  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken) return { token: cachedToken, configured: false };
  if (!username || !password) {
    throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
  }

  const response = await fetchErpWithRetry(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Nao foi possivel autenticar no ERP (${response.status}).`);
  }

  const token = resolveTokenFromAuth((await response.json()) as Record<string, unknown>);
  if (!token) throw new Error("O ERP nao retornou um access token valido no login.");

  tokenCache.set(cacheKey, token);
  return { token, configured: false };
}

function buildErpHeaders(auth: ErpAuth, hasBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: auth.token,
    Accept: "application/json",
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  if (auth.configured) headers["X-API-KEY"] = auth.token;
  return headers;
}

async function fetchErpJson<T>(
  empresa: EmpresaKey,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ data: T | null; status: number; location: string }> {
  const baseUrl = resolveBaseUrl(empresa);
  const request = async () => {
    const auth = await getAccessToken(empresa, baseUrl);
    return fetchErpWithRetry(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: buildErpHeaders(auth, init.body != null),
      body: init.body == null ? undefined : JSON.stringify(init.body),
    });
  };

  let response = await request();
  if (response.status === 401) {
    tokenCache.clear();
    response = await request();
  }

  const text = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") && text ? JSON.parse(text) as T : null;

  if (!response.ok) {
    const detail = data ? JSON.stringify(data) : text;
    throw new Error(`ERP clientes ${response.status}${detail ? `: ${detail.slice(0, 600)}` : ""}`);
  }

  return {
    data,
    status: response.status,
    location: response.headers.get("location") || "",
  };
}

function sanitizeSearchTerm(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/[;,:=><!(){}[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escaparFiql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function soDigitos(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function inferirTipoPessoa(documento: string): "F" | "J" {
  return documento.replace(/\D/g, "").length > 11 ? "J" : "F";
}

function toClientePdv(cliente: ErpCliente) {
  const endereco = cliente.enderecos?.[0] ?? null;
  const documento = soDigitos(cliente.numeroDoDocumento);
  const codigo = soDigitos(cliente.id ?? "") || documento;
  const nome = getString(cliente.nome) || getString(cliente.fantasia) || "CLIENTE";

  return {
    codigo,
    nome,
    fantasia: getString(cliente.fantasia) || null,
    cpfCnpj: documento || null,
    tipoPessoa: cliente.tipoDePessoa === "JURIDICA" ? "J" : inferirTipoPessoa(documento),
    telefone: soDigitos(cliente.telefone1 || cliente.telefone2) || null,
    email: getString(cliente.email) || null,
    endereco: getString(endereco?.logradouro) || null,
    numeroEndereco: getString(endereco?.numero) || null,
    bairro: getString(endereco?.bairro) || null,
    cidade: getString(endereco?.municipio) || null,
    uf: getString(endereco?.uf).slice(0, 2) || null,
    cep: soDigitos(endereco?.cep) || null,
    complemento: getString(endereco?.complemento) || null,
    codigoIbge: soDigitos(endereco?.codigoIbge) || null,
    codigoPais: soDigitos(endereco?.codigoDoPais) || "1058",
  };
}

async function buscarClientes(empresa: EmpresaKey, search: string, limit: number) {
  const byId = new Map<string, ReturnType<typeof toClientePdv>>();
  const clean = sanitizeSearchTerm(search);
  const digits = soDigitos(clean);
  const queries: string[] = [];

  if (digits.length >= 3) {
    queries.push(`numeroDoDocumento==${digits}`);
    queries.push(`numeroDoDocumento==*${digits}*`);
    queries.push(`telefone1==*${digits}*`);
  }

  if (clean) {
    const escaped = escaparFiql(clean);
    queries.push(`nome==*${escaped}*`);
    queries.push(`fantasia==*${escaped}*`);
  }

  const paths = queries.length
    ? queries.map((q) => `/v1/pessoa/clientes?q=${encodeURIComponent(q)}&sort=nome&start=0&count=${limit}`)
    : [`/v1/pessoa/clientes?sort=nome&start=0&count=${limit}`];

  for (const path of paths) {
    const { data } = await fetchErpJson<ErpListResponse<ErpCliente>>(empresa, path);
    for (const item of data?.items ?? []) {
      const cliente = toClientePdv(item);
      if (!cliente.codigo || !cliente.nome) continue;
      byId.set(cliente.codigo, cliente);
    }
    if (byId.size >= limit) break;
  }

  return [...byId.values()].slice(0, limit);
}

function montarPayloadCadastro(empresa: EmpresaKey, body: Record<string, unknown>) {
  const nome = getString(body.nome);
  const fantasia = getString(body.fantasia) || nome;
  const documento = soDigitos(body.cpfCnpj ?? body.numeroDoDocumento ?? body.documento);
  const telefone = soDigitos(body.telefone);
  const email = getString(body.email) || process.env.ERP_CLIENTE_EMAIL_PADRAO || "cliente.scan@local";

  if (!nome) throw new Error("Nome do cliente obrigatorio.");
  if (![11, 14].includes(documento.length)) {
    throw new Error("CPF/CNPJ obrigatorio para cadastrar cliente no ERP.");
  }

  const tipoDePessoa: ErpCliente["tipoDePessoa"] = documento.length > 11 ? "JURIDICA" : "FISICA";
  const lojaId = getIntEnv(empresa, "ERP_CLIENTE_LOJA_ID", empresa === "NEWSHOP" ? 2 : 1);

  return {
    id: 0,
    numeroDoDocumento: documento,
    email,
    tipoDeCliente: "TITULAR",
    tipoDePessoa,
    statusId: getIntEnv(empresa, "ERP_CLIENTE_STATUS_ID", 1),
    holdingId: getIntEnv(empresa, "ERP_CLIENTE_HOLDING_ID", 1),
    nome,
    fantasia,
    telefone1: telefone || undefined,
    lojaId,
    tipoContribuinte: "NAO_CONTRIBUINTE",
    dataDeCadastro: new Date().toISOString().slice(0, 10),
    origemDeAlteracao: "SCAN",
  };
}

function extractIdFromLocation(location: string): string {
  const match = location.match(/\/clientes\/(\d+)(?:$|[/?#])/i) || location.match(/(\d+)(?:$|[/?#])/);
  return match?.[1] ?? "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const empresa = normalizeEmpresa(req.query.empresa);
      const limitRaw = Number(getSingle(req.query.limit));
      const limit = Number.isFinite(limitRaw) ? Math.min(30, Math.max(1, Math.trunc(limitRaw))) : 20;
      const search = getSingle(req.query.search);
      const items = await buscarClientes(empresa, search, limit);
      return res.status(200).json({ items, empresa });
    }

    if (req.method === "POST") {
      const body = getBody(req);
      const empresa = normalizeEmpresa(getString(body.empresa));
      const payload = montarPayloadCadastro(empresa, body);
      const existentes = await buscarClientes(empresa, payload.numeroDoDocumento, 5);
      const existente = existentes.find((cliente) => cliente.cpfCnpj === payload.numeroDoDocumento);
      if (existente) return res.status(200).json({ cliente: existente, created: false, empresa });

      const created = await fetchErpJson<ErpCliente>(empresa, "/v1/pessoa/clientes", {
        method: "POST",
        body: payload,
      });

      const locationId = extractIdFromLocation(created.location);
      const data = created.data;
      if (data?.id) return res.status(201).json({ cliente: toClientePdv(data), created: true, empresa });

      if (locationId) {
        const fetched = await fetchErpJson<ErpCliente>(empresa, `/v1/pessoa/clientes/${locationId}`);
        if (fetched.data?.id) {
          return res.status(201).json({ cliente: toClientePdv(fetched.data), created: true, empresa });
        }
      }

      return res.status(201).json({
        cliente: toClientePdv({ ...payload, id: Number(locationId || 0) }),
        created: true,
        empresa,
      });
    }

    return res.status(405).json({ error: "Metodo nao permitido" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    if (message === RATE_LIMITED_MARKER) {
      return res.status(503).json({
        error: "ERP indisponivel no momento (limite de requisicoes). Tente novamente em instantes.",
      });
    }
    return res.status(500).json({ error: message });
  }
}

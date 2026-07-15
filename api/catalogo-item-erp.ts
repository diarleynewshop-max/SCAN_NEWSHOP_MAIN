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

type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE";

type ErpProduto = {
  id?: number;
  descricao?: string;
  codigoInterno?: string;
  imagem?: string;
  imagemUrl?: string;
  urlImagem?: string;
  foto?: string;
  fotoUrl?: string;
};

type CatalogoItem = ReturnType<typeof toItem> & {
  empresa?: EmpresaKey;
  match?: string;
};

type ErpCodigoAuxiliar = {
  id?: string;
  produtoId?: number;
  tipo?: string;
};

type ErpListResponse<T> = {
  items?: T[];
};

type CadastroProduto = {
  codigo?: number;
  descricao?: string;
  pesoVariavel?: string;
};

type CadastroSearchResponse = {
  totalDeRegistros?: number;
  produtosDTO?: CadastroProduto[];
};

type ErpAuth = {
  token: string;
  configured: boolean;
};

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
};

const tokenCache = new Map<string, string>();
const webSessionCache = new Map<string, string>();

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmpresa(body: Record<string, unknown>): EmpresaKey {
  const raw = `${getString(body.erpBaseOverride)} ${getString(body.loja)}`.toUpperCase();
  if (raw.includes("SOYE")) return "SOYE";
  if (raw.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function erpBaseEmpresa(empresa: EmpresaKey): EmpresaKey {
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

function resolveBaseUrl(empresa: EmpresaKey): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[baseEmpresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function resolveWebBaseUrl(empresa: EmpresaKey): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[baseEmpresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl.slice(0, -4) : configuredUrl;
}

function getConfiguredWebSessionCookie(empresa: EmpresaKey): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  return (
    process.env[`ERP_WEB_COOKIE_${empresa}`] ||
    process.env[`ERP_SESSION_COOKIE_${empresa}`] ||
    process.env[`VAREJOFACIL_SESSION_COOKIE_${empresa}`] ||
    process.env[`ERP_WEB_COOKIE_${baseEmpresa}`] ||
    process.env[`ERP_SESSION_COOKIE_${baseEmpresa}`] ||
    process.env[`VAREJOFACIL_SESSION_COOKIE_${baseEmpresa}`] ||
    process.env.ERP_WEB_COOKIE ||
    process.env.ERP_SESSION_COOKIE ||
    process.env.VAREJOFACIL_SESSION_COOKIE ||
    ""
  ).trim();
}

function getWebSessionCacheKey(empresa: EmpresaKey): string {
  return `${empresa}:${resolveWebBaseUrl(empresa)}:${getEnv(empresa, "USERNAME")}`;
}

async function getWebSessionCookie(empresa: EmpresaKey): Promise<string> {
  const configuredCookie = getConfiguredWebSessionCookie(empresa);
  if (configuredCookie) return configuredCookie;

  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  if (!username || !password) return "";

  const cacheKey = getWebSessionCacheKey(empresa);
  const cached = webSessionCache.get(cacheKey);
  if (cached) return cached;

  const webBaseUrl = resolveWebBaseUrl(empresa);
  const params = new URLSearchParams({ j_username: username, j_password: password });
  const response = await fetchErpWithRetry(`${webBaseUrl}/j_spring_security_check?${params.toString()}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${webBaseUrl}/login`,
    },
  });

  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/JSESSIONID=([^;]+)/);
  if (!match?.[1]) return "";

  const cookie = `JSESSIONID=${match[1]}`;
  webSessionCache.set(cacheKey, cookie);
  return cookie;
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
  if (!username || !password) throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);

  const response = await fetchErpWithRetry(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) throw new Error(`Nao foi possivel autenticar no ERP (${response.status}).`);

  const token = resolveTokenFromAuth((await response.json()) as Record<string, unknown>);
  if (!token) throw new Error("O ERP nao retornou um access token valido no login.");

  tokenCache.set(cacheKey, token);
  return { token, configured: false };
}

function buildErpHeaders(auth: ErpAuth): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: auth.token,
    Accept: "application/json",
  };
  if (auth.configured) headers["X-API-KEY"] = auth.token;
  return headers;
}

async function fetchErpJson<T>(baseUrl: string, auth: ErpAuth, path: string): Promise<T | null> {
  const response = await fetchErpWithRetry(`${baseUrl}${path}`, { headers: buildErpHeaders(auth) });
  if (response.status === 404) return null;
  if (response.status === 401) tokenCache.clear();
  if (!response.ok) throw new Error(`Falha ERP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchErpWebJson<T>(empresa: EmpresaKey, path: string): Promise<T | null> {
  const cookie = await getWebSessionCookie(empresa);
  if (!cookie) return null;

  const response = await fetchErpWithRetry(`${resolveWebBaseUrl(empresa)}${path}`, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${resolveWebBaseUrl(empresa)}/produto/cadastro`,
      Cookie: cookie,
    },
  });

  if (response.status === 302) {
    webSessionCache.delete(getWebSessionCacheKey(empresa));
    return null;
  }
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Falha ERP cadastro ${response.status}`);
  return (await response.json()) as T;
}

function normalizarEans(codigo: string): string[] {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d+$/.test(limpo) && limpo.length < 14) candidatos.push(limpo.padStart(14, "0"));
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0+\d+$/.test(limpo)) candidatos.push(limpo.replace(/^0+/, ""));
  return [...new Set(candidatos.filter(Boolean))];
}

function imagemProduto(produto: ErpProduto): string | undefined {
  return produto.imagem || produto.imagemUrl || produto.urlImagem || produto.foto || produto.fotoUrl || undefined;
}

function toItem(produto: ErpProduto, ean?: string) {
  return {
    produtoId: produto.id,
    ean: ean || produto.codigoInterno || String(produto.id ?? ""),
    sku: produto.codigoInterno || "",
    descricao: produto.descricao || produto.codigoInterno || "",
    fornecedor: "",
    varejo: 0,
    atacado: 0,
    foto: produto.id ? imagemProduto(produto) : undefined,
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

function searchCandidates(term: string): string[] {
  const clean = sanitizeSearchTerm(term);
  const noDash = clean.replace(/-/g, " ");
  const onlyDigits = clean.replace(/\D+/g, "");
  const compact = clean.replace(/\s+/g, "");
  const candidates = [clean, noDash, compact];

  if (onlyDigits && onlyDigits !== clean) candidates.push(onlyDigits);

  if (/^[A-Za-z]+[-\s]?\d+/.test(clean)) {
    const match = clean.match(/^([A-Za-z]+)[-\s]?(\d+)/);
    if (match) {
      const [, prefix, digits] = match;
      candidates.push(`${prefix}-${digits}`);
      candidates.push(`${prefix} ${digits}`);
      for (let len = digits.length; len >= Math.max(2, digits.length - 3); len -= 1) {
        candidates.push(`${prefix}-${digits.slice(0, len)}`);
        candidates.push(`${prefix}${digits.slice(0, len)}`);
      }
    }
  }

  return [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
}

async function buscarPorEan(baseUrl: string, auth: ErpAuth, ean: string): Promise<ReturnType<typeof toItem> | null> {
  for (const candidato of normalizarEans(ean)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const aux = await fetchErpJson<ErpListResponse<ErpCodigoAuxiliar>>(
      baseUrl,
      auth,
      `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`
    ).catch(() => null);
    const encontrado = (aux?.items ?? []).find((item) => item.produtoId && item.tipo === "EAN") || (aux?.items ?? [])[0];
    if (encontrado?.produtoId) {
      const produto = await fetchErpJson<ErpProduto>(baseUrl, auth, `/v1/produto/produtos/${encontrado.produtoId}`);
      if (produto?.id) return toItem(produto, encontrado.id || candidato);
    }
  }
  return null;
}

async function buscarPorTermo(baseUrl: string, auth: ErpAuth, termo: string, limit: number, empresa: EmpresaKey) {
  const byId = new Map<number, ErpProduto>();
  const labels = new Map<number, string>();

  for (const candidate of searchCandidates(termo)) {
    const escaped = escaparFiql(candidate);
    const queries = [
      { label: `descricao:${candidate}`, fiql: `descricao==*${escaped}*` },
      { label: `codigoInterno:${candidate}`, fiql: `codigoInterno==*${escaped}*` },
    ];

    for (const query of queries) {
      const fiql = encodeURIComponent(query.fiql);
      const data = await fetchErpJson<ErpListResponse<ErpProduto>>(
        baseUrl,
        auth,
        `/v1/produto/produtos?q=${fiql}&count=${limit}`
      ).catch(() => null);

      for (const item of data?.items ?? []) {
        if (!item.id || byId.has(item.id)) continue;
        byId.set(item.id, item);
        labels.set(item.id, query.label);
      }

      if (byId.size >= limit) break;
    }

    if (byId.size >= limit) break;
  }

  return [...byId.values()].slice(0, limit).map((produto) => ({
    ...toItem(produto),
    empresa,
    match: produto.id ? labels.get(produto.id) : undefined,
  }));
}

function buildCadastroSearchPath(candidate: string, limit: number): string {
  const params = new URLSearchParams({
    "produtoFilter.pesquisaDeCadastro": "true",
    "produtoFilter.codigo": "",
    "produtoFilter.descricao": candidate,
    "produtoFilter.codigoDaSecao": "",
    "produtoFilter.codigoDoGrupo": "",
    "produtoFilter.codigoDoSubgrupo": "",
    "produtoFilter.situacaoFiscal": "",
    "produtoFilter.situacaoFiscalEspecificaSaida": "",
    "produtoFilter.codigoDoFornecedor": "",
    "produtoFilter.identificadorDeOrigem": "",
    "produtoFilter.cadastroInicial": "",
    "produtoFilter.cadastroFinal": "",
    "produtoFilter.maxResult": String(limit),
    "produtoFilter.startResult": "0",
    "produtoFilter.order.field": "codigo",
    "produtoFilter.order.direcao": "ASC",
    _: String(Date.now()),
  });

  return `/produto/cadastro/pesquisa/paginada?${params.toString()}`;
}

async function buscarPorCadastroWeb(empresa: EmpresaKey, termo: string, limit: number): Promise<CatalogoItem[]> {
  const byId = new Map<number, CadastroProduto>();
  const labels = new Map<number, string>();

  for (const candidate of searchCandidates(termo)) {
    const data = await fetchErpWebJson<CadastroSearchResponse>(
      empresa,
      buildCadastroSearchPath(candidate, limit)
    ).catch(() => null);

    for (const item of data?.produtosDTO ?? []) {
      if (!item.codigo || byId.has(item.codigo)) continue;
      byId.set(item.codigo, item);
      labels.set(item.codigo, `cadastro:${candidate}`);
    }

    if (byId.size >= limit) break;
  }

  return [...byId.values()].slice(0, limit).map((produto) => ({
    ...toItem({ id: produto.codigo, descricao: produto.descricao }),
    empresa,
    match: produto.codigo ? labels.get(produto.codigo) : undefined,
  }));
}

async function buscarPorTermoNaEmpresa(empresa: EmpresaKey, termo: string, limit: number): Promise<CatalogoItem[]> {
  let eanItem: ReturnType<typeof toItem> | null = null;
  let items: CatalogoItem[] = [];

  try {
    const baseUrl = resolveBaseUrl(empresa);
    const auth = await getAccessToken(empresa, baseUrl);
    eanItem = /^\d{6,14}$/.test(termo) ? await buscarPorEan(baseUrl, auth, termo) : null;
    items = await buscarPorTermo(baseUrl, auth, termo, limit, empresa);
  } catch {
    // A busca por SKU ainda pode funcionar pela rota de cadastro web quando houver sessao configurada.
  }

  if (items.length === 0) {
    items = await buscarPorCadastroWeb(empresa, termo, limit);
  }

  const todos = eanItem
    ? [{ ...eanItem, empresa, match: "ean" }, ...items.filter((item) => item.produtoId !== eanItem.produtoId)]
    : items;
  return todos.slice(0, limit);
}

async function buscarPorTermoTodasEmpresas(empresaInicial: EmpresaKey, termo: string, limit: number): Promise<CatalogoItem[]> {
  const empresas = [empresaInicial, ...(["NEWSHOP", "FACIL", "SOYE"] as EmpresaKey[]).filter((item) => item !== empresaInicial)];
  const byKey = new Map<string, CatalogoItem>();

  for (const empresa of empresas) {
    try {
      const encontrados = await buscarPorTermoNaEmpresa(empresa, termo, limit);
      for (const item of encontrados) {
        const key = `${item.empresa}:${item.produtoId}`;
        if (!byKey.has(key)) byKey.set(key, item);
      }
      if (byKey.size >= limit) break;
    } catch {
      // Continua tentando as outras bases.
    }
  }

  return [...byKey.values()].slice(0, limit);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const empresa = normalizeEmpresa(body);
  const limitRaw = Number(body.limit ?? 8);
  const limit = Number.isFinite(limitRaw) ? Math.min(20, Math.max(1, Math.trunc(limitRaw))) : 8;

  try {
    const ean = getString(body.ean);
    const search = getString(body.search);
    const produtoId = Number(body.produtoId);

    if (search) {
      const items = await buscarPorTermoTodasEmpresas(empresa, search, limit);
      return res.status(200).json({ items });
    }

    const baseUrl = resolveBaseUrl(empresa);
    const auth = await getAccessToken(empresa, baseUrl);

    if (Number.isFinite(produtoId) && produtoId > 0) {
      const produto = await fetchErpJson<ErpProduto>(baseUrl, auth, `/v1/produto/produtos/${produtoId}`);
      return res.status(200).json({ item: produto?.id ? toItem(produto) : null });
    }

    if (ean) {
      return res.status(200).json({ item: await buscarPorEan(baseUrl, auth, ean) });
    }

    return res.status(400).json({ error: "Informe ean, search ou produtoId." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    if (message === RATE_LIMITED_MARKER) {
      return res.status(503).json({
        error: "ERP indisponivel no momento (limite de requisicoes). Tente novamente em instantes.",
      });
    }
    return res.status(500).json({ error: message, empresa });
  }
}

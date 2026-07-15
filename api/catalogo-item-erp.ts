import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchErpWithRetry, RATE_LIMITED_MARKER } from "./_erp-fetch";

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

type ErpCodigoAuxiliar = {
  id?: string;
  produtoId?: number;
  tipo?: string;
};

type ErpListResponse<T> = {
  items?: T[];
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
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}_${baseEmpresa}`] ||
    process.env[`VITE_ERP_API_${key}_${baseEmpresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    ""
  );
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

async function buscarPorTermo(baseUrl: string, auth: ErpAuth, termo: string, limit: number) {
  const queries = [
    `descricao==*${termo}*`,
    `codigoInterno==*${termo}*`,
  ];
  const byId = new Map<number, ErpProduto>();

  for (const query of queries) {
    const fiql = encodeURIComponent(query);
    const data = await fetchErpJson<ErpListResponse<ErpProduto>>(
      baseUrl,
      auth,
      `/v1/produto/produtos?q=${fiql}&count=${limit}`
    ).catch(() => null);

    for (const item of data?.items ?? []) {
      if (item.id && !byId.has(item.id)) byId.set(item.id, item);
    }
  }

  return [...byId.values()].slice(0, limit).map((produto) => toItem(produto));
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
    const baseUrl = resolveBaseUrl(empresa);
    const auth = await getAccessToken(empresa, baseUrl);
    const ean = getString(body.ean);
    const search = getString(body.search);
    const produtoId = Number(body.produtoId);

    if (Number.isFinite(produtoId) && produtoId > 0) {
      const produto = await fetchErpJson<ErpProduto>(baseUrl, auth, `/v1/produto/produtos/${produtoId}`);
      return res.status(200).json({ item: produto?.id ? toItem(produto) : null });
    }

    if (ean) {
      return res.status(200).json({ item: await buscarPorEan(baseUrl, auth, ean) });
    }

    if (search) {
      const eanItem = /^\d{6,14}$/.test(search) ? await buscarPorEan(baseUrl, auth, search) : null;
      const items = await buscarPorTermo(baseUrl, auth, search, limit);
      const todos = eanItem ? [eanItem, ...items.filter((item) => item.produtoId !== eanItem.produtoId)] : items;
      return res.status(200).json({ items: todos.slice(0, limit) });
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

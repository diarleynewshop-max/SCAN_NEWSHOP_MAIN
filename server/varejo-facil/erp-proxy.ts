import type { VercelRequest, VercelResponse } from "@vercel/node";

type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE";
type ErpProduto = Record<string, unknown> & { id?: number | string; imagem?: string };

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

const tokenCache = new Map<string, string>();

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeEmpresa(value: string | string[] | undefined): EmpresaKey {
  const normalized = getSingle(value).trim().toUpperCase();
  if (normalized.includes("SOYE")) return "SOYE";
  if (normalized.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function getEnv(empresa: EmpresaKey, key: "URL" | "USERNAME" | "PASSWORD" | "TOKEN"): string {
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    ""
  );
}

function resolveBaseUrl(empresa: EmpresaKey): string {
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[empresa]}`).replace(/\/$/, "");
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

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body as Record<string, unknown>;
  return {};
}

async function fetchErpJson<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<{ response: Response; data: T | null; text: string }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") && text ? (JSON.parse(text) as T) : null;
  return { response, data, text };
}

function normalizarEans(codigo: string): string[] {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));
  return [...new Set(candidatos.filter(Boolean))];
}

async function buscarProdutoPorCodigo(baseUrl: string, token: string, codigo: string): Promise<ErpProduto | null> {
  for (const candidato of normalizarEans(codigo)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const codAux = await fetchErpJson<{ items?: Array<{ produtoId?: number }> }>(
      baseUrl,
      token,
      `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`
    );

    const produtoId = codAux.data?.items?.find((item) => item?.produtoId)?.produtoId;
    if (produtoId) {
      const produto = await fetchErpJson<ErpProduto>(baseUrl, token, `/v1/produto/produtos/${produtoId}`);
      if (produto.response.ok && produto.data?.id) return produto.data;
    }
  }

  const produto = await fetchErpJson<ErpProduto>(
    baseUrl,
    token,
    `/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`
  );
  if (produto.response.ok && produto.data?.id) return produto.data;
  return null;
}

async function atualizarFotoProduto(baseUrl: string, token: string, codigo: string, photo: string) {
  const produto = await buscarProdutoPorCodigo(baseUrl, token, codigo);
  if (!produto?.id) {
    return { ok: false, status: 404, error: "Produto nao encontrado no ERP" };
  }

  const payload = { ...produto, imagem: photo };
  const produtoId = encodeURIComponent(String(produto.id));
  const update = await fetchErpJson<ErpProduto>(baseUrl, token, `/v1/produto/produtos/${produtoId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (update.response.status === 401) tokenCache.clear();

  if (!update.response.ok) {
    return {
      ok: false,
      status: update.response.status,
      produtoId: produto.id,
      error: update.text || "Falha ao atualizar imagem no ERP",
    };
  }

  return { ok: true, status: update.response.status, produtoId: produto.id };
}

async function getAccessToken(empresa: EmpresaKey, baseUrl: string): Promise<string> {
  const configuredToken = getEnv(empresa, "TOKEN");
  if (configuredToken) return configuredToken;

  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken) return cachedToken;
  if (!username || !password) {
    throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
  }

  const response = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Nao foi possivel autenticar no ERP (${response.status}).`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const token = resolveTokenFromAuth(data);

  if (!token) {
    throw new Error("O ERP nao retornou um access token valido no login.");
  }

  tokenCache.set(cacheKey, token);
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const empresa = normalizeEmpresa(req.query.empresa);
  const action = getSingle(req.query.action);
  const path = getSingle(req.query.path);

  if (req.method === "GET" && (!path || !path.startsWith("/"))) {
    return res.status(400).json({ error: "path obrigatorio" });
  }

  try {
    const baseUrl = resolveBaseUrl(empresa);
    const token = await getAccessToken(empresa, baseUrl);

    if (req.method === "POST" && action === "upload-product-photo") {
      const body = parseBody(req.body);
      const codigo = String(body.codigo ?? "").trim();
      const photo = String(body.photo ?? "").trim();

      if (!codigo || !photo.startsWith("data:image/")) {
        return res.status(400).json({ error: "codigo e photo data:image sao obrigatorios" });
      }

      const result = await atualizarFotoProduto(baseUrl, token, codigo, photo);
      return res.status(result.ok ? 200 : result.status || 500).json({ ...result, empresa, codigo });
    }

    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      tokenCache.clear();
    }

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") && text ? JSON.parse(text) : text;

    return res.status(response.status).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ error: message, empresa });
  }
}

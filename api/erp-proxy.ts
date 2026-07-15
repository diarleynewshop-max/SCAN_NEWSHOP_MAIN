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

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
};

const tokenCache = new Map<string, string>();
const webSessionCache = new Map<string, string>();

interface ErpAuth {
  token: string;
  configured: boolean;
}

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeEmpresa(value: string | string[] | undefined): EmpresaKey {
  const normalized = getSingle(value).trim().toUpperCase();
  if (normalized.includes("SOYE")) return "SOYE";
  if (normalized.includes("FACIL")) return "FACIL";
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

function resolveWebBaseUrl(empresa: EmpresaKey): string {
  const baseEmpresa = erpBaseEmpresa(empresa);
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[baseEmpresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl.slice(0, -4) : configuredUrl;
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
  return { token, configured: false };
}

function buildErpHeaders(auth: ErpAuth): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: auth.token,
    Accept: "application/json",
  };

  if (auth.configured) {
    headers["X-API-KEY"] = auth.token;
  }

  return headers;
}

async function buildWebSessionHeaders(empresa: EmpresaKey): Promise<Record<string, string> | null> {
  const cookie = await getWebSessionCookie(empresa);
  if (!cookie) return null;

  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    Referer: `https://${HOSTS[erpBaseEmpresa(empresa)]}/produto/cadastro`,
    Cookie: cookie,
  };
}

async function fetchErpPath(empresa: EmpresaKey, baseUrl: string, path: string): Promise<Response> {
  try {
    const auth = await getAccessToken(empresa, baseUrl);
    const response = await fetchErpWithRetry(`${baseUrl}${path}`, {
      headers: buildErpHeaders(auth),
    });

    if (response.status !== 401) return response;
    tokenCache.clear();
  } catch (error) {
    if (!(await buildWebSessionHeaders(empresa))) throw error;
  }

  const webHeaders = await buildWebSessionHeaders(empresa);
  if (!webHeaders) throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
  const response = await fetchErpWithRetry(`${baseUrl}${path}`, { headers: webHeaders, redirect: "manual" });

  if (response.status !== 302) return response;

  webSessionCache.delete(getWebSessionCacheKey(empresa));
  const refreshedHeaders = await buildWebSessionHeaders(empresa);
  if (!refreshedHeaders) return response;
  return fetchErpWithRetry(`${baseUrl}${path}`, { headers: refreshedHeaders, redirect: "manual" });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const empresa = normalizeEmpresa(req.query.empresa);
  const path = getSingle(req.query.path);

  if (!path || !path.startsWith("/")) {
    return res.status(400).json({ error: "path obrigatorio" });
  }

  try {
    const baseUrl = resolveBaseUrl(empresa);
    const response = await fetchErpPath(empresa, baseUrl, path);

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") && text ? JSON.parse(text) : text;

    return res.status(response.status).json(data);
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

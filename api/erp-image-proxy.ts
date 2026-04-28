import type { VercelRequest, VercelResponse } from "@vercel/node";

type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE";

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
  return configuredUrl.endsWith("/api") ? configuredUrl.slice(0, -4) : configuredUrl;
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

  const response = await fetch(`${baseUrl}/api/auth`, {
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

function resolveImageUrl(baseUrl: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${baseUrl}${src.startsWith("/") ? src : `/${src}`}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Metodo nao permitido");
  }

  const empresa = normalizeEmpresa(req.query.empresa);
  const src = getSingle(req.query.src);

  if (!src) {
    return res.status(400).send("src obrigatorio");
  }

  try {
    const baseUrl = resolveBaseUrl(empresa);
    const token = await getAccessToken(empresa, baseUrl);
    const response = await fetch(resolveImageUrl(baseUrl, src), {
      headers: {
        Authorization: token,
        Accept: "image/*,*/*",
      },
    });

    if (response.status === 401) {
      tokenCache.clear();
    }

    if (!response.ok) {
      return res.status(response.status).send(`Falha ao carregar imagem (${response.status})`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).send(message);
  }
}

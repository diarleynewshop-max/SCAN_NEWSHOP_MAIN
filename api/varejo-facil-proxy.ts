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

function envFor(empresa: EmpresaKey, suffix: string): string {
  return (
    process.env[`VAREJO_FACIL_${suffix}_${empresa}`] ||
    process.env[`VAREJO_FACIL_${suffix}`] ||
    ""
  );
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

async function getAuthHeader(empresa: EmpresaKey, baseUrl: string): Promise<string> {
  const configuredToken = envFor(empresa, "TOKEN");
  if (configuredToken) return configuredToken;

  const username = envFor(empresa, "USERNAME");
  const password = envFor(empresa, "PASSWORD");
  const cacheKey = `${empresa}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken) return cachedToken;
  if (!username || !password) return "";

  const response = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao autenticar no Varejo Facil (${response.status}).`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const token = resolveTokenFromAuth(data);

  if (!token) {
    throw new Error("Varejo Facil nao retornou token valido.");
  }

  tokenCache.set(cacheKey, token);
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const codigo = getSingle(req.query.codigo).trim();
  const empresa = normalizeEmpresa(req.query.empresa);

  if (!codigo) {
    return res.status(400).json({ error: "codigo obrigatorio" });
  }

  try {
    const baseUrl = `https://${HOSTS[empresa]}`;
    const authHeader = await getAuthHeader(empresa, baseUrl);
    const headers: Record<string, string> = { Accept: "application/json" };

    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(`${baseUrl}/api/v1/produtos/${encodeURIComponent(codigo)}`, {
      method: "GET",
      headers,
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") && text ? JSON.parse(text) : text;

    if (!response.ok) {
      if (response.status === 401) {
        tokenCache.clear();
      }

      return res.status(response.status).json({
        error: "Falha ao consultar Varejo Facil",
        empresa,
        status: response.status,
        detail: data,
      });
    }

    return res.status(200).json({ success: true, empresa, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ error: message, empresa });
  }
}

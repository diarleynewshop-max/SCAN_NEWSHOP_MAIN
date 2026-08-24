import type { VercelRequest, VercelResponse } from "@vercel/node";

const RATE_LIMITED_MARKER = "ERP_RATE_LIMITED";
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchErpWithRetry(input: string | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);
    if (response.status !== 429) return response;

    await response.text().catch(() => "");
    if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new Error(RATE_LIMITED_MARKER);

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE" | "SEFULY";

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
  SEFULY: "sefuly.varejofacil.com",
};

const webSessionCache = new Map<string, string>();

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizarEmpresa(value: string | string[] | undefined): EmpresaKey {
  const empresa = getSingle(value).trim().toUpperCase();
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  if (empresa.includes("SEFULY")) return "SEFULY";
  return "NEWSHOP";
}

function empresaBase(empresa: EmpresaKey): EmpresaKey {
  if (empresa === "SEFULY") return "NEWSHOP";
  return empresa === "SOYE" ? "FACIL" : empresa;
}

function getEnv(empresa: EmpresaKey, key: "URL" | "USERNAME" | "PASSWORD"): string {
  const base = empresaBase(empresa);
  const generic = empresa !== "SEFULY";
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}_${base}`] ||
    process.env[`ERP_${key}_${base}`] ||
    (generic ? process.env[`ERP_API_${key}`] : "") ||
    (generic ? process.env[`ERP_${key}`] : "") ||
    ""
  ).trim();
}

function getWebBaseUrl(empresa: EmpresaKey): string {
  const configured = getEnv(empresa, "URL") || `https://${HOSTS[empresaBase(empresa)]}`;
  return configured.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

async function getWebSession(empresa: EmpresaKey): Promise<string> {
  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  if (!username || !password) throw new Error("Credenciais web do ERP nao configuradas.");

  const baseUrl = getWebBaseUrl(empresa);
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cached = webSessionCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ j_username: username, j_password: password });
  const response = await fetchErpWithRetry(`${baseUrl}/j_spring_security_check?${params.toString()}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${baseUrl}/login`,
    },
  });
  const sessionId = (response.headers.get("set-cookie") || "").match(/JSESSIONID=([^;]+)/)?.[1];
  if (!sessionId) throw new Error("Nao foi possivel abrir a sessao web do ERP.");

  const cookie = `JSESSIONID=${sessionId}`;
  webSessionCache.set(cacheKey, cookie);
  return cookie;
}

function extrairEnderecoPicking(html: string): string | null {
  const match = html.match(/\b[A-Z]{1,4}-\d{1,4}-[A-Z]{1,4}-\d{1,4}\b/i);
  return match?.[0]?.toUpperCase() || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Metodo nao permitido" });

  const produtoId = Number(getSingle(req.query.produtoId));
  if (!Number.isInteger(produtoId) || produtoId <= 0) return res.status(400).json({ error: "produtoId invalido" });

  const empresa = normalizarEmpresa(req.query.empresa);
  const baseUrl = getWebBaseUrl(empresa);
  const caminhos = [
    `/produto/cadastro/edita/${produtoId}`,
    `/produto/cadastro/${produtoId}`,
    `/produto/cadastro/editar/${produtoId}`,
    `/produto/cadastro?codigo=${produtoId}`,
  ];

  try {
    const cookie = await getWebSession(empresa);
    for (const caminho of caminhos) {
      const response = await fetchErpWithRetry(`${baseUrl}${caminho}`, {
        redirect: "manual",
        headers: {
          Accept: "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${baseUrl}/produto/cadastro`,
          Cookie: cookie,
        },
      });
      if (!response.ok) continue;

      const endereco = extrairEnderecoPicking(await response.text());
      if (endereco) return res.status(200).json({ produtoId, endereco });
    }

    return res.status(404).json({ error: "Endereco de picking nao encontrado para este produto.", produtoId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar endereco de picking.";
    if (message === RATE_LIMITED_MARKER) return res.status(503).json({ error: "ERP temporariamente limitado. Tente novamente." });
    return res.status(500).json({ error: message });
  }
}

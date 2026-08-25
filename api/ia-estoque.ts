import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Fachada deliberadamente pequena para agentes externos. Ela nunca aceita uma
 * URL/path do cliente: somente as consultas de estoque conhecidas e, se o
 * adaptador de ajuste for configurado e habilitado, um ajuste explicitamente
 * confirmado.
 */
type Empresa = "NEWSHOP" | "FACIL" | "SOYE" | "SEFULY";
type AcaoLeitura = "docs" | "status" | "resolver" | "produto" | "estoque";
type AcaoEscrita = "ajustar";

const EMPRESAS: readonly Empresa[] = ["NEWSHOP", "FACIL", "SOYE", "SEFULY"];
const HOSTS: Record<Empresa, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
  SEFULY: "sefuly.varejofacil.com",
};
const MAX_ERP_RETRIES = 2;

type ErpAuth = { token: string; configured: boolean };
const tokenCache = new Map<string, string>();
const webSessionCache = new Map<string, string>();

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function asEmpresa(value: unknown): Empresa {
  const normalizada = String(value || "NEWSHOP").trim().toUpperCase();
  return EMPRESAS.includes(normalizada as Empresa) ? (normalizada as Empresa) : "NEWSHOP";
}

function empresaBase(empresa: Empresa): Empresa {
  return empresa === "SOYE" ? "FACIL" : empresa === "SEFULY" ? "NEWSHOP" : empresa;
}

function envErp(empresa: Empresa, chave: "URL" | "USERNAME" | "PASSWORD" | "TOKEN" | "KEY"): string {
  const base = empresaBase(empresa);
  const allowGeneric = empresa !== "SEFULY";
  const nomes = [
    `ERP_API_${chave}_${empresa}`, `ERP_${chave}_${empresa}`,
    `ERP_API_${chave}_${base}`, `ERP_${chave}_${base}`,
    ...(allowGeneric ? [`ERP_API_${chave}`, `ERP_${chave}`] : []),
  ];
  return nomes.map((nome) => process.env[nome] || "").find(Boolean) || "";
}

function sessaoConfigurada(empresa: Empresa): string {
  const base = empresaBase(empresa);
  const allowGeneric = empresa !== "SEFULY";
  const nomes = [
    `ERP_WEB_COOKIE_${empresa}`, `ERP_SESSION_COOKIE_${empresa}`, `VAREJOFACIL_SESSION_COOKIE_${empresa}`,
    `ERP_WEB_COOKIE_${base}`, `ERP_SESSION_COOKIE_${base}`, `VAREJOFACIL_SESSION_COOKIE_${base}`,
    ...(allowGeneric ? ["ERP_WEB_COOKIE", "ERP_SESSION_COOKIE", "VAREJOFACIL_SESSION_COOKIE"] : []),
  ];
  return nomes.map((nome) => process.env[nome] || "").find(Boolean)?.trim() || "";
}

function baseUrl(empresa: Empresa): string {
  const base = empresaBase(empresa);
  const origin = (envErp(empresa, "URL") || `https://${HOSTS[base]}`).replace(/\/$/, "");
  return origin.endsWith("/api") ? origin : `${origin}/api`;
}

function webOrigin(empresa: Empresa): string {
  const url = baseUrl(empresa);
  return url.endsWith("/api") ? url.slice(0, -4) : url;
}

function allowedEmpresas(): Empresa[] {
  const configuradas = (process.env.IA_ESTOQUE_EMPRESAS || "NEWSHOP")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is Empresa => EMPRESAS.includes(item as Empresa));
  return configuradas.length > 0 ? configuradas : ["NEWSHOP"];
}

function suppliedKey(req: VercelRequest): string {
  const xApiKey = first(req.headers["x-api-key"] as string | string[] | undefined).trim();
  if (xApiKey) return xApiKey;
  const bearer = first(req.headers.authorization).trim().match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || "";
}

function keyMatches(recebida: string, esperada: string): boolean {
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function validApiKey(req: VercelRequest, tipo: "leitura" | "escrita"): boolean {
  const configurada = tipo === "escrita"
    ? process.env.IA_ESTOQUE_WRITE_API_KEY || ""
    : process.env.IA_ESTOQUE_API_KEY || "";
  return Boolean(configurada) && keyMatches(suppliedKey(req), configurada);
}

async function erpFetch(url: string, init: RequestInit): Promise<Response> {
  for (let tentativa = 0; ; tentativa += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const resposta = await fetch(url, { ...init, signal: controller.signal });
      if (resposta.status !== 429 || tentativa >= MAX_ERP_RETRIES) return resposta;
      await resposta.text().catch(() => "");
      const retryAfter = Number(resposta.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 * (tentativa + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

async function erpAuth(empresa: Empresa): Promise<ErpAuth> {
  const configurado = envErp(empresa, "TOKEN") || envErp(empresa, "KEY");
  if (configurado) return { token: configurado, configured: true };

  const usuario = envErp(empresa, "USERNAME");
  const senha = envErp(empresa, "PASSWORD");
  const chaveCache = `${empresa}:${baseUrl(empresa)}:${usuario}`;
  const cached = tokenCache.get(chaveCache);
  if (cached) return { token: cached, configured: false };
  if (!usuario || !senha) throw new Error(`Credenciais ERP ausentes para ${empresa}.`);

  const resposta = await erpFetch(`${baseUrl(empresa)}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  if (!resposta.ok) throw new Error(`Autenticacao ERP recusada (${resposta.status}).`);
  const data = (await resposta.json()) as Record<string, unknown>;
  const token = [data.accessToken, data.access_token, data.token, data.jwt].find((value): value is string => typeof value === "string" && value.length > 0);
  if (!token) throw new Error("O ERP nao retornou token de acesso.");
  tokenCache.set(chaveCache, token);
  return { token, configured: false };
}

async function webHeaders(empresa: Empresa): Promise<Record<string, string> | null> {
  let cookie = sessaoConfigurada(empresa);
  const cacheKey = `${empresa}:${webOrigin(empresa)}:${envErp(empresa, "USERNAME")}`;
  if (!cookie) cookie = webSessionCache.get(cacheKey) || "";
  if (!cookie) {
    const usuario = envErp(empresa, "USERNAME");
    const senha = envErp(empresa, "PASSWORD");
    if (!usuario || !senha) return null;
    const resposta = await erpFetch(`${webOrigin(empresa)}/j_spring_security_check?${new URLSearchParams({ j_username: usuario, j_password: senha })}`, {
      method: "POST",
      redirect: "manual",
      headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/x-www-form-urlencoded", Referer: `${webOrigin(empresa)}/login` },
    });
    const sessionId = (resposta.headers.get("set-cookie") || "").match(/JSESSIONID=([^;]+)/)?.[1];
    if (!sessionId) return null;
    cookie = `JSESSIONID=${sessionId}`;
    webSessionCache.set(cacheKey, cookie);
  }
  return { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", Referer: `${webOrigin(empresa)}/produto/cadastro`, Cookie: cookie };
}

function apiHeaders(auth: ErpAuth, contentType = false): Record<string, string> {
  const headers: Record<string, string> = { Authorization: auth.token, Accept: "application/json" };
  if (auth.configured) headers["X-API-KEY"] = auth.token;
  if (contentType) headers["Content-Type"] = "application/json";
  return headers;
}

async function callErp(empresa: Empresa, path: string, init: RequestInit = {}): Promise<Response> {
  try {
    const auth = await erpAuth(empresa);
    const resposta = await erpFetch(`${baseUrl(empresa)}${path}`, { ...init, headers: { ...apiHeaders(auth, Boolean(init.body)), ...init.headers } });
    if (resposta.status !== 401) return resposta;
    tokenCache.clear();
  } catch {
    // O fallback por sessao e usado somente quando a API nao autenticou.
  }
  const headers = await webHeaders(empresa);
  if (!headers) throw new Error(`Credenciais ERP ausentes para ${empresa}.`);
  return erpFetch(`${baseUrl(empresa)}${path}`, { ...init, headers: { ...headers, ...init.headers } });
}

async function erpJson(empresa: Empresa, path: string, init?: RequestInit): Promise<{ status: number; data: unknown }> {
  const resposta = await callErp(empresa, path, init);
  const texto = await resposta.text();
  let data: unknown = texto;
  if (texto && (resposta.headers.get("content-type") || "").includes("application/json")) {
    try { data = JSON.parse(texto); } catch { data = { erro: "Resposta JSON invalida do ERP." }; }
  }
  if (!resposta.ok) throw Object.assign(new Error(`ERP respondeu ${resposta.status}.`), { status: resposta.status, data });
  return { status: resposta.status, data };
}

function produtoId(value: unknown): string | null {
  const id = String(value || "").trim();
  return /^\d{1,14}$/.test(id) ? id : null;
}

function codigoEan(value: unknown): string | null {
  const codigo = String(value || "").replace(/\D/g, "");
  return /^\d{6,18}$/.test(codigo) ? codigo : null;
}

function candidatosEan(ean: string): string[] {
  const candidatos = [ean];
  if (ean.length < 14) candidatos.push(ean.padStart(14, "0"));
  if (ean.length === 14 && ean.startsWith("0")) candidatos.push(ean.slice(1));
  return [...new Set(candidatos)];
}

function error(res: VercelResponse, status: number, codigo: string, mensagem: string) {
  return res.status(status).json({ error: { codigo, mensagem } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization, X-API-Key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return error(res, 405, "METHOD_NOT_ALLOWED", "Use GET para consulta ou POST para ajuste.");

  const acao = String(req.query.acao || (req.method === "POST" ? "ajustar" : "status")).trim().toLowerCase();
  if (req.method === "GET" && acao === "docs") {
    return res.status(200).json({
      titulo: "API IA Estoque - SCAN",
      versao: "1.0",
      objetivo: "Consulta segura de produto e saldo do Varejo Facil sem expor credenciais do ERP.",
      baseUrl: "https://scan-newshop-main.vercel.app/api/ia-estoque",
      autenticacao: {
        obrigatoria: true,
        headerPreferido: "X-API-Key: SUA_CHAVE_DE_LEITURA",
        alternativa: "Authorization: Bearer SUA_CHAVE_DE_LEITURA",
        aviso: "Abrir a URL no navegador sem header retorna 401. Use a API pela outra IA, Postman, curl ou backend.",
      },
      endpoints: [
        { acao: "status", metodo: "GET", url: "?acao=status", faz: "Mostra empresas liberadas e se escrita esta habilitada." },
        { acao: "resolver", metodo: "GET", url: "?acao=resolver&empresa=NEWSHOP&codigo=7893095626124", faz: "Resolve EAN, retorna produto e saldos por lojaId." },
        { acao: "produto", metodo: "GET", url: "?acao=produto&empresa=NEWSHOP&produtoId=143", faz: "Retorna o cadastro bruto do produto." },
        { acao: "estoque", metodo: "GET", url: "?acao=estoque&empresa=NEWSHOP&produtoId=143", faz: "Retorna saldos por local." },
      ],
      locais: { "1": "Loja", "2": "Deposito", "3": "CD" },
      fluxoRecomendado: ["Chame status.", "Resolva o EAN do produto.", "Leia o saldo por lojaId.", "Compare com a contagem fisica e devolva divergencias."],
      escrita: { ativa: false, aviso: "O ajuste de estoque continua bloqueado ate homologar a rota oficial de inventario do ERP." },
    });
  }
  const escrita = req.method === "POST" || acao === "ajustar";
  if (!validApiKey(req, escrita ? "escrita" : "leitura")) {
    return error(res, 401, "UNAUTHORIZED", "Chave de API ausente, invalida ou sem o escopo exigido.");
  }

  const origem = req.method === "POST" && req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const empresa = asEmpresa(origem.empresa || req.query.empresa);
  if (!allowedEmpresas().includes(empresa)) return error(res, 403, "EMPRESA_NOT_ALLOWED", `A chave nao tem acesso a ${empresa}.`);

  try {
    if (!escrita) {
      if (!(["status", "resolver", "produto", "estoque"] as AcaoLeitura[]).includes(acao as AcaoLeitura)) {
        return error(res, 400, "INVALID_ACTION", "Acoes GET: docs, status, resolver, produto ou estoque.");
      }
      if (acao === "status") {
        return res.status(200).json({
          versao: "1.0", empresaPadrao: "NEWSHOP", empresasPermitidas: allowedEmpresas(),
          capacidades: { consultarProduto: true, consultarEstoque: true, ajustarEstoque: process.env.IA_ESTOQUE_WRITE_ENABLED === "true" && Boolean(process.env.IA_ESTOQUE_ERP_AJUSTE_PATH) },
          aviso: "A escrita exige chave separada, habilitacao explicita e adaptador ERP validado.",
        });
      }

      const idDireto = produtoId(req.query.produtoId);
      let id = idDireto;
      let eanResolvido: string | undefined;
      if (acao === "resolver" && !id) {
        const ean = codigoEan(req.query.codigo);
        if (!ean) return error(res, 400, "INVALID_CODE", "Informe produtoId numerico ou codigo EAN com 6 a 18 digitos.");
        for (const candidato of candidatosEan(ean)) {
          const busca = await erpJson(empresa, `/v1/produto/codigos-auxiliares?q=${encodeURIComponent(`id==${candidato}`)}&count=5`);
          const itens = ((busca.data as { items?: Array<{ produtoId?: number | string; id?: string; tipo?: string }> }).items || []);
          const item = itens.find((atual) => atual.produtoId && atual.tipo === "EAN") || itens.find((atual) => atual.produtoId);
          id = produtoId(item?.produtoId);
          eanResolvido = item?.id || candidato;
          if (id) break;
        }
        if (!id) return error(res, 404, "PRODUCT_NOT_FOUND", "Nenhum produto foi encontrado para este EAN.");
      }
      if (!id) return error(res, 400, "PRODUCT_ID_REQUIRED", "Informe produtoId. Para EAN use acao=resolver&codigo=.");

      if (acao === "produto") {
        const produto = await erpJson(empresa, `/v1/produto/produtos/${encodeURIComponent(id)}`);
        return res.status(200).json({ empresa, produtoId: id, produto: produto.data });
      }
      if (acao === "estoque") {
        const estoque = await erpJson(empresa, `/v1/estoque/saldos?q=${encodeURIComponent(`produtoId==${id}`)}&count=100`);
        return res.status(200).json({ empresa, produtoId: id, estoque: estoque.data });
      }

      const [produto, estoque] = await Promise.all([
        erpJson(empresa, `/v1/produto/produtos/${encodeURIComponent(id)}`),
        erpJson(empresa, `/v1/estoque/saldos?q=${encodeURIComponent(`produtoId==${id}`)}&count=100`),
      ]);
      return res.status(200).json({ empresa, produtoId: id, eanResolvido, produto: produto.data, estoque: estoque.data });
    }

    if (acao !== "ajustar") return error(res, 400, "INVALID_ACTION", "A unica acao POST e ajustar.");
    if (process.env.IA_ESTOQUE_WRITE_ENABLED !== "true") return error(res, 403, "WRITE_DISABLED", "Ajustes estao desabilitados. Consulte o runbook antes de habilitar.");
    const path = (process.env.IA_ESTOQUE_ERP_AJUSTE_PATH || "").trim();
    if (!path.startsWith("/")) return error(res, 503, "ERP_ADAPTER_NOT_CONFIGURED", "O adaptador de ajuste do ERP ainda nao foi configurado e validado.");
    if (String(origem.confirmacao || "") !== "AJUSTAR_ESTOQUE") return error(res, 409, "CONFIRMATION_REQUIRED", "Envie confirmacao exatamente como AJUSTAR_ESTOQUE.");

    const id = produtoId(origem.produtoId);
    const lojaId = produtoId(origem.lojaId);
    const quantidade = Number(origem.quantidade);
    const modo = String(origem.modo || "").toUpperCase();
    const motivo = String(origem.motivo || "").trim();
    const idempotencyKey = String(req.headers["idempotency-key"] || origem.idempotencyKey || "").trim();
    if (!id || !lojaId || !Number.isFinite(quantidade) || !["ABSOLUTO", "DELTA"].includes(modo) || motivo.length < 8 || motivo.length > 300 || !/^[A-Za-z0-9_-]{12,120}$/.test(idempotencyKey)) {
      return error(res, 400, "INVALID_ADJUSTMENT", "produtoId, lojaId, quantidade, modo, motivo e Idempotency-Key validos sao obrigatorios.");
    }

    const payload = { produtoId: Number(id), lojaId: Number(lojaId), modo, quantidade, motivo, idempotencyKey };
    const ajuste = await erpJson(empresa, path, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    console.info("[ia-estoque] ajuste enviado", { empresa, produtoId: id, lojaId, modo, quantidade, idempotencyKey });
    return res.status(200).json({ sucesso: true, empresa, ajuste: ajuste.data });
  } catch (causa) {
    const erroErp = causa as { status?: number; data?: unknown };
    const status = typeof erroErp.status === "number" && erroErp.status >= 400 && erroErp.status < 600 ? erroErp.status : 502;
    console.error("[ia-estoque] erro ERP", { status, empresa, acao });
    return error(res, status, "ERP_ERROR", "Nao foi possivel concluir a operacao no ERP. Nenhuma alteracao deve ser presumida sem nova consulta de saldo.");
  }
}

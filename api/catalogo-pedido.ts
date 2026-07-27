import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";
type FlagKey = "loja" | "cd";

type CatalogoPedidoItem = {
  codigo: string;
  sku: string | null;
  descricao: string;
  secao: string | null;
  foto_url: string | null;
  preco_unitario: number;
  quantidade_pedida: number;
};

type CatalogoPedidoPayload = {
  numeroPedido: string;
  empresa: EmpresaKey;
  flag: FlagKey;
  clienteNome: string;
  titulo: string;
  conferenceId: string;
  itens: CatalogoPedidoItem[];
};

const MAX_ITENS = 500;

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-api-key, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getRequestToken(req: VercelRequest): string {
  const apiKey = headerValue(req.headers["x-api-key"]).trim();
  if (apiKey) return apiKey;

  const authorization = headerValue(req.headers.authorization).trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function assertAuthorized(req: VercelRequest) {
  const configured = String(process.env.CATALOGO_PEDIDOS_API_KEY ?? "").trim();
  if (!configured) {
    throw Object.assign(new Error("CATALOGO_PEDIDOS_API_KEY nao configurada."), { statusCode: 500 });
  }

  const received = getRequestToken(req);
  if (!received || !safeEquals(received, configured)) {
    throw Object.assign(new Error("Nao autorizado."), { statusCode: 401 });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
  if (typeof body === "object") return body as Record<string, unknown>;
  return {};
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return undefined;
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const directMessage =
      asString(err.message)
      || asString(err.details)
      || asString(err.hint)
      || asString(err.code)
      || asString(err.error_description)
      || asString(err.error);

    if (directMessage) return directMessage;

    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") return serialized.slice(0, 500);
    } catch {
      // Ignore serialization failures and fall through to the generic message.
    }
  }
  return asString(error) || "Erro desconhecido.";
}

function normalizeText(value: unknown): string {
  return asString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeEmpresa(value: unknown): EmpresaKey | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.includes("SEFULY")) return "SEFULY";
  if (text.includes("NEWSHOP") || text.includes("NEW SHOP")) return "NEWSHOP";
  if (text.includes("SOYE")) return "SOYE";
  if (text.includes("FACIL")) return "FACIL";
  return null;
}

function normalizeFlag(value: unknown): FlagKey {
  return normalizeText(value) === "CD" ? "cd" : "loja";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value);
  if (!text) return null;

  const clean = text.replace(/[^\d,.-]/g, "");
  if (!clean) return null;

  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantidade(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null) return null;
  const quantidade = Math.trunc(parsed);
  return quantidade > 0 ? quantidade : null;
}

function normalizePhoto(value: unknown): string | null {
  const photo = asString(value);
  if (!photo) return null;
  if (photo.startsWith("data:image/")) {
    throw new Error("Envie a foto como URL, nao como base64.");
  }
  return photo;
}

function normalizeItem(raw: unknown, index: number): CatalogoPedidoItem {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Item ${index + 1}: formato invalido.`);
  }

  const item = raw as Record<string, unknown>;
  const codigo = asString(pick(item, ["codigo", "código", "ean", "barcode", "sku"]));
  const descricao = asString(pick(item, ["descricao", "descrição", "description", "nome"]));
  const quantidade = parseQuantidade(pick(item, ["quantidadePedida", "quantidade_pedida", "quantidade", "qtd"]));
  const preco = parseNumber(pick(item, ["preco", "preço", "precoUnitario", "preco_unitario", "price"]));

  if (!codigo) throw new Error(`Item ${index + 1}: codigo obrigatorio.`);
  if (!descricao) throw new Error(`Item ${index + 1}: descricao obrigatoria.`);
  if (quantidade == null) throw new Error(`Item ${index + 1}: quantidade pedida deve ser maior que zero.`);
  if (preco == null || preco < 0) throw new Error(`Item ${index + 1}: preco invalido.`);

  return {
    codigo,
    sku: asString(pick(item, ["sku", "referencia"])) || null,
    descricao,
    secao: asString(pick(item, ["secao", "seção", "categoria"])) || null,
    foto_url: normalizePhoto(pick(item, ["foto", "fotoUrl", "foto_url", "imagem", "image"])),
    preco_unitario: Number(preco.toFixed(2)),
    quantidade_pedida: quantidade,
  };
}

function getRawItens(body: Record<string, unknown>): unknown[] {
  const itens = pick(body, ["itens", "items", "produtos", "products"]);
  if (Array.isArray(itens)) return itens;

  const codigo = pick(body, ["codigo", "código", "ean", "barcode", "sku"]);
  if (codigo) return [body];
  return [];
}

function normalizeConferenceId(empresa: EmpresaKey, numeroPedido: string, explicit?: unknown): string {
  const raw = asString(explicit) || `catalogo:${empresa}:${numeroPedido}`;
  return raw.replace(/\s+/g, "-").slice(0, 180);
}

function buildPayload(body: Record<string, unknown>): CatalogoPedidoPayload {
  const numeroPedido = asString(pick(body, [
    "numeroPedido",
    "codigoPedido",
    "codigo_pedido",
    "pedidoCodigo",
    "numero_pedido",
    "numeroDoPedido",
    "pedidoNumero",
    "orderNumber",
    "numero",
  ]));
  const empresa = normalizeEmpresa(pick(body, ["loja", "empresa", "lojaDestino", "empresaDestino", "lojaId", "loja_id", "idLoja"]));
  const clienteNome = asString(pick(body, ["nomeCliente", "nome_cliente", "cliente", "customerName"]));
  const flag = normalizeFlag(pick(body, ["flag", "tipo", "origem"]));

  if (!numeroPedido) throw new Error("Numero do pedido obrigatorio.");
  if (!empresa) throw new Error("Loja invalida. Use NEWSHOP, SOYE, FACIL ou SEFULY.");
  if (!clienteNome) throw new Error("Nome do cliente obrigatorio.");

  const rawItens = getRawItens(body);
  if (rawItens.length === 0) throw new Error("Informe ao menos um item em itens[].");
  if (rawItens.length > MAX_ITENS) throw new Error(`Pedido limitado a ${MAX_ITENS} itens.`);

  const itens = rawItens.map(normalizeItem);
  const titulo = asString(pick(body, ["titulo", "nomeLista", "name"]))
    || `Catalogo #${numeroPedido} - ${clienteNome}`;

  return {
    numeroPedido,
    empresa,
    flag,
    clienteNome,
    titulo,
    conferenceId: normalizeConferenceId(empresa, numeroPedido, pick(body, ["conferenceId", "conference_id"])),
    itens,
  };
}

function createSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw Object.assign(new Error("Supabase nao configurado."), { statusCode: 500 });
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metodo nao permitido." });

  try {
    assertAuthorized(req);
    const body = parseBody(req);
    const payload = buildPayload(body);
    const supabase = createSupabase();

    const { data, error } = await supabase.rpc("receber_pedido_catalogo", {
      p_conference_id: payload.conferenceId,
      p_empresa: payload.empresa,
      p_flag: payload.flag,
      p_numero_pedido: payload.numeroPedido,
      p_cliente_nome: payload.clienteNome,
      p_titulo: payload.titulo,
      p_itens: payload.itens,
      p_payload: body,
    });

    if (error) throw error;

    const result = (data ?? {}) as Record<string, unknown>;
    return res.status(200).json({
      ok: true,
      pedidoId: result.pedidoId,
      conferenceId: result.conferenceId ?? payload.conferenceId,
      numeroPedido: payload.numeroPedido,
      loja: payload.empresa,
      cliente: payload.clienteNome,
      totalItens: payload.itens.length,
      created: Boolean(result.created),
      updated: Boolean(result.updated),
      bloqueado: Boolean(result.bloqueado),
      status: result.status ?? "analisado",
      message: result.bloqueado
        ? "Pedido ja esta em conferencia ou concluido; nao foi alterado."
        : "Pedido recebido.",
    });
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode ?? 400);
    const message = getErrorMessage(error);
    console.error("[catalogo-pedido] falha ao receber pedido", {
      message,
      error,
    });
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      ok: false,
      error: message,
    });
  }
}

import { createClient } from "@supabase/supabase-js";

export type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";
export type FlagKey = "loja" | "cd";

export type CatalogoPedidoItem = {
  codigo: string;
  sku: string | null;
  descricao: string;
  secao: string | null;
  foto_url: string | null;
  preco_unitario: number;
  quantidade_pedida: number;
};

export type CatalogoPedidoPayload = {
  numeroPedido: string;
  empresa: EmpresaKey;
  flag: FlagKey;
  clienteNome: string;
  titulo: string;
  conferenceId: string;
  itens: CatalogoPedidoItem[];
};

export type CatalogoPedidoResult = {
  ok: true;
  pedidoId: unknown;
  conferenceId: unknown;
  numeroPedido: string;
  loja: EmpresaKey;
  cliente: string;
  totalItens: number;
  created: boolean;
  updated: boolean;
  bloqueado: boolean;
  status: unknown;
  message: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const MAX_ITENS = 500;

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

export function getCatalogoPedidoErrorMessage(error: unknown): string {
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
  const codigo = asString(pick(item, ["codigo", "\u0063\u00f3digo", "ean", "barcode", "sku"]));
  const descricao = asString(pick(item, ["descricao", "\u0064\u0065\u0073\u0063\u0072\u0069\u00e7\u00e3\u006f", "description", "nome"]));
  const quantidade = parseQuantidade(pick(item, ["quantidadePedida", "quantidade_pedida", "quantidade", "qtd"]));
  const preco = parseNumber(pick(item, ["preco", "\u0070\u0072\u0065\u00e7\u006f", "precoUnitario", "preco_unitario", "price"]));

  if (!codigo) throw new Error(`Item ${index + 1}: codigo obrigatorio.`);
  if (!descricao) throw new Error(`Item ${index + 1}: descricao obrigatoria.`);
  if (quantidade == null) throw new Error(`Item ${index + 1}: quantidade pedida deve ser maior que zero.`);
  if (preco == null || preco < 0) throw new Error(`Item ${index + 1}: preco invalido.`);

  return {
    codigo,
    sku: asString(pick(item, ["sku", "referencia"])) || null,
    descricao,
    secao: asString(pick(item, ["secao", "\u0073\u0065\u00e7\u00e3\u006f", "categoria"])) || null,
    foto_url: normalizePhoto(pick(item, ["foto", "fotoUrl", "foto_url", "imagem", "image"])),
    preco_unitario: Number(preco.toFixed(2)),
    quantidade_pedida: quantidade,
  };
}

function getRawItens(body: Record<string, unknown>): unknown[] {
  const itens = pick(body, ["itens", "items", "produtos", "products"]);
  if (Array.isArray(itens)) return itens;

  const codigo = pick(body, ["codigo", "\u0063\u00f3digo", "ean", "barcode", "sku"]);
  if (codigo) return [body];
  return [];
}

function normalizeConferenceId(empresa: EmpresaKey, numeroPedido: string, explicit?: unknown): string {
  const raw = asString(explicit) || `catalogo:${empresa}:${numeroPedido}`;
  return raw.replace(/\s+/g, "-").slice(0, 180);
}

export function buildCatalogoPedidoPayload(body: Record<string, unknown>): CatalogoPedidoPayload {
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

function createSupabase(): RpcClient {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw Object.assign(new Error("Supabase nao configurado."), { statusCode: 500 });
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function receiveCatalogoPedido(
  body: Record<string, unknown>,
  supabase: RpcClient = createSupabase()
): Promise<CatalogoPedidoResult> {
  const payload = buildCatalogoPedidoPayload(body);

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
  const bloqueado = Boolean(result.bloqueado);

  return {
    ok: true,
    pedidoId: result.pedidoId,
    conferenceId: result.conferenceId ?? payload.conferenceId,
    numeroPedido: payload.numeroPedido,
    loja: payload.empresa,
    cliente: payload.clienteNome,
    totalItens: payload.itens.length,
    created: Boolean(result.created),
    updated: Boolean(result.updated),
    bloqueado,
    status: result.status ?? "analisado",
    message: bloqueado
      ? "Pedido ja esta em conferencia ou concluido; nao foi alterado."
      : "Pedido recebido.",
  };
}

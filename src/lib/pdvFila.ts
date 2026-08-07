// Enfileira a conferencia concluida como pre-venda para o PDV (SYSpdv).
//
// O SCAN web monta apenas o JSON operacional e grava na tabela
// public.pdv_prevenda_fila. Quem roda no PC/servidor local e transforma esse
// JSON no arquivo aceito pela retaguarda/PDV.
//
// REGRA DE DINHEIRO: a pre-venda vira venda no caixa. Se falta preco em algum
// item vendavel, esta funcao NAO enfileira nada e devolve o motivo. Enviar a
// pre-venda sem um item significa cobrar menos do cliente — preferimos falhar
// visivelmente a cobrar errado.

import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  type PdvPrevendaCliente,
  type PdvPrevendaItem,
  type PdvTipoPessoa,
} from "./pdvPrevenda";
import { lojaEnviaPrevendaParaPdv } from "./lojaFeatures";

// Config da instalacao do SYSpdv. Sem VITE_PDV_* o app usa os defaults abaixo.
const CODIGO_FUNCIONARIO = String(import.meta.env.VITE_PDV_CODIGO_FUNCIONARIO ?? "1");
const TRIBUTACAO_PADRAO = String(import.meta.env.VITE_PDV_TRIBUTACAO ?? "").trim();
// Codigo de cliente usado quando o pedido nao traz CPF/CNPJ (consumidor final).
const CLIENTE_CODIGO_PADRAO = String(import.meta.env.VITE_PDV_CLIENTE_CODIGO_PADRAO ?? "").trim();
const UNIDADE_PADRAO = String(import.meta.env.VITE_PDV_UNIDADE ?? "UN").trim() || "UN";

export type PdvPrevendaStatusItem = "separado" | "nao_tem" | "nao_tem_tudo" | "pendente" | "aguardando";

export interface PdvPrevendaConferenciaItem {
  codigo: string;
  sku?: string | null;
  descricao?: string | null;
  quantidadePedida: number;
  quantidadeReal: number | null;
  status: PdvPrevendaStatusItem;
  descontoPercentual?: number | null;
}

export interface EnfileirarPrevendaParams {
  empresa: string;
  pedidoId: string | null;
  conferenceId?: string | null;
  conferente?: string | null;
  origemTipo?: "conferencia" | "pedido_direto";
  cliente?: PdvPrevendaCliente | null;
  itens: PdvPrevendaConferenciaItem[];
}

// Tipo unico (nao union discriminada) porque o projeto compila com
// `strict: false`, e sem strictNullChecks o TS nao estreita union por
// discriminante boolean — o mesmo problema aparece em Chat.tsx.
export interface EnfileirarPrevendaResult {
  ok: boolean;
  id?: string;
  numeroPrevenda?: string;
  nomeArquivo?: string;
  totalItens?: number;
  valorTotal?: number;
  /** Preenchido quando ok = false. */
  motivo?: string;
  detalhe?: string;
}

interface PdvPrevendaPayloadJson {
  version: 1;
  formato: "syspdv_rpx_ecf";
  origem: {
    sistema: "SCAN";
    tipo: "conferencia" | "pedido_direto";
    empresa: string;
    pedidoId: string | null;
    conferenceId: string | null;
    numeroCatalogo: string | null;
  };
  numeroPrevenda: number;
  dataEmissao: string;
  codigoFuncionario: string;
  nomeVendedor: string | null;
  observacao: string;
  cliente: PdvPrevendaCliente;
  itens: PdvPrevendaItem[];
}

function toInt(value: unknown): number {
  const numero = Number(value ?? 0);
  return Number.isFinite(numero) ? Math.trunc(numero) : 0;
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function codigoClienteValido(value: unknown): string {
  const digits = texto(value).replace(/\D/g, "");
  return Number(digits) > 0 ? digits : "";
}

function numeroPrevendaFormatado(value: number): string {
  return String(Math.trunc(value)).replace(/\D/g, "").padStart(10, "0").slice(-10);
}

function nomeArquivoPrevenda(numeroPrevenda: number): string {
  const digitos = String(Math.trunc(numeroPrevenda)).replace(/\D/g, "").padStart(7, "0").slice(-7);
  return `RPX${digitos}.ECF`;
}

function calcularValorTotal(itens: PdvPrevendaItem[]): number {
  const total = itens.reduce((acc, item) => {
    const bruto = Number(item.quantidade ?? 0) * Number(item.valorUnitario ?? 0);
    const desconto = Number(item.valorDesconto ?? 0);
    return acc + bruto - desconto;
  }, 0);
  return Math.round(total * 100) / 100;
}

function normalizarDescontoPercentual(value: unknown): number {
  const percentual = Number(value ?? 0);
  if (!Number.isFinite(percentual) || percentual <= 0) return 0;
  return Math.min(50, Math.round(percentual * 100) / 100);
}

/**
 * Quantidade que efetivamente vai para o caixa:
 *   separado      -> quantidade real, ou a pedida quando o conferente nao mexeu
 *   nao_tem_tudo  -> quantidade real (parcial): so o que existe fisicamente
 *   nao_tem/pendente/aguardando -> nao vende
 * Mesma regra usada em dispararExpedicaoConferencia.
 */
function quantidadeVendavel(item: PdvPrevendaConferenciaItem): number {
  if (item.status === "separado") {
    const real = item.quantidadeReal == null ? null : toInt(item.quantidadeReal);
    return real && real > 0 ? real : toInt(item.quantidadePedida);
  }
  if (item.status === "nao_tem_tudo") return toInt(item.quantidadeReal);
  return 0;
}

// ── Dados do cliente vindos do pedido do catalogo ───────────────────────────

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value != null && texto(value)) return value;
    }
  }
  return undefined;
}

function inferirTipoPessoa(cpfCnpj: string): PdvTipoPessoa {
  return cpfCnpj.replace(/\D/g, "").length > 11 ? "J" : "F";
}

function normalizarClienteDireto(cliente: PdvPrevendaCliente | null | undefined): PdvPrevendaCliente | null {
  if (!cliente) return null;

  const nome = texto(cliente.nome);
  const cpfCnpj = texto(cliente.cpfCnpj).replace(/\D/g, "");
  const codigo =
    codigoClienteValido(cliente.codigo) ||
    cpfCnpj ||
    codigoClienteValido(CLIENTE_CODIGO_PADRAO);

  if (!nome || !codigo) return null;

  return {
    codigo,
    nome,
    cpfCnpj: cpfCnpj || null,
    tipoPessoa: cliente.tipoPessoa === "J" || cpfCnpj.length > 11 ? "J" : "F",
    endereco: texto(cliente.endereco) || null,
    numeroEndereco: texto(cliente.numeroEndereco) || null,
    complemento: texto(cliente.complemento) || null,
    bairro: texto(cliente.bairro) || null,
    cidade: texto(cliente.cidade) || null,
    uf: texto(cliente.uf).slice(0, 2) || null,
    cep: texto(cliente.cep).replace(/\D/g, "") || null,
    telefone: texto(cliente.telefone).replace(/\D/g, "") || null,
    inscricaoEstadual: texto(cliente.inscricaoEstadual) || null,
    codigoIbge: texto(cliente.codigoIbge).replace(/\D/g, "") || null,
    codigoPais: texto(cliente.codigoPais).replace(/\D/g, "") || null,
  };
}

interface PedidoPdvRow {
  id: string;
  empresa: string;
  pessoa: string | null;
  listeiro: string | null;
  catalogo_cliente_nome: string | null;
  catalogo_numero_pedido: string | null;
  catalogo_payload: Record<string, unknown> | null;
  conference_id: string | null;
}

function montarCliente(pedido: PedidoPdvRow | null, fallbackNome: string): PdvPrevendaCliente | null {
  const payload = (pedido?.catalogo_payload ?? null) as Record<string, unknown> | null;
  const cliente = (pick(payload, ["cliente", "customer", "clienteDados"]) ?? null) as
    | Record<string, unknown>
    | null;
  const fonte = cliente && typeof cliente === "object" ? cliente : payload;

  const nome =
    texto(pick(fonte, ["nomeCliente", "nome_cliente", "nome", "cliente", "customerName", "razaoSocial"]))
    || texto(pedido?.catalogo_cliente_nome)
    || texto(pedido?.pessoa)
    || texto(pedido?.listeiro)
    || fallbackNome;

  const cpfCnpj = texto(pick(fonte, ["cpfCnpj", "cpf_cnpj", "cpf", "cnpj", "documento", "doc"])).replace(/\D/g, "");
  const codigo =
    codigoClienteValido(pick(fonte, ["codigoCliente", "codigo_cliente", "clienteCodigo", "idCliente"]))
    || cpfCnpj
    || codigoClienteValido(CLIENTE_CODIGO_PADRAO);

  if (!nome || !codigo) return null;

  return {
    codigo,
    nome,
    cpfCnpj: cpfCnpj || null,
    tipoPessoa: cpfCnpj ? inferirTipoPessoa(cpfCnpj) : "F",
    endereco: texto(pick(fonte, ["endereco", "logradouro", "rua", "address"])) || null,
    numeroEndereco: texto(pick(fonte, ["numero", "numeroEndereco", "numero_endereco"])) || null,
    complemento: texto(pick(fonte, ["complemento"])) || null,
    bairro: texto(pick(fonte, ["bairro"])) || null,
    cidade: texto(pick(fonte, ["cidade", "municipio", "city"])) || null,
    uf: texto(pick(fonte, ["uf", "estado", "state"])).slice(0, 2) || null,
    cep: texto(pick(fonte, ["cep", "zip", "zipCode"])) || null,
    telefone: texto(pick(fonte, ["telefone", "fone", "celular", "phone", "whatsapp"])) || null,
    inscricaoEstadual: texto(pick(fonte, ["inscricaoEstadual", "inscricao_estadual", "ie"])) || null,
    codigoIbge: texto(pick(fonte, ["codigoIbge", "codigo_ibge", "ibge"])) || null,
    codigoPais: texto(pick(fonte, ["codigoPais", "codigo_pais"])) || null,
  };
}

// ── Precos ──────────────────────────────────────────────────────────────────

async function carregarPrecos(pedidoId: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const { data, error } = await supabase
    .from("pedido_itens")
    .select("codigo,preco_unitario")
    .eq("pedido_id", pedidoId);

  if (error) throw error;

  for (const row of (data ?? []) as Array<{ codigo: string | null; preco_unitario: number | null }>) {
    const codigo = texto(row.codigo);
    const preco = Number(row.preco_unitario ?? 0);
    if (codigo && Number.isFinite(preco) && preco > 0) mapa.set(codigo, preco);
  }

  return mapa;
}

async function carregarPedido(pedidoId: string): Promise<PedidoPdvRow | null> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id,empresa,pessoa,listeiro,catalogo_cliente_nome,catalogo_numero_pedido,catalogo_payload,conference_id")
    .eq("id", pedidoId)
    .maybeSingle();

  if (error) throw error;
  return (data as PedidoPdvRow | null) ?? null;
}

// ── API publica ─────────────────────────────────────────────────────────────

/**
 * Enfileira a pre-venda. Nao lanca: devolve `{ ok: false, motivo }` para o
 * chamador decidir o que mostrar (o fechamento da conferencia NAO deve falhar
 * por causa do PDV).
 */
export async function enfileirarPrevendaConferencia(
  params: EnfileirarPrevendaParams
): Promise<EnfileirarPrevendaResult> {
  try {
    if (!isSupabaseConfigured) {
      return { ok: false, motivo: "supabase_nao_configurado" };
    }
    if (!lojaEnviaPrevendaParaPdv(params.empresa)) {
      return { ok: false, motivo: "loja_sem_pdv" };
    }

    const vendaveis = (params.itens ?? [])
      .map((item) => ({ item, quantidade: quantidadeVendavel(item) }))
      .filter((entry) => entry.quantidade > 0 && texto(entry.item.codigo));

    if (vendaveis.length === 0) {
      return { ok: false, motivo: "sem_itens_vendaveis" };
    }
    if (!params.pedidoId) {
      // Conferencia de arquivo importado nao tem pedido no banco, logo nao tem
      // preco. Sem preco nao existe pre-venda.
      return { ok: false, motivo: "sem_pedido_de_origem" };
    }

    const [pedido, precos] = await Promise.all([
      carregarPedido(params.pedidoId),
      carregarPrecos(params.pedidoId),
    ]);

    const { data: existente, error: existenteError } = await supabase
      .from("pdv_prevenda_fila")
      .select("id,numero_prevenda,nome_arquivo,total_itens,valor_total,status")
      .eq("pedido_id", params.pedidoId)
      .neq("status", "erro")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existenteError) throw existenteError;
    if (existente?.id) {
      return {
        ok: true,
        id: String(existente.id),
        numeroPrevenda: numeroPrevendaFormatado(Number(existente.numero_prevenda ?? 0)),
        nomeArquivo: String(existente.nome_arquivo ?? ""),
        totalItens: Number(existente.total_itens ?? 0),
        valorTotal: Number(existente.valor_total ?? 0),
      };
    }

    const semPreco = vendaveis.filter((entry) => !precos.has(texto(entry.item.codigo)));
    if (semPreco.length > 0) {
      const exemplos = semPreco.slice(0, 5).map((entry) => texto(entry.item.codigo)).join(", ");
      return {
        ok: false,
        motivo: "itens_sem_preco",
        detalhe: `${semPreco.length} item(ns) sem preco unitario: ${exemplos}`,
      };
    }

    const nomeVendedor = texto(pedido?.pessoa) || texto(pedido?.listeiro) || texto(params.conferente) || null;
    const cliente = normalizarClienteDireto(params.cliente) || montarCliente(pedido, nomeVendedor || "CONSUMIDOR");
    if (!cliente) {
      return {
        ok: false,
        motivo: "cliente_incompleto",
        detalhe: "Sem CPF/CNPJ nem codigo de cliente. Configure VITE_PDV_CLIENTE_CODIGO_PADRAO.",
      };
    }

    const { data: numeroData, error: numeroError } = await supabase.rpc("pdv_prevenda_reservar_numero");
    if (numeroError) throw numeroError;
    const numeroPrevenda = Number(numeroData ?? 0);
    if (!numeroPrevenda) return { ok: false, motivo: "numero_prevenda_indisponivel" };

    const itens: PdvPrevendaItem[] = vendaveis.map((entry) => {
      const valorUnitario = precos.get(texto(entry.item.codigo)) as number;
      const descontoPercentual = normalizarDescontoPercentual(entry.item.descontoPercentual);
      return {
        codigo: texto(entry.item.codigo),
        descricao: texto(entry.item.descricao) || texto(entry.item.sku) || texto(entry.item.codigo),
        quantidade: entry.quantidade,
        valorUnitario,
        valorDesconto: Math.round(entry.quantidade * valorUnitario * descontoPercentual) / 100,
        tributacao: TRIBUTACAO_PADRAO || null,
        unidade: UNIDADE_PADRAO,
        codigoAuxiliar: texto(entry.item.sku) || null,
      };
    });

    const numeroCatalogo = texto(pedido?.catalogo_numero_pedido);
    const origemTipo = params.origemTipo === "pedido_direto" ? "pedido_direto" : "conferencia";
    const payloadJson: PdvPrevendaPayloadJson = {
      version: 1,
      formato: "syspdv_rpx_ecf",
      origem: {
        sistema: "SCAN",
        tipo: origemTipo,
        empresa: texto(params.empresa).toUpperCase(),
        pedidoId: params.pedidoId,
        conferenceId: texto(params.conferenceId) || pedido?.conference_id || null,
        numeroCatalogo: numeroCatalogo || null,
      },
      numeroPrevenda,
      dataEmissao: new Date().toISOString(),
      codigoFuncionario: CODIGO_FUNCIONARIO,
      nomeVendedor,
      observacao: [
        `origem=${origemTipo}`,
        numeroCatalogo ? `pedido=${numeroCatalogo}` : "",
      ].filter(Boolean).join(" "),
      cliente,
      itens,
    };

    const nomeArquivo = nomeArquivoPrevenda(numeroPrevenda);
    const valorTotal = calcularValorTotal(itens);

    const { data: inserido, error: insertError } = await supabase
      .from("pdv_prevenda_fila")
      .insert({
        empresa: texto(params.empresa).toUpperCase(),
        pedido_id: params.pedidoId,
        conference_id: texto(params.conferenceId) || pedido?.conference_id || null,
        numero_prevenda: numeroPrevenda,
        nome_arquivo: nomeArquivo,
        payload_json: payloadJson,
        conteudo: null,
        total_itens: itens.length,
        valor_total: valorTotal,
        conferente: texto(params.conferente) || null,
        cliente_nome: cliente.nome,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return {
      ok: true,
      id: String(inserido?.id ?? ""),
      numeroPrevenda: numeroPrevendaFormatado(numeroPrevenda),
      nomeArquivo,
      totalItens: itens.length,
      valorTotal,
    };
  } catch (error) {
    return {
      ok: false,
      motivo: "erro",
      detalhe: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Mensagem curta para o toast do app. String vazia = nao vale avisar o usuario. */
export function descreverFalhaPrevenda(result: { motivo?: string; detalhe?: string }): string {
  switch (result.motivo) {
    case "loja_sem_pdv":
    case "supabase_nao_configurado":
      return "";
    case "sem_itens_vendaveis":
      return "Nenhum item separado: nada foi enviado ao PDV.";
    case "sem_pedido_de_origem":
      return "Conferencia sem pedido de origem (sem preco): PDV nao recebeu.";
    case "itens_sem_preco":
      return `PDV nao recebeu: ${result.detalhe ?? "itens sem preco"}.`;
    case "cliente_incompleto":
      return `PDV nao recebeu: ${result.detalhe ?? "dados do cliente incompletos"}.`;
    default:
      return `Falha ao enviar ao PDV: ${result.detalhe ?? "erro desconhecido"}.`;
  }
}

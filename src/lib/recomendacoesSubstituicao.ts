import { produtoKey } from "@/lib/comprasSupabase";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export type RecomendacaoStatus = "pendente" | "aceita" | "recusada" | "aplicada" | "cancelada";

type CompraStatusApp =
  | "todo"
  | "produto_bom"
  | "produto_ruim"
  | "fazer_pedido"
  | "pedido_andamento"
  | "compra_realizada"
  | "concluido";

const STATUS_COMPRA_PRIORITY: Record<CompraStatusApp, number> = {
  fazer_pedido: 400,
  produto_bom: 300,
  produto_ruim: 200,
  pedido_andamento: 150,
  compra_realizada: 140,
  concluido: 130,
  todo: 100,
};

interface RecomendacaoRow {
  id: string;
  empresa: string;
  flag: string;
  pedido_id: string;
  pedido_item_id: string;
  pedido_titulo: string | null;
  pedido_pessoa: string | null;
  codigo_original: string;
  sku_original: string | null;
  descricao_original: string | null;
  foto_original: string | null;
  codigo_sugerido: string;
  sku_sugerido: string | null;
  descricao_sugerida: string | null;
  secao_sugerida: string | null;
  foto_sugerida: string | null;
  erp_id_sugerido: string | null;
  sugerido_por: string;
  destinatario: string;
  observacao: string | null;
  status: RecomendacaoStatus;
  respondido_por: string | null;
  respondido_em: string | null;
  aplicado_por: string | null;
  aplicado_em: string | null;
  resultado_visto_sugerente: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CompraRow {
  id: string;
  empresa: string;
  produto_key: string;
  codigo: string;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  status: CompraStatusApp;
  vezes_pedido: number | null;
  foto_url: string | null;
  tags: string[] | null;
}

export interface RecomendacaoSubstituicao {
  id: string;
  empresa: string;
  flag: string;
  pedidoId: string;
  pedidoItemId: string;
  pedidoTitulo: string;
  pedidoPessoa: string;
  codigoOriginal: string;
  skuOriginal: string;
  descricaoOriginal: string;
  fotoOriginal: string | null;
  codigoSugerido: string;
  skuSugerido: string;
  descricaoSugerida: string;
  secaoSugerida: string;
  fotoSugerida: string | null;
  erpIdSugerido: string;
  sugeridoPor: string;
  destinatario: string;
  observacao: string;
  status: RecomendacaoStatus;
  respondidoPor: string;
  respondidoEm: string | null;
  aplicadoPor: string;
  aplicadoEm: string | null;
  resultadoVistoSugerente: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CriarRecomendacaoSubstituicaoInput {
  empresa: string;
  flag: string;
  pedidoId: string;
  pedidoItemId: string;
  pedidoTitulo?: string | null;
  pedidoPessoa?: string | null;
  codigoOriginal: string;
  skuOriginal?: string | null;
  descricaoOriginal?: string | null;
  fotoOriginal?: string | null;
  codigoSugerido: string;
  skuSugerido?: string | null;
  descricaoSugerida?: string | null;
  secaoSugerida?: string | null;
  fotoSugerida?: string | null;
  erpIdSugerido?: string | null;
  sugeridoPor: string;
  destinatario: string;
  observacao?: string | null;
}

function mapRow(row: RecomendacaoRow): RecomendacaoSubstituicao {
  return {
    id: row.id,
    empresa: row.empresa,
    flag: row.flag,
    pedidoId: row.pedido_id,
    pedidoItemId: row.pedido_item_id,
    pedidoTitulo: row.pedido_titulo ?? "",
    pedidoPessoa: row.pedido_pessoa ?? "",
    codigoOriginal: row.codigo_original,
    skuOriginal: row.sku_original ?? "",
    descricaoOriginal: row.descricao_original ?? "",
    fotoOriginal: row.foto_original ?? null,
    codigoSugerido: row.codigo_sugerido,
    skuSugerido: row.sku_sugerido ?? "",
    descricaoSugerida: row.descricao_sugerida ?? "",
    secaoSugerida: row.secao_sugerida ?? "",
    fotoSugerida: row.foto_sugerida ?? null,
    erpIdSugerido: row.erp_id_sugerido ?? "",
    sugeridoPor: row.sugerido_por,
    destinatario: row.destinatario,
    observacao: row.observacao ?? "",
    status: row.status,
    respondidoPor: row.respondido_por ?? "",
    respondidoEm: row.respondido_em,
    aplicadoPor: row.aplicado_por ?? "",
    aplicadoEm: row.aplicado_em,
    resultadoVistoSugerente: Boolean(row.resultado_visto_sugerente),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase nao configurado neste ambiente.");
  }
}

function shouldReplaceStatus(current: CompraStatusApp, next: CompraStatusApp) {
  return (STATUS_COMPRA_PRIORITY[next] ?? 0) > (STATUS_COMPRA_PRIORITY[current] ?? 0);
}

async function registrarOriginalEmCompras(rec: RecomendacaoSubstituicao) {
  const key = produtoKey(rec.codigoOriginal, rec.skuOriginal);
  if (!key) return;

  const { data, error } = await supabase
    .from("compras")
    .select("id,empresa,produto_key,codigo,sku,descricao,secao,status,vezes_pedido,foto_url,tags")
    .eq("empresa", rec.empresa)
    .eq("produto_key", key)
    .maybeSingle();

  if (error) throw error;

  const tagsBase = new Set<string>([
    "substituicao_original",
    "nao_tem",
    ...((data as CompraRow | null)?.tags ?? []),
  ]);

  if (data) {
    const atual = data as CompraRow;
    const payload: Partial<CompraRow> & { tags: string[]; vezes_pedido: number } = {
      tags: Array.from(tagsBase),
      vezes_pedido: Math.max(1, atual.vezes_pedido ?? 1) + 1,
    };

    if (shouldReplaceStatus(atual.status, "todo")) {
      payload.status = "todo";
    }
    if (!atual.descricao && rec.descricaoOriginal) {
      payload.descricao = rec.descricaoOriginal;
    }
    if (!atual.foto_url && rec.fotoOriginal) {
      payload.foto_url = rec.fotoOriginal;
    }
    if (!atual.sku && rec.skuOriginal) {
      payload.sku = rec.skuOriginal;
    }

    const { error: updateError } = await supabase.from("compras").update(payload).eq("id", atual.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase.from("compras").insert({
    empresa: rec.empresa,
    produto_key: key,
    codigo: rec.codigoOriginal,
    sku: rec.skuOriginal || null,
    descricao: rec.descricaoOriginal || null,
    secao: null,
    status: "todo",
    vezes_pedido: 1,
    foto_url: rec.fotoOriginal || null,
    tags: Array.from(tagsBase),
  });
  if (insertError) throw insertError;
}

export async function criarRecomendacaoSubstituicao(
  input: CriarRecomendacaoSubstituicaoInput
): Promise<RecomendacaoSubstituicao> {
  ensureSupabase();

  const destinatario = String(input.destinatario ?? "").trim();
  if (!destinatario) throw new Error("Pedido sem pessoa para receber a recomendacao.");

  await supabase
    .from("recomendacoes_substituicao")
    .update({ status: "cancelada" })
    .eq("pedido_item_id", input.pedidoItemId)
    .in("status", ["pendente", "aceita"]);

  const { data, error } = await supabase
    .from("recomendacoes_substituicao")
    .insert({
      empresa: input.empresa,
      flag: input.flag,
      pedido_id: input.pedidoId,
      pedido_item_id: input.pedidoItemId,
      pedido_titulo: input.pedidoTitulo ?? null,
      pedido_pessoa: input.pedidoPessoa ?? null,
      codigo_original: input.codigoOriginal,
      sku_original: input.skuOriginal ?? null,
      descricao_original: input.descricaoOriginal ?? null,
      foto_original: input.fotoOriginal ?? null,
      codigo_sugerido: input.codigoSugerido,
      sku_sugerido: input.skuSugerido ?? null,
      descricao_sugerida: input.descricaoSugerida ?? null,
      secao_sugerida: input.secaoSugerida ?? null,
      foto_sugerida: input.fotoSugerida ?? null,
      erp_id_sugerido: input.erpIdSugerido ?? null,
      sugerido_por: input.sugeridoPor,
      destinatario,
      observacao: input.observacao ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as RecomendacaoRow);
}

export async function listarRecomendacoesPendentesPorDestinatario(
  empresa: string,
  flag: string,
  destinatario: string
): Promise<RecomendacaoSubstituicao[]> {
  ensureSupabase();
  const { data, error } = await supabase
    .from("recomendacoes_substituicao")
    .select("*")
    .eq("empresa", empresa)
    .eq("flag", flag)
    .eq("status", "pendente")
    .ilike("destinatario", destinatario.trim())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as RecomendacaoRow[] | null) ?? []).map(mapRow);
}

export async function listarRecomendacoesDoPedido(
  pedidoId: string
): Promise<RecomendacaoSubstituicao[]> {
  ensureSupabase();
  const { data, error } = await supabase
    .from("recomendacoes_substituicao")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as RecomendacaoRow[] | null) ?? []).map(mapRow);
}

export async function responderRecomendacaoSubstituicao(
  id: string,
  decisao: "aceita" | "recusada",
  actor: string
): Promise<void> {
  ensureSupabase();
  const { error } = await supabase
    .from("recomendacoes_substituicao")
    .update({
      status: decisao,
      respondido_por: actor,
      respondido_em: new Date().toISOString(),
      resultado_visto_sugerente: false,
    })
    .eq("id", id)
    .eq("status", "pendente");
  if (error) throw error;
}

export async function aplicarRecomendacaoSubstituicao(
  id: string,
  actor: string
): Promise<RecomendacaoSubstituicao> {
  ensureSupabase();

  const { data, error } = await supabase
    .from("recomendacoes_substituicao")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const recomendacao = mapRow(data as RecomendacaoRow);
  if (recomendacao.status !== "aceita") {
    throw new Error("A troca so pode ser aplicada depois que a pessoa aceitar.");
  }

  await registrarOriginalEmCompras(recomendacao);

  const { error: itemError } = await supabase
    .from("pedido_itens")
    .update({
      codigo: recomendacao.codigoSugerido,
      sku: recomendacao.skuSugerido || null,
      descricao: recomendacao.descricaoSugerida || null,
      secao: recomendacao.secaoSugerida || null,
      foto_url: recomendacao.fotoSugerida || null,
      quantidade_real: null,
      status: "pendente",
    })
    .eq("id", recomendacao.pedidoItemId);
  if (itemError) throw itemError;

  const { data: updated, error: updateError } = await supabase
    .from("recomendacoes_substituicao")
    .update({
      status: "aplicada",
      aplicado_por: actor,
      aplicado_em: new Date().toISOString(),
      resultado_visto_sugerente: false,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  return mapRow(updated as RecomendacaoRow);
}

export async function listarResultadosRecomendacaoPorSugerente(
  empresa: string,
  flag: string,
  sugeridoPor: string
): Promise<RecomendacaoSubstituicao[]> {
  ensureSupabase();
  const { data, error } = await supabase
    .from("recomendacoes_substituicao")
    .select("*")
    .eq("empresa", empresa)
    .eq("flag", flag)
    .ilike("sugerido_por", sugeridoPor.trim())
    .in("status", ["aceita", "recusada", "aplicada"])
    .eq("resultado_visto_sugerente", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data as RecomendacaoRow[] | null) ?? []).map(mapRow);
}

export async function marcarResultadosRecomendacaoComoVistos(ids: string[]): Promise<void> {
  ensureSupabase();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return;
  const { error } = await supabase
    .from("recomendacoes_substituicao")
    .update({ resultado_visto_sugerente: true })
    .in("id", unicos);
  if (error) throw error;
}

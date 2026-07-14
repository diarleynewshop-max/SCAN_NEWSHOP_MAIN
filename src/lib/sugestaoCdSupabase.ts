import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { enviarListaParaConferencia } from "@/lib/pedidosFila";
import { produtoKey } from "@/lib/comprasSupabase";

export type SugestaoCdEmpresa = "NEWSHOP" | "SOYE" | "FACIL";

export interface SugestaoCdItem {
  id: string;
  empresa: SugestaoCdEmpresa;
  produtoKey: string;
  codigo: string;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  fotoUrl: string | null;
  qtdErpLoja: number;
  qtdErpCd: number;
  qtdErpDeposito: number;
  qtdContada: number;
  qtdDesejada: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

type SugestaoCdRow = {
  id: string;
  empresa: SugestaoCdEmpresa;
  produto_key: string;
  codigo: string;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  foto_url: string | null;
  qtd_erp_loja: number | null;
  qtd_erp_cd: number | null;
  qtd_erp_deposito: number | null;
  qtd_contada: number | null;
  qtd_desejada: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export interface UpsertSugestaoCdInput {
  empresa: SugestaoCdEmpresa;
  codigo: string;
  sku?: string | null;
  descricao?: string | null;
  secao?: string | null;
  fotoUrl?: string | null;
  qtdErpLoja?: number;
  qtdErpCd?: number;
  qtdErpDeposito?: number;
  qtdContadaDelta?: number;
  qtdContada?: number;
  qtdDesejada?: number | null;
  createdBy?: string | null;
}

function toInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function rowToItem(row: SugestaoCdRow): SugestaoCdItem {
  return {
    id: row.id,
    empresa: row.empresa,
    produtoKey: row.produto_key,
    codigo: row.codigo,
    sku: row.sku,
    descricao: row.descricao,
    secao: row.secao,
    fotoUrl: row.foto_url,
    qtdErpLoja: row.qtd_erp_loja ?? 0,
    qtdErpCd: row.qtd_erp_cd ?? 0,
    qtdErpDeposito: row.qtd_erp_deposito ?? 0,
    qtdContada: row.qtd_contada ?? 0,
    qtdDesejada: row.qtd_desejada ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listarSugestaoCdItens(empresa: SugestaoCdEmpresa): Promise<SugestaoCdItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("sugestao_cd_itens")
    .select("*")
    .eq("empresa", empresa)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data as SugestaoCdRow[] | null) ?? []).map(rowToItem);
}

export function subscribeSugestaoCdItens(empresa: SugestaoCdEmpresa, onChange: () => void) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`sugestao-cd:${empresa}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sugestao_cd_itens", filter: `empresa=eq.${empresa}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function upsertSugestaoCdItem(input: UpsertSugestaoCdInput): Promise<SugestaoCdItem> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase nao configurado.");
  }

  const codigo = String(input.codigo ?? "").trim();
  if (!codigo) throw new Error("Codigo obrigatorio.");

  const key = produtoKey(codigo, input.sku) || `COD:${codigo}`;

  const { data: existing, error: existingError } = await supabase
    .from("sugestao_cd_itens")
    .select("*")
    .eq("empresa", input.empresa)
    .eq("produto_key", key)
    .maybeSingle();

  if (existingError) throw existingError;

  const qtdContadaBase = existing?.qtd_contada ?? 0;
  const qtdContada = input.qtdContada != null
    ? toInt(input.qtdContada)
    : qtdContadaBase + toInt(input.qtdContadaDelta, 0);

  const payload = {
    empresa: input.empresa,
    produto_key: key,
    codigo,
    sku: String(input.sku ?? "").trim() || null,
    descricao: String(input.descricao ?? "").trim() || null,
    secao: String(input.secao ?? "").trim() || null,
    foto_url: String(input.fotoUrl ?? "").trim() || null,
    qtd_erp_loja: toInt(input.qtdErpLoja),
    qtd_erp_cd: toInt(input.qtdErpCd),
    qtd_erp_deposito: toInt(input.qtdErpDeposito),
    qtd_contada: qtdContada,
    qtd_desejada: input.qtdDesejada == null ? existing?.qtd_desejada ?? null : toInt(input.qtdDesejada),
    created_by: String(input.createdBy ?? existing?.created_by ?? "").trim() || null,
  };

  const { data, error } = await supabase
    .from("sugestao_cd_itens")
    .upsert(payload, { onConflict: "empresa,produto_key" })
    .select("*")
    .single();

  if (error) throw error;
  return rowToItem(data as SugestaoCdRow);
}

export async function removerSugestaoCdItem(id: string): Promise<void> {
  if (!isSupabaseConfigured || !id) return;
  const { error } = await supabase.from("sugestao_cd_itens").delete().eq("id", id);
  if (error) throw error;
}

export async function removerSugestaoCdItens(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured || ids.length === 0) return;
  const { error } = await supabase.from("sugestao_cd_itens").delete().in("id", ids);
  if (error) throw error;
}

export async function gerarListaConferenciaSugestaoCd(params: {
  empresa: SugestaoCdEmpresa;
  pessoa: string;
  itens: SugestaoCdItem[];
}): Promise<{ pedidoId: string; conferenceId: string; totalItens: number }> {
  const itensValidos = params.itens.filter((item) => (item.qtdDesejada ?? 0) > 0);
  if (itensValidos.length === 0) {
    throw new Error("Nenhum item com quantidade desejada preenchida.");
  }

  const conferenceId = `sugestao-cd-${crypto.randomUUID()}`;
  const dataCriacao = new Date().toISOString();
  const titulo = `Sugestao CD - ${params.empresa} - ${new Date().toLocaleDateString("pt-BR")}`;

  const fila = await enviarListaParaConferencia({
    empresa: params.empresa,
    flag: "loja",
    pessoa: params.pessoa,
    titulo,
    totalItens: itensValidos.length,
    dataCriacao,
    conferenceId,
    produtos: itensValidos.map((item) => ({
      barcode: item.codigo,
      sku: item.sku ?? "",
      quantidade: toInt(item.qtdDesejada),
      removeTag: false,
      secao: item.secao ?? undefined,
      photo: item.fotoUrl,
    })),
  });

  if (!fila?.pedidoId) {
    throw new Error("Nao foi possivel gerar a lista de conferencia.");
  }

  await removerSugestaoCdItens(itensValidos.map((item) => item.id));
  return { pedidoId: fila.pedidoId, conferenceId: fila.conferenceId, totalItens: itensValidos.length };
}

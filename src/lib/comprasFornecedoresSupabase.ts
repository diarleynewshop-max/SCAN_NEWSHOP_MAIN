import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type Empresa = "NEWSHOP" | "SOYE" | "FACIL";
type EmpresaCompras = "NEWSHOP" | "SF";

export interface FornecedorCacheItem {
  id: string;
  empresa: EmpresaCompras;
  produtoKey: string;
  codigo: string;
  sku: string | null;
  produtoErpId: string | null;
  fornecedorId: string;
  fornecedorNome: string | null;
  fornecedorFantasia: string | null;
  fornecedorDocumento: string | null;
  principal: boolean;
  placeholder: boolean;
  syncedAt: string | null;
}

export interface MarcaFornecedor {
  id: string;
  empresa: EmpresaCompras;
  nome: string;
  slug: string;
}

export interface MarcaFornecedorVinculo {
  id: string;
  marcaId: string;
  marcaNome: string;
  fornecedorId: string;
  fornecedorNome: string | null;
  fornecedorDocumento: string | null;
  alias: string | null;
}

export interface FornecedorProdutoSyncInput {
  fornecedorId: string;
  nome: string;
  fantasia?: string | null;
  documento?: string | null;
  principal?: boolean;
}

type FornecedorCacheRow = {
  id: string;
  empresa: EmpresaCompras;
  produto_key: string;
  codigo: string;
  sku: string | null;
  produto_erp_id: string | null;
  fornecedor_id: string;
  fornecedor_nome: string | null;
  fornecedor_fantasia: string | null;
  fornecedor_documento: string | null;
  principal: boolean | null;
  placeholder: boolean | null;
  synced_at: string | null;
};

type MarcaFornecedorRow = {
  id: string;
  empresa: EmpresaCompras;
  nome: string;
  slug: string;
};

type MarcaFornecedorVinculoRow = {
  id: string;
  marca_id: string;
  fornecedor_id: string;
  fornecedor_nome: string | null;
  fornecedor_documento: string | null;
  alias: string | null;
};

function empresaCompras(empresa: Empresa | string): EmpresaCompras {
  const valor = String(empresa ?? "").toUpperCase();
  return valor.includes("SOYE") || valor.includes("FACIL") || valor === "SF" ? "SF" : "NEWSHOP";
}

function slugMarca(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapFornecedorCache(row: FornecedorCacheRow): FornecedorCacheItem {
  return {
    id: row.id,
    empresa: row.empresa,
    produtoKey: row.produto_key,
    codigo: row.codigo,
    sku: row.sku,
    produtoErpId: row.produto_erp_id,
    fornecedorId: row.fornecedor_id,
    fornecedorNome: row.fornecedor_nome,
    fornecedorFantasia: row.fornecedor_fantasia,
    fornecedorDocumento: row.fornecedor_documento,
    principal: Boolean(row.principal),
    placeholder: Boolean(row.placeholder),
    syncedAt: row.synced_at,
  };
}

export async function listarFornecedoresCacheCompras(empresa: Empresa | string): Promise<FornecedorCacheItem[]> {
  if (!isSupabaseConfigured) return [];
  const emp = empresaCompras(empresa);
  const { data, error } = await supabase
    .from("compras_produto_fornecedores")
    .select("*")
    .eq("empresa", emp)
    .order("principal", { ascending: false })
    .order("fornecedor_nome", { ascending: true });
  if (error) throw error;
  return ((data as FornecedorCacheRow[] | null) ?? []).map(mapFornecedorCache);
}

export async function sincronizarFornecedoresProdutoCompras(params: {
  empresa: Empresa | string;
  produtoKey: string;
  codigo: string;
  sku?: string | null;
  produtoErpId?: string | null;
  fornecedores: FornecedorProdutoSyncInput[];
}): Promise<FornecedorCacheItem[]> {
  if (!isSupabaseConfigured) return [];

  const emp = empresaCompras(params.empresa);
  const key = String(params.produtoKey ?? "").trim();
  if (!key) throw new Error("produtoKey obrigatorio.");

  const { error: deleteError } = await supabase
    .from("compras_produto_fornecedores")
    .delete()
    .eq("empresa", emp)
    .eq("produto_key", key);
  if (deleteError) throw deleteError;

  const base = {
    empresa: emp,
    produto_key: key,
    codigo: String(params.codigo ?? "").trim(),
    sku: String(params.sku ?? "").trim() || null,
    produto_erp_id: String(params.produtoErpId ?? "").trim() || null,
    synced_at: new Date().toISOString(),
  };

  const rows = params.fornecedores.length > 0
    ? params.fornecedores.map((fornecedor) => ({
        ...base,
        fornecedor_id: String(fornecedor.fornecedorId ?? "").trim(),
        fornecedor_nome: String(fornecedor.nome ?? "").trim() || null,
        fornecedor_fantasia: String(fornecedor.fantasia ?? "").trim() || null,
        fornecedor_documento: String(fornecedor.documento ?? "").trim() || null,
        principal: Boolean(fornecedor.principal),
        placeholder: false,
      }))
    : [{
        ...base,
        fornecedor_id: "SEM_FORNECEDOR",
        fornecedor_nome: "Sem fornecedor cadastrado",
        fornecedor_fantasia: null,
        fornecedor_documento: null,
        principal: false,
        placeholder: true,
      }];

  const { data, error } = await supabase
    .from("compras_produto_fornecedores")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return ((data as FornecedorCacheRow[] | null) ?? []).map(mapFornecedorCache);
}

export async function listarMarcasFornecedorCompras(empresa: Empresa | string): Promise<MarcaFornecedor[]> {
  if (!isSupabaseConfigured) return [];
  const emp = empresaCompras(empresa);
  const { data, error } = await supabase
    .from("compras_marcas")
    .select("*")
    .eq("empresa", emp)
    .order("nome", { ascending: true });
  if (error) throw error;
  return ((data as MarcaFornecedorRow[] | null) ?? []).map((row) => ({
    id: row.id,
    empresa: row.empresa,
    nome: row.nome,
    slug: row.slug,
  }));
}

export async function criarMarcaFornecedorCompras(empresa: Empresa | string, nome: string): Promise<MarcaFornecedor> {
  if (!isSupabaseConfigured) throw new Error("Supabase nao configurado.");
  const nomeLimpo = String(nome ?? "").trim();
  if (!nomeLimpo) throw new Error("Nome da marca obrigatorio.");
  const payload = {
    empresa: empresaCompras(empresa),
    nome: nomeLimpo,
    slug: slugMarca(nomeLimpo),
  };
  const { data, error } = await supabase.from("compras_marcas").upsert(payload, { onConflict: "empresa,slug" }).select("*").single();
  if (error) throw error;
  const row = data as MarcaFornecedorRow;
  return { id: row.id, empresa: row.empresa, nome: row.nome, slug: row.slug };
}

export async function listarVinculosMarcaFornecedorCompras(
  empresa: Empresa | string
): Promise<MarcaFornecedorVinculo[]> {
  if (!isSupabaseConfigured) return [];
  const marcas = await listarMarcasFornecedorCompras(empresa);
  if (marcas.length === 0) return [];

  const marcaPorId = new Map(marcas.map((marca) => [marca.id, marca]));
  const { data, error } = await supabase
    .from("compras_marca_fornecedores")
    .select("*")
    .in("marca_id", marcas.map((marca) => marca.id))
    .order("fornecedor_nome", { ascending: true });
  if (error) throw error;

  return ((data as MarcaFornecedorVinculoRow[] | null) ?? [])
    .map((row) => {
      const marca = marcaPorId.get(row.marca_id);
      if (!marca) return null;
      return {
        id: row.id,
        marcaId: row.marca_id,
        marcaNome: marca.nome,
        fornecedorId: row.fornecedor_id,
        fornecedorNome: row.fornecedor_nome,
        fornecedorDocumento: row.fornecedor_documento,
        alias: row.alias,
      } satisfies MarcaFornecedorVinculo;
    })
    .filter((item): item is MarcaFornecedorVinculo => Boolean(item));
}

export async function vincularFornecedorMarcaCompras(params: {
  marcaId: string;
  fornecedorId: string;
  fornecedorNome?: string | null;
  fornecedorDocumento?: string | null;
  alias?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase nao configurado.");
  const { error } = await supabase.from("compras_marca_fornecedores").upsert({
    marca_id: params.marcaId,
    fornecedor_id: String(params.fornecedorId ?? "").trim(),
    fornecedor_nome: String(params.fornecedorNome ?? "").trim() || null,
    fornecedor_documento: String(params.fornecedorDocumento ?? "").trim() || null,
    alias: String(params.alias ?? "").trim() || null,
  }, { onConflict: "marca_id,fornecedor_id" });
  if (error) throw error;
}

export async function removerVinculoMarcaFornecedorCompras(vinculoId: string): Promise<void> {
  if (!isSupabaseConfigured || !vinculoId) return;
  const { error } = await supabase.from("compras_marca_fornecedores").delete().eq("id", vinculoId);
  if (error) throw error;
}

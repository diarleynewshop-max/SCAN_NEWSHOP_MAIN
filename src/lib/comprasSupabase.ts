// Camada de dados de Compras no Supabase (piloto de migracao do ClickUp).
// Durante a transicao (dual-write), o ClickUp continua sendo a fonte de verdade e
// o `id` do produto na UI segue sendo o ID da task do ClickUp. Aqui so espelhamos
// e, no futuro, passamos a LER daqui (com realtime). Nada aqui derruba a UI: os
// chamadores tratam os erros como "melhor esforco".
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { ProdutoComprar, CompraStatusApp } from '@/hooks/useProdutosComprar';

type Empresa = 'NEWSHOP' | 'SOYE' | 'FACIL';

// No dominio de Compras, Soye e Facil sao a MESMA empresa (SF): mesmo preco e
// mesmo setor de compras. Por isso a tabela `compras` usa 'NEWSHOP' e 'SF'.
type EmpresaCompras = 'NEWSHOP' | 'SF';
function empresaCompras(empresa: Empresa): EmpresaCompras {
  return empresa === 'NEWSHOP' ? 'NEWSHOP' : 'SF';
}

function normalizar(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

// Mesma regra de chave do dedup em useProdutosComprar (COD:<numerico> | SKU:<sku>).
export function produtoKey(codigo: string, sku: string | null | undefined): string {
  const cod = normalizar(codigo);
  const numerico = cod.match(/\d{6,14}/)?.[0];
  if (numerico) return `COD:${numerico}`;
  const s = normalizar(sku);
  if (s) return `SKU:${s}`;
  // Sem codigo numerico nem SKU nao e produto real (ex.: tasks agregadas do
  // ClickUp). Retorna vazio para NAO gravar/espelhar lixo no Supabase.
  return '';
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
  clickup_task_id: string | null;
  created_at: string | null;
}

function rowToProduto(row: CompraRow): ProdutoComprar {
  return {
    // Na leitura via Supabase, o id do produto e o UUID da linha (identificador
    // estavel do banco). As acoes de status atualizam por esse id.
    id: row.id,
    codigo: row.codigo,
    sku: row.sku,
    descricao: row.descricao ?? '',
    foto: row.foto_url,
    status: row.status,
    date_created: row.created_at ? String(new Date(row.created_at).getTime()) : '',
    vezesPedido: row.vezes_pedido ?? 1,
    secao: row.secao ?? null,
  };
}

// Le os itens de compra do Supabase (usado quando a leitura for migrada).
export async function fetchComprasSupabase(empresa: Empresa): Promise<ProdutoComprar[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('compras')
    .select('*')
    .eq('empresa', empresaCompras(empresa));
  if (error) throw error;
  return (data as CompraRow[] | null ?? []).map(rowToProduto);
}

// Espelha no Supabase os produtos ja deduplicados vindos do ClickUp (dual-write).
// Upsert por (empresa, produto_key): re-importar nao duplica, so atualiza.
export async function upsertComprasFromClickup(
  produtos: ProdutoComprar[],
  empresa: Empresa
): Promise<void> {
  if (!isSupabaseConfigured || produtos.length === 0) return;
  const emp = empresaCompras(empresa);
  const rows = produtos
    .map((p) => ({
      empresa: emp,
      produto_key: produtoKey(p.codigo, p.sku),
      codigo: p.codigo,
      sku: p.sku,
      descricao: p.descricao,
      status: p.status,
      vezes_pedido: p.vezesPedido ?? 1,
      clickup_task_id: p.id,
    }))
    .filter((r) => r.produto_key);
  if (rows.length === 0) return;
  // Envia em lotes para nao mandar payloads gigantes numa requisicao so.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('compras')
      .upsert(chunk, { onConflict: 'empresa,produto_key' });
    if (error) throw error;
  }
}

// Atualiza o status de um item pelo UUID da linha no Supabase (usado quando a
// tela de Compras esta lendo direto do Supabase).
export async function atualizarStatusPorId(
  id: string,
  status: CompraStatusApp
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('compras').update({ status }).eq('id', id);
  if (error) throw error;
}

// Persiste a secao (vinda do ERP) na linha, pelo UUID — usado no modo Supabase.
export async function atualizarSecaoPorId(id: string, secao: string): Promise<void> {
  if (!isSupabaseConfigured || !secao) return;
  const { error } = await supabase.from('compras').update({ secao }).eq('id', id);
  if (error) throw error;
}

// Persiste a secao pela task do ClickUp — usado no modo ClickUp (popula o banco
// para leituras futuras no modo Supabase). So grava onde ainda esta vazio.
export async function atualizarSecaoPorClickup(
  empresa: Empresa,
  clickupTaskId: string,
  secao: string
): Promise<void> {
  if (!isSupabaseConfigured || !secao) return;
  const { error } = await supabase
    .from('compras')
    .update({ secao })
    .eq('empresa', empresaCompras(empresa))
    .eq('clickup_task_id', clickupTaskId)
    .is('secao', null);
  if (error) throw error;
}

// Assina mudancas em tempo real da tabela compras (por empresa).
export function subscribeComprasSupabase(
  empresa: Empresa,
  onChange: () => void
): () => void {
  if (!isSupabaseConfigured) return () => {};
  const emp = empresaCompras(empresa);
  const channel = supabase
    .channel(`compras:${emp}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'compras', filter: `empresa=eq.${emp}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

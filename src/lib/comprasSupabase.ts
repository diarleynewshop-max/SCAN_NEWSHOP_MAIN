// Camada de dados de Compras no Supabase.
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

function isDescricaoCompraReal(descricao: string | null | undefined, codigo: string | null | undefined): boolean {
  const desc = String(descricao ?? '').trim();
  if (!desc) return false;

  const cod = String(codigo ?? '').trim();
  const codigoNumerico = cod.match(/\d{6,14}/)?.[0] ?? '';
  const descNormalizada = normalizar(desc);

  if (desc === cod || desc === codigoNumerico) return false;
  if (/^\d{6,14}$/.test(desc)) return false;
  if (desc.includes('\u{1F6D2}')) return false;
  if (codigoNumerico && desc.includes(codigoNumerico)) return false;
  if (descNormalizada.includes('CARLOS')) return false;
  if (/\s[\u2014-]\s/.test(desc) && /\d{6,14}/.test(desc)) return false;

  return true;
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
  pedido_feito: number | null;
  created_at: string | null;
}

function rowToProduto(row: CompraRow): ProdutoComprar {
  const pedidoFeito = row.pedido_feito === 1;
  const status = pedidoFeito && row.status !== 'compra_realizada' && row.status !== 'concluido'
    ? 'pedido_andamento'
    : row.status;

  return {
    // Na leitura via Supabase, o id do produto e o UUID da linha (identificador
    // estavel do banco). As acoes de status atualizam por esse id.
    id: row.id,
    codigo: row.codigo,
    sku: row.sku,
    descricao: row.descricao ?? '',
    foto: row.foto_url,
    status,
    date_created: row.created_at ? String(new Date(row.created_at).getTime()) : '',
    vezesPedido: row.vezes_pedido ?? 1,
    secao: row.secao ?? null,
    pedidoFeito,
  };
}

// Le os itens de compra do Supabase.
export async function fetchComprasSupabase(empresa: Empresa): Promise<ProdutoComprar[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('compras')
    .select('*')
    .eq('empresa', empresaCompras(empresa));
  if (error) throw error;
  return (data as CompraRow[] | null ?? []).map(rowToProduto);
}

// ── Enriquecimento de itens (foto + info de Compras) ─────────────────────────
// Cruza itens de um pedido com o catalogo por `produto_key`: a tabela `compras`
// traz vezes_pedido/status/foto (produtos que foram para compra) e `produtos`
// completa foto/descricao dos demais. Usado em Meus Pedidos (fotos nao migraram
// para pedido_itens) e no modal de detalhe do item.
export interface CatalogoItemInfo {
  fotoUrl: string | null;
  descricao: string | null;
  secao: string | null;
  vezesPedido: number | null;
  statusCompra: CompraStatusApp | null;
}

function empresaComprasDeString(empresa: string): EmpresaCompras {
  const e = String(empresa ?? '').toUpperCase();
  return e.includes('SOYE') || e.includes('FACIL') ? 'SF' : 'NEWSHOP';
}

export async function buscarCatalogoItens(
  empresa: string,
  produtoKeys: string[]
): Promise<Map<string, CatalogoItemInfo>> {
  const mapa = new Map<string, CatalogoItemInfo>();
  if (!isSupabaseConfigured) return mapa;

  const chaves = [...new Set((produtoKeys ?? []).filter(Boolean))];
  if (chaves.length === 0) return mapa;

  const emp = empresaComprasDeString(empresa);

  try {
    const { data: compras, error } = await supabase
      .from('compras')
      .select('produto_key,descricao,secao,status,vezes_pedido,foto_url')
      .eq('empresa', emp)
      .in('produto_key', chaves);
    if (error) throw error;
    for (const r of (compras ?? []) as CompraRow[]) {
      mapa.set(r.produto_key, {
        fotoUrl: r.foto_url ?? null,
        descricao: r.descricao ?? null,
        secao: r.secao ?? null,
        vezesPedido: r.vezes_pedido ?? null,
        statusCompra: r.status ?? null,
      });
    }
  } catch (error) {
    console.warn('[comprasSupabase] buscarCatalogoItens: falha ao ler compras (best-effort):', error);
  }

  // Completa com o catalogo global `produtos` (foto/descricao) onde faltou.
  const faltam = chaves.filter((k) => !mapa.get(k)?.fotoUrl);
  if (faltam.length > 0) {
    try {
      const { data: produtos, error } = await supabase
        .from('produtos')
        .select('produto_key,descricao,secao,foto_url')
        .in('produto_key', faltam);
      if (error) throw error;
      for (const r of (produtos ?? []) as Array<{ produto_key: string; descricao: string | null; secao: string | null; foto_url: string | null }>) {
        const atual = mapa.get(r.produto_key);
        if (atual) {
          if (!atual.fotoUrl) atual.fotoUrl = r.foto_url ?? null;
          if (!atual.descricao) atual.descricao = r.descricao ?? null;
          if (!atual.secao) atual.secao = r.secao ?? null;
        } else {
          mapa.set(r.produto_key, {
            fotoUrl: r.foto_url ?? null,
            descricao: r.descricao ?? null,
            secao: r.secao ?? null,
            vezesPedido: null,
            statusCompra: null,
          });
        }
      }
    } catch (error) {
      console.warn('[comprasSupabase] buscarCatalogoItens: falha ao ler produtos (best-effort):', error);
    }
  }

  return mapa;
}

// Espelha no Supabase os produtos ja deduplicados vindos do ClickUp (dual-write).
// Upsert por (empresa, produto_key): re-importar nao duplica, so atualiza.
// Atualiza o status de um item pelo UUID da linha no Supabase.
export async function atualizarStatusPorId(
  id: string,
  status: CompraStatusApp
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('compras').update({ status }).eq('id', id);
  if (error) throw error;
}

// Exclui diretamente do Supabase. Esta acao administrativa nao depende de
// localizar ou validar o produto no ERP.
export async function excluirCompraPorId(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('compras')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Item nao encontrado no Supabase para excluir');
}

// Marca "pedido feito" (equivale a gerar o PDF do pedido ao fornecedor). Grava
// pedido_feito = 1; o trigger no banco move o item para 'pedido_andamento'
// automaticamente.
export async function marcarPedidoFeitoPorId(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('compras')
    .update({ pedido_feito: 1 })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Item nao encontrado no Supabase para marcar pedido feito');
}

// Persiste a secao (vinda do ERP) na linha.
export async function atualizarSecaoPorId(id: string, secao: string): Promise<void> {
  if (!isSupabaseConfigured || !secao) return;
  const { error } = await supabase.from('compras').update({ secao }).eq('id', id);
  if (error) throw error;
}

// Persiste a descricao (nome real vindo do ERP) na linha.
export async function atualizarDescricaoPorId(id: string, descricao: string): Promise<void> {
  if (!isSupabaseConfigured || !descricao) return;
  const { error } = await supabase.from('compras').update({ descricao }).eq('id', id);
  if (error) throw error;
}

// ── Fotos no Supabase Storage ────────────────────────────────────────────────
const FOTO_BUCKET = 'compras-fotos';

export function isFotoStorage(url: string | null | undefined): boolean {
  return Boolean(url && url.includes('/storage/v1/object/public/'));
}

function dataUrlParaBlob(dataUrl: string): { blob: Blob; contentType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const contentType = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

function nomeArquivoFoto(emp: EmpresaCompras, codigo: string, sku: string | null): string {
  const key = produtoKey(codigo, sku) || String(codigo ?? '');
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${emp}/${safe}.jpg`;
}

// Sobe a foto (data URL do ERP) no Storage e grava a URL publica em compras.foto_url.
export async function persistirFotoCompra(params: {
  produtoId: string;
  empresa: Empresa;
  codigo: string;
  sku: string | null;
  dataUrl: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured || !params.dataUrl) return null;
  const conv = dataUrlParaBlob(params.dataUrl);
  if (!conv) return null;

  const emp = empresaCompras(params.empresa);
  const path = nomeArquivoFoto(emp, params.codigo, params.sku);

  const up = await supabase.storage.from(FOTO_BUCKET).upload(path, conv.blob, {
    contentType: conv.contentType,
    upsert: true,
  });
  if (up.error) throw up.error;

  const url = supabase.storage.from(FOTO_BUCKET).getPublicUrl(path).data.publicUrl;

  const query = supabase.from('compras').update({ foto_url: url });
  const { error } = await query.eq('id', params.produtoId);
  if (error) throw error;

  return url;
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

import { isSupabaseConfigured, supabase } from './supabaseClient';
import { produtoKey } from './comprasSupabase';

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;
const STORAGE_URL_MARKER = '/storage/v1/object/public/';
const ERP_FOTO_SYNC_TASK_ID = 'erp-foto-sync';
const EXPEDICAO_SYNC_TASK_ID = 'expedicao-sync';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';
export type FlagKey = 'loja' | 'cd';

interface PedidoFilaRow {
  id: string;
  titulo: string | null;
  listeiro: string | null;
  pessoa: string | null;
  status: string;
  observacao: string | null;
  created_at: string | null;
  clickup_task_id: string | null;
}

interface MeuPedidoRow {
  id: string;
  titulo: string | null;
  pessoa: string | null;
  listeiro: string | null;
  conferente: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  data_conferencia: string | null;
  total_itens: number | null;
  resumo_separado: number | null;
  resumo_nao_tem: number | null;
  resumo_parcial: number | null;
  resumo_pendente: number | null;
}

interface PedidoFilaItemRow {
  id: string;
  pedido_id: string;
  codigo: string;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  quantidade_pedida: number | null;
  quantidade_real: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
  foto_url: string | null;
  ordem: number | null;
}

interface PedidoBaseResumoRow {
  id: string;
  titulo: string | null;
  status: string;
  observacao: string | null;
  created_at: string | null;
  updated_at: string | null;
  data_conferencia: string | null;
  concluido_at: string | null;
}

interface PedidoItemHistoricoRow {
  id: string;
  pedido_id: string;
  codigo: string;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  quantidade_pedida: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
  foto_url: string | null;
}

export interface PedidoParaConferencia {
  id: string;
  name: string;
  listeiro: string;
  date_created: string;
  emAndamento: boolean;
  clickupTaskId: string | null;
  undoMergeDisponivel?: boolean;
  description?: string;
  attachments?: any[];
}

interface PedidoMergeUndoMeta {
  version: 1;
  mergedAt: string;
  target: {
    id: string;
    titulo: string | null;
    pessoa: string | null;
    listeiro: string | null;
    status: string;
    created_at: string | null;
  };
  sources: Array<{
    id: string;
    titulo: string | null;
    pessoa: string | null;
    listeiro: string | null;
    status: string;
    created_at: string | null;
    itemIds: string[];
  }>;
}

export interface PedidoFilaItem {
  id: string;
  pedidoId: string;
  codigo: string;
  sku: string;
  descricao: string;
  secao: string | null;
  quantidadePedida: number;
  quantidadeReal: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
  photo: string | null;
  ordem: number;
}

export interface MeuPedidoResumo {
  id: string;
  titulo: string;
  pessoa: string;
  listeiro: string;
  conferente: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  dataConferencia: string | null;
  totalItens: number;
  resumoSeparado: number;
  resumoNaoTem: number;
  resumoParcial: number;
  resumoPendente: number;
}

export interface PendenteConsolidado {
  produtoKey: string;
  codigo: string;
  sku: string;
  descricao: string;
  secao: string | null;
  photo: string | null;
  quantidadePendente: number;
  ocorrencias: number;
  ultimaData: string | null;
  pedidoTitulos: string[];
}

export interface AnalisePendentesResult {
  pedidosPendentes: number;
  itensPendentes: number;
  itensRemovidos: number;
  produtosResolvidos: number;
  pedidosExcluidos: number;
  periodoInicio: string | null;
  periodoFim: string | null;
}

export interface ListarPedidosFiltro {
  empresa: string;
  flag: string;
  pessoa?: string;          // match EXATO (usado por listarMeusPedidos)
  pessoaBusca?: string;     // match PARCIAL (ilike) — filtro da tela
  status?: string;          // ex.: 'concluido' para so os finalizados
  dataInicio?: string;
  dataFim?: string;
  produtoBusca?: string;
}

export interface FecharConferenciaItemPayload {
  codigo: string;
  sku?: string | null;
  secao?: string | null;
  quantidadePedida: number;
  quantidadeReal: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente' | 'aguardando';
  photo?: string | null;
}

export interface FecharConferenciaPayload {
  empresa: string;
  conferente: string;
  tempoSegundos?: number | null;
  itens: FecharConferenciaItemPayload[];
}

export interface PedidoFilaProduto {
  barcode: string;
  sku: string;
  quantidade: number;
  removeTag: boolean;
  secao?: string | null;
  photo: string | null;
  description?: string;
  erpProdutoId?: string;
  appPhotoWithoutErp?: boolean;
}

export interface EnviarListaParaConferenciaPayload {
  flag: string;
  empresa: string;
  pessoa: string;
  titulo: string;
  totalItens: number;
  dataCriacao: string;
  conferenceId?: string;
  produtos: PedidoFilaProduto[];
}

export interface EnviarListaParaConferenciaResult {
  pedidoId: string;
  conferenceId: string;
  created: boolean;
}

function normalizarEmpresa(value: unknown): EmpresaKey {
  const empresa = String(value ?? 'NEWSHOP').trim().toUpperCase();
  if (empresa.includes('SOYE')) return 'SOYE';
  if (empresa.includes('FACIL')) return 'FACIL';
  return 'NEWSHOP';
}

function normalizarFlag(value: unknown): FlagKey {
  return String(value ?? 'loja').trim().toLowerCase() === 'cd' ? 'cd' : 'loja';
}

const MERGE_UNDO_PREFIX = 'mergeUndo=';

function splitObservacaoTokens(value: string | null | undefined): string[] {
  return String(value ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function encodeMergeUndoMeta(meta: PedidoMergeUndoMeta): string {
  return `${MERGE_UNDO_PREFIX}${JSON.stringify(meta)}`;
}

function extrairMergeUndoMeta(observacao: string | null | undefined): PedidoMergeUndoMeta | null {
  const token = splitObservacaoTokens(observacao).find((part) => part.startsWith(MERGE_UNDO_PREFIX));
  if (!token) return null;
  const raw = token.slice(MERGE_UNDO_PREFIX.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PedidoMergeUndoMeta;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sources) || !parsed.target?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function upsertMergeUndoMetaInObservacao(
  observacao: string | null | undefined,
  meta: PedidoMergeUndoMeta
): string {
  const semMerge = splitObservacaoTokens(observacao).filter((part) => !part.startsWith(MERGE_UNDO_PREFIX));
  return [...semMerge, encodeMergeUndoMeta(meta)].join(' | ');
}

function removerMergeUndoMetaDaObservacao(observacao: string | null | undefined): string | null {
  const semMerge = splitObservacaoTokens(observacao).filter((part) => !part.startsWith(MERGE_UNDO_PREFIX));
  return semMerge.length > 0 ? semMerge.join(' | ') : null;
}

function isStorageUrl(value: string | null | undefined): boolean {
  return Boolean(value && value.includes(STORAGE_URL_MARKER));
}

function isFotoBase64(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith('data:image/'));
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

const FOTO_CONFERENCIA_BUCKET = 'compras-fotos';

// Sobe a foto tirada no app (data URL) pro Storage e devolve a URL publica.
// Best-effort: se falhar, loga e devolve null (o item so fica sem foto, nao
// derruba o envio/fechamento da conferencia).
async function uploadFotoConferencia(empresa: EmpresaKey, codigo: string, photo: string): Promise<string | null> {
  const conv = dataUrlParaBlob(photo);
  if (!conv) return null;

  const safeCodigo = String(codigo ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '_') || 'sem-codigo';
  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `conferencia/${empresa}/${safeCodigo}-${sufixo}.jpg`;

  try {
    const up = await supabase.storage.from(FOTO_CONFERENCIA_BUCKET).upload(path, conv.blob, {
      contentType: conv.contentType,
      upsert: true,
    });
    if (up.error) throw up.error;
    return supabase.storage.from(FOTO_CONFERENCIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.warn('[pedidosFila] Falha ao subir foto pro Storage (item fica sem foto):', codigo, error);
    return null;
  }
}

// Resolve a foto de um item pra uma URL de Storage: se ja for URL, usa direto;
// se for base64 (foto tirada agora no app), sobe pro Storage; senao, null.
async function resolverFotoParaStorage(
  empresa: EmpresaKey,
  codigo: string,
  photo: string | null | undefined
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  if (isStorageUrl(photo)) return photo as string;
  if (isFotoBase64(photo)) return uploadFotoConferencia(empresa, codigo, photo as string);
  return null;
}

async function resolverFotosEmLote<T>(
  empresa: EmpresaKey,
  itens: T[],
  getCodigo: (item: T) => string,
  getFoto: (item: T) => string | null | undefined
): Promise<Array<string | null>> {
  return Promise.all(itens.map((item) => resolverFotoParaStorage(empresa, getCodigo(item), getFoto(item))));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function toInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function formatDateKeySaoPaulo(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function getPedidoDiaReferencia(row: PedidoBaseResumoRow): string | null {
  const conferencia = String(row.data_conferencia ?? '').trim();
  if (conferencia) return conferencia;
  const createdAt = String(row.created_at ?? '').trim();
  if (!createdAt) return null;
  return formatDateKeySaoPaulo(createdAt);
}

function parseDateOnlyToMs(value: string): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = new Date(`${text}T23:59:59-03:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function parseDateTimeToMs(value: string | null | undefined): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = new Date(text).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getPedidoMomentoPendenteMs(row: PedidoBaseResumoRow): number | null {
  const createdMs = parseDateTimeToMs(row.created_at);
  if (createdMs != null) return createdMs;
  const dia = getPedidoDiaReferencia(row);
  return dia ? parseDateOnlyToMs(dia) : null;
}

function getPedidoMomentoResolvidoMs(row: PedidoBaseResumoRow): number | null {
  const concluidoMs = parseDateTimeToMs(row.concluido_at);
  if (concluidoMs != null) return concluidoMs;
  const updatedMs = parseDateTimeToMs(row.updated_at);
  if (updatedMs != null) return updatedMs;
  const dia = String(row.data_conferencia ?? '').trim();
  if (dia) return parseDateOnlyToMs(dia);
  return parseDateTimeToMs(row.created_at);
}

function isPedidoPendenteAberto(row: PedidoBaseResumoRow): boolean {
  if (row.status !== 'analisado') return false;

  const observacao = String(row.observacao ?? '').toLowerCase();
  if (observacao.includes('origem=pendentes-conferencia')) return true;

  const titulo = String(row.titulo ?? '').toUpperCase();
  return titulo.includes('PENDENTES');
}

function buildUltimoResolvidoConcluidoPorProduto(
  pedidosPorId: Map<string, PedidoBaseResumoRow>,
  itens: PedidoItemHistoricoRow[]
): Map<string, number> {
  const ultimoResolvidoPorProduto = new Map<string, number>();

  for (const item of itens) {
    if (item.status === 'pendente') continue;

    const pedido = pedidosPorId.get(item.pedido_id);
    if (!pedido || pedido.status !== 'concluido') continue;

    const key = produtoKey(item.codigo, item.sku);
    if (!key) continue;

    const momento = getPedidoMomentoResolvidoMs(pedido);
    if (momento == null) continue;

    const anterior = ultimoResolvidoPorProduto.get(key);
    if (anterior == null || momento > anterior) {
      ultimoResolvidoPorProduto.set(key, momento);
    }
  }

  return ultimoResolvidoPorProduto;
}

async function fetchPedidosResumoAll(
  empresa: string,
  flag: string
): Promise<PedidoBaseResumoRow[]> {
  const acc: PedidoBaseResumoRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id,titulo,status,observacao,created_at,updated_at,data_conferencia,concluido_at')
      .eq('empresa', normalizarEmpresa(empresa))
      .eq('flag', normalizarFlag(flag))
      .order('created_at', { ascending: false })
      .range(from, from + 999);

    if (error) throw error;

    const rows = (data ?? []) as PedidoBaseResumoRow[];
    acc.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }

  return acc;
}

async function fetchPedidoItensAll(pedidoIds: string[]): Promise<PedidoItemHistoricoRow[]> {
  if (pedidoIds.length === 0) return [];

  const acc: PedidoItemHistoricoRow[] = [];
  for (const ids of chunk(pedidoIds, 200)) {
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('pedido_itens')
        .select('id,pedido_id,codigo,sku,descricao,secao,quantidade_pedida,status,foto_url')
        .in('pedido_id', ids)
        .range(from, from + 999);

      if (error) throw error;

      const rows = (data ?? []) as PedidoItemHistoricoRow[];
      acc.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  return acc;
}

function resolveConferenceId(payload: EnviarListaParaConferenciaPayload): string {
  const explicit = String(payload.conferenceId ?? '').trim();
  if (explicit) return explicit;

  const key = [
    normalizarEmpresa(payload.empresa),
    normalizarFlag(payload.flag),
    String(payload.pessoa ?? '').trim(),
    String(payload.titulo ?? '').trim(),
    String(payload.dataCriacao ?? '').trim(),
  ].join('|');

  return `lista-${hashString(key)}`;
}

function buildProdutoCatalogoPayload(
  produtos: PedidoFilaProduto[],
  fotosResolvidas: Array<string | null>
): Array<Record<string, string | null>> {
  return produtos
    .map((produto, index) => ({
      codigo: String(produto.barcode ?? '').trim() || null,
      sku: String(produto.sku ?? '').trim() || null,
      descricao: String(produto.description ?? '').trim() || null,
      secao: String(produto.secao ?? '').trim() || null,
      foto_url: fotosResolvidas[index] ?? null,
    }))
    .filter((produto) => produto.codigo || produto.sku);
}

function toStatusConferencia(
  value: FecharConferenciaItemPayload['status']
): 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente' {
  if (value === 'separado' || value === 'nao_tem' || value === 'nao_tem_tudo' || value === 'pendente') {
    return value;
  }
  return 'pendente';
}

async function buildPedidoItemRows(
  empresa: EmpresaKey,
  pedidoId: string,
  itens: FecharConferenciaItemPayload[]
): Promise<Array<{
  pedido_id: string;
  codigo: string;
  sku: string | null;
  secao: string | null;
  quantidade_pedida: number;
  quantidade_real: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
  foto_url: string | null;
  ordem: number;
}>> {
  const fotosResolvidas = await resolverFotosEmLote(
    empresa,
    itens,
    (item) => String(item.codigo ?? '').trim(),
    (item) => item.photo
  );

  return itens
    .map((item, index) => ({
      pedido_id: pedidoId,
      codigo: String(item.codigo ?? '').trim(),
      sku: String(item.sku ?? '').trim() || null,
      secao: String(item.secao ?? '').trim() || null,
      quantidade_pedida: toInt(item.quantidadePedida),
      quantidade_real: item.quantidadeReal == null ? null : toInt(item.quantidadeReal),
      status: toStatusConferencia(item.status),
      foto_url: fotosResolvidas[index] ?? null,
      ordem: index + 1,
    }))
    .filter((item) => item.codigo);
}

export async function listarPedidosParaConferencia(
  empresa: string,
  flag: string
): Promise<PedidoParaConferencia[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('pedidos')
    .select('id,titulo,listeiro,pessoa,status,observacao,created_at,clickup_task_id')
    .eq('empresa', normalizarEmpresa(empresa))
    .eq('flag', normalizarFlag(flag))
    .in('status', ['analisado', 'em_andamento'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as PedidoFilaRow[]).map((pedido) => ({
    id: pedido.id,
    name: String(pedido.titulo ?? pedido.id).trim() || pedido.id,
    listeiro: String(pedido.listeiro ?? pedido.pessoa ?? '').trim(),
    date_created: pedido.created_at ? String(new Date(pedido.created_at).getTime()) : '',
    emAndamento: pedido.status === 'em_andamento',
    clickupTaskId: pedido.clickup_task_id ?? null,
    undoMergeDisponivel: Boolean(extrairMergeUndoMeta(pedido.observacao)),
  }));
}

function mapMeuPedido(row: MeuPedidoRow): MeuPedidoResumo {
  return {
    id: row.id,
    titulo: String(row.titulo ?? row.id).trim() || row.id,
    pessoa: String(row.pessoa ?? '').trim(),
    listeiro: String(row.listeiro ?? '').trim(),
    conferente: String(row.conferente ?? '').trim(),
    status: String(row.status ?? '').trim() || 'pendente',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    dataConferencia: row.data_conferencia ?? null,
    totalItens: toInt(row.total_itens),
    resumoSeparado: toInt(row.resumo_separado),
    resumoNaoTem: toInt(row.resumo_nao_tem),
    resumoParcial: toInt(row.resumo_parcial),
    resumoPendente: toInt(row.resumo_pendente),
  };
}

const MEU_PEDIDO_SELECT_COLUMNS = [
  'id',
  'titulo',
  'pessoa',
  'listeiro',
  'conferente',
  'status',
  'created_at',
  'updated_at',
  'data_conferencia',
  'total_itens',
  'resumo_separado',
  'resumo_nao_tem',
  'resumo_parcial',
  'resumo_pendente',
].join(',');

export async function listarPedidos(f: ListarPedidosFiltro): Promise<MeuPedidoResumo[]> {
  if (!isSupabaseConfigured) return [];

  // produtoBusca: primeiro acha os pedidos que tem algum item batendo a busca
  // (codigo/nome/sku/secao, parcial). Em .or() o curinga do ilike e '*'.
  let idsPorProduto: string[] | null = null;
  const produtoBusca = String(f.produtoBusca ?? '').trim();
  if (produtoBusca) {
    const like = `*${produtoBusca}*`;
    const { data: itens, error: errItens } = await supabase
      .from('pedido_itens')
      .select('pedido_id')
      .or(`codigo.ilike.${like},descricao.ilike.${like},sku.ilike.${like},secao.ilike.${like}`);
    if (errItens) throw errItens;
    idsPorProduto = [...new Set((itens ?? []).map((item: { pedido_id: string }) => item.pedido_id).filter(Boolean))];
    if (idsPorProduto.length === 0) return [];
  }

  const flagFiltro = normalizarFlag(f.flag);
  const pessoa = String(f.pessoa ?? '').trim();
  const pessoaBusca = String(f.pessoaBusca ?? '').trim();
  const status = String(f.status ?? '').trim();
  const dataInicio = String(f.dataInicio ?? '').trim();
  const dataFim = String(f.dataFim ?? '').trim();

  // Quem esta logado no CD tambem enxerga os pedidos da loja (o CD atende a loja).
  // Quem esta na loja continua vendo apenas os pedidos da loja.
  const buildQuery = () => {
    let q = supabase
      .from('pedidos')
      .select(MEU_PEDIDO_SELECT_COLUMNS)
      .eq('empresa', normalizarEmpresa(f.empresa))
      .order('created_at', { ascending: false });
    q = flagFiltro === 'cd' ? q.in('flag', ['cd', 'loja']) : q.eq('flag', flagFiltro);
    if (status) q = q.eq('status', status);
    if (pessoa) q = q.or(`pessoa.eq.${pessoa},listeiro.eq.${pessoa}`);
    if (pessoaBusca) q = q.or(`pessoa.ilike.*${pessoaBusca}*,listeiro.ilike.*${pessoaBusca}*`);
    if (dataInicio) q = q.gte('created_at', `${dataInicio}T00:00:00`);
    if (dataFim) q = q.lte('created_at', `${dataFim}T23:59:59`);
    if (idsPorProduto) q = q.in('id', idsPorProduto);
    return q;
  };

  // Pagina de 1000 em 1000 para trazer TODOS os pedidos que batem o filtro
  // (o "todos os concluidos" pode passar de 1000).
  const pageSize = 1000;
  const rows: MeuPedidoRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as MeuPedidoRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows.map(mapMeuPedido);
}

export async function listarMeusPedidos(
  empresa: string,
  flag: string,
  pessoa: string
): Promise<MeuPedidoResumo[]> {
  const pessoaNormalizada = String(pessoa ?? '').trim();
  if (!pessoaNormalizada) return [];

  return listarPedidos({
    empresa,
    flag,
    pessoa: pessoaNormalizada,
  });
}

export async function listarPendentesConsolidados(
  empresa: string,
  flag: string
): Promise<PendenteConsolidado[]> {
  if (!isSupabaseConfigured) return [];

  const pedidos = await fetchPedidosResumoAll(empresa, flag);
  if (pedidos.length === 0) return [];

  const pedidosPorId = new Map(pedidos.map((pedido) => [pedido.id, pedido] as const));
  const itens = await fetchPedidoItensAll(pedidos.map((pedido) => pedido.id));
  if (itens.length === 0) return [];

  const ultimoResolvidoPorProduto = buildUltimoResolvidoConcluidoPorProduto(pedidosPorId, itens);

  const agrupados = new Map<string, PendenteConsolidado>();

  for (const item of itens) {
    if (item.status !== 'pendente') continue;

    const key = produtoKey(item.codigo, item.sku);
    if (!key) continue;

    const pedido = pedidosPorId.get(item.pedido_id);
    if (!pedido) continue;

    if (!isPedidoPendenteAberto(pedido)) continue;

    const dia = getPedidoDiaReferencia(pedido);
    if (!dia) continue;

    const momentoPendente = getPedidoMomentoPendenteMs(pedido);
    if (momentoPendente == null) continue;

    const ultimoResolvido = ultimoResolvidoPorProduto.get(key);
    if (ultimoResolvido != null && ultimoResolvido > momentoPendente) continue;

    const existente = agrupados.get(key);
    if (existente) {
      existente.quantidadePendente += toInt(item.quantidade_pedida, 1);
      existente.ocorrencias += 1;
      if (!existente.descricao && item.descricao) existente.descricao = String(item.descricao).trim();
      if (!existente.secao && item.secao) existente.secao = item.secao;
      if (!existente.photo && item.foto_url) existente.photo = item.foto_url;
      if (dia > String(existente.ultimaData ?? '')) existente.ultimaData = dia;
      const titulo = String(pedido.titulo ?? '').trim();
      if (titulo && !existente.pedidoTitulos.includes(titulo)) {
        existente.pedidoTitulos.push(titulo);
      }
      continue;
    }

    agrupados.set(key, {
      produtoKey: key,
      codigo: String(item.codigo ?? '').trim(),
      sku: String(item.sku ?? '').trim(),
      descricao: String(item.descricao ?? '').trim() || String(item.codigo ?? '').trim(),
      secao: item.secao ?? null,
      photo: item.foto_url ?? null,
      quantidadePendente: toInt(item.quantidade_pedida, 1),
      ocorrencias: 1,
      ultimaData: dia,
      pedidoTitulos: String(pedido.titulo ?? '').trim() ? [String(pedido.titulo ?? '').trim()] : [],
    });
  }

  return [...agrupados.values()].sort((a, b) => {
    const dataA = a.ultimaData ?? '';
    const dataB = b.ultimaData ?? '';
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    if (a.quantidadePendente !== b.quantidadePendente) return b.quantidadePendente - a.quantidadePendente;
    return a.descricao.localeCompare(b.descricao, 'pt-BR');
  });
}

async function recalcularOuExcluirPedido(pedidoId: string): Promise<boolean> {
  const { count, error: countError } = await supabase
    .from('pedido_itens')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId);
  if (countError) throw countError;

  if ((count ?? 0) === 0) {
    const { error: deleteError } = await supabase.from('pedidos').delete().eq('id', pedidoId);
    if (deleteError) throw deleteError;
    return true;
  }

  const { error: rpcError } = await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: pedidoId });
  if (rpcError) throw rpcError;
  return false;
}

export async function analisarPendentesAbertos(
  empresa: string,
  flag: string
): Promise<AnalisePendentesResult> {
  if (!isSupabaseConfigured) {
    return {
      pedidosPendentes: 0,
      itensPendentes: 0,
      itensRemovidos: 0,
      produtosResolvidos: 0,
      pedidosExcluidos: 0,
      periodoInicio: null,
      periodoFim: null,
    };
  }

  const pedidos = await fetchPedidosResumoAll(empresa, flag);
  const pedidosPendentesAbertos = pedidos.filter(isPedidoPendenteAberto);

  if (pedidosPendentesAbertos.length === 0) {
    return {
      pedidosPendentes: 0,
      itensPendentes: 0,
      itensRemovidos: 0,
      produtosResolvidos: 0,
      pedidosExcluidos: 0,
      periodoInicio: null,
      periodoFim: null,
    };
  }

  const pedidosPorId = new Map(pedidos.map((pedido) => [pedido.id, pedido] as const));
  const itens = await fetchPedidoItensAll(pedidos.map((pedido) => pedido.id));
  const ultimoResolvidoPorProduto = buildUltimoResolvidoConcluidoPorProduto(pedidosPorId, itens);

  const datasPendentes = pedidosPendentesAbertos
    .map((pedido) => getPedidoDiaReferencia(pedido))
    .filter((value): value is string => Boolean(value))
    .sort();

  const itensPendentesAbertos = itens.filter((item) => {
    if (item.status !== 'pendente') return false;
    const pedido = pedidosPorId.get(item.pedido_id);
    return Boolean(pedido && isPedidoPendenteAberto(pedido));
  });

  const itemIdsParaExcluir: string[] = [];
  const pedidoIdsAfetados = new Set<string>();
  const produtosResolvidos = new Set<string>();

  for (const item of itensPendentesAbertos) {
    const key = produtoKey(item.codigo, item.sku);
    if (!key) continue;

    const pedido = pedidosPorId.get(item.pedido_id);
    if (!pedido) continue;

    const momentoPendente = getPedidoMomentoPendenteMs(pedido);
    if (momentoPendente == null) continue;

    const ultimoResolvido = ultimoResolvidoPorProduto.get(key);
    if (ultimoResolvido == null || ultimoResolvido <= momentoPendente) continue;

    itemIdsParaExcluir.push(item.id);
    pedidoIdsAfetados.add(item.pedido_id);
    produtosResolvidos.add(key);
  }

  for (const ids of chunk(itemIdsParaExcluir, 200)) {
    const { error } = await supabase.from('pedido_itens').delete().in('id', ids);
    if (error) throw error;
  }

  let pedidosExcluidos = 0;
  for (const pedidoId of pedidoIdsAfetados) {
    const excluido = await recalcularOuExcluirPedido(pedidoId);
    if (excluido) pedidosExcluidos += 1;
  }

  return {
    pedidosPendentes: pedidosPendentesAbertos.length,
    itensPendentes: itensPendentesAbertos.length,
    itensRemovidos: itemIdsParaExcluir.length,
    produtosResolvidos: produtosResolvidos.size,
    pedidosExcluidos,
    periodoInicio: datasPendentes[0] ?? null,
    periodoFim: datasPendentes[datasPendentes.length - 1] ?? null,
  };
}

export async function juntarPedidosPendentesAbertos(
  empresa: string,
  flag: string
): Promise<{ pedidoId: string; totalItens: number; juntados: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase nao configurado.');

  const pedidos = await fetchPedidosResumoAll(empresa, flag);
  const ids = pedidos.filter(isPedidoPendenteAberto).map((pedido) => pedido.id);

  if (ids.length < 2) {
    throw new Error('Nao ha ao menos 2 pedidos pendentes em aberto para juntar.');
  }

  return juntarPedidos(ids);
}

export async function reservarPedido(
  pedidoId: string,
  pessoa: string,
  forcar = false
): Promise<void> {
  if (!isSupabaseConfigured || !pedidoId) return;

  const { data, error } = await supabase.rpc('reservar_pedido_conferencia', {
    p_pedido_id: pedidoId,
    p_pessoa: String(pessoa ?? '').trim() || 'Sem conferente',
    p_forcar: forcar,
  });

  if (error) throw error;
  if (data !== true) {
    throw new Error('Pedido ja esta em andamento e nao pode ser reservado agora.');
  }
}

export async function liberarPedido(pedidoId: string): Promise<void> {
  if (!isSupabaseConfigured || !pedidoId) return;

  const { error } = await supabase.rpc('liberar_pedido_conferencia', {
    p_pedido_id: pedidoId,
  });

  if (error) throw error;
}

export function liberarPedidoEmSegundoPlano(pedidoId: string): void {
  if (!pedidoId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  void fetch(`${SUPABASE_URL}/rest/v1/rpc/liberar_pedido_conferencia`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_pedido_id: pedidoId }),
  }).catch(() => undefined);
}

export async function carregarItensDoPedido(pedidoId: string): Promise<PedidoFilaItem[]> {
  if (!isSupabaseConfigured || !pedidoId) return [];

  const { data, error } = await supabase
    .from('pedido_itens')
    .select('id,pedido_id,codigo,sku,descricao,secao,quantidade_pedida,quantidade_real,status,foto_url,ordem')
    .eq('pedido_id', pedidoId)
    .order('ordem', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as PedidoFilaItemRow[]).map((item, index) => ({
    id: item.id,
    pedidoId: item.pedido_id,
    codigo: String(item.codigo ?? '').trim(),
    sku: String(item.sku ?? '').trim(),
    descricao: String(item.descricao ?? '').trim(),
    secao: item.secao ?? null,
    quantidadePedida: toInt(item.quantidade_pedida),
    quantidadeReal: item.quantidade_real == null ? null : toInt(item.quantidade_real),
    status: item.status,
    photo: item.foto_url ?? null,
    ordem: item.ordem ?? index + 1,
  }));
}

// Junta 2+ pedidos (da mesma empresa/flag) num só: move todos os itens pro pedido
// mais antigo, apaga os demais e recalcula o resumo. Usado na conferência quando a
// mesma pessoa tem várias listas. Retorna o id do pedido resultante.
export async function juntarPedidos(
  pedidoIds: string[]
): Promise<{ pedidoId: string; totalItens: number; juntados: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase nao configurado.');
  const ids = Array.from(new Set((pedidoIds ?? []).map((s) => String(s ?? '').trim()).filter(Boolean)));
  if (ids.length < 2) throw new Error('Selecione ao menos 2 pedidos para juntar.');

  const { data, error } = await supabase
    .from('pedidos')
    .select('id,empresa,flag,listeiro,pessoa,titulo,status,observacao,created_at')
    .in('id', ids);
  if (error) throw error;

  type PedidoMeta = {
    id: string; empresa: string; flag: string; listeiro: string | null;
    pessoa: string | null; titulo: string | null; status: string; observacao: string | null; created_at: string | null;
  };
  const pedidos = (data ?? []) as PedidoMeta[];
  if (pedidos.length < 2) throw new Error('Pedidos nao encontrados para juntar.');

  if (new Set(pedidos.map((p) => p.empresa)).size > 1 || new Set(pedidos.map((p) => p.flag)).size > 1) {
    throw new Error('So da pra juntar pedidos da mesma empresa e tipo (loja/CD).');
  }
  if (pedidos.some((p) => p.status === 'concluido')) {
    throw new Error('Nao da pra juntar pedidos ja concluidos.');
  }
  if (pedidos.some((p) => p.status === 'em_andamento')) {
    throw new Error('Um dos pedidos esta em conferencia. Libere antes de juntar.');
  }

  // alvo = mais antigo; os outros viram fonte
  const ordenados = [...pedidos].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  );
  const alvo = ordenados[0];
  const fontes = ordenados.slice(1);

  const itemIdsPorPedido = new Map<string, string[]>();
  for (const pedido of ordenados) {
    const { data: itensPedido, error: itensError } = await supabase
      .from('pedido_itens')
      .select('id')
      .eq('pedido_id', pedido.id);
    if (itensError) throw itensError;
    itemIdsPorPedido.set(pedido.id, ((itensPedido ?? []) as Array<{ id: string }>).map((item) => item.id));
  }

  // move os itens de cada fonte para o alvo
  for (const fonte of fontes) {
    const { error: mvErr } = await supabase
      .from('pedido_itens')
      .update({ pedido_id: alvo.id })
      .eq('pedido_id', fonte.id);
    if (mvErr) throw mvErr;
  }

  // apaga os pedidos fonte (já sem itens)
  const { error: delErr } = await supabase
    .from('pedidos')
    .delete()
    .in('id', fontes.map((f) => f.id));
  if (delErr) throw delErr;

  // conta itens do alvo e atualiza titulo/total/status
  const { count, error: cntErr } = await supabase
    .from('pedido_itens')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', alvo.id);
  if (cntErr) throw cntErr;
  const totalItens = count ?? 0;

  const pessoa = String(alvo.listeiro ?? alvo.pessoa ?? '').trim();
  const novoTitulo = `${pessoa || String(alvo.titulo ?? '').trim() || 'Lista'} (juntado ${pedidos.length})`;
  const mergeUndoMeta: PedidoMergeUndoMeta = {
    version: 1,
    mergedAt: new Date().toISOString(),
    target: {
      id: alvo.id,
      titulo: alvo.titulo,
      pessoa: alvo.pessoa,
      listeiro: alvo.listeiro,
      status: alvo.status,
      created_at: alvo.created_at,
    },
    sources: ordenados.map((pedido) => ({
      id: pedido.id,
      titulo: pedido.titulo,
      pessoa: pedido.pessoa,
      listeiro: pedido.listeiro,
      status: pedido.status,
      created_at: pedido.created_at,
      itemIds: itemIdsPorPedido.get(pedido.id) ?? [],
    })),
  };
  const { error: updErr } = await supabase
    .from('pedidos')
    .update({
      titulo: novoTitulo,
      total_itens: totalItens,
      status: 'analisado',
      observacao: upsertMergeUndoMetaInObservacao(alvo.observacao, mergeUndoMeta),
    })
    .eq('id', alvo.id);
  if (updErr) throw updErr;

  await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: alvo.id }).then(({ error: e }) => {
    if (e) throw e;
  });

  return { pedidoId: alvo.id, totalItens, juntados: pedidos.length };
}

export async function desfazerJuntarPedidos(pedidoId: string): Promise<{ restaurados: number }> {
  if (!isSupabaseConfigured) throw new Error('Supabase nao configurado.');
  const id = String(pedidoId ?? '').trim();
  if (!id) throw new Error('Pedido invalido para desfazer o juntar.');

  const { data, error } = await supabase
    .from('pedidos')
    .select('id,empresa,flag,titulo,listeiro,pessoa,status,observacao,created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pedido nao encontrado para desfazer o juntar.');

  const pedidoAtual = data as {
    id: string;
    empresa: string;
    flag: string;
    titulo: string | null;
    listeiro: string | null;
    pessoa: string | null;
    status: string;
    observacao: string | null;
    created_at: string | null;
  };

  const mergeUndo = extrairMergeUndoMeta(pedidoAtual.observacao);
  if (!mergeUndo) {
    throw new Error('Este pedido nao tem historico suficiente para desfazer o juntar.');
  }
  if (pedidoAtual.status === 'concluido' || pedidoAtual.status === 'em_andamento') {
    throw new Error('So da para desfazer juntar com o pedido parado em analisado.');
  }

  const targetOriginal = mergeUndo.sources.find((source) => source.id === mergeUndo.target.id);
  if (!targetOriginal) {
    throw new Error('Historico de juntar corrompido: alvo original ausente.');
  }

  for (const source of mergeUndo.sources) {
    if (source.id === mergeUndo.target.id) continue;

    const { error: insertError } = await supabase.from('pedidos').insert({
      id: source.id,
      empresa: pedidoAtual.empresa,
      flag: pedidoAtual.flag,
      titulo: source.titulo,
      pessoa: source.pessoa,
      listeiro: source.listeiro,
      conferente: null,
      status: source.status,
      total_itens: source.itemIds.length,
      resumo_separado: 0,
      resumo_nao_tem: 0,
      resumo_parcial: 0,
      resumo_pendente: source.itemIds.length,
      observacao: null,
      created_at: source.created_at,
    });
    if (insertError) throw insertError;

    if (source.itemIds.length > 0) {
      const { error: moveError } = await supabase
        .from('pedido_itens')
        .update({ pedido_id: source.id })
        .in('id', source.itemIds);
      if (moveError) throw moveError;
    }
  }

  const { error: restoreTargetError } = await supabase
    .from('pedidos')
    .update({
      titulo: targetOriginal.titulo,
      pessoa: targetOriginal.pessoa,
      listeiro: targetOriginal.listeiro,
      status: targetOriginal.status,
      total_itens: targetOriginal.itemIds.length,
      observacao: removerMergeUndoMetaDaObservacao(pedidoAtual.observacao),
    })
    .eq('id', mergeUndo.target.id);
  if (restoreTargetError) throw restoreTargetError;

  for (const source of mergeUndo.sources) {
    const { error: rpcError } = await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: source.id });
    if (rpcError) throw rpcError;
  }

  return { restaurados: mergeUndo.sources.length };
}

export async function enviarListaParaConferencia(
  payload: EnviarListaParaConferenciaPayload
): Promise<EnviarListaParaConferenciaResult | null> {
  if (!isSupabaseConfigured) return null;
  if (!Array.isArray(payload.produtos) || payload.produtos.length === 0) return null;

  const empresa = normalizarEmpresa(payload.empresa);
  const flag = normalizarFlag(payload.flag);
  const conferenceId = resolveConferenceId(payload);

  const { data: existing, error: existingError } = await supabase
    .from('pedidos')
    .select('id')
    .eq('conference_id', conferenceId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    return { pedidoId: existing.id, conferenceId, created: false };
  }

  const observacao = [`conferenceId=${conferenceId}`, 'origem=enviar-para-conferencia'].join(' | ');
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      empresa,
      flag,
      titulo: String(payload.titulo ?? '').trim() || `Lista ${payload.pessoa || 'sem nome'}`,
      pessoa: String(payload.pessoa ?? '').trim() || null,
      listeiro: String(payload.pessoa ?? '').trim() || null,
      conferente: null,
      status: 'analisado',
      total_itens: toInt(payload.totalItens, payload.produtos.length),
      resumo_separado: 0,
      resumo_nao_tem: 0,
      resumo_parcial: 0,
      resumo_pendente: payload.produtos.length,
      observacao,
      conference_id: conferenceId,
    })
    .select('id')
    .single();

  if (pedidoError) throw pedidoError;
  const pedidoId = String(pedido?.id ?? '').trim();
  if (!pedidoId) throw new Error('Supabase nao retornou o ID do pedido');

  try {
    const fotosResolvidas = await resolverFotosEmLote(
      empresa,
      payload.produtos,
      (produto) => String(produto.barcode ?? '').trim(),
      (produto) => produto.photo
    );

    const rows = payload.produtos
      .map((produto, index) => ({
        pedido_id: pedidoId,
        codigo: String(produto.barcode ?? '').trim(),
        sku: String(produto.sku ?? '').trim() || null,
        descricao: String(produto.description ?? '').trim() || null,
        secao: String(produto.secao ?? '').trim() || null,
        quantidade_pedida: toInt(produto.quantidade),
        quantidade_real: null,
        status: 'pendente',
        foto_url: fotosResolvidas[index] ?? null,
        ordem: index + 1,
      }))
      .filter((item) => item.codigo);

    if (rows.length === 0) {
      throw new Error('Nenhum item valido para gravar em pedido_itens');
    }

    for (const lote of chunk(rows, 500)) {
      const { error } = await supabase.from('pedido_itens').insert(lote);
      if (error) throw error;
    }

    const { error: rpcError } = await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: pedidoId });
    if (rpcError) throw rpcError;

    const produtosCatalogo = buildProdutoCatalogoPayload(payload.produtos, fotosResolvidas);
    if (produtosCatalogo.length > 0) {
      const { error: upsertError } = await supabase.rpc('upsert_produtos', { p: produtosCatalogo });
      if (upsertError) {
        console.warn('[pedidosFila] upsert_produtos falhou (best-effort):', upsertError);
      }
    }

    return { pedidoId, conferenceId, created: true };
  } catch (error) {
    await supabase.from('pedidos').delete().eq('id', pedidoId);
    throw error;
  }
}

export async function removerListaDaConferencia(pedidoId: string): Promise<void> {
  if (!isSupabaseConfigured || !pedidoId) return;
  const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
  if (error) throw error;
}

export async function dispararErpFotoSyncLista(payload: EnviarListaParaConferenciaPayload): Promise<void> {
  const itens = (payload.produtos ?? [])
    .filter((produto) => produto.appPhotoWithoutErp && produto.erpProdutoId && produto.photo)
    .map((produto) => ({
      erpProdutoId: String(produto.erpProdutoId),
      photoBase64: String(produto.photo),
      barcode: String(produto.barcode ?? '').trim(),
    }));

  if (itens.length === 0) return;
  if (!TRIGGER_API_KEY) {
    console.warn('[pedidosFila] VITE_TRIGGER_API_KEY nao configurada. erp-foto-sync nao disparado.');
    return;
  }

  const response = await fetch(`https://api.trigger.dev/api/v1/tasks/${ERP_FOTO_SYNC_TASK_ID}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TRIGGER_API_KEY}`,
    },
    body: JSON.stringify({
      payload: {
        empresa: normalizarEmpresa(payload.empresa),
        itens,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`[Trigger.dev] Erro ${response.status} ao disparar ${ERP_FOTO_SYNC_TASK_ID}: ${detail || 'sem detalhe'}`);
  }
}

export async function fecharConferenciaExistente(
  pedidoId: string,
  payload: FecharConferenciaPayload
): Promise<void> {
  if (!isSupabaseConfigured || !pedidoId) return;
  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    throw new Error('Conferencia sem itens para concluir');
  }

  const empresa = normalizarEmpresa(payload.empresa);
  const novosItens = await buildPedidoItemRows(empresa, pedidoId, payload.itens);
  if (novosItens.length === 0) {
    throw new Error('Nenhum item valido para concluir pedido');
  }

  const itensOriginais = await carregarItensDoPedido(pedidoId);

  try {
    const { error: deleteError } = await supabase.from('pedido_itens').delete().eq('pedido_id', pedidoId);
    if (deleteError) throw deleteError;

    for (const lote of chunk(novosItens, 500)) {
      const { error } = await supabase.from('pedido_itens').insert(lote);
      if (error) throw error;
    }

    const { error: rpcError } = await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: pedidoId });
    if (rpcError) throw rpcError;

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        conferente: String(payload.conferente ?? '').trim() || null,
        tempo_segundos: payload.tempoSegundos == null ? null : toInt(payload.tempoSegundos),
        status: 'concluido',
        em_conferencia_por: null,
        em_conferencia_em: null,
      })
      .eq('id', pedidoId);

    if (updateError) throw updateError;
  } catch (error) {
    try {
      const { error: restoreDeleteError } = await supabase.from('pedido_itens').delete().eq('pedido_id', pedidoId);
      if (restoreDeleteError) throw restoreDeleteError;

      const itensRestore = await buildPedidoItemRows(
        empresa,
        pedidoId,
        itensOriginais.map((item) => ({
          codigo: item.codigo,
          sku: item.sku,
          secao: item.secao,
          quantidadePedida: item.quantidadePedida,
          quantidadeReal: item.quantidadeReal,
          status: item.status,
          photo: item.photo,
        }))
      );

      for (const lote of chunk(itensRestore, 500)) {
        const { error: restoreInsertError } = await supabase.from('pedido_itens').insert(lote);
        if (restoreInsertError) throw restoreInsertError;
      }

      await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: pedidoId });
    } catch (restoreError) {
      console.error('[pedidosFila] Falha ao restaurar itens apos erro no fechamento:', restoreError);
    }

    throw error;
  }
}

// Regra do negocio: ao concluir uma conferencia, todo item marcado como
// 'pendente' gera um NOVO pedido (status 'analisado') so com esses itens, para
// ser revisto/reconferido depois. Aparece na fila de conferencia como "PENDENTES".
// Best-effort: retorna o id do pedido criado, ou null se nao havia pendentes.
export async function gerarPedidoPendentes(params: {
  empresa: string;
  flag: string;
  pessoa: string;
  itens: FecharConferenciaItemPayload[];
}): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const pendentes = (params.itens ?? []).filter((item) => item.status === 'pendente');
  if (pendentes.length === 0) return null;

  const empresa = normalizarEmpresa(params.empresa);
  const flag = normalizarFlag(params.flag);
  const pessoa = String(params.pessoa ?? '').trim();
  const dataLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  const titulo = `⏳ ${pessoa || 'Sem nome'} — ${dataLabel} — PENDENTES`;

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      empresa,
      flag,
      titulo,
      pessoa: pessoa || null,
      listeiro: pessoa || null,
      conferente: null,
      status: 'analisado',
      total_itens: pendentes.length,
      resumo_separado: 0,
      resumo_nao_tem: 0,
      resumo_parcial: 0,
      resumo_pendente: pendentes.length,
      observacao: 'origem=pendentes-conferencia',
    })
    .select('id')
    .single();

  if (pedidoError) throw pedidoError;
  const pedidoId = String(pedido?.id ?? '').trim();
  if (!pedidoId) return null;

  try {
    // Reentram como itens 'pendente' (a conferir de novo), sem quantidade real.
    const rows = await buildPedidoItemRows(
      empresa,
      pedidoId,
      pendentes.map((item) => ({ ...item, quantidadeReal: null, status: 'pendente' as const }))
    );
    for (const lote of chunk(rows, 500)) {
      const { error } = await supabase.from('pedido_itens').insert(lote);
      if (error) throw error;
    }
    const { error: rpcError } = await supabase.rpc('recalcular_resumo_pedido', { p_pedido_id: pedidoId });
    if (rpcError) throw rpcError;
    return pedidoId;
  } catch (error) {
    await supabase.from('pedidos').delete().eq('id', pedidoId);
    throw error;
  }
}

export async function dispararExpedicaoConferencia(params: {
  conferente: string;
  empresa: string;
  dataConferencia?: string;
  itens: FecharConferenciaItemPayload[];
}): Promise<void> {
  const itens = (params.itens ?? [])
    .filter((item) => item.status === 'separado' || item.status === 'nao_tem_tudo')
    .map((item) => ({
      descricao: String(item.sku ?? item.codigo ?? '').trim() || String(item.codigo ?? '').trim(),
      ean: String(item.codigo ?? '').trim(),
      quantidadeReal: toInt(item.quantidadeReal),
    }))
    .filter((item) => item.ean && item.quantidadeReal > 0);

  if (itens.length === 0) return;
  if (!TRIGGER_API_KEY) {
    console.warn('[pedidosFila] VITE_TRIGGER_API_KEY nao configurada. expedicao-sync nao disparado.');
    return;
  }

  const response = await fetch(`https://api.trigger.dev/api/v1/tasks/${EXPEDICAO_SYNC_TASK_ID}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TRIGGER_API_KEY}`,
    },
    body: JSON.stringify({
      payload: {
        conferente: String(params.conferente ?? '').trim() || 'App Conferencia',
        empresa: normalizarEmpresa(params.empresa),
        dataConferencia: params.dataConferencia ?? new Date().toISOString(),
        itens,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`[Trigger.dev] Erro ${response.status} ao disparar ${EXPEDICAO_SYNC_TASK_ID}: ${detail || 'sem detalhe'}`);
  }
}

/**
 * supabaseAnalytics.ts
 * Funções utilitárias para salvar dados de analytics no Supabase
 */

import { supabase } from './supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface ListaBaixadaPayload {
  flag: string;
  empresa: string;
  pessoa: string;
  titulo: string;
  totalItens: number;
  dataCriacao: string;
  produtos: Array<{
    barcode: string;
    sku: string;
    quantidade: number;
    removeTag: boolean;
    photo: string | null;
  }>;
  dataDownload?: string;
}

export interface ConferenciaBaixadaPayload {
  conferente: string;
  tempo: string;
  totalItens: number;
  resumo: {
    separado: number;
    naoTem: number;
    parcial: number;
    pendente: number;
  };
  itens: Array<{
    codigo: string;
    sku: string;
    quantidadePedida: number;
    quantidadeReal: number | null;
    status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
    digito?: 'S' | 'M' | null;
    photo?: string | null;
  }>;
  empresa: string;
  flag: string;
  conferenceId?: string;
  dataConferencia?: string;
}

export interface ListaBaixadaLog {
  flag: string;
  empresa: string;
  pessoa: string;
  titulo: string;
  total_itens: number;
  data_criacao: string;
  data_download: string;
  clickup_task_id?: string;
  clickup_compras_task_id?: string;
  processing_time_ms?: number;
  status: 'pending' | 'success' | 'error';
  error_message?: string;
  produtos_count: number;
  produtos_sem_estoque_count: number;
  fotos_count: number;
  payload_json: any;
}

export interface ConferenciaBaixadaLog {
  conferente: string;
  tempo: string;
  total_itens: number;
  empresa: string;
  flag: string;
  conference_id: string;
  data_conferencia: string;
  resumo_separado: number;
  resumo_nao_tem: number;
  resumo_parcial: number;
  resumo_pendente: number;
  clickup_task_id?: string;
  clickup_compras_task_id?: string;
  processing_time_ms?: number;
  status: 'pending' | 'success' | 'error';
  error_message?: string;
  itens_faltantes_count: number;
  fotos_faltantes_count: number;
  digito_s_count: number;
  digito_m_count: number;
  itens_separados_count: number;
  payload_json: any;
}

export interface ConferenciaItem {
  conferencia_log_id: string;
  codigo: string;
  sku?: string;
  quantidade_pedida: number;
  quantidade_real: number | null;
  status: 'separado' | 'nao_tem' | 'nao_tem_tudo' | 'pendente';
  digito?: 'S' | 'M' | null;
  tem_foto: boolean;
  diferenca_quantidade?: number;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * Converte tempo no formato "HH:MM:SS" para segundos
 */
export function tempoParaSegundos(tempo: string): number {
  try {
    const [horas, minutos, segundos] = tempo.split(':').map(Number);
    return (horas * 3600) + (minutos * 60) + segundos;
  } catch (error) {
    console.error('Erro ao converter tempo para segundos:', error);
    return 0;
  }
}

/**
 * Calcula estatísticas de uma lista de produtos
 */
export function calcularEstatisticasProdutos(produtos: ListaBaixadaPayload['produtos']) {
  const produtosSemEstoque = produtos.filter(p => p.quantidade === 0);
  const fotosCount = produtos.filter(p => p.photo && p.photo.length > 0).length;
  
  return {
    produtos_count: produtos.length,
    produtos_sem_estoque_count: produtosSemEstoque.length,
    fotos_count: fotosCount,
  };
}

/**
 * Calcula estatísticas de uma lista de itens de conferência
 */
export function calcularEstatisticasItens(itens: ConferenciaBaixadaPayload['itens']) {
  const itensComFoto = itens.filter(i => i.photo && i.photo.length > 0);
  const digitoSCount = itens.filter(i => i.digito === 'S').length;
  const digitoMCount = itens.filter(i => i.digito === 'M').length;
  const itensFaltantes = itens.filter(i => i.status === 'nao_tem' || i.status === 'nao_tem_tudo').length;
  const fotosFaltantes = itensComFoto.filter(i => i.status === 'nao_tem' || i.status === 'nao_tem_tudo').length;
  
  return {
    itens_faltantes_count: itensFaltantes,
    fotos_faltantes_count: fotosFaltantes,
    digito_s_count: digitoSCount,
    digito_m_count: digitoMCount,
  };
}

// ============================================================================
// FUNÇÕES PRINCIPAIS
// ============================================================================

/**
 * Salva um registro de lista baixada no Supabase
 */
export async function salvarListaBaixadaNoSupabase(
  payload: ListaBaixadaPayload,
  clickupTaskId?: string,
  clickupComprasTaskId?: string,
  processingTimeMs?: number,
  error?: Error
): Promise<string | null> {
  try {
    const startTime = Date.now();
    
    const estatisticas = calcularEstatisticasProdutos(payload.produtos);
    
    const logData: ListaBaixadaLog = {
      flag: payload.flag,
      empresa: payload.empresa,
      pessoa: payload.pessoa,
      titulo: payload.titulo,
      total_itens: payload.totalItens,
      data_criacao: payload.dataCriacao,
      data_download: payload.dataDownload || new Date().toISOString(),
      clickup_task_id: clickupTaskId,
      clickup_compras_task_id: clickupComprasTaskId,
      processing_time_ms: processingTimeMs,
      status: error ? 'error' : (clickupTaskId ? 'success' : 'pending'),
      error_message: error?.message,
      produtos_count: estatisticas.produtos_count,
      produtos_sem_estoque_count: estatisticas.produtos_sem_estoque_count,
      fotos_count: estatisticas.fotos_count,
      payload_json: payload,
    };
    
    const { data, error: supabaseError } = await supabase
      .from('lista_baixada_logs')
      .insert(logData)
      .select('id')
      .single();
    
    if (supabaseError) {
      console.error('Erro ao salvar lista baixada no Supabase:', supabaseError);
      return null;
    }
    
    const endTime = Date.now();
    console.log(`✅ Lista baixada salva no Supabase em ${endTime - startTime}ms. ID: ${data.id}`);
    
    return data.id;
  } catch (error) {
    console.error('Erro inesperado ao salvar lista baixada:', error);
    return null;
  }
}

/**
 * Salva um registro de conferência baixada no Supabase
 */
export async function salvarConferenciaBaixadaNoSupabase(
  payload: ConferenciaBaixadaPayload,
  clickupTaskId?: string,
  clickupComprasTaskId?: string,
  processingTimeMs?: number,
  error?: Error
): Promise<string | null> {
  try {
    const startTime = Date.now();
    
    const estatisticas = calcularEstatisticasItens(payload.itens);
    
    const logData: ConferenciaBaixadaLog = {
      conferente: payload.conferente,
      tempo: payload.tempo,
      total_itens: payload.totalItens,
      empresa: payload.empresa,
      flag: payload.flag,
      conference_id: payload.conferenceId || `conf_${Date.now()}`,
      data_conferencia: payload.dataConferencia || new Date().toISOString(),
      resumo_separado: payload.resumo.separado,
      resumo_nao_tem: payload.resumo.naoTem,
      resumo_parcial: payload.resumo.parcial,
      resumo_pendente: payload.resumo.pendente,
      clickup_task_id: clickupTaskId,
      clickup_compras_task_id: clickupComprasTaskId,
      processing_time_ms: processingTimeMs,
      status: error ? 'error' : (clickupTaskId ? 'success' : 'pending'),
      error_message: error?.message,
      itens_faltantes_count: estatisticas.itens_faltantes_count,
      fotos_faltantes_count: estatisticas.fotos_faltantes_count,
      digito_s_count: estatisticas.digito_s_count,
      digito_m_count: estatisticas.digito_m_count,
      itens_separados_count: payload.resumo.separado + payload.resumo.parcial,
      payload_json: payload,
    };
    
    const { data, error: supabaseError } = await supabase
      .from('conferencia_baixada_logs')
      .insert(logData)
      .select('id')
      .single();
    
    if (supabaseError) {
      console.error('Erro ao salvar conferência baixada no Supabase:', supabaseError);
      return null;
    }
    
    const conferenciaLogId = data.id;
    
    // Salvar itens individualmente
    await salvarItensConferenciaNoSupabase(conferenciaLogId, payload.itens);
    
    const endTime = Date.now();
    console.log(`✅ Conferência baixada salva no Supabase em ${endTime - startTime}ms. ID: ${conferenciaLogId}`);
    
    return conferenciaLogId;
  } catch (error) {
    console.error('Erro inesperado ao salvar conferência baixada:', error);
    return null;
  }
}

/**
 * Salva os itens de uma conferência no Supabase
 */
export async function salvarItensConferenciaNoSupabase(
  conferenciaLogId: string,
  itens: ConferenciaBaixadaPayload['itens']
): Promise<number> {
  try {
    if (itens.length === 0) {
      return 0;
    }
    
    const itensData: ConferenciaItem[] = itens.map(item => ({
      conferencia_log_id: conferenciaLogId,
      codigo: item.codigo,
      sku: item.sku,
      quantidade_pedida: item.quantidadePedida,
      quantidade_real: item.quantidadeReal,
      status: item.status,
      digito: item.digito || null,
      tem_foto: !!(item.photo && item.photo.length > 0),
      diferenca_quantidade: item.quantidadeReal !== null 
        ? item.quantidadePedida - item.quantidadeReal 
        : null,
    }));
    
    // Inserir em batches para melhor performance
    const batchSize = 50;
    let insertedCount = 0;
    
    for (let i = 0; i < itensData.length; i += batchSize) {
      const batch = itensData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('conferencia_itens')
        .insert(batch);
      
      if (error) {
        console.error(`Erro ao salvar batch de itens (${i}-${i + batch.length}):`, error);
      } else {
        insertedCount += batch.length;
      }
    }
    
    console.log(`✅ ${insertedCount} itens de conferência salvos no Supabase`);
    return insertedCount;
  } catch (error) {
    console.error('Erro inesperado ao salvar itens de conferência:', error);
    return 0;
  }
}

/**
 * Obtém ranking de conferentes
 */
export async function obterRankingConferentes(
  empresa?: string,
  dataInicio?: string,
  dataFim?: string
): Promise<any[]> {
  try {
    let query = supabase
      .from('conferente_ranking')
      .select('*')
      .order('total_itens_separados', { ascending: false });
    
    if (empresa) {
      // Nota: A view não tem coluna empresa, então precisamos filtrar na tabela base
      // Para simplificar, retornamos todos e filtramos depois se necessário
      console.warn('Filtro por empresa não suportado na view conferente_ranking');
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Erro ao obter ranking de conferentes:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Erro inesperado ao obter ranking:', error);
    return [];
  }
}

/**
 * Obtém análise de popularidade de itens
 */
export async function obterPopularidadeItens(
  limite: number = 20
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('item_popularidade')
      .select('*')
      .order('vezes_pedido', { ascending: false })
      .limit(limite);
    
    if (error) {
      console.error('Erro ao obter popularidade de itens:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Erro inesperado ao obter popularidade de itens:', error);
    return [];
  }
}

/**
 * Obtém análise de tempo médio
 */
export async function obterTempoMedioAnalise(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('tempo_medio_analise')
      .select('*');
    
    if (error) {
      console.error('Erro ao obter análise de tempo médio:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Erro inesperado ao obter análise de tempo médio:', error);
    return [];
  }
}

/**
 * Verifica se as tabelas de analytics existem
 */
export async function verificarTabelasAnalytics(): Promise<boolean> {
  try {
    // Tenta acessar cada tabela
    const tables = ['lista_baixada_logs', 'conferencia_baixada_logs', 'conferencia_itens'];
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      if (error && error.code !== 'PGRST116') { // PGRST116 é "no rows returned", não é erro
        console.error(`Tabela ${table} não existe ou não pode ser acessada:`, error);
        return false;
      }
    }
    
    console.log('✅ Todas as tabelas de analytics estão acessíveis');
    return true;
  } catch (error) {
    console.error('Erro ao verificar tabelas de analytics:', error);
    return false;
  }
}
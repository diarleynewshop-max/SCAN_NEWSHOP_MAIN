/**
 * supabaseClient.ts
 * Cliente Supabase configurado para o ambiente do Trigger.dev (Node.js)
 */

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Configuração do Supabase para ambiente do Trigger
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Variáveis de ambiente do Supabase não configuradas para o Trigger');
  console.warn('Para salvar analytics no Supabase, configure:');
  console.warn('  - SUPABASE_URL');
  console.warn('  - SUPABASE_SERVICE_ROLE_KEY (recomendado) ou SUPABASE_ANON_KEY');
}

// Criar cliente Supabase
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
   {
    auth: {
      persistSession: false
    },
    realtime: {
      transport: WebSocket as never,
    },
    db: { 
      schema: 'public',
    },
  }
);

/**
 * Verifica se o Supabase está configurado corretamente
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseKey);
}

/**
 * Funções utilitárias para analytics no ambiente do Trigger
 */

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
    removeTag?: boolean;
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

/**
 * Calcula estatísticas de produtos para TASK 1
 */
export function calcularEstatisticasProdutos(produtos: ListaBaixadaPayload['produtos']) {
  const produtosSemEstoque = produtos.filter(p => (p.quantidade ?? 0) === 0);
  const fotosCount = produtos.filter(p => p.photo && p.photo.length > 0).length;
  
  return {
    produtos_count: produtos.length,
    produtos_sem_estoque_count: produtosSemEstoque.length,
    fotos_count: fotosCount,
  };
}

/**
 * Calcula estatísticas de itens para TASK 2
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

/**
 * Salva lista baixada no Supabase (para TASK 1)
 */
export async function salvarListaBaixadaNoSupabase(
  payload: ListaBaixadaPayload,
  clickupTaskId?: string,
  clickupComprasTaskId?: string,
  processingTimeMs?: number,
  error?: Error
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    console.log('⚠️ Supabase não configurado, pulando salvamento de analytics');
    return null;
  }
  
  try {
    const estatisticas = calcularEstatisticasProdutos(payload.produtos);
    
    const logData = {
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
    
    console.log(`✅ Lista baixada salva no Supabase. ID: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('Erro inesperado ao salvar lista baixada:', error);
    return null;
  }
}

/**
 * Salva conferência baixada no Supabase (para TASK 2)
 */
export async function salvarConferenciaBaixadaNoSupabase(
  payload: ConferenciaBaixadaPayload,
  clickupTaskId?: string,
  clickupComprasTaskId?: string,
  processingTimeMs?: number,
  error?: Error
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    console.log('⚠️ Supabase não configurado, pulando salvamento de analytics');
    return null;
  }
  
  try {
    const estatisticas = calcularEstatisticasItens(payload.itens);
    
    const logData = {
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
    
    console.log(`✅ Conferência baixada salva no Supabase. ID: ${conferenciaLogId}`);
    return conferenciaLogId;
  } catch (error) {
    console.error('Erro inesperado ao salvar conferência baixada:', error);
    return null;
  }
}

/**
 * Salva itens de conferência no Supabase
 */
export async function salvarItensConferenciaNoSupabase(
  conferenciaLogId: string,
  itens: ConferenciaBaixadaPayload['itens']
): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }
  
  try {
    if (itens.length === 0) {
      return 0;
    }
    
    const itensData = itens.map(item => ({
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
    
    // Inserir em batches
    const batchSize = 50;
    let insertedCount = 0;
    
    for (let i = 0; i < itensData.length; i += batchSize) {
      const batch = itensData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('conferencia_itens')
        .insert(batch);
      
      if (error) {
        console.error(`Erro ao salvar batch de itens:`, error);
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

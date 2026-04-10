import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface ProdutoComprar {
  id:           string;
  codigo:       string;
  sku:          string | null;
  descricao:    string;
  foto:         string | null;
  status:       'novo' | 'analisado' | 'comprado' | 'reprovado';
  date_created: string;
}

interface UseProdutosComprarReturn {
  produtos:          ProdutoComprar[];
  loading:           boolean;
  error:             string | null;
  ultimaAtualizacao: Date | null;
  refetch:           () => Promise<void>;
  analisar:          (taskId: string) => Promise<void>;
  aprovar:           (taskId: string) => Promise<void>;
  rejeitar:          (taskId: string) => Promise<void>;
}

// ─── Status map (espelho do webhook) ─────────────────────────────────────────
const STATUS_MAP: Record<string, ProdutoComprar['status']> = {
  comprado:  'comprado',
  analisado: 'analisado',
  reprovado: 'reprovado',
  novo:      'novo',
};

// ─── Hook principal ───────────────────────────────────────────────────────────
export const useProdutosComprar = (): UseProdutosComprarReturn => {
  const [produtos, setProdutos]                   = useState<ProdutoComprar[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const realtimeChannelRef                        = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Busca produtos na API Vercel (fonte: ClickUp) ─────────────────────────
  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/clickup-compras');

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${response.status}`);
      }

      const data = await response.json();
      setProdutos(data.produtos ?? []);
      setUltimaAtualizacao(new Date());
    } catch (err: any) {
      console.error('[useProdutosComprar] Erro ao buscar:', err);
      setError(err.message ?? 'Falha ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Realtime: escuta canal publicado pelo webhook Vercel ──────────────────
  useEffect(() => {
    const channel = supabase
      .channel('compras-sync')
      .on('broadcast', { event: 'clickup_update' }, (msg) => {
        const payload = msg.payload as {
          event:       string;
          task_id:     string;
          task_name:   string | null;
          status_app?: string;
          timestamp:   number;
        };

        console.log('[Realtime] Evento recebido:', payload);

        // Atualização otimista de status — sem refetch completo
        if (payload.event === 'taskStatusUpdated' && payload.status_app) {
          const novoStatus = STATUS_MAP[payload.status_app];
          if (novoStatus) {
            setProdutos(prev =>
              prev.map(p =>
                p.id === payload.task_id
                  ? { ...p, status: novoStatus }
                  : p
              )
            );
            setUltimaAtualizacao(new Date());
            return;
          }
        }

        // Criado / deletado / outro → refetch completo
        fetchProdutos();
      })
      .subscribe((status) => {
        console.log('[Realtime] Canal compras-sync:', status);
      });

    realtimeChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      realtimeChannelRef.current = null;
    };
  }, [fetchProdutos]);

  // ─── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  // ─── Ações (mudam status no ClickUp via API Vercel) ───────────────────────
  const executarAcao = useCallback(async (taskId: string, acao: string) => {
    // Atualização otimista imediata
    const previsao: Record<string, ProdutoComprar['status']> = {
      ANALISAR: 'analisado',
      APROVAR:  'comprado',
      REJEITAR: 'reprovado',
    };
    if (previsao[acao]) {
      setProdutos(prev =>
        prev.map(p => p.id === taskId ? { ...p, status: previsao[acao] } : p)
      );
    }

    try {
      const response = await fetch('/api/clickup-compras-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ taskId, acao }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Reverte otimismo em caso de erro
        await fetchProdutos();
        throw new Error(data.error ?? 'Erro ao executar ação');
      }

      console.log('[useProdutosComprar] Ação OK:', { taskId, acao });
      // O webhook vai confirmar via Realtime — não precisa refetch aqui
    } catch (err: any) {
      console.error('[useProdutosComprar] Erro na ação:', err);
      throw err;
    }
  }, [fetchProdutos]);

  const analisar = useCallback((id: string) => executarAcao(id, 'ANALISAR'), [executarAcao]);
  const aprovar  = useCallback((id: string) => executarAcao(id, 'APROVAR'),  [executarAcao]);
  const rejeitar = useCallback((id: string) => executarAcao(id, 'REJEITAR'), [executarAcao]);

  return {
    produtos,
    loading,
    error,
    ultimaAtualizacao,
    refetch: fetchProdutos,
    analisar,
    aprovar,
    rejeitar,
  };
};

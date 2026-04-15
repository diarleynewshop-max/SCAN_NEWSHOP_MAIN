import { useState, useEffect, useCallback, useRef } from 'react';
import { obterLoginSalvo } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export interface ProdutoComprar {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: 'todo' | 'produto_bom' | 'produto_ruim' | 'fazer_pedido' | 'concluido';
  date_created: string;
}

interface UseProdutosComprarReturn {
  produtos: ProdutoComprar[];
  loading: boolean;
  error: string | null;
  ultimaAtualizacao: Date | null;
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL';
  refetch: () => Promise<void>;
  like: (taskId: string) => Promise<void>;
  dislike: (taskId: string) => Promise<void>;
  fazerPedido: (taskId: string) => Promise<void>;
  concluir: (taskId: string) => Promise<void>;
}

const STATUS_MAP: Record<string, ProdutoComprar['status']> = {
  todo: 'todo',
  produto_bom: 'produto_bom',
  produto_ruim: 'produto_ruim',
  fazer_pedido: 'fazer_pedido',
  concluido: 'concluido',
};

function getEmpresaAtual(): 'NEWSHOP' | 'SOYE' | 'FACIL' {
  const login = obterLoginSalvo();
  if (login?.empresa === 'SOYE' || login?.empresa === 'FACIL') {
    return login.empresa;
  }
  return 'NEWSHOP';
}

export const useProdutosComprar = (): UseProdutosComprarReturn => {
  const [produtos, setProdutos] = useState<ProdutoComprar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [empresa, setEmpresa] = useState<'NEWSHOP' | 'SOYE' | 'FACIL'>(() => getEmpresaAtual());
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProdutos = useCallback(async () => {
    const empresaAtual = getEmpresaAtual();
    setEmpresa(empresaAtual);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clickup-compras?empresa=${empresaAtual}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body.error ?? `Erro ${response.status}`;
        const context = body.empresa ? ` [empresa=${body.empresa}]` : '';
        throw new Error(`${detail}${context}`);
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

  useEffect(() => {
    fetchProdutos();

    const intervalId = window.setInterval(() => {
      fetchProdutos();
    }, 60000);

    const onFocus = () => {
      fetchProdutos();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchProdutos]);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      return;
    }

    const channel = supabase
      .channel('compras-sync')
      .on('broadcast', { event: 'clickup_update' }, (msg) => {
        const payload = msg.payload as {
          event: string;
          task_id: string;
          status_app?: string;
          empresa?: string;
        };

        if (payload.empresa && payload.empresa !== getEmpresaAtual()) {
          return;
        }

        if (payload.event === 'taskStatusUpdated' && payload.status_app) {
          const novoStatus = STATUS_MAP[payload.status_app];
          if (novoStatus) {
            setProdutos((prev) =>
              prev.map((p) =>
                p.id === payload.task_id ? { ...p, status: novoStatus } : p
              )
            );
            setUltimaAtualizacao(new Date());
            return;
          }
        }

        fetchProdutos();
      })
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      realtimeChannelRef.current = null;
    };
  }, [fetchProdutos]);

  const executarAcao = useCallback(async (taskId: string, acao: string) => {
    const empresaAtual = getEmpresaAtual();
    const produtoAtual = produtos.find((p) => p.id === taskId);
    const previsao: Record<string, ProdutoComprar['status']> = {
      LIKE: 'produto_bom',
      DISLIKE: 'produto_ruim',
      FAZER_PEDIDO: 'fazer_pedido',
      CONCLUIR: 'concluido',
    };

    if (previsao[acao]) {
      setProdutos((prev) =>
        prev.map((p) => (p.id === taskId ? { ...p, status: previsao[acao] } : p))
      );
    }

    try {
      const response = await fetch('/api/clickup-compras-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          acao,
          empresa: empresaAtual,
          currentStatus: produtoAtual?.status ?? 'todo',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await fetchProdutos();
        const detalhe = data.details ? `: ${data.details}` : '';
        throw new Error((data.error ?? 'Erro ao executar acao') + detalhe);
      }
    } catch (err: any) {
      console.error('[useProdutosComprar] Erro na acao:', err);
      throw err;
    }
  }, [fetchProdutos, produtos]);

  const like = useCallback((id: string) => executarAcao(id, 'LIKE'), [executarAcao]);
  const dislike = useCallback((id: string) => executarAcao(id, 'DISLIKE'), [executarAcao]);
  const fazerPedido = useCallback((id: string) => executarAcao(id, 'FAZER_PEDIDO'), [executarAcao]);
  const concluir = useCallback((id: string) => executarAcao(id, 'CONCLUIR'), [executarAcao]);

  return {
    produtos,
    loading,
    error,
    ultimaAtualizacao,
    empresa,
    refetch: fetchProdutos,
    like,
    dislike,
    fazerPedido,
    concluir,
  };
};


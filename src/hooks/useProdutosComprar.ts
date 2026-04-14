import { useState, useEffect, useCallback, useRef } from 'react';
import { obterLoginSalvo } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export interface ProdutoComprar {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: 'novo' | 'analisado' | 'comprado' | 'reprovado';
  date_created: string;
}

interface UseProdutosComprarReturn {
  produtos: ProdutoComprar[];
  loading: boolean;
  error: string | null;
  ultimaAtualizacao: Date | null;
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL';
  refetch: () => Promise<void>;
  analisar: (taskId: string) => Promise<void>;
  aprovar: (taskId: string) => Promise<void>;
  rejeitar: (taskId: string) => Promise<void>;
}

const STATUS_MAP: Record<string, ProdutoComprar['status']> = {
  comprado: 'comprado',
  analisado: 'analisado',
  reprovado: 'reprovado',
  novo: 'novo',
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
    const previsao: Record<string, ProdutoComprar['status']> = {
      ANALISAR: 'analisado',
      APROVAR: 'comprado',
      REJEITAR: 'reprovado',
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
        body: JSON.stringify({ taskId, acao, empresa: empresaAtual }),
      });

      const data = await response.json();

      if (!response.ok) {
        await fetchProdutos();
        throw new Error(data.error ?? 'Erro ao executar acao');
      }
    } catch (err: any) {
      console.error('[useProdutosComprar] Erro na acao:', err);
      throw err;
    }
  }, [fetchProdutos]);

  const analisar = useCallback((id: string) => executarAcao(id, 'ANALISAR'), [executarAcao]);
  const aprovar = useCallback((id: string) => executarAcao(id, 'APROVAR'), [executarAcao]);
  const rejeitar = useCallback((id: string) => executarAcao(id, 'REJEITAR'), [executarAcao]);

  return {
    produtos,
    loading,
    error,
    ultimaAtualizacao,
    empresa,
    refetch: fetchProdutos,
    analisar,
    aprovar,
    rejeitar,
  };
};


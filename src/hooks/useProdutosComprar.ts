import { useState, useEffect, useCallback, useRef } from 'react';
import { obterLoginSalvo } from '@/hooks/useAuth';

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
  const requestControllerRef = useRef<AbortController | null>(null);

  const fetchProdutos = useCallback(async () => {
    const empresaAtual = getEmpresaAtual();
    setEmpresa(empresaAtual);
    setLoading(true);
    setError(null);
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch(`/api/clickup-compras-proxy?action=buscar-tasks&empresa=${empresaAtual}`, {
        signal: controller.signal,
      });

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
      if (err?.name === 'AbortError') {
        return;
      }
      console.error('[useProdutosComprar] Erro ao buscar:', err);
      setError(err.message ?? 'Falha ao carregar produtos');
    } finally {
      if (requestControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchProdutos();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchProdutos();
      }
    }, 60000);

    const onFocus = () => {
      fetchProdutos();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchProdutos();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      requestControllerRef.current?.abort();
    };
  }, [fetchProdutos]);

  const executarAcao = useCallback(async (taskId: string, acao: string) => {
    const empresaAtual = getEmpresaAtual();
    const produtoAtual = produtos.find((p) => p.id === taskId);
    const statusAnterior = produtoAtual?.status;
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
      const response = await fetch('/api/clickup-compras-proxy?action=mover-status', {
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
        const statusDisponiveis = Array.isArray(data.availableStatuses) && data.availableStatuses.length > 0
          ? ` | Status disponiveis: ${data.availableStatuses.join(', ')}`
          : '';
        const statusTentados = Array.isArray(data.attemptedStatuses) && data.attemptedStatuses.length > 0
          ? ` | Status tentados: ${data.attemptedStatuses.join(', ')}`
          : '';
        throw new Error((data.error ?? 'Erro ao executar acao') + detalhe + statusDisponiveis + statusTentados);
      }

      await fetchProdutos();
    } catch (err: any) {
      if (statusAnterior) {
        setProdutos((prev) =>
          prev.map((p) => (p.id === taskId ? { ...p, status: statusAnterior } : p))
        );
      }
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


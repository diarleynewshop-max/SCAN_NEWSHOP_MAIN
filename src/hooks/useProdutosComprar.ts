import { useState, useEffect, useCallback } from "react";

interface ProdutoComprar {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: 'novo' | 'analisado' | 'comprado' | 'reprovado';
  empresa: string;
  date_created: string;
}

interface UseProdutosComprarReturn {
  produtos: ProdutoComprar[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  analisar: (taskId: string) => Promise<void>;
  aprobar: (taskId: string) => Promise<void>;
  rejeitar: (taskId: string) => Promise<void>;
}

export const useProdutosComprar = (): UseProdutosComprarReturn => {
  const [produtos, setProdutos] = useState<ProdutoComprar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/clickup-compras');
      
      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const data = await response.json();
      setProdutos(data.produtos || []);
    } catch (err: any) {
      console.error('Erro ao buscar produtos:', err);
      setError(err.message || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  const executarAcao = async (taskId: string, acao: string) => {
    try {
      const response = await fetch('/api/clickup-compras-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, acao }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao executar ação');
      }

      setProdutos(prev => prev.filter(p => p.id !== taskId));
      return data;
    } catch (err: any) {
      console.error('Erro ao executar ação:', err);
      throw err;
    }
  };

  const analisar = (taskId: string) => executarAcao(taskId, 'ANALISAR');
  const aprobar = (taskId: string) => executarAcao(taskId, 'APROVAR');
  const rejeitar = (taskId: string) => executarAcao(taskId, 'REJEITAR');

  return {
    produtos,
    loading,
    error,
    refetch: fetchProdutos,
    analisar,
    aprobar,
    rejeitar,
  };
};
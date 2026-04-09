import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

interface ConferenciaItem {
  id: string;
  codigo: string;
  sku: string | null;
  quantidade_pedida: number;
  quantidade_real: number | null;
  status: string;
  digito: string | null;
  tem_foto: boolean;
  created_at: string;
}

interface ProdutoDisplay {
  id: string;
  codigo: string;
  nome: string;
  fornecedor: string;
  estoque: number;
  minimo: number;
  status: "ok" | "baixo" | "critico";
  ultimaCompra: string;
}

interface UseConferenciaItensReturn {
  produtos: ProdutoDisplay[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useConferenciaItens = (): UseConferenciaItensReturn => {
  const [itens, setItens] = useState<ConferenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItens = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('conferencia_itens')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setItens(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar itens:", err);
      setError(err.message || "Falha ao carregar itens");
      setItens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItens();
  }, []);

  const produtos = useMemo(() => {
    const uniqueMap = new Map<string, ConferenciaItem>();
    
    for (const item of itens) {
      if (!uniqueMap.has(item.codigo)) {
        uniqueMap.set(item.codigo, item);
      }
    }

    return Array.from(uniqueMap.values()).map((item): ProdutoDisplay => {
      const estoque = item.quantidade_real ?? 0;
      const minimo = item.quantidade_pedida;
      let status: "ok" | "baixo" | "critico";

      if (estoque === 0 || item.status === 'nao_tem' || item.status === 'nao_tem_tudo') {
        status = "critico";
      } else if (estoque < minimo) {
        status = "baixo";
      } else {
        status = "ok";
      }

      return {
        id: item.id,
        codigo: item.codigo,
        nome: item.sku || item.codigo,
        fornecedor: "Não informado",
        estoque,
        minimo,
        status,
        ultimaCompra: new Date(item.created_at).toLocaleDateString('pt-BR'),
      };
    });
  }, [itens]);

  return {
    produtos,
    loading,
    error,
    refetch: fetchItens,
  };
};
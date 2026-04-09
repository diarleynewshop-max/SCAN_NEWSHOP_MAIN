import { useState, useEffect, useMemo, useCallback } from "react";
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

  const fetchItens = useCallback(async () => {
    console.log("🔄 refetch chamado!");
    setLoading(true);
    setError(null);

    try {
      console.log("🔍 Buscando itens do Supabase...");
      
      // Verificar se as variáveis de ambiente estão definidas
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      console.log("🌐 Vars check:", { 
        hasUrl: !!supabaseUrl, 
        hasKey: !!supabaseKey,
        urlPrefix: supabaseUrl?.substring(0, 20)
      });
      
      // Buscar apenas itens sem estoque ou parciais (nao_tem e nao_tem_tudo)
      // Com sistema de retry para problemas temporários do Supabase
      let retries = 3;
      let lastError;
      
      for (let i = 0; i < retries; i++) {
        try {
          const { data, error: fetchError } = await supabase
            .from('conferencia_itens')
            .select('*')
            .in('status', ['nao_tem', 'nao_tem_tudo'])
            .order('created_at', { ascending: false });

          console.log(`📦 Tentativa ${i + 1}/${retries}:`, { 
            data, 
            error: fetchError, 
            count: data?.length, 
            filter: 'status: nao_tem, nao_tem_tudo'
          });

          if (fetchError?.message?.includes('schema cache') || fetchError?.code === '503') {
            lastError = fetchError;
            // Esperar antes de tentar novamente (backoff exponencial)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            continue;
          }

          if (fetchError) {
            throw new Error(fetchError.message);
          }

          console.log("📊 Dados recebidos (JSON):", JSON.stringify(data, null, 2));
          setItens(data || []);
          return; // Sucesso, sair do loop
          
        } catch (retryError: any) {
          lastError = retryError;
          if (i === retries - 1) {
            // Última tentativa, deixar propagar o erro
            throw retryError;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
      }
    } catch (err: any) {
      console.error("❌ Erro ao buscar itens:", err);
      setError(err.message || "Falha ao carregar itens");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItens();
  }, [fetchItens]);

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

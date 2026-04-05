import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface ProductInfo {
  codigo: string;
  estoque: number;
  preco?: number;
  nome_produto?: string;
  descricao?: string;
  // Adicione outros campos conforme necessário
}

interface UseProductLookupReturn {
  productInfo: ProductInfo | null;
  loading: boolean;
  error: string | null;
  lookupProduct: (barcode: string) => Promise<void>;
}

export const useProductLookup = (): UseProductLookupReturn => {
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const lookupProduct = useCallback(async (barcode: string) => {
    setLoading(true);
    setError(null);

    try {
      // Consultando a tabela 'estoque' como visto em ListHistory.tsx
      // Vamos tentar diferentes combinações de campos que podem existir na tabela
      const { data, error } = await supabase
        .from('estoque')
        .select(`
          codigo,
          estoque,
          preco,
          nome_produto,
          descricao
        `)
        .eq('codigo', barcode)
        .single();

      if (error) {
        // Se ocorrer um erro, vamos tentar uma consulta mais simples
        const { data: simpleData, error: simpleError } = await supabase
          .from('estoque')
          .select('*')
          .eq('codigo', barcode)
          .single();

        if (simpleError) {
          throw new Error(simpleError.message);
        }

        if (!simpleData) {
          setError("Produto não encontrado");
          setProductInfo(null);
          return;
        }

        // Usar os dados retornados diretamente
        setProductInfo({
          codigo: simpleData.codigo || simpleData.barcode || barcode,
          estoque: simpleData.estoque || simpleData.quantidade || 0,
          preco: simpleData.preco || simpleData.valor || undefined,
          nome_produto: simpleData.nome_produto || simpleData.nome || simpleData.descricao || undefined,
          descricao: simpleData.descricao || undefined,
        });
        return;
      }

      if (!data) {
        setError("Produto não encontrado");
        setProductInfo(null);
        return;
      }

      // Mapeie os dados conforme a estrutura da tabela 'estoque'
      setProductInfo({
        codigo: data.codigo,
        estoque: data.estoque,
        preco: data.preco,
        nome_produto: data.nome_produto || data.descricao,
        descricao: data.descricao,
      });
    } catch (err) {
      console.error("Erro ao buscar produto:", err);
      setError("Falha ao buscar informações do produto");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { productInfo, loading, error, lookupProduct };
};
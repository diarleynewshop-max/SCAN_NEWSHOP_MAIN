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
    console.log("Buscando produto com código:", barcode);
    setLoading(true);
    setError(null);

    try {
      // Primeiro vamos testar se conseguimos acessar a tabela
      const { data: sampleData, error: sampleError } = await supabase
        .from('estoque')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error("Erro ao acessar tabela estoque:", sampleError);
        throw new Error(`Falha ao acessar tabela: ${sampleError.message}`);
      }

      // Agora vamos buscar o produto específico
      const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .eq('codigo', barcode)
        .single();

      console.log("Resposta completa do Supabase:", { data, error });

      if (error) {
        // Tratar erros específicos
        if (error.code === "PGRST116") {
          setError("Produto não encontrado no banco de dados");
          setProductInfo(null);
          return;
        }

        console.error("Erro na consulta:", error);
        setError(`Erro na consulta: ${error.message}`);
        setProductInfo(null);
        return;
      }

      if (!data) {
        setError("Nenhum dado retornado para este produto");
        setProductInfo(null);
        return;
      }

      console.log("Dados brutos do produto:", data);

      // Converter os dados para o formato esperado com validações adequadas
      const productData: ProductInfo = {
        codigo: String(data.codigo || data.barcode || barcode),
        estoque: Number(data.estoque || data.quantidade_estoque || data.qtd || 0),
        preco: data.preco !== undefined ? Number(data.preco) :
               data.valor !== undefined ? Number(data.valor) : undefined,
        nome_produto: data.nome_produto || data.nome || data.descricao_produto || undefined,
        descricao: data.descricao || data.descricao_completa || undefined,
      };

      console.log("Produto processado:", productData);
      setProductInfo(productData);
    } catch (err: any) {
      console.error("Erro ao buscar produto:", err);
      setError(err.message || "Falha desconhecida ao buscar informações do produto");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { productInfo, loading, error, lookupProduct };
};
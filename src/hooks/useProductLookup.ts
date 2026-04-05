import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface ProductInfo {
  id: number;
  name: string;
  price: number;
  stock: number;
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
      // Substitua 'products' pelo nome real da sua tabela no Supabase
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        setError("Produto não encontrado");
        setProductInfo(null);
        return;
      }

      // Mapeie os dados conforme a estrutura da sua tabela
      setProductInfo({
        id: data.id,
        name: data.name,
        price: data.price,
        stock: data.stock,
        // Adicione outros campos conforme necessário
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
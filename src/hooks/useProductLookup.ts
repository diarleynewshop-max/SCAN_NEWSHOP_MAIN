import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { buscarProdutoVarejoFacil, salvarProdutoSupabase } from "@/lib/varejoFacilIntegration";

interface ProductInfo {
  codigo: string;
  estoque: number;
  preco?: number;
  nome_produto?: string;
  descricao?: string;
}

interface UseProductLookupReturn {
  productInfo: ProductInfo | null;
  loading: boolean;
  error: string | null;
  lookupProduct: (barcode: string) => Promise<void>;
}

interface UseProductLookupOptions {
  enabled?: boolean;
}

export const useProductLookup = ({ enabled = true }: UseProductLookupOptions = {}): UseProductLookupReturn => {
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) return;
    setProductInfo(null);
    setError(null);
    setLoading(false);
  }, [enabled]);

  const lookupProduct = useCallback(async (barcode: string) => {
    if (!enabled) {
      setProductInfo(null);
      setError(null);
      setLoading(false);
      return;
    }

    console.log("Buscando produto com codigo:", barcode);
    setLoading(true);
    setError(null);

    try {
      // Primeiro tentar buscar no Supabase
      const { data, error } = await supabase
        .from("estoque")
        .select("*")
        .eq("codigo", barcode)
        .single();

      console.log("Resposta do Supabase:", { data, error });

      if (error && error.code !== "PGRST116") {
        console.error("Erro na consulta ao Supabase:", error);
        throw new Error(`Erro na consulta: ${error.message}`);
      }

      // Se encontrou no Supabase, usar esses dados
      if (data) {
        const productData: ProductInfo = {
          codigo: String(data.codigo || data.barcode || barcode),
          estoque: Number(data.estoque || data.quantidade_estoque || data.qtd || 0),
          preco: data.preco !== undefined ? Number(data.preco) : data.valor !== undefined ? Number(data.valor) : undefined,
          nome_produto: data.nome_produto || data.nome || data.descricao_produto || undefined,
          descricao: data.descricao || data.descricao_completa || undefined,
        };

        setProductInfo(productData);
        return;
      }

      // Se nao encontrou no Supabase, buscar na Varejo Facil
      const produtoVarejoFacil = await buscarProdutoVarejoFacil(barcode);

      if (produtoVarejoFacil) {
        try {
          await salvarProdutoSupabase(produtoVarejoFacil);
        } catch (saveError) {
          console.error("Erro ao salvar produto no Supabase:", saveError);
        }

        const productData: ProductInfo = {
          codigo: produtoVarejoFacil.codigo_barras,
          estoque: produtoVarejoFacil.estoque,
          preco: produtoVarejoFacil.preco,
          nome_produto: produtoVarejoFacil.descricao,
        };

        setProductInfo(productData);
      } else {
        setError("Produto nao encontrado no banco local nem na API externa");
        setProductInfo(null);
      }
    } catch (err: any) {
      console.error("Erro ao buscar produto:", err);
      setError(err.message || "Falha ao buscar informacoes do produto");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  return { productInfo, loading, error, lookupProduct };
};

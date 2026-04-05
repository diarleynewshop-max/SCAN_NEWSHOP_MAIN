import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { buscarProdutoVarejoFacil, salvarProdutoSupabase } from "@/lib/varejoFacilIntegration";

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
      // Primeiro tentar buscar no Supabase
      const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .eq('codigo', barcode)
        .single();

      console.log("Resposta do Supabase:", { data, error });

      if (error && error.code !== "PGRST116") {
        // Erro diferente de "não encontrado"
        console.error("Erro na consulta ao Supabase:", error);
        throw new Error(`Erro na consulta: ${error.message}`);
      }

      // Se encontrou no Supabase, usar esses dados
      if (data) {
        console.log("Produto encontrado no Supabase:", data);

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
        return;
      }

      // Se não encontrou no Supabase, buscar na Varejo Fácil
      console.log("Produto não encontrado no Supabase, buscando na Varejo Fácil...");
      const produtoVarejoFacil = await buscarProdutoVarejoFacil(barcode);

      if (produtoVarejoFacil) {
        // Salvar no Supabase para uso futuro
        try {
          await salvarProdutoSupabase(produtoVarejoFacil);

          // Converter para o formato esperado
          const productData: ProductInfo = {
            codigo: produtoVarejoFacil.codigo_barras,
            estoque: produtoVarejoFacil.estoque,
            preco: produtoVarejoFacil.preco,
            nome_produto: produtoVarejoFacil.descricao,
          };

          console.log("Produto salvo no Supabase e pronto para uso:", productData);
          setProductInfo(productData);
        } catch (saveError) {
          console.error("Erro ao salvar produto no Supabase:", saveError);
          // Mesmo assim, mostrar os dados obtidos
          const productData: ProductInfo = {
            codigo: produtoVarejoFacil.codigo_barras,
            estoque: produtoVarejoFacil.estoque,
            preco: produtoVarejoFacil.preco,
            nome_produto: produtoVarejoFacil.descricao,
          };

          setProductInfo(productData);
          setError("Produto encontrado mas falha ao salvar localmente");
        }
      } else {
        setError("Produto não encontrado");
        setProductInfo(null);
      }
    } catch (err: any) {
      console.error("Erro ao buscar produto:", err);
      setError(err.message || "Falha ao buscar informações do produto");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { productInfo, loading, error, lookupProduct };
};
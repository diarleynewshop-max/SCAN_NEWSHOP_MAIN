import { useState, useCallback, useEffect } from "react";
import {
  buscarOpcoesProdutoVarejoFacil,
  buscarProdutoVarejoFacil,
  buscarProdutoVarejoFacilPorProdutoId,
  type VarejoFacilLookupContext,
  type VarejoFacilProduct,
  type VarejoFacilProductOption,
} from "@/lib/varejoFacilIntegration";

interface ProductInfo {
  codigo: string;
  estoque: number;
  preco?: number;
  precoVarejo?: number;
  precoAtacado?: number;
  nome_produto?: string;
  descricao?: string;
  secao?: string;
  imagem?: string;
  hasErpImage?: boolean;
  erpProdutoId?: string;
}

interface UseProductLookupReturn {
  productInfo: ProductInfo | null;
  productOptions: VarejoFacilProductOption[];
  loading: boolean;
  error: string | null;
  lookupProduct: (barcode: string) => Promise<void>;
  selectProductOption: (option: VarejoFacilProductOption) => Promise<void>;
  clearProductOptions: () => void;
}

interface UseProductLookupOptions {
  enabled?: boolean;
  empresa?: string | null;
  flag?: string | null;
}

export const useProductLookup = ({ enabled = true, empresa, flag }: UseProductLookupOptions = {}): UseProductLookupReturn => {
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [productOptions, setProductOptions] = useState<VarejoFacilProductOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) return;
    setProductInfo(null);
    setProductOptions([]);
    setError(null);
    setLoading(false);
  }, [enabled]);

  const contexto: VarejoFacilLookupContext = { empresa, flag };

  const toProductInfo = useCallback((produtoVarejoFacil: VarejoFacilProduct): ProductInfo => ({
    codigo: produtoVarejoFacil.codigo_barras,
    estoque: produtoVarejoFacil.estoque,
    preco: produtoVarejoFacil.preco,
    precoVarejo: produtoVarejoFacil.precoVarejo,
    precoAtacado: produtoVarejoFacil.precoAtacado,
    nome_produto: produtoVarejoFacil.descricao,
    secao: produtoVarejoFacil.secao,
    imagem: produtoVarejoFacil.imagem,
    hasErpImage: produtoVarejoFacil.hasErpImage,
    erpProdutoId: produtoVarejoFacil.id,
  }), []);

  const selectProductOption = useCallback(async (option: VarejoFacilProductOption) => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    try {
      const produto = await buscarProdutoVarejoFacilPorProdutoId(option.id, contexto, option.codigo_barras || option.sku);
      if (!produto) {
        setError("Produto nao encontrado para esse SKU");
        setProductInfo(null);
        return;
      }

      setProductInfo(toProductInfo(produto));
      setProductOptions([]);
    } catch (err: any) {
      console.error("Erro ao carregar produto escolhido:", err);
      setError(err.message || "Falha ao carregar produto escolhido");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, empresa, flag, toProductInfo]);

  const lookupProduct = useCallback(async (barcode: string) => {
    if (!enabled) {
      setProductInfo(null);
      setError(null);
      setLoading(false);
      return;
    }

    console.log("Buscando produto por codigo/SKU:", barcode);
    setLoading(true);
    setError(null);
    setProductOptions([]);

    try {
      // Produto vem direto da API Varejo Facil da empresa ativa.
      const termo = barcode.trim();
      const deveAbrirOpcoesSku = /[a-z]/i.test(termo) || (/^\d+$/.test(termo) && termo.length < 6);
      if (deveAbrirOpcoesSku) {
        const opcoes = await buscarOpcoesProdutoVarejoFacil(termo, contexto);
        if (opcoes.length > 1) {
          setProductOptions(opcoes);
          setProductInfo(null);
          return;
        }
        if (opcoes.length === 1) {
          await selectProductOption(opcoes[0]);
          return;
        }
      }

      const produtoVarejoFacil = await buscarProdutoVarejoFacil(barcode, contexto);

      if (produtoVarejoFacil) {
        setProductInfo(toProductInfo(produtoVarejoFacil));
      } else {
        setError("Produto nao encontrado para esse codigo/SKU");
        setProductInfo(null);
      }
    } catch (err: any) {
      console.error("Erro ao buscar produto:", err);
      setError(err.message || "Falha ao buscar informacoes do produto");
      setProductInfo(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, empresa, flag, selectProductOption, toProductInfo]);

  return {
    productInfo,
    productOptions,
    loading,
    error,
    lookupProduct,
    selectProductOption,
    clearProductOptions: () => setProductOptions([]),
  };
};

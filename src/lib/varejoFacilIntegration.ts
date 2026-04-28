import { supabase } from "@/lib/supabase";

// Interface para os dados do produto da Varejo FÃ¡cil
interface VarejoFacilProduct {
  id: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  estoque: number;
  // Adicione outros campos conforme necessÃ¡rio
}

// Interface para os dados no formato da tabela estoque do Supabase
interface SupabaseStock {
  codigo: string;
  estoque: number;
  preco?: number;
  nome_produto?: string;
  descricao?: string;
}

export type VarejoFacilEmpresa = "NEWSHOP" | "FACIL" | "SOYE";
export type VarejoFacilFlag = "loja" | "cd";

export interface VarejoFacilLookupContext {
  empresa?: string | null;
  flag?: VarejoFacilFlag | string | null;
}

const VAREJO_FACIL_HOSTS: Record<VarejoFacilEmpresa, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

const normalizarEmpresaVarejoFacil = (empresa?: string | null): VarejoFacilEmpresa => {
  const normalizada = (empresa ?? "").toUpperCase();

  if (normalizada.includes("SOYE")) return "SOYE";
  if (normalizada.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
};

const resolverBaseUrlVarejoFacil = (contexto: VarejoFacilLookupContext = {}) => {
  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  return `https://${VAREJO_FACIL_HOSTS[empresa]}`;
};

const adaptarProdutoVarejoFacil = (data: any, codigoBarras: string): VarejoFacilProduct => ({
  id: data.id || data.produto_id || '',
  codigo_barras: data.codigo_barras || data.ean || data.gtin || codigoBarras,
  descricao: data.descricao || data.nome || data.titulo || '',
  preco: Number(data.preco || data.valor || data.price || 0),
  estoque: Number(data.estoque || data.quantidade || data.qtd || 0),
});

/**
 * Busca informaÃ§Ãµes de um produto na API do Varejo FÃ¡cil
 * @param codigoBarras CÃ³digo de barras do produto
 * @returns Dados do produto ou null se nÃ£o encontrado
 */
export const buscarProdutoVarejoFacil = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => {
  try {
    console.log("Buscando produto na Varejo FÃ¡cil:", codigoBarras);

    const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
    const response = await fetch(`/api/varejo-facil-proxy?codigo=${encodeURIComponent(codigoBarras)}&empresa=${empresa.toLowerCase()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.error || `Falha ao consultar Varejo Facil (${response.status}).`);
    }

    const data = result?.data || result;
    const produto = adaptarProdutoVarejoFacil(data, codigoBarras);
    return produto.codigo_barras ? produto : null;
  } catch (error) {
    console.error("Erro ao buscar produto na Varejo Facil:", error);
    if (error instanceof Error) throw error;
    throw new Error("Nao foi possivel consultar a API Varejo Facil.");
  }
};

/**
 * Salva ou atualiza informaÃ§Ãµes de produto no Supabase
 * @param produto Dados do produto a ser salvo
 * @returns Resultado da operaÃ§Ã£o
 */
export const salvarProdutoSupabase = async (produto: VarejoFacilProduct): Promise<boolean> => {
  try {
    console.log("Salvando produto no Supabase:", produto);

    // Converter dados para o formato da tabela estoque
    const dadosEstoque: SupabaseStock = {
      codigo: produto.codigo_barras,
      estoque: produto.estoque,
      preco: produto.preco,
      nome_produto: produto.descricao,
      // descricao: produto.descricao // Se quiser duplicar
    };

    // Verificar se o produto jÃ¡ existe
    const { data: existingData, error: fetchError } = await supabase
      .from('estoque')
      .select('codigo')
      .eq('codigo', produto.codigo_barras)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // Erro diferente de "nÃ£o encontrado"
      throw new Error(`Erro ao verificar produto existente: ${fetchError.message}`);
    }

    let result;
    if (existingData) {
      // Atualizar produto existente
      console.log("Atualizando produto existente");
      result = await supabase
        .from('estoque')
        .update(dadosEstoque)
        .eq('codigo', produto.codigo_barras);
    } else {
      // Inserir novo produto
      console.log("Inserindo novo produto");
      result = await supabase
        .from('estoque')
        .insert(dadosEstoque);
    }

    if (result.error) {
      throw new Error(`Erro ao salvar no Supabase: ${result.error.message}`);
    }

    console.log("Produto salvo com sucesso no Supabase");
    return true;
  } catch (error) {
    console.error("Erro ao salvar produto no Supabase:", error);
    throw new Error(`Falha ao salvar produto: ${(error as Error).message}`);
  }
};

/**
 * FunÃ§Ã£o completa que busca um produto na Varejo FÃ¡cil e salva no Supabase
 * @param codigoBarras CÃ³digo de barras do produto
 * @returns Dados do produto salvo ou null se nÃ£o encontrado
 */
export const sincronizarProduto = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => {
  try {
    // Buscar produto na Varejo FÃ¡cil
    const produto = await buscarProdutoVarejoFacil(codigoBarras, contexto);

    if (!produto) {
      console.log("Produto nÃ£o encontrado na Varejo FÃ¡cil");
      return null;
    }

    // Salvar no Supabase
    const sucesso = await salvarProdutoSupabase(produto);

    if (sucesso) {
      return produto;
    } else {
      throw new Error("Falha ao salvar produto no Supabase");
    }
  } catch (error) {
    console.error("Erro na sincronizaÃ§Ã£o completa:", error);
    throw error;
  }
};

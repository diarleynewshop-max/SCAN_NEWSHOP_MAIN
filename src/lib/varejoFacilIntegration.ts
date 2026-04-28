import { supabase } from "@/lib/supabase";

// Interface para os dados do produto da Varejo Fácil
interface VarejoFacilProduct {
  id: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  estoque: number;
  // Adicione outros campos conforme necessário
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
 * Busca informações de um produto na API do Varejo Fácil
 * @param codigoBarras Código de barras do produto
 * @returns Dados do produto ou null se não encontrado
 */
export const buscarProdutoVarejoFacil = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => {
  try {
    console.log("Buscando produto na Varejo Fácil:", codigoBarras);

    // Primeiro tentar via Vercel Function para evitar CORS e expor credenciais no browser
    try {
      const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
      const response = await fetch(`/api/varejo-facil-proxy?codigo=${encodeURIComponent(codigoBarras)}&empresa=${empresa.toLowerCase()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.data || result;
        const produto = adaptarProdutoVarejoFacil(data, codigoBarras);

        if (produto.codigo_barras) {
          return produto;
        }
      }
    } catch (proxyError) {
      console.log("Proxy Vercel da Varejo Facil falhou:", proxyError);
    }

    // Tentar acesso direto como fallback
    try {
      const url = `${resolverBaseUrlVarejoFacil(contexto)}/api/v1/produtos/${codigoBarras}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          // Se a API exigir autenticação, adicione aqui:
          // 'Authorization': 'Bearer SUA_CHAVE_DE_API',
          // 'X-API-Key': 'SUA_CHAVE_DE_API'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Dados recebidos diretamente da Varejo Fácil:", data);

        // Adaptar os dados conforme a estrutura real da resposta da API
        const produto = adaptarProdutoVarejoFacil(data, codigoBarras);

        // Validar se os dados são válidos
        if (produto.codigo_barras) {
          return produto;
        }
      } else if (response.status !== 404) {
        console.log(`Erro HTTP ${response.status} ao acessar Varejo Fácil diretamente`);
      }
    } catch (directError) {
      console.log("Acesso direto à Varejo Fácil falhou:", directError);
      // Continuar para tentativa via função serverless
    }

    // Se acesso direto falhar (possivelmente por CORS), tentar via função serverless
    console.log("Tentando acesso via função serverless...");

    // URL da função serverless do Supabase (ajustar conforme sua configuração)
    const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
    const serverlessUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-varejo-facil?codigo=${codigoBarras}&empresa=${empresa.toLowerCase()}`;

    const serverlessResponse = await fetch(serverlessUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (serverlessResponse.ok) {
      const result = await serverlessResponse.json();

      if (result.success && result.data) {
        console.log("Dados recebidos via função serverless:", result.data);
        return result.data as VarejoFacilProduct;
      } else if (result.error) {
        console.log("Erro na função serverless:", result.error);
      }
    } else {
      console.log(`Função serverless retornou status ${serverlessResponse.status}`);
    }

    // Se ambas as tentativas falharem
    console.log("Produto não encontrado na Varejo Fácil (ambas as tentativas)");
    return null;

  } catch (error) {
    console.error("Erro ao buscar produto na Varejo Fácil:", error);
    return null;
  }
};

/**
 * Salva ou atualiza informações de produto no Supabase
 * @param produto Dados do produto a ser salvo
 * @returns Resultado da operação
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

    // Verificar se o produto já existe
    const { data: existingData, error: fetchError } = await supabase
      .from('estoque')
      .select('codigo')
      .eq('codigo', produto.codigo_barras)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // Erro diferente de "não encontrado"
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
 * Função completa que busca um produto na Varejo Fácil e salva no Supabase
 * @param codigoBarras Código de barras do produto
 * @returns Dados do produto salvo ou null se não encontrado
 */
export const sincronizarProduto = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => {
  try {
    // Buscar produto na Varejo Fácil
    const produto = await buscarProdutoVarejoFacil(codigoBarras, contexto);

    if (!produto) {
      console.log("Produto não encontrado na Varejo Fácil");
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
    console.error("Erro na sincronização completa:", error);
    throw error;
  }
};

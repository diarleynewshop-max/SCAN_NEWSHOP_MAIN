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

/**
 * Busca informações de um produto na API do Varejo Fácil
 * @param codigoBarras Código de barras do produto
 * @returns Dados do produto ou null se não encontrado
 */
export const buscarProdutoVarejoFacil = async (codigoBarras: string): Promise<VarejoFacilProduct | null> => {
  try {
    console.log("Buscando produto na Varejo Fácil:", codigoBarras);

    // TODO: Substituir pela URL real da API do Varejo Fácil
    // Esta é uma implementação genérica - você precisará adaptar conforme a documentação real
    const response = await fetch(`https://mercado.varejofacil.com/api/v1/produtos/${codigoBarras}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // Se a API exigir autenticação, adicione aqui:
        // 'Authorization': 'Bearer SUA_CHAVE_DE_API',
        // 'X-API-Key': 'SUA_CHAVE_DE_API'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log("Produto não encontrado na Varejo Fácil");
        return null;
      }
      throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Dados recebidos da Varejo Fácil:", data);

    // Adaptar os dados conforme a estrutura real da resposta da API
    // Esta é uma implementação genérica que você precisará ajustar
    const produto: VarejoFacilProduct = {
      id: data.id || data.produto_id,
      codigo_barras: data.codigo_barras || data.ean || data.gtin || codigoBarras,
      descricao: data.descricao || data.nome || data.titulo,
      preco: Number(data.preco || data.valor || data.price || 0),
      estoque: Number(data.estoque || data.quantidade || data.qtd || 0),
    };

    return produto;
  } catch (error) {
    console.error("Erro ao buscar produto na Varejo Fácil:", error);
    throw new Error(`Falha ao buscar produto: ${(error as Error).message}`);
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
export const sincronizarProduto = async (codigoBarras: string): Promise<VarejoFacilProduct | null> => {
  try {
    // Buscar produto na Varejo Fácil
    const produto = await buscarProdutoVarejoFacil(codigoBarras);

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
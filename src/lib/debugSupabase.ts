import { supabase } from "@/lib/supabase";

// Função temporária para debug - pode ser removida depois
export const debugSupabaseTable = async () => {
  try {
    console.log("=== DEBUG SUPABASE TABLE ===");

    // Verificar se a tabela 'estoque' existe
    const { data: tableData, error: tableError } = await supabase
      .from('estoque')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error("Erro ao acessar tabela 'estoque':", tableError);
      return;
    }

    console.log("Tabela 'estoque' acessada com sucesso");
    console.log("Primeiro registro:", tableData?.[0]);

    // Listar todas as tabelas disponíveis (se possível)
    /*
    // Esta parte requer permissões especiais e pode não funcionar
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (!tablesError && tables) {
      console.log("Tabelas disponíveis:", tables.map(t => t.table_name));
    }
    */

  } catch (error) {
    console.error("Erro durante debug:", error);
  }
};

// Função para testar com um código específico
export const testWithBarcode = async (barcode: string) => {
  try {
    console.log("=== TESTANDO COM CÓDIGO:", barcode, "===");

    // Tentativa 1: Consulta direta
    const { data, error } = await supabase
      .from('estoque')
      .select('*')
      .eq('codigo', barcode)
      .single();

    if (error) {
      console.error("Erro na consulta direta:", error);
    } else {
      console.log("Resultado da consulta direta:", data);
    }

    // Tentativa 2: Consulta com colunas específicas
    const columns = ['codigo', 'estoque', 'preco', 'nome_produto', 'descricao', 'nome'];
    for (const column of columns) {
      try {
        const { data: columnData, error: columnError } = await supabase
          .from('estoque')
          .select(column)
          .eq('codigo', barcode)
          .limit(1);

        if (!columnError && columnData && columnData.length > 0) {
          console.log(`Coluna '${column}' existe e contém dados:`, columnData[0]);
        } else if (columnError) {
          console.log(`Erro ao acessar coluna '${column}':`, columnError.message);
        } else {
          console.log(`Coluna '${column}' não encontrada para este código`);
        }
      } catch (e) {
        console.log(`Erro ao testar coluna '${column}':`, e);
      }
    }

  } catch (error) {
    console.error("Erro durante teste com código de barras:", error);
  }
};
import { supabase, isSupabaseConfigured } from "./supabaseClient";

// Lista fixa de secoes por empresa, usada tanto na configuracao do perfil de
// Compras (marcar as secoes do comprador) quanto no filtro da tela de Compras.
// As secoes reais vem do ERP conforme os produtos carregam; esta lista fixa e a
// unica fonte estatica disponivel no momento em que o comprador ainda nao tem
// produtos em tela (ex.: configurar o perfil).

export const SECOES_FIXAS_NEWSHOP = ["Eletronico", "Papelaria", "Bijuteria"];

export const SECOES_FIXAS_SF = [
  "GERAL",
  "PET SHOP",
  "UTILIDADES DOMÉSTICAS",
  "PAPELARIA",
  "ÁREA KIDS",
  "ELETRÔNICOS E INFORMÁTICA",
  "USO PESSOAL",
  "AUTOMOTIVO",
  "ESPORTE E LAZER",
  "CONSUMO",
];

export function getSecoesFixasPorEmpresa(empresa: string): string[] {
  const empresaNormalizada = empresa.toUpperCase();
  if (empresaNormalizada.includes("FACIL") || empresaNormalizada.includes("SOYE")) {
    return SECOES_FIXAS_SF;
  }

  return SECOES_FIXAS_NEWSHOP;
}

// ── Secoes REAIS vindas do banco (tabela compras) ────────────────────────────
// No dominio de Compras, Soye e Facil sao a mesma empresa (SF). Mapeia a empresa
// do perfil para a chave usada em `compras.empresa`.
function empresaComprasKey(empresa: string): "NEWSHOP" | "SF" {
  const e = String(empresa ?? "").toUpperCase();
  return e.includes("FACIL") || e.includes("SOYE") ? "SF" : "NEWSHOP";
}

// "Secoes" que na verdade sao status/tecnicas do fluxo de Compras, nao categorias
// reais de produto — ficam de fora da pre-selecao do perfil.
const SECOES_IGNORADAS = /^(pendentes a entrega|produto ja cadastrado|secao\s*\d+)$/i;

function normalizarSecaoChave(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Busca as secoes distintas realmente usadas na tabela `compras` para as empresas
// informadas (pagina de 1000 em 1000 porque a tabela pode ter milhares de linhas).
// Best-effort: em erro/sem Supabase devolve [] e o chamador cai na lista fixa.
export async function buscarSecoesComprasDisponiveis(empresas: string[]): Promise<string[]> {
  if (!isSupabaseConfigured || !Array.isArray(empresas) || empresas.length === 0) return [];

  const alvos = [...new Set(empresas.map(empresaComprasKey))];
  const encontradas = new Map<string, string>(); // chave normalizada -> rotulo original
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("compras")
      .select("secao")
      .in("empresa", alvos)
      .not("secao", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as Array<{ secao: string | null }>;
    for (const row of page) {
      const secao = String(row.secao ?? "").trim();
      if (!secao) continue;
      const chave = normalizarSecaoChave(secao).toUpperCase();
      if (!chave || SECOES_IGNORADAS.test(normalizarSecaoChave(secao))) continue;
      if (!encontradas.has(chave)) encontradas.set(chave, secao);
    }

    if (page.length < pageSize) break;
  }

  return [...encontradas.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

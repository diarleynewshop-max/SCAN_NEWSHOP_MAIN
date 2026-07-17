import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Empresa } from "@/hooks/useAuth";
import type { ActorCredenciais } from "@/lib/usuarios";

export interface RelatorioWhatsappConfig {
  id?: string;
  empresas: Empresa[];
  flag: "loja" | "cd" | "todos";
  secoes: string[];
  numeroWhatsapp: string;
  criterio: "diario" | "semanal" | "mensal";
  ativo: boolean;
}

function actorParams(actor: ActorCredenciais) {
  return { p_actor_login: actor.login, p_actor_senha: actor.senha };
}

export async function obterRelatoriosWhatsapp(actor: ActorCredenciais): Promise<RelatorioWhatsappConfig[]> {
  if (!isSupabaseConfigured) throw new Error("Supabase nao configurado.");
  const { data, error } = await supabase.rpc("super_relatorio_whatsapp_obter", actorParams(actor));
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: String(row.id),
    empresas: Array.isArray(row.empresas) ? row.empresas : ["NEWSHOP"],
    flag: row.flag === "cd" || row.flag === "todos" ? row.flag : "loja",
    secoes: Array.isArray(row.secoes) ? row.secoes : [],
    numeroWhatsapp: String(row.numero_whatsapp ?? ""),
    criterio: row.criterio === "semanal" || row.criterio === "mensal" ? row.criterio : "diario",
    ativo: row.ativo !== false,
  }));
}

export async function salvarRelatorioWhatsapp(
  actor: ActorCredenciais,
  config: RelatorioWhatsappConfig
): Promise<string> {
  if (!isSupabaseConfigured) throw new Error("Supabase nao configurado.");
  const { data, error } = await supabase.rpc("super_relatorio_whatsapp_salvar", {
    ...actorParams(actor),
    p_id: config.id || null,
    p_empresas: config.empresas,
    p_flag: config.flag,
    p_secoes: config.secoes,
    p_numero: config.numeroWhatsapp,
    p_criterio: config.criterio,
    p_ativo: config.ativo,
  });
  if (error) throw error;
  return String(data);
}

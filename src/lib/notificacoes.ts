// Central de notificacoes individuais (por nome do destinatario).
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export type NotificacaoTipo = "recomendacao" | "resultado_troca" | "pedido_concluido" | "mensagem";

export interface Notificacao {
  id: string;
  empresa: string;
  destinatario: string;
  tipo: NotificacaoTipo;
  titulo: string;
  corpo: string;
  refTipo: string | null;
  refId: string | null;
  lida: boolean;
  createdAt: string | null;
}

interface NotificacaoRow {
  id: string;
  empresa: string;
  destinatario: string;
  tipo: NotificacaoTipo;
  titulo: string;
  corpo: string | null;
  ref_tipo: string | null;
  ref_id: string | null;
  lida: boolean;
  created_at: string | null;
}

function mapRow(row: NotificacaoRow): Notificacao {
  return {
    id: row.id,
    empresa: row.empresa,
    destinatario: row.destinatario,
    tipo: row.tipo,
    titulo: row.titulo,
    corpo: row.corpo ?? "",
    refTipo: row.ref_tipo,
    refId: row.ref_id,
    lida: row.lida,
    createdAt: row.created_at,
  };
}

export interface CriarNotificacaoInput {
  empresa: string;
  destinatario: string;
  tipo: NotificacaoTipo;
  titulo: string;
  corpo?: string | null;
  refTipo?: string | null;
  refId?: string | null;
}

// Best-effort: nunca derruba o fluxo principal (retorna false em falha).
export async function criarNotificacao(input: CriarNotificacaoInput): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const destinatario = String(input.destinatario ?? "").trim();
  if (!destinatario) return false;
  try {
    const { error } = await supabase.from("notificacoes").insert({
      empresa: input.empresa,
      destinatario,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo ?? null,
      ref_tipo: input.refTipo ?? null,
      ref_id: input.refId ?? null,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[notificacoes] falha ao criar (best-effort):", err);
    return false;
  }
}

export async function listarNotificacoes(
  empresa: string,
  destinatario: string,
  limite = 50
): Promise<Notificacao[]> {
  if (!isSupabaseConfigured) return [];
  const nome = String(destinatario ?? "").trim();
  if (!nome) return [];
  const { data, error } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("empresa", empresa)
    .ilike("destinatario", nome)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return ((data as NotificacaoRow[] | null) ?? []).map(mapRow);
}

export async function contarNotificacoesNaoLidas(empresa: string, destinatario: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const nome = String(destinatario ?? "").trim();
  if (!nome) return 0;
  const { count, error } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("empresa", empresa)
    .ilike("destinatario", nome)
    .eq("lida", false);
  if (error) throw error;
  return count ?? 0;
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  if (!isSupabaseConfigured || !id) return;
  const { error } = await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
  if (error) throw error;
}

export async function marcarTodasNotificacoesLidas(empresa: string, destinatario: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const nome = String(destinatario ?? "").trim();
  if (!nome) return;
  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("empresa", empresa)
    .ilike("destinatario", nome)
    .eq("lida", false);
  if (error) throw error;
}

// Realtime: dispara onChange em qualquer mudanca de notificacoes da empresa.
export function subscribeNotificacoes(empresa: string, onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`notificacoes:${empresa}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notificacoes", filter: `empresa=eq.${empresa}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

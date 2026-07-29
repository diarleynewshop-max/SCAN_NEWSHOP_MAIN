import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Empresa } from "@/hooks/useAuth";
import type { ActorCredenciais } from "@/lib/usuarios";

export interface FeedbackStatus {
  deveExibir: boolean;
  motivo: string;
}

export interface FeedbackPayload {
  usuarioId: string;
  login: string;
  empresa: Empresa;
  notaGeral: number;
  notaClareza: number;
  bom: string;
  ruim: string;
  melhorar: string;
  ferramentas: string;
  outros: string;
  rotaAtual: string;
  userAgent: string;
}

export interface FeedbackAdmin {
  id: string;
  usuarioId: string | null;
  empresa: Empresa;
  nome: string;
  login: string;
  notaGeral: number;
  notaClareza: number;
  bom: string;
  ruim: string;
  melhorar: string;
  ferramentas: string;
  outros: string;
  rotaAtual: string;
  userAgent: string;
  createdAt: string;
}

type FeedbackStatusRow = {
  deve_exibir?: boolean;
  motivo?: string | null;
};

type FeedbackAdminRow = {
  id?: string;
  usuario_id?: string | null;
  empresa?: string;
  nome?: string;
  login?: string;
  nota_geral?: number;
  nota_clareza?: number;
  bom?: string | null;
  ruim?: string | null;
  melhorar?: string | null;
  ferramentas?: string | null;
  outros?: string | null;
  rota_atual?: string | null;
  user_agent?: string | null;
  created_at?: string;
};

function assertSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase nao configurado.");
  }
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function empresaValida(value: unknown): Empresa {
  const empresa = String(value ?? "").trim().toUpperCase();
  if (empresa === "SOYE" || empresa === "FACIL" || empresa === "SEFULY") return empresa;
  return "NEWSHOP";
}

function mapFeedback(row: FeedbackAdminRow): FeedbackAdmin {
  return {
    id: String(row.id ?? ""),
    usuarioId: row.usuario_id ? String(row.usuario_id) : null,
    empresa: empresaValida(row.empresa),
    nome: texto(row.nome),
    login: texto(row.login),
    notaGeral: Number(row.nota_geral ?? 0),
    notaClareza: Number(row.nota_clareza ?? 0),
    bom: texto(row.bom),
    ruim: texto(row.ruim),
    melhorar: texto(row.melhorar),
    ferramentas: texto(row.ferramentas),
    outros: texto(row.outros),
    rotaAtual: texto(row.rota_atual),
    userAgent: texto(row.user_agent),
    createdAt: String(row.created_at ?? ""),
  };
}

export function temComentarioFeedback(input: Pick<FeedbackPayload, "bom" | "ruim" | "melhorar" | "ferramentas" | "outros">): boolean {
  return [input.bom, input.ruim, input.melhorar, input.ferramentas, input.outros].some((value) => texto(value).length > 0);
}

export async function verificarFeedbackPendente(input: { usuarioId: string; login: string }): Promise<FeedbackStatus> {
  assertSupabase();
  if (!input.usuarioId || !input.login) return { deveExibir: false, motivo: "usuario invalido" };

  const { data, error } = await supabase.rpc("feedback_deve_exibir", {
    p_usuario_id: input.usuarioId,
    p_login: input.login,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? (data[0] as FeedbackStatusRow | undefined) : undefined;
  return {
    deveExibir: row?.deve_exibir === true,
    motivo: texto(row?.motivo),
  };
}

export async function enviarFeedback(payload: FeedbackPayload): Promise<string> {
  assertSupabase();
  const { data, error } = await supabase.rpc("feedback_enviar_resposta", {
    p_usuario_id: payload.usuarioId,
    p_login: payload.login,
    p_empresa: payload.empresa,
    p_nota_geral: payload.notaGeral,
    p_nota_clareza: payload.notaClareza,
    p_bom: texto(payload.bom) || null,
    p_ruim: texto(payload.ruim) || null,
    p_melhorar: texto(payload.melhorar) || null,
    p_ferramentas: texto(payload.ferramentas) || null,
    p_outros: texto(payload.outros) || null,
    p_rota_atual: texto(payload.rotaAtual) || null,
    p_user_agent: texto(payload.userAgent) || null,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function listarFeedbackAdmin(
  actor: ActorCredenciais,
  filtros: { empresa?: Empresa | ""; limite?: number } = {}
): Promise<FeedbackAdmin[]> {
  assertSupabase();
  const { data, error } = await supabase.rpc("admin_listar_feedback", {
    p_actor_login: actor.login,
    p_actor_senha: actor.senha,
    p_empresa: filtros.empresa || null,
    p_limite: filtros.limite ?? 500,
  });
  if (error) throw error;
  return ((data ?? []) as FeedbackAdminRow[]).map(mapFeedback);
}

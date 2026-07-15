// Chat 1:1 entre usuarios (por nome). Texto (<=500), foto e item (mini-scanner).
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { criarNotificacao } from "./notificacoes";

export const LIMITE_MENSAGEM = 500;

export type MensagemTipo = "texto" | "foto" | "item" | "recomendacao";

export interface UsuarioChat {
  login: string;
  nome: string;
  role: string;
  fotoUrl?: string | null;
}

type UsuarioChatRow = {
  login?: string;
  nome?: string;
  role?: string;
  foto_url?: string | null;
};

export interface Mensagem {
  id: string;
  empresa: string;
  remetente: string;
  destinatario: string;
  conteudo: string;
  fotoUrl: string | null;
  itemCodigo: string | null;
  itemSku: string | null;
  itemDescricao: string | null;
  itemFoto: string | null;
  tipo: MensagemTipo;
  recomendacaoId: string | null;
  lida: boolean;
  createdAt: string | null;
}

export interface ResumoConversa {
  nome: string;
  ultimaMensagem: string;
  ultimoHorario: string | null;
  naoLidas: number;
  tipo: MensagemTipo;
}

interface MensagemRow {
  id: string;
  empresa: string;
  remetente: string;
  destinatario: string;
  conteudo: string;
  foto_url: string | null;
  item_codigo: string | null;
  item_sku: string | null;
  item_descricao: string | null;
  item_foto: string | null;
  tipo: MensagemTipo;
  recomendacao_id: string | null;
  lida: boolean;
  created_at: string | null;
}

function mapRow(row: MensagemRow): Mensagem {
  return {
    id: row.id,
    empresa: row.empresa,
    remetente: row.remetente,
    destinatario: row.destinatario,
    conteudo: row.conteudo ?? "",
    fotoUrl: row.foto_url,
    itemCodigo: row.item_codigo,
    itemSku: row.item_sku,
    itemDescricao: row.item_descricao,
    itemFoto: row.item_foto,
    tipo: row.tipo,
    recomendacaoId: row.recomendacao_id,
    lida: row.lida,
    createdAt: row.created_at,
  };
}

// Diretorio de usuarios da empresa (para escolher com quem falar).
export async function listarUsuariosChat(empresa: string, excluirNome?: string): Promise<UsuarioChat[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("chat_listar_usuarios", { p_empresa: empresa });
  if (error) throw error;
  const excluir = String(excluirNome ?? "").trim().toLowerCase();
  return ((data as UsuarioChatRow[] | null) ?? [])
    .map((u) => ({
      login: String(u.login ?? ""),
      nome: String(u.nome ?? ""),
      role: String(u.role ?? ""),
      fotoUrl: u.foto_url ?? null,
    }))
    .filter((u) => String(u.nome ?? "").trim().toLowerCase() !== excluir);
}

function normalizarPessoaChat(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function resolverDestinatarioChat(empresa: string, nomeOuLogin: string): Promise<string> {
  const alvo = String(nomeOuLogin ?? "").trim();
  if (!alvo || !isSupabaseConfigured) return alvo;

  const usuarios = await listarUsuariosChat(empresa);
  const alvoNorm = normalizarPessoaChat(alvo);
  const usuario = usuarios.find((u) => (
    normalizarPessoaChat(u.nome) === alvoNorm ||
    normalizarPessoaChat(u.login) === alvoNorm
  ));

  return usuario?.nome?.trim() || alvo;
}

// Conversa entre duas pessoas (ambas as direcoes), ordem cronologica.
export async function listarConversa(empresa: string, a: string, b: string, limite = 200): Promise<Mensagem[]> {
  if (!isSupabaseConfigured) return [];
  const p1 = String(a ?? "").trim();
  const p2 = String(b ?? "").trim();
  if (!p1 || !p2) return [];
  const { data, error } = await supabase
    .from("mensagens")
    .select("*")
    .eq("empresa", empresa)
    .or(
      `and(remetente.eq.${p1},destinatario.eq.${p2}),and(remetente.eq.${p2},destinatario.eq.${p1})`
    )
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return ((data as MensagemRow[] | null) ?? []).map(mapRow);
}

// ── Foto no Storage ──────────────────────────────────────────────────
const BUCKET = "compras-fotos";

function dataUrlParaBlob(dataUrl: string): { blob: Blob; contentType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const contentType = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

async function subirFotoChat(empresa: string, dataUrl: string): Promise<string | null> {
  const conv = dataUrlParaBlob(dataUrl);
  if (!conv) return null;
  const path = `chat/${empresa}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    const up = await supabase.storage.from(BUCKET).upload(path, conv.blob, {
      contentType: conv.contentType,
      upsert: true,
    });
    if (up.error) throw up.error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn("[chat] falha ao subir foto:", err);
    return null;
  }
}

export interface EnviarMensagemInput {
  empresa: string;
  remetente: string;
  destinatario: string;
  conteudo?: string;
  fotoDataUrl?: string | null;
  item?: { codigo: string; sku?: string | null; descricao?: string | null; foto?: string | null } | null;
  recomendacaoId?: string | null;
}

export async function enviarMensagem(input: EnviarMensagemInput): Promise<Mensagem> {
  if (!isSupabaseConfigured) throw new Error("Supabase nao configurado.");
  const remetente = String(input.remetente ?? "").trim();
  const destinatario = String(input.destinatario ?? "").trim();
  if (!remetente || !destinatario) throw new Error("Remetente/destinatario invalido.");

  const conteudo = String(input.conteudo ?? "").slice(0, LIMITE_MENSAGEM);
  const item = input.item ?? null;
  let fotoUrl: string | null = null;
  if (input.fotoDataUrl) {
    fotoUrl = input.fotoDataUrl.startsWith("data:")
      ? await subirFotoChat(input.empresa, input.fotoDataUrl)
      : input.fotoDataUrl;
  }

  const tipo: MensagemTipo = input.recomendacaoId
    ? "recomendacao"
    : item
      ? "item"
      : fotoUrl
        ? "foto"
        : "texto";

  if (tipo === "texto" && !conteudo.trim()) {
    throw new Error("Mensagem vazia.");
  }

  const { data, error } = await supabase
    .from("mensagens")
    .insert({
      empresa: input.empresa,
      remetente,
      destinatario,
      conteudo,
      foto_url: fotoUrl,
      item_codigo: item?.codigo ?? null,
      item_sku: item?.sku ?? null,
      item_descricao: item?.descricao ?? null,
      item_foto: item?.foto ?? null,
      tipo,
      recomendacao_id: input.recomendacaoId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Notificacao de nova mensagem para o destinatario (best-effort).
  const resumo = tipo === "foto" ? "enviou uma foto" : tipo === "item" ? "enviou um item" : tipo === "recomendacao" ? "enviou uma recomendacao" : conteudo.slice(0, 80);
  await criarNotificacao({
    empresa: input.empresa,
    destinatario,
    tipo: "mensagem",
    titulo: `Nova mensagem de ${remetente}`,
    corpo: resumo,
    refTipo: "chat",
    refId: remetente,
  });

  return mapRow(data as MensagemRow);
}

export async function marcarConversaLida(empresa: string, meuNome: string, outroNome: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const eu = String(meuNome ?? "").trim();
  const outro = String(outroNome ?? "").trim();
  if (!eu || !outro) return;
  const { error } = await supabase
    .from("mensagens")
    .update({ lida: true })
    .eq("empresa", empresa)
    .eq("destinatario", eu)
    .eq("remetente", outro)
    .eq("lida", false);
  if (error) throw error;
}

export async function contarMensagensNaoLidas(empresa: string, meuNome: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const eu = String(meuNome ?? "").trim();
  if (!eu) return 0;
  const { count, error } = await supabase
    .from("mensagens")
    .select("id", { count: "exact", head: true })
    .eq("empresa", empresa)
    .eq("destinatario", eu)
    .eq("lida", false);
  if (error) throw error;
  return count ?? 0;
}

export async function listarResumoConversas(empresa: string, meuNome: string): Promise<Record<string, ResumoConversa>> {
  if (!isSupabaseConfigured) return {};
  const eu = String(meuNome ?? "").trim();
  if (!eu) return {};

  const { data, error } = await supabase
    .from("mensagens")
    .select("remetente,destinatario,conteudo,tipo,created_at,lida")
    .eq("empresa", empresa)
    .or(`remetente.eq.${eu},destinatario.eq.${eu}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const resumo: Record<string, ResumoConversa> = {};
  for (const row of (data as Pick<MensagemRow, "remetente" | "destinatario" | "conteudo" | "tipo" | "created_at" | "lida">[] | null) ?? []) {
    const outro = row.remetente === eu ? row.destinatario : row.remetente;
    if (!outro) continue;

    if (!resumo[outro]) {
      const conteudo = String(row.conteudo ?? "").trim();
      const fallback = row.tipo === "foto"
        ? "Foto"
        : row.tipo === "item"
          ? "Item enviado"
          : row.tipo === "recomendacao"
            ? "Recomendacao de troca"
            : "";
      resumo[outro] = {
        nome: outro,
        ultimaMensagem: conteudo || fallback,
        ultimoHorario: row.created_at,
        naoLidas: 0,
        tipo: row.tipo,
      };
    }

    if (row.destinatario === eu && row.lida === false) {
      resumo[outro].naoLidas += 1;
    }
  }

  return resumo;
}

export function subscribeMensagens(empresa: string, onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`mensagens:${empresa}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mensagens", filter: `empresa=eq.${empresa}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

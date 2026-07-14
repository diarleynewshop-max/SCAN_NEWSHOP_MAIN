// Histórico de um item nos pedidos (Supabase) usado ao escanear no Scanner:
//  - emConferencia: item está em algum pedido ainda NÃO concluído (analisado/
//    em_andamento) → o novo pedido é barrado (evita duplicar).
//  - conferidoRecente: item foi conferido (concluído) nos últimos 7 dias → aviso.
//  - ocorrencias: últimas conferências concluídas (data, status, quem) → histórico.
import { supabase, isSupabaseConfigured } from "./supabaseClient";

export interface HistoricoOcorrencia {
  data: string;          // ISO, para ordenar
  dataFormatada: string; // dd/mm/aaaa
  status: string;        // separado | nao_tem | parcial | pendente
  listeiro: string;
}

export interface HistoricoItemResultado {
  ocorrencias: HistoricoOcorrencia[];
  emConferencia: { titulo: string; pessoa: string; status: string } | null;
  conferidoRecente: { dataFormatada: string; diasAtras: number } | null;
  totalConcluidas: number;
}

const VAZIO: HistoricoItemResultado = {
  ocorrencias: [],
  emConferencia: null,
  conferidoRecente: null,
  totalConcluidas: 0,
};

function normalizarEmpresa(value: string): string {
  const e = String(value ?? "").toUpperCase();
  if (e.includes("SOYE")) return "SOYE";
  if (e.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

// Alguns leitores prefixam o código com identificadores AIM (ex.: "]C1"). Limpa.
function limparCodigo(value: string): string {
  return String(value ?? "").trim().replace(/^\][A-Za-z]\d/, "").trim();
}

function formatarData(dateKey: string | null, createdAt: string | null): { iso: string; label: string } {
  const base = dateKey ? `${dateKey}T12:00:00` : createdAt;
  const d = base ? new Date(base) : null;
  if (!d || Number.isNaN(d.getTime())) return { iso: "", label: "-" };
  return {
    iso: d.toISOString(),
    label: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d),
  };
}

function statusExibicao(status: string): string {
  return status === "nao_tem_tudo" ? "parcial" : status;
}

interface HistoricoRow {
  status: string;
  pedidos: {
    status: string;
    data_conferencia: string | null;
    created_at: string | null;
    pessoa: string | null;
    listeiro: string | null;
    conferente: string | null;
    titulo: string | null;
  } | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export async function consultarHistoricoItem(
  empresa: string,
  codigo: string
): Promise<HistoricoItemResultado> {
  if (!isSupabaseConfigured) return VAZIO;
  const cod = limparCodigo(codigo);
  if (!cod) return VAZIO;

  const emp = normalizarEmpresa(empresa);
  const { data, error } = await supabase
    .from("pedido_itens")
    .select(
      "status,pedidos!inner(status,data_conferencia,created_at,pessoa,listeiro,conferente,titulo)"
    )
    .eq("codigo", cod)
    .eq("pedidos.empresa", emp)
    .limit(300);
  if (error) throw error;

  const rows = (data ?? []) as unknown as HistoricoRow[];
  const ocorrencias: HistoricoOcorrencia[] = [];
  let emConferencia: HistoricoItemResultado["emConferencia"] = null;
  let conferidoRecente: HistoricoItemResultado["conferidoRecente"] = null;
  const agora = Date.now();

  for (const row of rows) {
    const p = row.pedidos;
    if (!p) continue;
    const statusPedido = String(p.status ?? "");

    if (statusPedido === "analisado" || statusPedido === "em_andamento") {
      if (!emConferencia) {
        emConferencia = {
          titulo: String(p.titulo ?? "").trim() || "Pedido em aberto",
          pessoa: String(p.pessoa ?? p.listeiro ?? p.conferente ?? "").trim(),
          status: statusPedido,
        };
      }
      continue;
    }

    if (statusPedido === "concluido") {
      const { iso, label } = formatarData(p.data_conferencia, p.created_at);
      ocorrencias.push({
        data: iso,
        dataFormatada: label,
        status: statusExibicao(row.status),
        listeiro: String(p.listeiro ?? p.pessoa ?? p.conferente ?? "").trim(),
      });

      if (p.data_conferencia) {
        const dt = new Date(`${p.data_conferencia}T12:00:00`).getTime();
        if (!Number.isNaN(dt) && agora - dt >= 0 && agora - dt <= 7 * DIA_MS) {
          const dias = Math.floor((agora - dt) / DIA_MS);
          if (!conferidoRecente || dias < conferidoRecente.diasAtras) {
            conferidoRecente = { dataFormatada: label, diasAtras: dias };
          }
        }
      }
    }
  }

  ocorrencias.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  return {
    ocorrencias: ocorrencias.slice(0, 10),
    emConferencia,
    conferidoRecente,
    totalConcluidas: ocorrencias.length,
  };
}

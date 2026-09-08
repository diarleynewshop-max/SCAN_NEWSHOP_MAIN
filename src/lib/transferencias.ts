/**
 * transferencias.ts
 *
 * Transferencia entre lojas (NEWSHOP / SOYE / FACIL) — ver migration 047.
 *
 * O modelo e o MESMO pedido de sempre, com dois campos a mais:
 *   empresa         = loja que SEPARA e MANDA (dona da fila de conferencia)
 *   empresa_destino = loja que RECEBE
 *
 * Por isso quem confere uma transferencia e a loja de ORIGEM, na tela de
 * Conferencia que ela ja usa todo dia — nao existe conferencia separada.
 */

import {
  enviarListaParaConferencia,
  listarPedidos,
  type EmpresaKey,
  type MeuPedidoResumo,
} from "./pedidosFila";
import type { PedidoFilaProduto } from "./pedidosFila";

// SEFULY fica de fora (ver COM_TRANSFERENCIA_LOJA em lojaFeatures.ts).
export const LOJAS_TRANSFERENCIA = ["NEWSHOP", "SOYE", "FACIL"] as const;
export type LojaTransferencia = (typeof LOJAS_TRANSFERENCIA)[number];

// "Eu peco" = a outra loja separa e manda pra mim.
// "Eu mando" = eu separo e mando pra outra loja.
export type DirecaoTransferencia = "pedir" | "enviar";

const ROTULOS: Record<LojaTransferencia, string> = {
  NEWSHOP: "NEWSHOP",
  SOYE: "SOYE",
  FACIL: "FACIL ATACADO",
};

export function rotuloLoja(loja: string | null | undefined): string {
  const chave = normalizarLojaTransferencia(loja);
  return chave ? ROTULOS[chave] : String(loja ?? "").trim().toUpperCase();
}

export function normalizarLojaTransferencia(value: unknown): LojaTransferencia | null {
  const bruto = String(value ?? "").trim().toUpperCase();
  if (!bruto) return null;
  if (bruto.includes("NEWSHOP")) return "NEWSHOP";
  if (bruto.includes("SOYE")) return "SOYE";
  if (bruto.includes("FACIL")) return "FACIL";
  return null;
}

/** Lojas parceiras possiveis: todas menos a minha. */
export function lojasParceiras(minhaLoja: unknown): LojaTransferencia[] {
  const minha = normalizarLojaTransferencia(minhaLoja);
  return LOJAS_TRANSFERENCIA.filter((loja) => loja !== minha);
}

/**
 * Resolve quem separa e quem recebe a partir da direcao escolhida na tela.
 * Concentrar isso aqui e o que impede a tela de inverter origem e destino.
 */
export function resolverRotaTransferencia(params: {
  minhaLoja: unknown;
  parceira: unknown;
  direcao: DirecaoTransferencia;
}): { origem: LojaTransferencia; destino: LojaTransferencia } {
  const minha = normalizarLojaTransferencia(params.minhaLoja);
  const parceira = normalizarLojaTransferencia(params.parceira);

  if (!minha) throw new Error("Sua loja nao participa de transferencia entre lojas.");
  if (!parceira) throw new Error("Escolha a outra loja.");
  if (minha === parceira) throw new Error("A outra loja tem que ser diferente da sua.");

  return params.direcao === "pedir"
    ? { origem: parceira, destino: minha }
    : { origem: minha, destino: parceira };
}

export function montarTituloTransferencia(params: {
  origem: LojaTransferencia;
  destino: LojaTransferencia;
  pessoa: string;
  quando?: Date;
}): string {
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(params.quando ?? new Date());

  const pessoa = String(params.pessoa ?? "").trim() || "Sem nome";
  return `⇄ ${params.origem} → ${params.destino} — ${pessoa} — ${data}`;
}

export interface EnviarTransferenciaPayload {
  origem: LojaTransferencia;
  destino: LojaTransferencia;
  pessoa: string;
  titulo?: string;
  conferenceId?: string;
  dataCriacao?: string;
  produtos: PedidoFilaProduto[];
}

/**
 * Grava a transferencia como pedido `analisado` na fila de conferencia da
 * loja de ORIGEM. A partir daqui e o fluxo normal de conferencia.
 */
export async function enviarTransferencia(payload: EnviarTransferenciaPayload) {
  if (payload.origem === payload.destino) {
    throw new Error("A loja de destino tem que ser diferente da loja que separa.");
  }
  if (!Array.isArray(payload.produtos) || payload.produtos.length === 0) {
    throw new Error("Transferencia sem itens.");
  }

  const resultado = await enviarListaParaConferencia({
    empresa: payload.origem,
    empresaDestino: payload.destino,
    tipo: "transferencia",
    flag: "loja",
    pessoa: payload.pessoa,
    titulo:
      payload.titulo ||
      montarTituloTransferencia({ origem: payload.origem, destino: payload.destino, pessoa: payload.pessoa }),
    totalItens: payload.produtos.length,
    dataCriacao: payload.dataCriacao ?? new Date().toISOString(),
    conferenceId: payload.conferenceId,
    produtos: payload.produtos,
  });

  if (!resultado) {
    throw new Error("Nao foi possivel gravar a transferencia (verifique a conexao com o Supabase).");
  }
  return resultado;
}

export interface TransferenciaResumo extends MeuPedidoResumo {
  origem: EmpresaKey | null;
  destino: EmpresaKey | null;
  /** true quando a MINHA loja e quem separa e manda. */
  souOrigem: boolean;
}

/** Transferencias que envolvem a minha loja, nos dois sentidos. */
export async function listarTransferenciasDaLoja(minhaLoja: string): Promise<TransferenciaResumo[]> {
  const minha = normalizarLojaTransferencia(minhaLoja);
  if (!minha) return [];

  const pedidos = await listarPedidos({ empresa: minha, flag: "loja", tipo: "transferencia" });

  return pedidos.map((pedido) => ({
    ...pedido,
    origem: pedido.empresa,
    destino: pedido.empresaDestino,
    souOrigem: pedido.empresa === minha,
  }));
}

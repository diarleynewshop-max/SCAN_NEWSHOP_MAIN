/**
 * webhookRouter.ts
 * Envia a lista escaneada para a fila de conferência no Supabase.
 */

import {
  dispararErpFotoSyncLista,
  fecharConferenciaExistente,
  enviarListaParaConferencia,
  removerListaDaConferencia,
  type EnviarListaParaConferenciaResult,
} from "./pedidosFila";
import { lojaEnviaPrevendaParaPdv } from "./lojaFeatures";
import { buscarProdutoVarejoFacil } from "./varejoFacilIntegration";
import {
  descreverFalhaPrevenda,
  enfileirarPrevendaConferencia,
  type EnfileirarPrevendaResult,
} from "./pdvFila";
import type { PdvPrevendaCliente } from "./pdvPrevenda";

type ListFlag = "loja" | "cd";

export interface WebhookPayload {
  flag: ListFlag;
  empresa: string;
  pessoa: string;
  titulo: string;
  totalItens: number;
  dataCriacao: string;
  conferenceId?: string;
  clientePdv?: PdvPrevendaCliente | null;
  produtos: Array<{
    barcode: string;
    sku: string;
    description?: string;
    quantidade: number;
    removeTag: boolean;
    secao?: string | null;
    photo: string | null;
    erpProdutoId?: string;
    precoUnitario?: number | null;
    descontoPercentual?: number | null;
    appPhotoWithoutErp?: boolean;
  }>;
}

export interface EnviarListaParaSupabaseResult {
  fila: EnviarListaParaConferenciaResult;
  prevenda?: EnfileirarPrevendaResult;
  pdvDireto: boolean;
}

function toMoneyOrNull(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function clientePdvValido(cliente: PdvPrevendaCliente | null | undefined): boolean {
  const codigo = String(cliente?.codigo ?? "").replace(/\D/g, "");
  const documento = String(cliente?.cpfCnpj ?? "").replace(/\D/g, "");
  return Boolean(String(cliente?.nome ?? "").trim() && (codigo || documento));
}

async function prepararPedidoDiretoPdv(payload: WebhookPayload): Promise<WebhookPayload> {
  if (!lojaEnviaPrevendaParaPdv(payload.empresa)) return payload;
  if (!clientePdvValido(payload.clientePdv)) {
    throw new Error("Selecione ou cadastre o cliente antes de enviar ao PDV.");
  }

  const produtos = await Promise.all(
    payload.produtos.map(async (produto) => {
      const precoAtual = toMoneyOrNull(produto.precoUnitario);
      if (precoAtual) return { ...produto, precoUnitario: precoAtual };

      const codigo = String(produto.barcode ?? "").trim();
      const produtoErp = codigo
        ? await buscarProdutoVarejoFacil(codigo, { empresa: payload.empresa, flag: payload.flag })
        : null;
      const precoErp = toMoneyOrNull(produtoErp?.precoVarejo ?? produtoErp?.preco);

      return {
        ...produto,
        description: produto.description || produtoErp?.descricao || "",
        secao: produto.secao || produtoErp?.secao || null,
        erpProdutoId: produto.erpProdutoId || produtoErp?.id,
        precoUnitario: precoErp,
      };
    })
  );

  const semPreco = produtos.filter((produto) => !toMoneyOrNull(produto.precoUnitario));
  if (semPreco.length > 0) {
    const exemplos = semPreco.slice(0, 5).map((produto) => produto.barcode).join(", ");
    throw new Error(`PDV bloqueado: ${semPreco.length} item(ns) sem preco no ERP (${exemplos}).`);
  }

  return { ...payload, produtos };
}

export async function enviarListaParaSupabase(payload: WebhookPayload): Promise<EnviarListaParaSupabaseResult> {
  // Supabase e o unico destino do envio. Erro aqui PRECISA propagar — nao ha fallback.
  const pdvDireto = lojaEnviaPrevendaParaPdv(payload.empresa);
  const payloadFinal = await prepararPedidoDiretoPdv(payload);
  const fila = await enviarListaParaConferencia(payloadFinal);
  if (!fila) {
    throw new Error("Nao foi possivel gravar a lista no Supabase (verifique a configuracao).");
  }

  try {
    await dispararErpFotoSyncLista(payloadFinal);
  } catch (error) {
    console.error("[webhookRouter] Falha ao disparar erp-foto-sync (nao bloqueia envio):", error);
  }

  let prevenda: EnfileirarPrevendaResult | undefined;
  if (pdvDireto) {
    prevenda = await enfileirarPrevendaConferencia({
      empresa: payloadFinal.empresa,
      pedidoId: fila.pedidoId,
      conferenceId: fila.conferenceId,
      conferente: payloadFinal.pessoa || "SCAN",
      origemTipo: "pedido_direto",
      cliente: payloadFinal.clientePdv ?? null,
      itens: payloadFinal.produtos.map((produto) => ({
        codigo: produto.barcode,
        sku: produto.sku,
        descricao: produto.description ?? null,
        quantidadePedida: produto.quantidade,
        quantidadeReal: produto.quantidade,
        status: "separado",
        descontoPercentual: produto.descontoPercentual ?? 0,
      })),
    });

    if (!prevenda.ok) {
      if (fila.created) {
        await removerListaDaConferencia(fila.pedidoId).catch((error) => {
          console.error("[webhookRouter] Falha ao desfazer pedido sem pre-venda PDV:", error);
        });
      }
      throw new Error(descreverFalhaPrevenda(prevenda) || "PDV nao recebeu o pedido.");
    }

    await fecharConferenciaExistente(fila.pedidoId, {
      empresa: payloadFinal.empresa,
      conferente: payloadFinal.pessoa || "SCAN",
      tempoSegundos: null,
      itens: payloadFinal.produtos.map((produto) => ({
        codigo: produto.barcode,
        sku: produto.sku,
        descricao: produto.description ?? null,
        secao: produto.secao ?? null,
        quantidadePedida: produto.quantidade,
        quantidadeReal: produto.quantidade,
        status: "separado",
        photo: produto.photo,
        precoUnitario: produto.precoUnitario ?? null,
      })),
    });
  }

  return { fila, prevenda, pdvDireto };
}

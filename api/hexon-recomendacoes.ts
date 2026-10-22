import type { VercelRequest, VercelResponse } from "@vercel/node";

const HEXON_URL = "https://api-recebimento.newgrup.cloud/functions/v1/separacao-integration";
const MAX_LOTES = 100;

type LoteHexon = {
  id?: string;
  descricao?: string | null;
  externalRef?: string | null;
  destino?: string | null;
  createdAt?: string | null;
};

type ItemHexon = {
  id?: string;
  descricao?: string | null;
  itemDescricao?: string | null;
  ean?: string | null;
  quantidade?: number | null;
  statusItem?: string | null;
  encontrado?: boolean | null;
  externalItemRef?: string | null;
};

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function resultOf<T>(body: unknown): T | null {
  if (!body || typeof body !== "object") return null;
  return ((body as { result?: T }).result ?? null) as T | null;
}

async function lerJson(response: Response): Promise<unknown> {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return { error: body.slice(0, 500) };
  }
}

async function buscarLote(id: string, apiKey: string): Promise<{ lote: LoteHexon; itens: ItemHexon[] } | null> {
  const url = new URL(HEXON_URL);
  url.searchParams.set("id", id);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await lerJson(response);
  if (!response.ok) throw new Error(`Hexon retornou ${response.status} ao abrir lote.`);
  const lote = resultOf<LoteHexon & { itens?: ItemHexon[] }>(body);
  if (!lote) return null;
  return { lote, itens: Array.isArray(lote.itens) ? lote.itens : [] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = texto(process.env.HEXON_API_KEY);
  if (!apiKey) return res.status(503).json({ error: "HEXON_API_KEY nao configurada." });

  try {
    const response = await fetch(HEXON_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await lerJson(response);
    if (!response.ok) {
      return res.status(response.status === 401 || response.status === 403 ? 502 : response.status).json({
        error: "Falha ao consultar os lotes pendentes no Hexon.",
      });
    }

    const lotes = resultOf<LoteHexon[]>(body);
    if (!Array.isArray(lotes)) return res.status(502).json({ error: "Resposta de lotes do Hexon invalida." });

    const details: Array<{ lote: LoteHexon; itens: ItemHexon[] }> = [];
    for (let index = 0; index < Math.min(lotes.length, MAX_LOTES); index += 20) {
      const batch = lotes.slice(index, index + 20);
      details.push(...(await Promise.all(batch.map((lote) => texto(lote.id) ? buscarLote(texto(lote.id), apiKey) : null))).filter(
        (value): value is { lote: LoteHexon; itens: ItemHexon[] } => value !== null
      ));
    }

    const recomendacoes = details.flatMap(({ lote, itens }) => itens
      .filter((item) => texto(item.statusItem).toLowerCase() === "reposicao")
      .map((item) => {
        const destino = texto(lote.destino);
        const loja = (["NEWSHOP", "FACIL", "SOYE"].find((nome) => nome === destino.toUpperCase()) ?? null);
        return {
          id: texto(item.id) || `${texto(lote.id)}:${texto(item.externalItemRef) || texto(item.ean)}`,
          loteId: texto(lote.id),
          lote: texto(lote.descricao) || texto(lote.externalRef) || "Lote Hexon",
          externalRef: texto(lote.externalRef) || null,
          destino: destino || null,
          loja,
          criadoEm: texto(lote.createdAt) || null,
          descricao: texto(item.itemDescricao) || texto(item.descricao) || "Item sem descricao",
          ean: texto(item.ean) || null,
          externalItemRef: texto(item.externalItemRef) || null,
          quantidade: Math.max(0, Number(item.quantidade) || 0),
          encontrado: item.encontrado !== false,
        };
      }));

    return res.status(200).json({ result: recomendacoes });
  } catch (error) {
    console.error("[hexon-recomendacoes] Falha ao consultar recomendacoes", error);
    return res.status(502).json({ error: error instanceof Error ? error.message : "Falha ao consultar Hexon." });
  }
}

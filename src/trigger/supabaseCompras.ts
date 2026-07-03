// Espelho de itens de compra no Supabase a partir do Trigger (dual-write com o
// ClickUp — Opcao 1 da migracao). Best-effort: se a env nao estiver setada ou a
// chamada falhar, o chamador apenas loga; o ClickUp continua sendo criado normal.
// Usa a funcao registrar_item_compra (nao ressuscita item ja analisado).
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

function empresaCompras(empresa?: string): "NEWSHOP" | "SF" {
  const e = String(empresa ?? "NEWSHOP").toUpperCase();
  return e === "SOYE" || e === "FACIL" ? "SF" : "NEWSHOP";
}

// Mesma regra de chave do dedup do app (COD:<numerico> | SKU:<sku>).
function produtoKey(codigo?: string, sku?: string | null): string {
  const cod = String(codigo ?? "").toUpperCase().trim();
  const num = cod.match(/\d{6,14}/)?.[0];
  if (num) return `COD:${num}`;
  const s = String(sku ?? "").toUpperCase().trim();
  if (s) return `SKU:${s}`;
  return cod ? `COD:${cod}` : "";
}

export interface ItemCompraSupabase {
  empresa?: string;
  codigo: string;
  sku?: string | null;
  descricao?: string | null;
  secao?: string | null;
  clickupTaskId?: string | null;
}

export async function registrarItemCompraSupabase(item: ItemCompraSupabase): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[trigger][supabase] SUPABASE_URL/KEY nao configurados — pulando espelho");
    return;
  }
  const key = produtoKey(item.codigo, item.sku);
  if (!key) return;

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/registrar_item_compra`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_empresa: empresaCompras(item.empresa),
      p_produto_key: key,
      p_codigo: item.codigo,
      p_sku: item.sku ?? null,
      p_descricao: item.descricao ?? null,
      p_secao: item.secao ?? null,
      p_clickup_task_id: item.clickupTaskId ?? null,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Supabase rpc ${resp.status}: ${await resp.text()}`);
  }
}

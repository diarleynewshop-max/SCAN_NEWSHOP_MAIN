import { task } from "@trigger.dev/sdk/v3";
import { 
  salvarListaBaixadaNoSupabase, 
  salvarConferenciaBaixadaNoSupabase,
  isSupabaseConfigured 
} from "./supabaseClient";

// ── Credenciais SOYE / FACIL ─────────────────────────────────────────────────
const CLICKUP_TOKEN_SF = process.env.CLICKUP_TOKEN_SF!;
const CLICKUP_LIST_ID_SOYE = process.env.CLICKUP_LIST_ID_SOYE ?? "901326461924";
const CLICKUP_LIST_ID_FACIL = process.env.CLICKUP_LIST_ID_FACIL ?? "901326461915";
const CLICKUP_CD_LIST_ID_SOYE = process.env.CLICKUP_CD_LIST_ID_SOYE ?? "901326461924";
const CLICKUP_CD_LIST_ID_FACIL = process.env.CLICKUP_CD_LIST_ID_FACIL ?? "901326461915";
const CLICKUP_TODO_LIST_ID_SF = process.env.CLICKUP_TODO_LIST_ID_SF ?? "901326695640"; // COMPRAS SF

// ── Helper: escolhe list ID pela empresa e flag ──────────────────────────────
function getListId(empresa: string, isCD = false): string {
  if (empresa === "FACIL") return isCD ? CLICKUP_CD_LIST_ID_FACIL : CLICKUP_LIST_ID_FACIL;
  return isCD ? CLICKUP_CD_LIST_ID_SOYE : CLICKUP_LIST_ID_SOYE;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function criarTarefaClickUp(
  listId: string,
  nome: string,
  descricao: string,
  status: string
): Promise<string> {
  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN_SF,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nome, description: descricao, status }),
    }
  );
  const data = await response.json();
  console.log("Resposta ClickUp completa:", JSON.stringify(data));
  console.log("Tarefa criada, ID:", data.id);
  return data.id;
}

async function anexarJsonNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: object
) {
  try {
    const jsonString = JSON.stringify(conteudo, null, 2);
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="attachment"; filename="${nomeArquivo}.json"`,
      `Content-Type: application/json`,
      ``,
      jsonString,
      `--${boundary}--`,
    ].join("\r\n");
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN_SF,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    console.log("JSON STATUS:", response.status);
  } catch (err) {
    console.error("Erro ao anexar JSON:", err);
  }
}

async function anexarTxtNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: string
) {
  try {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="attachment"; filename="${nomeArquivo}.txt"`,
      `Content-Type: text/plain`,
      ``,
      conteudo,
      `--${boundary}--`,
    ].join("\r\n");
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN_SF,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    console.log("TXT STATUS:", response.status);
  } catch (err) {
    console.error("Erro ao anexar TXT:", err);
  }
}

async function anexarFotoNaTarefa(
  taskId: string,
  photoBase64: string,
  filename: string
): Promise<boolean> {
  try {
    let raw = photoBase64;

    // Detecta formato
    let mimeType = "image/jpeg";
    if (raw.includes("data:image/png")) {
      mimeType = "image/png";
    }

    // Remove prefixo data URI
    if (raw.includes(";base64,")) {
      raw = raw.split(";base64,")[1];
    }

    // Converte base64 → Buffer → Blob
    const imgBuffer = Buffer.from(raw, "base64");
    const blob = new Blob([imgBuffer], { type: mimeType });

    console.log(`Preparando foto "${filename}" — ${imgBuffer.length} bytes`);

    const formData = new FormData();
    formData.append("attachment", blob, filename);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN_SF,
        },
        body: formData,
      }
    );

    console.log(`📸 Foto "${filename}" — Status: ${response.status}`);
    return response.ok;
  } catch (err) {
    console.error(`❌ Erro ao anexar foto "${filename}":`, err);
    return false;
  }
}

// ── TASK 1 — Lista baixada (SOYE / FACIL) ────────────────────────────────────
export const listaBaixadaSF = task({
  id: "lista-baixada-sf",
  machine: "medium-2x",
  maxDuration: 1000,
  run: async (payload: any) => {
    const startTime = Date.now();
    let taskId: string | null = null;
    let error: Error | null = null;

    try {
      const dataFormatada = payload.dataDownload
        ? new Date(payload.dataDownload).toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          })
        : new Date().toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          });

      const isCD = payload.flag === "cd";
      const listId = getListId(payload.empresa ?? "SOYE", isCD);
      const status = isCD ? "EM CONFERENCIA" : "to do";
      const flagLabel = isCD ? "CD" : "LOJA";

      // 1. Salvar no Supabase (antes do ClickUp para tracking)
      if (isSupabaseConfigured()) {
        await salvarListaBaixadaNoSupabase(payload);
      }

      // 2. Cria a Tarefa Principal de Conferência
      taskId = await criarTarefaClickUp(
        listId,
        `📦 ${payload.titulo} — ${payload.pessoa}`,
        `Pessoa: ${payload.pessoa}
Título: ${payload.titulo}
Empresa: ${payload.empresa}
Tipo: ${flagLabel}
Itens: ${payload.totalItens}
Data: ${dataFormatada}`,
        status
      );

      await Promise.all([
        anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
          type: "conference-file",
          empresa: payload.empresa ?? "SOYE",
          flag: payload.flag ?? "loja",
          items: payload.produtos.map((p: any) => ({
            codigo: p.barcode,
            sku: p.sku || "",
            quantidade: p.quantity ?? p.quantidade,
            photo: p.photo || null,
          })),
        }),
        anexarTxtNaTarefa(
          taskId,
          `lista_${payload.pessoa}`,
          (() => {
            const soCodigosBloco = payload.produtos
              .map((p: any) => p.barcode)
              .join("\n");
            const codigoQuantidadeBloco = payload.produtos
              .map(
                (p: any) => `${p.barcode};${p.quantity ?? p.quantidade}`
              )
              .join("\n");
            return `Codigo\n${soCodigosBloco}\n\n------------------------\n\nCodigo;Quantidade\n${codigoQuantidadeBloco}`;
          })()
        ),
      ]);

    } catch (err) {
      error = err as Error;
      console.error("Erro na TASK 1 (lista-baixada-sf):", err);
    } finally {
      // 3. Atualizar registro no Supabase com resultados
      const processingTimeMs = Date.now() - startTime;
      if (isSupabaseConfigured()) {
        await salvarListaBaixadaNoSupabase(
          payload,
          taskId || undefined,
          undefined, // Não tem tarefa de compras no SF
          processingTimeMs,
          error || undefined
        );
      }
    }
  },
});

// ── TASK 2 — Conferência finalizada (SOYE / FACIL) COM FOTOS ─────────────────
export const conferenciaBaixadaSF = task({
  id: "conferencia-baixada-sf",
  machine: "micro",
  maxDuration: 60,
  run: async (payload: any) => {
    const startTime = Date.now();
    let tarefaOriginalId: string | null = null;
    let todoTaskId: string | null = null;
    let error: Error | null = null;

    try {
      const dataFormatada = payload.dataConferencia
        ? new Date(payload.dataConferencia).toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          })
        : new Date().toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          });

      const isCD = payload.flag === "cd";
      const listId = getListId(payload.empresa ?? "SOYE", isCD);

    const statusMap: Record<string, string> = {
      separado: "✅ Separado",
      nao_tem: "❌ Nao tem",
      nao_tem_tudo: "⚠️ Parcial",
      pendente: "⏳ Pendente",
    };

    const itensS = payload.itens.filter((i: any) => i.digito === "S");
    const itensM = payload.itens.filter((i: any) => i.digito === "M");
    const itensSemDigito = payload.itens.filter((i: any) => !i.digito);

    const formatarItem = (item: any, idx: number) =>
      `${idx + 1}. Codigo: ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? "-"} | ${statusMap[item.status] ?? item.status}`;

    let itensTexto = "";
    if (itensS.length > 0)
      itensTexto += `{S}\n${itensS.map(formatarItem).join("\n")}`;
    if (itensM.length > 0) {
      if (itensTexto)
        itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `{M}\n${itensM.map(formatarItem).join("\n")}`;
    }
    if (itensSemDigito.length > 0) {
      if (itensTexto)
        itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `Sem categoria\n${itensSemDigito.map(formatarItem).join("\n")}`;
    }

    // 1. Salvar no Supabase (antes do ClickUp para tracking)
    if (isSupabaseConfigured()) {
      await salvarConferenciaBaixadaNoSupabase(payload);
    }

    // 2. Cria tarefa original na lista de conferência ──
    tarefaOriginalId = await criarTarefaClickUp(
      listId,
      `✅ ${payload.conferente} — ${dataFormatada}`,
      `Conferente: ${payload.conferente}
Empresa: ${payload.empresa}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens} item(ns)

📊 RESUMO
✅ Separado: ${payload.resumo.separado}
❌ Não tem: ${payload.resumo.naoTem}
⚠️ Parcial: ${payload.resumo.parcial}
⏳ Pendente: ${payload.resumo.pendente}

📦 ITENS
${itensTexto}`,
      "complete"
    );

    console.log(`Tarefa de conferência criada: ${tarefaOriginalId}`);

    // ── 2. Cria tarefa de COMPRAS com fotos diretas ──
    try {
      const itensNaoTem = (payload.itens || []).filter(
        (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
      );

      const listaFaltantes = itensNaoTem
        .map(
          (item: any, idx: number) =>
            `${idx + 1}. ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? 0} | ${statusMap[item.status] ?? item.status}`
        )
        .join("\n");

      const todoTaskId = await criarTarefaClickUp(
        CLICKUP_TODO_LIST_ID_SF,
        `🛒 Compras: ${payload.empresa} — ${payload.conferente} — ${dataFormatada}`,
        `Relatório gerado automaticamente após conferência.

📋 INFORMAÇÕES
Empresa: ${payload.empresa ?? "SOYE"}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
Data: ${dataFormatada}
Total itens conferidos: ${payload.totalItens}

📊 RESUMO
✅ Separado: ${payload.resumo?.separado ?? 0}
❌ Não tem: ${payload.resumo?.naoTem ?? 0}
⚠️ Parcial: ${payload.resumo?.parcial ?? 0}
⏳ Pendente: ${payload.resumo?.pendente ?? 0}

🛒 ITENS FALTANTES (${itensNaoTem.length})
${listaFaltantes || "Nenhum item faltante."}

📸 Fotos anexadas abaixo (se houver)`,
        "to do"
      );

      console.log(`Tarefa de COMPRAS criada: ${todoTaskId}`);

      // ── 3. Anexa foto APENAS dos itens que NÃO TEM (com limite para evitar OOM)
      const MAX_FOTOS = 10;
      const itensComFoto = (payload.itens || []).filter(
        (i: any) =>
          i.photo &&
          i.photo.length > 0 &&
          (i.status === "nao_tem" || i.status === "nao_tem_tudo")
      );
      const fotosExcedentes = itensComFoto.length > MAX_FOTOS;
      const fotosProcessar = fotosExcedentes ? itensComFoto.slice(0, MAX_FOTOS) : itensComFoto;

      if (fotosExcedentes) {
        console.warn(`⚠️ Limite de ${MAX_FOTOS} fotos atingido. ${itensComFoto.length - MAX_FOTOS} fotos serão ignoradas.`);
      }

      console.log(`Itens com foto (NÃO TEM): ${fotosProcessar.length}${fotosExcedentes ? ` (de ${itensComFoto.length} total)` : ""}`);

      for (const item of fotosProcessar) {
        const ext = item.photo.includes("data:image/png") ? "png" : "jpg";
        const filename = `${item.status}_${item.codigo}_${item.sku || "sem-sku"}.${ext}`;
        await anexarFotoNaTarefa(todoTaskId, item.photo, filename);
      }

      console.log("✅ Todas as fotos anexadas!");
    } catch (err) {
      console.error("Erro ao criar tarefa de COMPRAS:", err);
    }

    } catch (err) {
      error = err as Error;
      console.error("Erro na TASK 2 (conferencia-baixada-sf):", err);
    } finally {
      // 5. Atualizar registro no Supabase com resultados
      const processingTimeMs = Date.now() - startTime;
      if (isSupabaseConfigured()) {
        await salvarConferenciaBaixadaNoSupabase(
          payload,
          tarefaOriginalId || undefined,
          todoTaskId || undefined,
          processingTimeMs,
          error || undefined
        );
      }
    }
  },
});

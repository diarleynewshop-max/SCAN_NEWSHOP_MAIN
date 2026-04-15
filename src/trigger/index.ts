import { task } from "@trigger.dev/sdk/v3";
  import sharp from "sharp";

  Substitua a TASK 1 por esta versão:

  // ── TASK 1 — Lista baixada ────────────────────────────────────────────────────
  export const listaBaixada = task({
    id: "lista-baixada",
    machine: "small-1x",
    maxDuration: 1000,
    run: async (payload: any) => {
      let taskId: string | null = null;
      let comprasTaskId: string | null = null;

      try {
        const dataFormatada = payload.dataDownload
          ? new Date(payload.dataDownload).toLocaleString("pt-BR", {
              timeZone: "America/Fortaleza",
            })
          : new Date().toLocaleString("pt-BR", {
              timeZone: "America/Fortaleza",
            });

        const listId = CLICKUP_LIST_ID;
        const flagLabel = "LOJA";

        taskId = await criarTarefaClickUp(
          listId,
          ` ${payload.titulo} — ${payload.pessoa}`,
          `Pessoa: ${payload.pessoa}
  Título: ${payload.titulo}
  Empresa: ${payload.empresa ?? "NEWSHOP"}
  Tipo: ${flagLabel}
  Itens: ${payload.totalItens}
  Data: ${dataFormatada}`,
          "to do"
        );

        await Promise.all([
          anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
            type: "conference-file",
            empresa: payload.empresa ?? "NEWSHOP",
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

        const itensSemEstoque = payload.produtos.filter(
          (p: any) => (p.quantidade ?? p.quantity) === 0
        );

        if (itensSemEstoque.length > 0) {
          const listaFaltantesStr = itensSemEstoque
            .map(
              (p: any, idx: number) =>
                `${idx + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | ❌ Sem Estoque${p.photo ? " " : ""}`
            )
            .join("\n");

          comprasTaskId = await criarTarefaClickUp(
            CLICKUP_TODO_LIST_ID,
            ` Compras (Falta Estoque): ${payload.titulo} — ${payload.pessoa}`,
            `Relatório gerado no momento do envio da lista para conferência.
  Estes itens constam com 0 estoque no sistema.

   INFORMAÇÕES
  Empresa: ${payload.empresa ?? "NEWSHOP"}
  Tipo: ${flagLabel}
  Pessoa que fez a lista: ${payload.pessoa}
  Data: ${dataFormatada}

   ITENS SEM ESTOQUE (${itensSemEstoque.length})
  ${listaFaltantesStr}

   Fotos anexadas abaixo (se houver)`,
            "to do"
          );

          console.log(`Tarefa de COMPRAS criada: ${comprasTaskId}`);

          const itensComFoto = itensSemEstoque.filter(
            (p: any) => p.photo && p.photo.length > 0
          );

          if (itensComFoto.length > 0) {
            await uploadFotosParalelo(
              comprasTaskId,
              itensComFoto,
              10,
              () => "sem_estoque"
            );
          }
        }
      } catch (err) {
        console.error("Erro na TASK 1 (lista-baixada):", err);
      }
    },
  });

  Substitua a TASK 2 por esta versão:

  // ── TASK 2 — Conferência finalizada ──────────────────────────────────────────
  export const conferenciaBaixada = task({
    id: "conferencia-baixada",
    machine: "small-1x",
    maxDuration: 1000,
    run: async (payload: any) => {
      let tarefaOriginalId: string | null = null;
      let todoTaskId: string | null = null;

      try {
        const dataFormatada = payload.dataConferencia
          ? new Date(payload.dataConferencia).toLocaleString("pt-BR", {
              timeZone: "America/Fortaleza",
            })
          : new Date().toLocaleString("pt-BR", {
              timeZone: "America/Fortaleza",
            });

        const isCD = payload.flag === "cd";
        const listId = isCD ? CLICKUP_CD_LIST_ID : CLICKUP_LIST_ID;

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
          `${idx + 1}. Codigo: ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? "-"} |
  ${statusMap[item.status] ?? item.status}`;

        let itensTexto = "";
        if (itensS.length > 0)
          itensTexto += `{S}\n${itensS.map(formatarItem).join("\n")}`;
        if (itensM.length > 0) {
          if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
          itensTexto += `{M}\n${itensM.map(formatarItem).join("\n")}`;
        }
        if (itensSemDigito.length > 0) {
          if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
          itensTexto += `Sem categoria\n${itensSemDigito.map(formatarItem).join("\n")}`;
        }

        const itensNaoTem = (payload.itens || []).filter(
          (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
        );

        const listaFaltantes = itensNaoTem
          .map(
            (item: any, idx: number) =>
              `${idx + 1}. ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? 0} |
  ${statusMap[item.status] ?? item.status}`
          )
          .join("\n");

        const [conferenciId, comprasId] = await Promise.all([
          criarTarefaClickUp(
            listId,
            `✅ ${payload.conferente} — ${dataFormatada}`,
            `Conferente: ${payload.conferente}
  Empresa: ${payload.empresa ?? "NEWSHOP"}
  Tipo: ${isCD ? "CD" : "LOJA"}
  Data: ${dataFormatada}
  Tempo: ${payload.tempo}
  Total: ${payload.totalItens} item(ns)

   RESUMO
  ✅ Separado: ${payload.resumo.separado}
  ❌ Não tem: ${payload.resumo.naoTem}
  ⚠️ Parcial: ${payload.resumo.parcial}
  ⏳ Pendente: ${payload.resumo.pendente}

   ITENS
  ${itensTexto}`,
            "complete"
          ),

          criarTarefaClickUp(
            CLICKUP_TODO_LIST_ID,
            ` Compras: ${payload.conferente} — ${dataFormatada}`,
            `Relatório gerado automaticamente após conferência.

   INFORMAÇÕES
  Empresa: ${payload.empresa ?? "NEWSHOP"}
  Tipo: ${isCD ? "CD" : "LOJA"}
  Conferente: ${payload.conferente}
  Data: ${dataFormatada}
  Total itens conferidos: ${payload.totalItens}

   RESUMO
  ✅ Separado: ${payload.resumo?.separado ?? 0}
  ❌ Não tem: ${payload.resumo?.naoTem ?? 0}
  ⚠️ Parcial: ${payload.resumo?.parcial ?? 0}
  ⏳ Pendente: ${payload.resumo?.pendente ?? 0}

   ITENS FALTANTES (${itensNaoTem.length})
  ${listaFaltantes || "Nenhum item faltante."}

   Fotos anexadas abaixo (se houver)`,
            "to do"
          ),
        ]);

        tarefaOriginalId = conferenciId;
        todoTaskId = comprasId;

        console.log(`Tarefa de conferência criada: ${tarefaOriginalId}`);
        console.log(`Tarefa de COMPRAS criada: ${todoTaskId}`);

        const itensComFoto = (payload.itens || []).filter(
          (i: any) =>
            i.photo &&
            i.photo.length > 0 &&
            (i.status === "nao_tem" || i.status === "nao_tem_tudo")
        );

        if (itensComFoto.length > 0) {
          await uploadFotosParalelo(
            todoTaskId,
            itensComFoto,
            10,
            (item) => item.status
          );
        }
      } catch (err) {
        console.error("Erro na TASK 2 (conferencia-baixada):", err);
      }
    },
  });
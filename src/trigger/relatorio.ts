import { task } from "@trigger.dev/sdk/v3";

type EmpresaRelatorio = "NEWSHOP" | "SOYE" | "FACIL";
type FlagRelatorio = "loja" | "cd";

const MAX_CLICKUP_DESCRIPTION_CHARS = 12000;

function normalizarEmpresa(value: unknown): EmpresaRelatorio {
  const empresa = String(value ?? "NEWSHOP").trim().toUpperCase();
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function normalizarFlag(value: unknown): FlagRelatorio {
  return String(value ?? "loja").trim().toLowerCase() === "cd" ? "cd" : "loja";
}

function getPrimeiraEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function getClickUpToken(empresa: EmpresaRelatorio): string {
  if (empresa === "NEWSHOP") {
    return getPrimeiraEnv("CLICKUP_TOKEN", "CLICKUP_API_TOKEN", "VITE_CLICKUP_TOKEN_NEWSHOP") ?? "";
  }

  return getPrimeiraEnv("CLICKUP_TOKEN_SF", "CLICKUP_API_TOKEN_SF", "CLICKUP_API_TOKEN", "VITE_CLICKUP_TOKEN_SF") ?? "";
}

function getRelatorioListId(empresa: EmpresaRelatorio): string {
  const listId = getPrimeiraEnv(
    `CLICKUP_RELATORIO_LIST_ID_${empresa}`,
    `CLICKUP_LIST_ID_RELATORIO_${empresa}`,
    "CLICKUP_RELATORIO_LIST_ID",
    "CLICKUP_LIST_ID_RELATORIO",
    ...(empresa === "NEWSHOP" ? ["CLICKUP_LIST_ID"] : ["CLICKUP_LIST_ID_SF"])
  );

  if (!listId) {
    throw new Error(
      empresa === "NEWSHOP"
        ? "Configure CLICKUP_LIST_ID com o ID da lista Relatorio."
        : "Configure CLICKUP_LIST_ID_SF com o ID da lista Relatorio SF."
    );
  }

  return listId;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizarNomeArquivo(value: unknown): string {
  return String(value ?? "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "relatorio";
}

function statusLabel(status: unknown): string {
  const value = String(status ?? "");
  if (value === "nao_tem") return "Nao tem";
  if (value === "nao_tem_tudo" || value === "parcial") return "Parcial";
  if (value === "pendente") return "Pendente";
  return "Separado";
}

function calcularResumo(itens: any[]) {
  return {
    separado: itens.filter((item) => item.status === "separado").length,
    naoTem: itens.filter((item) => item.status === "nao_tem").length,
    parcial: itens.filter((item) => item.status === "nao_tem_tudo" || item.status === "parcial").length,
    pendente: itens.filter((item) => item.status === "pendente").length,
  };
}

function montarHtmlRelatorio(payload: any, empresa: EmpresaRelatorio, flag: FlagRelatorio, dataLabel: string): string {
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  const resumo = payload.resumo ?? calcularResumo(itens);
  const cards = itens.map((item: any) => {
    const status = item.status === "nao_tem_tudo" ? "parcial" : String(item.status ?? "separado");
    const photo = typeof item.photo === "string" && item.photo.startsWith("data:image/") ? item.photo : null;

    return `<article class="card ${escapeHtml(status)}">
      ${photo ? `<img class="photo" src="${photo}" alt="${escapeHtml(item.codigo)}" loading="lazy">` : `<div class="no-photo">Sem foto</div>`}
      <div class="body">
        <div class="code">${escapeHtml(item.codigo)}</div>
        <div class="sku">${escapeHtml(item.sku || "-")}</div>
        <div class="meta">${escapeHtml(item.secao || "Sem secao")} | ${escapeHtml(item.digito || "-")}</div>
        <div class="row">
          <span>Pedido <strong>${escapeHtml(item.quantidadePedida ?? item.pedido ?? "-")}</strong></span>
          <span>Real <strong>${escapeHtml(item.quantidadeReal ?? item.real ?? "-")}</strong></span>
        </div>
        <div class="tag">${escapeHtml(statusLabel(item.status))}</div>
      </div>
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatorio ${escapeHtml(empresa)} ${escapeHtml(dataLabel)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f5f5f2;color:#171717;font-family:Arial,sans-serif;padding:24px}
    header,.stats,.grid{max-width:1280px;margin:0 auto}header{margin-bottom:16px}h1{font-size:26px;margin:0 0 6px}
    .muted{color:#666;font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:16px}
    .stat{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px}.stat strong{display:block;font-size:26px}.stat span{font-size:12px;color:#666}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.card{background:#fff;border:1px solid #ddd;border-left:5px solid #22c55e;border-radius:8px;overflow:hidden}
    .card.nao_tem{border-left-color:#ef4444}.card.parcial{border-left-color:#eab308}.card.pendente{border-left-color:#9ca3af}
    .photo,.no-photo{width:100%;aspect-ratio:1;display:block}.photo{object-fit:cover}.no-photo{display:flex;align-items:center;justify-content:center;background:#eee;color:#888;font-weight:700}
    .body{padding:10px}.code{font-family:monospace;font-weight:700;font-size:13px;word-break:break-all}.sku{font-size:12px;color:#555;min-height:30px;margin-top:3px}.meta{font-size:11px;color:#777;margin-top:5px}
    .row{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-top:8px}.row strong{font-size:18px}.tag{display:inline-block;margin-top:8px;font-size:11px;font-weight:700;background:#eee;border-radius:6px;padding:4px 7px}
    @media(max-width:700px){body{padding:12px}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
  </style>
</head>
<body>
  <header>
    <h1>Relatorio de conferencia</h1>
    <div class="muted">${escapeHtml(empresa)} | ${escapeHtml(flag.toUpperCase())} | ${escapeHtml(dataLabel)} | Conferente: ${escapeHtml(payload.conferente || "-")}</div>
  </header>
  <section class="stats">
    <div class="stat"><strong>${resumo.separado ?? 0}</strong><span>Separado</span></div>
    <div class="stat"><strong>${resumo.naoTem ?? 0}</strong><span>Nao tem</span></div>
    <div class="stat"><strong>${resumo.parcial ?? 0}</strong><span>Parcial</span></div>
    <div class="stat"><strong>${resumo.pendente ?? 0}</strong><span>Pendente</span></div>
  </section>
  <main class="grid">${cards}</main>
</body>
</html>`;
}

async function criarTarefaClickUp(token: string, listId: string, nome: string, descricao: string): Promise<string> {
  const baseBody = { name: nome, description: descricao.slice(0, MAX_CLICKUP_DESCRIPTION_CHARS) };
  let response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(baseBody),
  });

  if (!response.ok) {
    response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, status: "to do" }),
    });
  }

  if (!response.ok) {
    response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, status: "complete" }),
    });
  }

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao criar task de relatorio: ${await response.text()}`);
  }

  const data = await response.json();
  return data.id;
}

async function anexarHtmlNaTarefa(token: string, taskId: string, nomeArquivo: string, html: string) {
  const formData = new FormData();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  formData.append("attachment", blob, `${nomeArquivo}.html`);

  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
    method: "POST",
    headers: {
      Authorization: token,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao anexar HTML: ${await response.text()}`);
  }
}

export const relatorioDiretoria = task({
  id: "relatorio-diretoria",
  machine: "small-1x",
  maxDuration: 1000,
  run: async (payload: any) => {
    const empresa = normalizarEmpresa(payload.empresa);
    const flag = normalizarFlag(payload.flag);
    const token = getClickUpToken(empresa);
    const listId = getRelatorioListId(empresa);
    const dataBase = payload.dataConferencia ? new Date(payload.dataConferencia) : new Date();
    const dataLabel = dataBase.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    const itens = Array.isArray(payload.itens) ? payload.itens : [];
    const resumo = payload.resumo ?? calcularResumo(itens);

    if (!token) throw new Error(`Token ClickUp nao configurado para ${empresa}.`);

    const nome = `Relatorio - ${empresa} ${flag.toUpperCase()} - ${payload.conferente || "Sem conferente"} - ${dataLabel}`;
    const descricao = `TASK 3 - Relatorio de conferencia para diretoria.

Empresa: ${empresa}
Tipo: ${flag.toUpperCase()}
Conferente: ${payload.conferente || "-"}
Data: ${dataLabel}
Total: ${payload.totalItens ?? itens.length}

Separado: ${resumo.separado ?? 0}
Nao tem: ${resumo.naoTem ?? 0}
Parcial: ${resumo.parcial ?? 0}
Pendente: ${resumo.pendente ?? 0}

HTML com fotos anexado nesta task.`;

    const html = montarHtmlRelatorio(payload, empresa, flag, dataLabel);
    const taskId = await criarTarefaClickUp(token, listId, nome, descricao);
    const nomeArquivo = sanitizarNomeArquivo(`relatorio_${empresa}_${flag}_${payload.conferente || "sem_conferente"}_${dataLabel}`);
    await anexarHtmlNaTarefa(token, taskId, nomeArquivo, html);

    console.log(`[TASK 3] Relatorio criado em ${empresa}: ${taskId} | lista=${listId} | url=https://app.clickup.com/t/${taskId}`);
    return { taskId, empresa, flag, listId, url: `https://app.clickup.com/t/${taskId}`, totalItens: itens.length };
  },
});

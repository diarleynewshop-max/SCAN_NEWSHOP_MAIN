import { schedules } from "@trigger.dev/sdk/v3";

const EMPRESAS = ["NEWSHOP", "SOYE", "FACIL"] as const;
const FLAGS = ["loja", "cd"] as const;

// Roda a cada 5 minutos e pergunta ao /api/clickup-proxy (action=executar-analise-automatica)
// se cada empresa tem a Análise Automática ligada e se já é hora/quantidade de mover
// os pedidos de "to do" (pendente) para "Analisado". A decisão de ligar/desligar e o modo
// (tempo ou quantidade) ficam guardados numa task de config no próprio ClickUp,
// editável só por admin na tela de Configurações do app.
export const analiseAutomatica = schedules.task({
  id: "analise-automatica-clickup",
  cron: "*/5 * * * *",
  maxDuration: 120,
  run: async () => {
    const baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      console.warn("[analiseAutomatica] APP_BASE_URL nao configurada. Abortando sem erro.");
      return { skipped: true };
    }

    const cronSecret = process.env.CRON_SECRET;
    const resultados: Array<{ empresa: string; flag: string; status?: number; erro?: string; [key: string]: unknown }> = [];

    for (const empresa of EMPRESAS) {
      for (const flag of FLAGS) {
        const url = `${baseUrl.replace(/\/$/, "")}/api/clickup-proxy?action=executar-analise-automatica&empresa=${empresa}&flag=${flag}`;
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: cronSecret ? { "x-cron-secret": cronSecret } : {},
          });
          const data = await response.json().catch(() => ({}));
          resultados.push({ empresa, flag, status: response.status, ...data });
          if (data?.executado) {
            console.log(`[analiseAutomatica] ${empresa} ${flag}: ${data.processado}/${data.total} pedido(s) movidos para Analisado`);
          }
        } catch (err: any) {
          resultados.push({ empresa, flag, erro: err?.message ?? "erro desconhecido" });
        }
      }
    }

    return { resultados };
  },
});

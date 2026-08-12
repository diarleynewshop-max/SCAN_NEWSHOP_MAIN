import { task } from "@trigger.dev/sdk/v3";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
const OPENAI_FREE_FALLBACK_MODEL = "openai/gpt-oss-20b:free";

type TomMetrica = "neutro" | "positivo" | "atencao" | "critico";
type AnaliseTipo = "resumo" | "faltas" | "mais_pedidos" | "prioridades" | "pergunta";
type LoginFlag = "loja" | "cd";
type Empresa = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";

type Metrica = {
  id: string;
  label: string;
  valor: string;
  detalhe: string;
  tom: TomMetrica;
};

type ProdutoContexto = {
  codigo: string;
  descricao: string;
  secao: string;
  pedido: number;
  atendido: number;
  falta: number;
  ocorrencias: number;
  atendimento_pct: number;
  prioridade: string;
  status_compras: string | null;
};

type SecaoContexto = {
  nome: string;
  pedido: number;
  atendido: number;
  falta: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  taxaAtendimento: number;
};

type ComprasIaLeituraPayload = {
  tipo: AnaliseTipo;
  pergunta: string;
  empresa: Empresa;
  flag: LoginFlag;
  periodo: {
    inicio: string;
    fim: string;
  };
  dados: {
    metricas: Metrica[];
    produtos: ProdutoContexto[];
    secoes: SecaoContexto[];
  };
};

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function getApiKey(): string {
  return texto(process.env.OPENROUTER_API_KEY || process.env.COMPRAS_IA_OPENROUTER_API_KEY);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map(texto).filter(Boolean)));
}

function getModels(): string[] {
  const modelosFixos = [
    process.env.COMPRAS_IA_TRIGGER_MODEL,
    process.env.OPENROUTER_MODEL,
    DEFAULT_MODEL,
    OPENAI_FREE_FALLBACK_MODEL,
  ];
  const modelosLista = texto(
    process.env.COMPRAS_IA_TRIGGER_MODELS ||
    process.env.OPENROUTER_MODELS ||
    process.env.COMPRAS_IA_OPENROUTER_MODELS
  )
    .split(",")
    .map((model) => model.trim());

  return uniq([...modelosFixos, ...modelosLista]);
}

function timeoutMs(): number {
  const parsed = Number(process.env.COMPRAS_IA_TRIGGER_PROVIDER_TIMEOUT_MS ?? 45_000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 45_000;
  return Math.max(5_000, Math.min(90_000, Math.trunc(parsed)));
}

export const comprasIaLeitura = task({
  id: "compras-ia-gerar-leitura",
  machine: "small-1x",
  maxDuration: 120,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 15_000 },
  run: async (payload: ComprasIaLeituraPayload) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY nao configurada no Trigger.dev.");
    }

    const models = getModels();
    let ultimoErro = "";

    for (const model of models) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs());
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://scan-newshop-main.vercel.app",
          "X-Title": "SCAN Compras IA",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content: [
                "Voce e um analista de compras somente leitura.",
                "Use exclusivamente os numeros fornecidos. Nao invente estoque, venda, preco ou fornecedor.",
                "Responda em portugues do Brasil com 3 a 6 bullets curtos, cada linha iniciada por '- '.",
                "Destaque risco, oportunidade e a conferencia humana necessaria antes de comprar.",
                "Nao use markdown alem dos bullets e nao repita todos os dados.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify(payload),
            },
          ],
        }),
      }).finally(() => clearTimeout(timeout));

      const data = await response.json().catch(() => null) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      } | null;
      if (!response.ok) {
        ultimoErro = `${model}: ${texto(data?.error?.message) || `OpenRouter respondeu ${response.status}`}`;
        continue;
      }

      const content = texto(data?.choices?.[0]?.message?.content);
      if (!content) {
        ultimoErro = `${model}: OpenRouter retornou resposta vazia.`;
        continue;
      }
      return { texto: content, model };
    }

    throw new Error(ultimoErro || "Nenhum modelo da Compras IA respondeu.");
  },
});

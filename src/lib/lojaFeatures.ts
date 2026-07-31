// Recursos habilitados POR LOJA.
//
// Permissao (accessControl) responde "esse usuario pode?"; aqui respondemos
// "essa loja usa?". As duas travas sao independentes e ambas precisam passar:
// um admin da SEFULY tem permissao `sugestao_cd`, mas a SEFULY nao opera CD.

export type LojaFeature = "sugestao_cd" | "pdv_prevenda";

type LoginLike = {
  empresa?: string | null;
};

function normalizarEmpresa(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

// Lojas que NAO operam Sugestao do CD. SEFULY e loja propria de bijuteria/
// semijoia: nao recebe sugestao de envio do CD.
const SEM_SUGESTAO_CD = new Set(["SEFULY"]);

// Lojas que enviam a conferencia concluida direto para o PDV (pre-venda
// SYSpdv/Casa Magalhaes). Ver src/lib/pdvPrevenda.ts.
const COM_PDV_PREVENDA = new Set(["SEFULY"]);

export function lojaTemFeature(empresa: unknown, feature: LojaFeature): boolean {
  const chave = normalizarEmpresa(empresa);
  if (!chave) return feature !== "pdv_prevenda";

  if (feature === "sugestao_cd") return !SEM_SUGESTAO_CD.has(chave);
  if (feature === "pdv_prevenda") return COM_PDV_PREVENDA.has(chave);
  return true;
}

export function loginTemFeature(login: LoginLike | null | undefined, feature: LojaFeature): boolean {
  return lojaTemFeature(login?.empresa, feature);
}

export function loginEhSefuly(login: LoginLike | null | undefined): boolean {
  return normalizarEmpresa(login?.empresa) === "SEFULY";
}

// Atalho de leitura para o fluxo de conferencia.
export function lojaEnviaPrevendaParaPdv(empresa: unknown): boolean {
  return lojaTemFeature(empresa, "pdv_prevenda");
}

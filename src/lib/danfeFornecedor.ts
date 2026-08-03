export type DanfeTipoContribuinte = "ISENTO" | "NAO_CONTRIBUINTE" | "CONTRIBUINTE";

export interface DanfeFornecedorConsulta {
  cnpj: string;
  razaoSocial: string | null;
  situacaoCadastral: string | null;
  uf: string | null;
  cidade: string | null;
  cep: string | null;
  endereco: string | null;
  cnaePrincipal: string | null;
  inscricaoEstadual: string | null;
  tipoContribuinte: DanfeTipoContribuinte;
  aviso: string | null;
  fonteResumo: string | null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickIe(inscricoes: unknown): string {
  if (!Array.isArray(inscricoes)) return "";
  for (const item of inscricoes) {
    if (typeof item === "string" && item.trim()) return onlyDigits(item);
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const value = asString(record.ie) || asString(record.inscricaoEstadual) || asString(record.inscricao_estadual);
      if (value) return onlyDigits(value);
    }
  }
  return "";
}

function inferirTipoContribuinte(status: string, ie: string): DanfeTipoContribuinte {
  const normalized = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (normalized.includes("CONTRIBUINTE") && !normalized.includes("NAO")) return "CONTRIBUINTE";
  if (normalized.includes("NAO CONTRIBUINTE") || normalized.includes("SEM IE")) return "NAO_CONTRIBUINTE";
  return ie ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE";
}

export async function consultarFornecedorDanfe(cnpj: string, uf?: string): Promise<DanfeFornecedorConsulta> {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) throw new Error("Informe um CNPJ valido com 14 digitos.");

  const url = new URL("/api/danfe-fornecedor", window.location.origin);
  url.searchParams.set("cnpj", digits);
  if (uf?.trim()) url.searchParams.set("uf", uf.trim().toUpperCase().slice(0, 2));

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error ?? "Falha ao consultar CNPJ no DanfeCollector."));
  }

  const raw = data?.data ?? data;
  const ieStatus = asString(raw?.ie?.status);
  const inscricaoEstadual = pickIe(raw?.ie?.inscricoes);

  return {
    cnpj: onlyDigits(asString(raw?.cnpj) || digits),
    razaoSocial: asString(raw?.razaoSocial) || null,
    situacaoCadastral: asString(raw?.situacaoCadastral) || null,
    uf: asString(raw?.uf).slice(0, 2).toUpperCase() || null,
    cidade: asString(raw?.cidade) || null,
    cep: onlyDigits(asString(raw?.cep)) || null,
    endereco: asString(raw?.endereco) || null,
    cnaePrincipal: asString(raw?.cnaePrincipal) || null,
    inscricaoEstadual: inscricaoEstadual || null,
    tipoContribuinte: inferirTipoContribuinte(ieStatus, inscricaoEstadual),
    aviso: asString(raw?.aviso) || null,
    fonteResumo: asString(raw?.fontes?.resumo) || null,
  };
}

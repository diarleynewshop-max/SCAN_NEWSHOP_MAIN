type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";

type ListaKey = "compras" | "conferencia";

const DEFAULT_LISTS: Record<EmpresaKey, { compras: string; conferencia: string }> = {
  NEWSHOP: {
    compras: "901326684020",
    conferencia: "901325900510",
  },
  SOYE: {
    compras: "901326684020",
    conferencia: "901326607319",
  },
  FACIL: {
    compras: "901326684020",
    conferencia: "901326607320",
  },
};

export function normalizeEmpresa(value: unknown): EmpresaKey {
  const empresa = String(value ?? "NEWSHOP").toUpperCase();
  if (empresa === "SOYE" || empresa === "FACIL") {
    return empresa;
  }
  return "NEWSHOP";
}

export function getClickUpToken(empresa: EmpresaKey): string {
  if (empresa === "NEWSHOP") {
    return (
      process.env.CLICKUP_TOKEN ||
      process.env.CLICKUP_API_TOKEN ||
      process.env.VITE_CLICKUP_API_TOKEN ||
      process.env.VITE_CLICKUP_TOKEN_NEWSHOP ||
      ""
    );
  }

  return (
    process.env.CLICKUP_TOKEN_SF ||
    process.env.CLICKUP_API_TOKEN_SF ||
    process.env.CLICKUP_API_TOKEN ||
    process.env.VITE_CLICKUP_API_TOKEN ||
    process.env.VITE_CLICKUP_TOKEN_SF ||
    ""
  );
}

export function getClickUpListId(empresa: EmpresaKey, lista: ListaKey): string {
  const defaults = DEFAULT_LISTS[empresa];

  if (lista === "compras") {
    if (empresa === "NEWSHOP") {
      return (
        process.env.CLICKUP_LIST_ID_COMPRAS_NEWSHOP ||
        process.env.CLICKUP_LIST_ID_COMPRAS ||
        process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
        defaults.compras
      );
    }

    if (empresa === "SOYE") {
      return (
        process.env.CLICKUP_LIST_ID_COMPRAS_SOYE ||
        process.env.CLICKUP_LIST_ID_COMPRAS_SF ||
        process.env.CLICKUP_LIST_ID_COMPRAS ||
        process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
        defaults.compras
      );
    }

    return (
      process.env.CLICKUP_LIST_ID_COMPRAS_FACIL ||
      process.env.CLICKUP_LIST_ID_COMPRAS_SF ||
      process.env.CLICKUP_LIST_ID_COMPRAS ||
      process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
      defaults.compras
    );
  }

  if (empresa === "NEWSHOP") {
    return (
      process.env.CLICKUP_LIST_ID_NEWSHOP ||
      process.env.VITE_CLICKUP_LIST_ID_NEWSHOP ||
      defaults.conferencia
    );
  }

  if (empresa === "SOYE") {
    return (
      process.env.CLICKUP_LIST_ID_SOYE ||
      process.env.VITE_CLICKUP_LIST_ID_SOYE ||
      defaults.conferencia
    );
  }

  return (
    process.env.CLICKUP_LIST_ID_FACIL ||
    process.env.VITE_CLICKUP_LIST_ID_FACIL ||
    defaults.conferencia
  );
}

export function extractCodigo(name: string): string {
  const match = name.match(/nao_tem(?:_tudo)?_(\d+)/i);
  return match ? match[1] : name;
}

export function extractSku(name: string): string | null {
  const match = name.match(/nao_tem(?:_tudo)?_\d+_([^_\s]+)/i);
  return match ? match[1] : null;
}

export function extractDescricao(name: string): string {
  return name
    .replace(/^nao_tem_tudo_/i, "")
    .replace(/^nao_tem_/i, "")
    .trim();
}

export function mapTaskStatus(status: string): "novo" | "analisado" | "comprado" | "reprovado" {
  const value = status?.toLowerCase();
  if (value === "done" || value === "completed") return "comprado";
  if (value === "analisado") return "analisado";
  if (value === "cancelled" || value === "reprovado") return "reprovado";
  return "novo";
}


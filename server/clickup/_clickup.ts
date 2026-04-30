type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";

type ListaKey = "compras" | "conferencia";

type CompraStatusApp =
  | "todo"
  | "produto_bom"
  | "produto_ruim"
  | "fazer_pedido"
  | "pedido_andamento"
  | "compra_realizada"
  | "concluido";

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
        process.env.CLICKUP_TODO_LIST_ID_NEWSHOP ||
        process.env.CLICKUP_TODO_LIST_ID ||
        process.env.CLICKUP_LIST_ID_COMPRAS_NEWSHOP ||
        process.env.CLICKUP_LIST_ID_COMPRAS ||
        process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
        defaults.compras
      );
    }

    if (empresa === "SOYE") {
      return (
        process.env.CLICKUP_TODO_LIST_ID_SOYE ||
        process.env.CLICKUP_TODO_LIST_ID_SF ||
        process.env.CLICKUP_TODO_LIST_ID ||
        process.env.CLICKUP_LIST_ID_COMPRAS_SOYE ||
        process.env.CLICKUP_LIST_ID_COMPRAS_SF ||
        process.env.CLICKUP_LIST_ID_COMPRAS ||
        process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
        defaults.compras
      );
    }

    return (
      process.env.CLICKUP_TODO_LIST_ID_FACIL ||
      process.env.CLICKUP_TODO_LIST_ID_SF ||
      process.env.CLICKUP_TODO_LIST_ID ||
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

function normalizeTaskName(name: unknown): string {
  return String(name ?? "").trim();
}

export function extractCodigo(name: unknown): string {
  const normalizedName = normalizeTaskName(name);
  const pipeMatch = normalizedName.match(/COD:([^|]+)/i);
  if (pipeMatch) return pipeMatch[1].trim();

  const firstBarcodeMatch = normalizedName.match(/\d{6,14}/);
  if (firstBarcodeMatch) return firstBarcodeMatch[0].trim();

  const match = normalizedName.match(/nao_tem(?:_tudo)?_(\d+)/i);
  return match ? match[1] : normalizedName;
}

export function extractSku(name: unknown): string | null {
  const normalizedName = normalizeTaskName(name);
  const pipeMatch = normalizedName.match(/SKU:([^|]+)/i);
  if (pipeMatch) return pipeMatch[1].trim();

  const match = normalizedName.match(/nao_tem(?:_tudo)?_\d+_([^_\s]+)/i);
  return match ? match[1] : null;
}

export function extractDescricao(name: unknown): string {
  const normalizedName = normalizeTaskName(name);
  const pipeMatch = normalizedName.match(/DESC:([^|]+)/i);
  if (pipeMatch) return pipeMatch[1].trim();

  return normalizedName
    .replace(/^nao_tem_tudo_/i, "")
    .replace(/^nao_tem_/i, "")
    .trim();
}

export function normalizeClickUpStatus(status: string): string {
  return String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function mapTaskStatus(
  status: string
): CompraStatusApp {
  const value = normalizeClickUpStatus(status);

  if (
    value === "pode ser que tem no galpao" ||
    value === "produto bom" ||
    value === "like" ||
    value === "bom" ||
    value === "aprovado" ||
    value === "analisado"
  ) {
    return "produto_bom";
  }

  if (
    value === "produtos ruim" ||
    value === "produto ruim" ||
    value === "dislike" ||
    value === "deslike" ||
    value === "ruim" ||
    value === "reprovado"
  ) {
    return "produto_ruim";
  }

  if (
    value === "fazer pedido" ||
    value === "pedido" ||
    value === "comprar"
  ) {
    return "fazer_pedido";
  }

  if (value === "pedido em andamento" || value === "em andamento") return "pedido_andamento";
  if (value === "compra realizada" || value === "comprado") return "compra_realizada";
  if (value === "concluido" || value === "done" || value === "completed") return "concluido";

  return "todo";
}

export function mapActionToStatus(
  action: string
): Exclude<CompraStatusApp, "todo"> | null {
  const value = String(action ?? "").trim().toUpperCase();

  if (value === "LIKE") return "produto_bom";
  if (value === "DISLIKE") return "produto_ruim";
  if (value === "FAZER_PEDIDO") return "fazer_pedido";
  if (value === "PEDIDO_ANDAMENTO") return "pedido_andamento";
  if (value === "COMPRA_REALIZADA") return "compra_realizada";
  if (value === "CONCLUIR") return "concluido";

  return null;
}

export function mapAppStatusToClickUp(
  status: string
): string {
  const value = String(status ?? "").trim().toLowerCase();

  if (value === "produto_bom") return "PODE SER QUE TEM NO GALPAO";
  if (value === "produto_ruim") return "PRODUTOS RUIM";
  if (value === "fazer_pedido") return "FAZER PEDIDO";
  if (value === "pedido_andamento") return "PEDIDO EM ANDAMENTO";
  if (value === "compra_realizada") return "COMPRA REALIZADA";
  if (value === "concluido") return "CONCLUIDO";

  return "PENDENTE";
}

function getCompraStatusAliases(status: CompraStatusApp): string[] {
  if (status === "produto_bom") {
    return ["PODE SER QUE TEM NO GALPAO", "produto bom", "like", "bom", "aprovado", "analisado"];
  }

  if (status === "produto_ruim") {
    return ["PRODUTOS RUIM", "produto ruim", "dislike", "deslike", "ruim", "reprovado"];
  }

  if (status === "fazer_pedido") {
    return ["FAZER PEDIDO", "fazer pedido", "pedido", "comprar"];
  }

  if (status === "pedido_andamento") {
    return ["PEDIDO EM ANDAMENTO", "pedido em andamento", "em andamento"];
  }

  if (status === "compra_realizada") {
    return ["COMPRA REALIZADA", "compra realizada", "comprado"];
  }

  if (status === "concluido") {
    return ["CONCLUIDO", "concluido", "done", "completed"];
  }

  return ["PENDENTE", "to do", "todo", "open", "aberto"];
}

export function getCompraStatusCandidates(status: CompraStatusApp): string[] {
  const aliases = getCompraStatusAliases(status);
  const unique = new Set<string>();
  const candidates: string[] = [];

  for (const alias of aliases) {
    const normalized = normalizeClickUpStatus(alias);
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    candidates.push(alias);
  }

  return candidates;
}

export function resolveCompraClickUpStatus(
  status: CompraStatusApp,
  availableStatuses: string[]
): string | null {
  const aliases = getCompraStatusCandidates(status);

  for (const alias of aliases) {
    const matched = availableStatuses.find(
      (candidate) => normalizeClickUpStatus(candidate) === normalizeClickUpStatus(alias)
    );

    if (matched) {
      return matched;
    }
  }

  return null;
}

export function isCompraTransitionAllowed(
  fromStatus: string,
  toStatus: string
): boolean {
  const from = String(fromStatus ?? "todo").trim().toLowerCase();
  const to = String(toStatus ?? "").trim().toLowerCase();

  const allowed: Record<string, string[]> = {
    todo: ["produto_bom", "produto_ruim", "fazer_pedido"],
    produto_bom: ["produto_ruim", "fazer_pedido"],
    produto_ruim: ["produto_bom"],
    fazer_pedido: ["produto_bom", "pedido_andamento"],
    pedido_andamento: ["fazer_pedido", "compra_realizada"],
    compra_realizada: ["pedido_andamento", "concluido"],
    concluido: ["fazer_pedido", "compra_realizada"],
  };

  return allowed[from]?.includes(to) ?? false;
}

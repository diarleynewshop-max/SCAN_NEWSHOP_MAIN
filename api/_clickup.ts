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
): "todo" | "produto_bom" | "produto_ruim" | "fazer_pedido" | "concluido" {
  const value = normalizeClickUpStatus(status);

  if (value === "produto bom") return "produto_bom";
  if (value === "produto ruim") return "produto_ruim";
  if (value === "fazer pedido") return "fazer_pedido";
  if (value === "concluido" || value === "done" || value === "completed") return "concluido";

  return "todo";
}

export function mapActionToStatus(
  action: string
): "produto_bom" | "produto_ruim" | "fazer_pedido" | "concluido" | null {
  const value = String(action ?? "").trim().toUpperCase();

  if (value === "LIKE") return "produto_bom";
  if (value === "DISLIKE") return "produto_ruim";
  if (value === "FAZER_PEDIDO") return "fazer_pedido";
  if (value === "CONCLUIR") return "concluido";

  return null;
}

export function mapAppStatusToClickUp(
  status: string
): "produto bom" | "produto ruim" | "fazer pedido" | "concluido" | "to do" {
  const value = String(status ?? "").trim().toLowerCase();

  if (value === "produto_bom") return "produto bom";
  if (value === "produto_ruim") return "produto ruim";
  if (value === "fazer_pedido") return "fazer pedido";
  if (value === "concluido") return "concluido";

  return "to do";
}

export function isCompraTransitionAllowed(
  fromStatus: string,
  toStatus: string
): boolean {
  const from = String(fromStatus ?? "todo").trim().toLowerCase();
  const to = String(toStatus ?? "").trim().toLowerCase();

  const allowed: Record<string, string[]> = {
    todo: ["produto_bom", "produto_ruim"],
    produto_bom: ["produto_ruim", "fazer_pedido"],
    produto_ruim: ["produto_bom"],
    fazer_pedido: ["produto_bom", "concluido"],
    concluido: ["fazer_pedido"],
  };

  return allowed[from]?.includes(to) ?? false;
}

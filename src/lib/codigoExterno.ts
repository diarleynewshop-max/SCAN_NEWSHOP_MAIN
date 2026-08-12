export function normalizarCodigoExterno14(value: unknown): string {
  const texto = String(value ?? "").trim();
  const digits = texto.replace(/\D/g, "");
  if (!digits) return texto;
  if (digits.length <= 14) return digits.padStart(14, "0");
  return digits;
}

export function pareceApenasCodigo(value: unknown, codigoReferencia?: unknown): boolean {
  const texto = String(value ?? "").trim();
  if (!texto) return false;

  const digits = texto.replace(/\D/g, "");
  const refDigits = String(codigoReferencia ?? "").replace(/\D/g, "");
  if (digits && digits === texto && digits.length >= 6) return true;
  if (refDigits && digits && normalizarCodigoExterno14(digits) === normalizarCodigoExterno14(refDigits)) return true;
  return false;
}

export function escolherDescricaoProdutoExterno(input: {
  descricao?: unknown;
  itemDescricao?: unknown;
  sku?: unknown;
  codigo?: unknown;
}): string {
  const codigo = normalizarCodigoExterno14(input.codigo);
  const candidatos = [input.descricao, input.itemDescricao, input.sku]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const candidato of candidatos) {
    if (!pareceApenasCodigo(candidato, codigo)) return candidato;
  }

  return "Item sem descricao";
}

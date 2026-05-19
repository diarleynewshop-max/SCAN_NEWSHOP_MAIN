export const HISTORICO_COMPRAS_KEY = "scan_newshop_historico_compras";

export function getHistoricoComprasEnabled(): boolean {
  try {
    return localStorage.getItem(HISTORICO_COMPRAS_KEY) === "true";
  } catch {
    return false;
  }
}

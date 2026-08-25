import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type LoginUsuarioRow = { login?: string; role?: string };
const EMPRESAS = ["NEWSHOP", "FACIL", "SOYE"] as const;
type Empresa = typeof EMPRESAS[number];

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
  if (typeof req.body === "string") return JSON.parse(req.body) as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

function respostaErro(res: VercelResponse, status: number, mensagem: string) {
  return res.status(status).json({ error: mensagem });
}

function empresaValida(value: unknown): Empresa | null {
  const empresa = texto(value).toUpperCase();
  return EMPRESAS.includes(empresa as Empresa) ? empresa as Empresa : null;
}

function empresasLiberadas(): Empresa[] {
  const configuradas = (process.env.IA_ESTOQUE_EMPRESAS || "NEWSHOP")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is Empresa => EMPRESAS.includes(item as Empresa));
  return configuradas.length ? configuradas : ["NEWSHOP"];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") return respostaErro(res, 405, "Metodo nao permitido.");

  try {
    const body = parseBody(req);
    const login = texto(body.login).toLowerCase();
    const senha = texto(body.senha);
    const empresa = empresaValida(body.empresa);
    if (!login || !senha || !empresa) return respostaErro(res, 400, "Informe login, senha e empresa valida.");
    if (!empresasLiberadas().includes(empresa)) return respostaErro(res, 403, `A API para ${empresa} nao esta habilitada.`);

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
    if (!supabaseUrl || !supabaseKey) return respostaErro(res, 503, "Validacao de usuario nao configurada.");

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("login_usuario", { p_login: login, p_senha: senha });
    if (error || !Array.isArray(data)) return respostaErro(res, 401, "Senha incorreta.");

    const usuario = data[0] as LoginUsuarioRow | undefined;
    if (!usuario || texto(usuario.login).toLowerCase() !== login || texto(usuario.role).toLowerCase() !== "super") {
      return respostaErro(res, 403, "A chave da API de estoque esta disponivel somente para usuario Super.");
    }

    const apiKey = texto(process.env[`IA_ESTOQUE_API_KEY_${empresa}`]);
    if (!apiKey) return respostaErro(res, 503, `A chave da API ${empresa} ainda nao esta configurada na Vercel.`);

    return res.status(200).json({
      apiKey,
      endpoint: "https://scan-newshop-main.vercel.app/api/ia-estoque",
      header: "X-API-Key",
      empresa,
    });
  } catch {
    return respostaErro(res, 400, "Nao foi possivel validar a solicitacao.");
  }
}

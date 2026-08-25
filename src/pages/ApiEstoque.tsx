import { useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type CredencialResposta = {
  apiKey: string;
  endpoint: string;
  header: string;
  empresa: string[];
};

export default function ApiEstoque() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [credencial, setCredencial] = useState<CredencialResposta | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function liberarChave() {
    if (!loginSalvo?.login || !senha.trim()) {
      toast({ title: "Informe sua senha", variant: "destructive" });
      return;
    }
    setCarregando(true);
    try {
      const resposta = await fetch("/api/ia-estoque-credencial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginSalvo.login, senha }),
      });
      const data = await resposta.json() as CredencialResposta & { error?: string };
      if (!resposta.ok || !data.apiKey) throw new Error(data.error || "Nao foi possivel liberar a chave.");
      setCredencial(data);
      setSenha("");
      toast({ title: "Chave liberada", description: "Copie e guarde no cofre de secrets da outra IA." });
    } catch (error) {
      toast({ title: "Acesso negado", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }

  async function copiar(texto: string, nome: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: `${nome} copiado` });
    } catch {
      toast({ title: "Nao foi possivel copiar", variant: "destructive" });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-8">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><KeyRound className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Integração externa</p>
            <h1 className="mt-1 text-2xl font-black text-foreground">API IA Estoque</h1>
            <p className="mt-2 text-sm text-muted-foreground">Libere sua chave de leitura para conectar outra IA ao estoque do ERP.</p>
          </div>
        </div>
      </section>

      {!credencial ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Confirme sua senha de Super</div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={mostrarSenha ? "text" : "password"}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void liberarChave(); }}
                placeholder="Sua senha"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-11 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setMostrarSenha((valor) => !valor)} className="absolute right-3 top-3 text-muted-foreground" aria-label="Mostrar senha">
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button onClick={() => void liberarChave()} disabled={carregando} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Liberar
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">A chave nao fica salva no aparelho. Ela aparece somente nesta tela apos validar sua senha.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Chave de leitura</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background p-3">
            <code className="min-w-0 flex-1 break-all text-sm font-semibold text-foreground">{credencial.apiKey}</code>
            <button onClick={() => void copiar(credencial.apiKey, "Chave")} className="rounded-md p-2 text-primary hover:bg-primary/10" title="Copiar chave"><Copy className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Endpoint</p><p className="break-all font-mono text-xs text-foreground">{credencial.endpoint}</p></div>
            <div><p className="text-xs text-muted-foreground">Empresas liberadas</p><p className="font-semibold text-foreground">{credencial.empresa.join(", ")}</p></div>
          </div>
          <div className="mt-4 rounded-lg bg-muted p-3 font-mono text-xs text-foreground">{credencial.header}: {credencial.apiKey}</div>
          <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">Envie a chave somente pelo cofre de secrets da outra IA. Nao cole em chat, frontend ou codigo.</p>
          <button onClick={() => setCredencial(null)} className="mt-3 text-sm font-semibold text-muted-foreground underline">Ocultar chave</button>
        </section>
      )}
    </main>
  );
}

import { useMemo, useState } from "react";
import { Download, Eye, EyeOff, MessageSquareText, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, type Empresa } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { listarFeedbackAdmin, type FeedbackAdmin } from "@/lib/feedback";

const EMPRESAS: Array<Empresa | ""> = ["", "NEWSHOP", "SOYE", "FACIL", "SEFULY"];

function formatarData(iso: string): string {
  if (!iso) return "-";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${text}"`;
}

function baixarCsv(feedbacks: FeedbackAdmin[]) {
  const headers = [
    "Data",
    "Empresa",
    "Nome",
    "Login",
    "Nota geral",
    "Clareza",
    "Bom",
    "Ruim",
    "Melhorar",
    "Ferramentas",
    "Outros",
    "Rota",
  ];
  const linhas = feedbacks.map((item) => [
    formatarData(item.createdAt),
    item.empresa,
    item.nome,
    item.login,
    item.notaGeral,
    item.notaClareza,
    item.bom,
    item.ruim,
    item.melhorar,
    item.ferramentas,
    item.outros,
    item.rotaAtual,
  ]);
  const csv = [headers, ...linhas].map((linha) => linha.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `feedback-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Feedback() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | "">("");
  const [busca, setBusca] = useState("");
  const [feedbacks, setFeedbacks] = useState<FeedbackAdmin[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const feedbacksFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return feedbacks;
    return feedbacks.filter((item) =>
      [
        item.nome,
        item.login,
        item.empresa,
        item.bom,
        item.ruim,
        item.melhorar,
        item.ferramentas,
        item.outros,
      ]
        .join(" ")
        .toLowerCase()
        .includes(termo)
    );
  }, [busca, feedbacks]);

  const resumo = useMemo(() => {
    if (feedbacks.length === 0) return { total: 0, nota: "-", clareza: "-" };
    const media = (key: "notaGeral" | "notaClareza") =>
      (feedbacks.reduce((sum, item) => sum + item[key], 0) / feedbacks.length).toFixed(1);
    return { total: feedbacks.length, nota: media("notaGeral"), clareza: media("notaClareza") };
  }, [feedbacks]);

  async function carregar(senhaAtual = senha) {
    if (!loginSalvo?.login) {
      toast({ title: "Refaca o login", variant: "destructive" });
      return;
    }
    if (!senhaAtual.trim()) {
      toast({ title: "Informe sua senha", variant: "destructive" });
      return;
    }

    setCarregando(true);
    try {
      const data = await listarFeedbackAdmin({ login: loginSalvo.login, senha: senhaAtual }, { empresa, limite: 500 });
      setFeedbacks(data);
      setSenha(senhaAtual);
      setConfirmado(true);
    } catch (err) {
      toast({
        title: "Acesso negado",
        description: err instanceof Error ? err.message : "Nao foi possivel carregar feedbacks.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-8">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <MessageSquareText className="h-4 w-4" />
              Feedback interno
            </div>
            <h1 className="mt-2 text-2xl font-black text-foreground">Respostas dos usuários</h1>
            <p className="mt-1 text-sm text-muted-foreground">Notas, sugestões e pontos de melhoria do SCAN.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-black text-foreground">{resumo.total}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Nota</p>
              <p className="text-xl font-black text-foreground">{resumo.nota}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Clareza</p>
              <p className="text-xl font-black text-foreground">{resumo.clareza}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1.1fr_160px_1fr_auto_auto] md:items-end">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Sua senha</span>
            <div className="flex gap-2">
              <Input
                type={senhaVisivel ? "text" : "password"}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Senha admin/super"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void carregar();
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setSenhaVisivel((v) => !v)}>
                {senhaVisivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Empresa</span>
            <select
              value={empresa}
              onChange={(event) => setEmpresa(event.target.value as Empresa | "")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {EMPRESAS.map((item) => (
                <option key={item || "todas"} value={item}>
                  {item || "Todas"}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Busca</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Nome, login ou comentário"
                className="pl-9"
              />
            </div>
          </label>

          <Button type="button" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => baixarCsv(feedbacksFiltrados)}
            disabled={feedbacksFiltrados.length === 0}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        {!confirmado ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Informe sua senha e clique em Atualizar.</p>
          </div>
        ) : feedbacksFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum feedback encontrado.
          </div>
        ) : (
          feedbacksFiltrados.map((item) => (
            <article key={item.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.login} · {item.empresa} · {formatarData(item.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">Nota {item.notaGeral}/5</span>
                  <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground">Clareza {item.notaClareza}/5</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ["Bom", item.bom],
                  ["Ruim", item.ruim],
                  ["Melhorar", item.melhorar],
                  ["Ferramentas", item.ferramentas],
                  ["Outros", item.outros],
                ]
                  .filter(([, value]) => String(value ?? "").trim())
                  .map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value}</p>
                    </div>
                  ))}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

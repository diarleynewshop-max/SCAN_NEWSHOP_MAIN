import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, MessageSquare, PackageCheck, Repeat, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  subscribeNotificacoes,
  type Notificacao,
} from "@/lib/notificacoes";
import {
  buscarRecomendacaoPorId,
  responderRecomendacaoSubstituicao,
} from "@/lib/recomendacoesSubstituicao";
import { criarNotificacao } from "@/lib/notificacoes";

function tempoRelativo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

function IconeTipo({ tipo }: { tipo: Notificacao["tipo"] }) {
  const cls = "h-5 w-5";
  if (tipo === "recomendacao") return <Repeat className={`${cls} text-indigo-600`} />;
  if (tipo === "resultado_troca") return <Check className={`${cls} text-emerald-600`} />;
  if (tipo === "pedido_concluido") return <PackageCheck className={`${cls} text-sky-600`} />;
  return <MessageSquare className={`${cls} text-violet-600`} />;
}

export default function Notificacoes() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const empresa = loginSalvo?.empresa ?? "NEWSHOP";
  const nome = String(loginSalvo?.nomePessoa ?? "").trim();

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const carregarRef = useRef<() => Promise<void>>(async () => undefined);

  const carregar = useCallback(async () => {
    if (!nome) {
      setNotificacoes([]);
      setLoading(false);
      return;
    }
    try {
      const data = await listarNotificacoes(empresa, nome);
      setNotificacoes(data);
    } catch (err) {
      console.error("[Notificacoes] falha ao carregar:", err);
    } finally {
      setLoading(false);
    }
  }, [empresa, nome]);

  carregarRef.current = carregar;

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!nome) return;
    const unsub = subscribeNotificacoes(empresa, () => void carregarRef.current());
    return unsub;
  }, [empresa, nome]);

  const abrir = async (n: Notificacao) => {
    if (!n.lida) {
      try {
        await marcarNotificacaoLida(n.id);
        setNotificacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      } catch { /* ignore */ }
    }
    if (n.tipo === "mensagem" && n.refId) {
      navigate(`/chat?com=${encodeURIComponent(n.refId)}`);
    }
  };

  const responder = async (n: Notificacao, decisao: "aceita" | "recusada") => {
    if (!n.refId) return;
    setProcessando(n.id);
    try {
      const rec = await buscarRecomendacaoPorId(n.refId);
      if (!rec || rec.status !== "pendente") {
        toast({ title: "Recomendacao ja respondida", variant: "destructive" });
        await carregar();
        return;
      }
      await responderRecomendacaoSubstituicao(n.refId, decisao, nome);
      await marcarNotificacaoLida(n.id);
      // Avisa quem sugeriu.
      await criarNotificacao({
        empresa,
        destinatario: rec.sugeridoPor,
        tipo: "resultado_troca",
        titulo: `${nome} ${decisao === "aceita" ? "aceitou" : "recusou"} a troca`,
        corpo: `${rec.codigoOriginal} por ${rec.codigoSugerido}`,
        refTipo: "recomendacao",
        refId: rec.id,
      });
      toast({ title: decisao === "aceita" ? "Troca aceita" : "Troca recusada" });
      await carregar();
    } catch (err) {
      toast({
        title: "Falha ao responder",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProcessando(null);
    }
  };

  const marcarTodas = async () => {
    try {
      await marcarTodasNotificacoesLidas(empresa, nome);
      setNotificacoes((prev) => prev.map((x) => ({ ...x, lida: true })));
    } catch { /* ignore */ }
  };

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-8">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Bell className="h-4 w-4" /> Notificacoes
            </div>
            <h1 className="mt-2 text-2xl font-black text-foreground">
              {naoLidas > 0 ? `${naoLidas} nao lida(s)` : "Tudo em dia"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{nome || "-"} · {empresa}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void carregar()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground hover:bg-accent"
              aria-label="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => void marcarTodas()}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-accent"
              >
                <CheckCheck className="h-4 w-4" /> Marcar todas
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {loading ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : notificacoes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma notificacao ainda.</p>
          </div>
        ) : (
          notificacoes.map((n) => (
            <article
              key={n.id}
              className={`rounded-2xl border p-4 transition ${n.lida ? "border-border bg-card" : "border-primary/40 bg-primary/5"}`}
            >
              <button type="button" onClick={() => void abrir(n)} className="flex w-full items-start gap-3 text-left">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background">
                  <IconeTipo tipo={n.tipo} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground">{n.titulo}</p>
                    {!n.lida && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  {n.corpo && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.corpo}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{tempoRelativo(n.createdAt)}</p>
                </div>
              </button>

              {n.tipo === "recomendacao" && n.refId && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void responder(n, "aceita")}
                    disabled={processando === n.id}
                    className="flex-1 h-10 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {processando === n.id ? "..." : "Aceitar troca"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void responder(n, "recusada")}
                    disabled={processando === n.id}
                    className="flex-1 h-10 rounded-xl border border-border bg-background text-sm font-bold text-foreground disabled:opacity-50"
                  >
                    Recusar
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

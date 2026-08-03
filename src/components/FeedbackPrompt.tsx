import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Clock3, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { enviarFeedback, temComentarioFeedback, verificarFeedbackPendente } from "@/lib/feedback";
import { loginEhSefuly } from "@/lib/lojaFeatures";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const START_DELAY_MS = 2200;
const DEFER_UNLOCK_SECONDS = 12;

const camposTexto = [
  { key: "bom", label: "O que está bom?", placeholder: "Ex.: ficou mais rápido, ajuda no pedido..." },
  { key: "ruim", label: "O que está ruim?", placeholder: "Ex.: tela confusa, demora, trava..." },
  { key: "melhorar", label: "O que precisa melhorar?", placeholder: "Pontos que atrapalham o trabalho." },
  { key: "ferramentas", label: "Ferramentas que faltam", placeholder: "O que você precisa que ainda não tem." },
  { key: "outros", label: "Mais alguma coisa?", placeholder: "Qualquer sugestão extra." },
] as const;

type CampoTexto = (typeof camposTexto)[number]["key"];
type FormState = Record<CampoTexto, string> & {
  notaGeral: number;
  notaClareza: number;
};

const formInicial: FormState = {
  notaGeral: 0,
  notaClareza: 0,
  bom: "",
  ruim: "",
  melhorar: "",
  ferramentas: "",
  outros: "",
};

function NotaControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <span className="text-xs font-bold text-foreground">{value > 0 ? `Nota ${value}` : "Sem nota"}</span>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((nota) => (
          <button
            key={nota}
            type="button"
            aria-label={`${label}: nota ${nota}`}
            onClick={() => onChange(nota)}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-black transition ${
              nota <= value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-transparent hover:border-primary/60 hover:bg-accent"
            }`}
          >
            {nota <= value ? "x" : "x"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FeedbackPrompt() {
  const location = useLocation();
  const { loginSalvo, atualizarLoginSalvo } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [deferSeconds, setDeferSeconds] = useState(DEFER_UNLOCK_SECONDS);
  const [form, setForm] = useState<FormState>(formInicial);
  const openRef = useRef(false);
  const checandoRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDeferSeconds(DEFER_UNLOCK_SECONDS);
      return;
    }

    setDeferSeconds(DEFER_UNLOCK_SECONDS);
    const intervalId = window.setInterval(() => {
      setDeferSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [open]);

  useEffect(() => {
    setForm(formInicial);
  }, [loginSalvo?.usuarioId]);

  useEffect(() => {
    if (!loginSalvo?.usuarioId || !loginSalvo.login || loginEhSefuly(loginSalvo) || loginSalvo.feedbackPendente === false) {
      setOpen(false);
      return;
    }

    let cancelado = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    const tentarExibir = async () => {
      if (cancelado || openRef.current || checandoRef.current) return;
      checandoRef.current = true;
      try {
        const status = await verificarFeedbackPendente({
          usuarioId: loginSalvo.usuarioId,
          login: loginSalvo.login ?? "",
        });
        if (!cancelado && status.deveExibir) setOpen(true);
      } catch (err) {
        console.warn("[feedback] falha ao checar feedback pendente:", err);
      } finally {
        checandoRef.current = false;
      }
    };

    timeoutId = window.setTimeout(() => void tentarExibir(), START_DELAY_MS);
    intervalId = window.setInterval(() => void tentarExibir(), CHECK_INTERVAL_MS);

    return () => {
      cancelado = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [loginSalvo?.usuarioId, loginSalvo?.login, loginSalvo?.empresa, loginSalvo?.feedbackPendente]);

  const setCampo = (campo: CampoTexto, value: string) => {
    setForm((prev) => ({ ...prev, [campo]: value }));
  };

  const handleEnviar = async () => {
    if (!loginSalvo?.usuarioId || !loginSalvo.login) return;
    if (form.notaGeral < 1 || form.notaClareza < 1) {
      toast({ title: "Dê as duas notas", description: "Marque de 1 a 5 antes de enviar.", variant: "destructive" });
      return;
    }
    if (!temComentarioFeedback(form)) {
      toast({ title: "Escreva pelo menos um comentário", variant: "destructive" });
      return;
    }

    setEnviando(true);
    try {
      await enviarFeedback({
        usuarioId: loginSalvo.usuarioId,
        login: loginSalvo.login,
        empresa: loginSalvo.empresa,
        notaGeral: form.notaGeral,
        notaClareza: form.notaClareza,
        bom: form.bom,
        ruim: form.ruim,
        melhorar: form.melhorar,
        ferramentas: form.ferramentas,
        outros: form.outros,
        rotaAtual: `${location.pathname}${location.search}`,
        userAgent: navigator.userAgent,
      });
      atualizarLoginSalvo({ feedbackPendente: false });
      setOpen(false);
      setForm(formInicial);
      toast({ title: "Feedback enviado", description: "Obrigado. Isso entra na lista de melhorias do SCAN." });
    } catch (err) {
      toast({
        title: "Falha ao enviar feedback",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleLembrarDepois = () => {
    if (enviando || deferSeconds > 0) return;
    setOpen(false);
  };

  if (!loginSalvo?.usuarioId || !loginSalvo.login || loginEhSefuly(loginSalvo) || loginSalvo.feedbackPendente === false) return null;

  const podeAdiar = deferSeconds <= 0;

  return (
    <Dialog open={open} onOpenChange={(next) => next && !enviando && setOpen(true)}>
      <DialogContent
        className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0 [&>button:last-child]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="border-b border-border bg-muted/30 px-5 py-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageSquareText className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle>Feedback rápido do SCAN</DialogTitle>
                <DialogDescription>
                  Responda uma vez. Depois disso este aviso não aparece mais para você.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <NotaControl
              label="Nota geral da ferramenta"
              value={form.notaGeral}
              onChange={(notaGeral) => setForm((prev) => ({ ...prev, notaGeral }))}
            />
            <NotaControl
              label="Clareza para usar"
              value={form.notaClareza}
              onChange={(notaClareza) => setForm((prev) => ({ ...prev, notaClareza }))}
            />
          </div>

          <div className="grid gap-3">
            {camposTexto.map((campo) => (
              <label key={campo.key} className="grid gap-1.5">
                <span className="text-sm font-semibold text-foreground">{campo.label}</span>
                <Textarea
                  value={form[campo.key]}
                  onChange={(event) => setCampo(campo.key, event.target.value)}
                  placeholder={campo.placeholder}
                  maxLength={700}
                  className="min-h-[72px] resize-y"
                />
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-background px-5 py-4 sm:gap-2">
          <Button type="button" variant="outline" onClick={handleLembrarDepois} disabled={enviando || !podeAdiar}>
            <Clock3 className="h-4 w-4" />
            {podeAdiar ? "Lembrar depois" : `Lembrar depois (${deferSeconds}s)`}
          </Button>
          <Button type="button" onClick={() => void handleEnviar()} disabled={enviando}>
            <Send className="h-4 w-4" />
            {enviando ? "Enviando..." : "Enviar feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

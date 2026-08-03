import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileDown, FileText, Loader2, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { obterLoginSalvo } from "@/hooks/useAuth";
import {
  baixarComprasIaPdf,
  baixarComprasIaTxt,
  consultarComprasIa,
  type ComprasIaContexto,
  type ComprasIaMessage,
} from "@/lib/comprasIa";

interface ComprasIaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: string;
  flag: string;
}

interface MensagemLocal extends ComprasIaMessage {
  id: string;
  contexto?: ComprasIaContexto;
  perguntaOrigem?: string;
}

const SUGESTOES = [
  "Qual produto foi mais pedido nos dias 10 e 12?",
  "Faca um relatorio dos itens mais pedidos no periodo lido.",
  "Quais secoes tiveram mais falta?",
];

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function erroMensagem(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "Falha ao consultar IA.");
}

export function ComprasIaModal({ open, onOpenChange, empresa, flag }: ComprasIaModalProps) {
  const { toast } = useToast();
  const [senha, setSenha] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<MensagemLocal[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [acessoValidado, setAcessoValidado] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loginSalvo = useMemo(() => (open ? obterLoginSalvo() : null), [open]);

  useEffect(() => {
    if (!open) {
      setSenha("");
      setPergunta("");
      setAcessoValidado(false);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, enviando]);

  const enviar = async () => {
    const texto = pergunta.trim();
    const actorLogin = loginSalvo?.login?.trim() ?? "";
    const actorSenha = senha.trim();

    if (!texto || enviando) return;
    if (!actorLogin) {
      toast({
        title: "Login nao encontrado",
        description: "Entre novamente no sistema para usar a IA.",
        variant: "destructive",
      });
      return;
    }
    if (!actorSenha) {
      toast({
        title: "Senha obrigatoria",
        description: "Confirme sua senha admin/super.",
        variant: "destructive",
      });
      return;
    }

    const historico = mensagens.map(({ role, content }) => ({ role, content })).slice(-8);
    const userMessage: MensagemLocal = { id: nextId(), role: "user", content: texto };

    setMensagens((prev) => [...prev, userMessage]);
    setPergunta("");
    setEnviando(true);

    try {
      const result = await consultarComprasIa({
        pergunta: texto,
        historico,
        empresa,
        flag,
        actorLogin,
        actorSenha,
      });

      setAcessoValidado(true);
      setMensagens((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: result.resposta,
          contexto: result.contexto,
          perguntaOrigem: texto,
        },
      ]);
    } catch (error) {
      const message = erroMensagem(error);
      toast({ title: "IA de Compras falhou", description: message, variant: "destructive" });
      setMensagens((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: `Erro: ${message}`,
          perguntaOrigem: texto,
        },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-slate-950 px-5 py-4 text-left text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-white">IA Compras</DialogTitle>
              <DialogDescription className="text-slate-300">
                {empresa} | {String(flag).toUpperCase()} | Admin/Super
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b bg-slate-50 px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              type="password"
              value={senha}
              onChange={(event) => {
                setSenha(event.target.value);
                setAcessoValidado(false);
              }}
              placeholder="Senha admin/super"
              className="max-w-sm bg-white"
              disabled={enviando}
            />
            {acessoValidado && (
              <Badge className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Validado
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="w-fit bg-white text-slate-700">
            Supabase leitura
          </Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-5 py-4">
            {mensagens.length === 0 && (
              <div className="grid gap-2 md:grid-cols-3">
                {SUGESTOES.map((sugestao) => (
                  <Button
                    key={sugestao}
                    variant="outline"
                    className="h-auto justify-start whitespace-normal rounded-md bg-white px-3 py-3 text-left text-sm"
                    onClick={() => setPergunta(sugestao)}
                  >
                    {sugestao}
                  </Button>
                ))}
              </div>
            )}

            {mensagens.map((mensagem) => {
              const isUser = mensagem.role === "user";
              return (
                <div key={mensagem.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[92%] rounded-md px-4 py-3 text-sm leading-6 shadow-sm md:max-w-[78%] ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{mensagem.content}</div>
                    {!isUser && !mensagem.content.startsWith("Erro:") && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => baixarComprasIaTxt(mensagem.perguntaOrigem ?? "", mensagem.content, mensagem.contexto)}
                        >
                          <FileText className="mr-2 h-3.5 w-3.5" />
                          TXT
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => baixarComprasIaPdf(mensagem.perguntaOrigem ?? "", mensagem.content, mensagem.contexto)}
                        >
                          <FileDown className="mr-2 h-3.5 w-3.5" />
                          PDF
                        </Button>
                        {mensagem.contexto && (
                          <span className="text-xs text-slate-500">
                            {mensagem.contexto.periodo_inicio} a {mensagem.contexto.periodo_fim}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {enviando && (
              <div className="flex justify-start">
                <div className="flex max-w-[78%] items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t bg-white px-5 py-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Textarea
              value={pergunta}
              onChange={(event) => setPergunta(event.target.value)}
              placeholder="Pergunte sobre compras, pedidos, datas, secoes ou faltas..."
              className="min-h-[72px] resize-none"
              disabled={enviando}
            />
            <Button onClick={() => void enviar()} disabled={enviando || !pergunta.trim()} className="h-11 md:w-32">
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

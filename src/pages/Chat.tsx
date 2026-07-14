import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ImageIcon, RefreshCw, ScanBarcode, Send, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  LIMITE_MENSAGEM,
  contarMensagensNaoLidas,
  enviarMensagem,
  listarConversa,
  listarUsuariosChat,
  marcarConversaLida,
  subscribeMensagens,
  type Mensagem,
  type UsuarioChat,
} from "@/lib/chat";
import { buscarProdutoVarejoFacil } from "@/lib/varejoFacilIntegration";

const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));

function horaMsg(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function lerArquivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Chat() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const empresa = loginSalvo?.empresa ?? "NEWSHOP";
  const meuNome = String(loginSalvo?.nomePessoa ?? "").trim();
  const flag = loginSalvo?.flag ?? "loja";

  const [usuarios, setUsuarios] = useState<UsuarioChat[]>([]);
  const [naoLidasPorNome, setNaoLidasPorNome] = useState<Record<string, number>>({});
  const [ativo, setAtivo] = useState<string>(params.get("com") ?? "");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const carregarConversaRef = useRef<() => Promise<void>>(async () => undefined);

  // Diretorio de usuarios da empresa
  useEffect(() => {
    if (!meuNome) return;
    void (async () => {
      try {
        setUsuarios(await listarUsuariosChat(empresa, meuNome));
      } catch (err) {
        console.error("[Chat] falha ao listar usuarios:", err);
      }
    })();
  }, [empresa, meuNome]);

  const carregarUsuarios = useCallback(async () => {
    if (!meuNome) return;
    try {
      setUsuarios(await listarUsuariosChat(empresa, meuNome));
    } catch (err) {
      console.error("[Chat] falha ao listar usuarios:", err);
    }
  }, [empresa, meuNome]);

  const carregarConversa = useCallback(async () => {
    if (!meuNome || !ativo) {
      setMensagens([]);
      return;
    }
    try {
      const data = await listarConversa(empresa, meuNome, ativo);
      setMensagens(data);
      await marcarConversaLida(empresa, meuNome, ativo);
    } catch (err) {
      console.error("[Chat] falha ao carregar conversa:", err);
    }
  }, [empresa, meuNome, ativo]);

  carregarConversaRef.current = carregarConversa;

  useEffect(() => {
    void carregarConversa();
  }, [carregarConversa]);

  // Contadores de nao lidas (atualizados no realtime)
  const atualizarContadores = useCallback(async () => {
    if (!meuNome) return;
    try {
      // recarrega direcao atual e recomputa badges simples via conversa nao lida
      const total = await contarMensagensNaoLidas(empresa, meuNome);
      if (total === 0) setNaoLidasPorNome({});
    } catch { /* ignore */ }
  }, [empresa, meuNome]);

  const atualizarTudo = useCallback(async () => {
    if (!meuNome) return;
    setAtualizando(true);
    try {
      await Promise.all([
        carregarUsuarios(),
        carregarConversaRef.current(),
        atualizarContadores(),
      ]);
    } finally {
      setAtualizando(false);
    }
  }, [atualizarContadores, carregarUsuarios, meuNome]);

  useEffect(() => {
    if (!meuNome) return;
    const unsub = subscribeMensagens(empresa, () => {
      void carregarConversaRef.current();
      void atualizarContadores();
    });
    return unsub;
  }, [empresa, meuNome, atualizarContadores]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const selecionar = (nome: string) => {
    setAtivo(nome);
    setParams({ com: nome });
  };

  const enviarTexto = async () => {
    const conteudo = texto.trim();
    if (!conteudo || !ativo) return;
    setEnviando(true);
    try {
      await enviarMensagem({ empresa, remetente: meuNome, destinatario: ativo, conteudo });
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enviarFoto = async (file: File) => {
    if (!ativo) return;
    setEnviando(true);
    try {
      const dataUrl = await lerArquivoComoDataUrl(file);
      await enviarMensagem({ empresa, remetente: meuNome, destinatario: ativo, fotoDataUrl: dataUrl, conteudo: texto.trim() });
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar foto", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enviarItem = async (codigo: string) => {
    setShowScanner(false);
    const cod = codigo.trim();
    if (!cod || !ativo) return;
    setEnviando(true);
    try {
      let descricao: string | null = null;
      let foto: string | null = null;
      try {
        const prod = await buscarProdutoVarejoFacil(cod, { empresa, flag });
        if (prod) { descricao = prod.descricao ?? null; foto = prod.imagem ?? null; }
      } catch { /* best-effort */ }
      await enviarMensagem({
        empresa,
        remetente: meuNome,
        destinatario: ativo,
        item: { codigo: cod, descricao, foto },
        conteudo: texto.trim(),
      });
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar item", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const usuarioAtivo = useMemo(() => usuarios.find((u) => u.nome === ativo), [usuarios, ativo]);

  if (!meuNome) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Faca login para usar o chat.</div>;
  }

  // Lista de contatos (quando nenhum selecionado no mobile)
  if (!ativo) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Chat - {empresa}
          </div>
          <button
            onClick={() => void atualizarTudo()}
            disabled={atualizando}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
          </button>
        </div>
        <h1 className="text-2xl font-black text-foreground">Com quem voce quer falar?</h1>
        <div className="mt-2 flex flex-col gap-2">
          {usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum outro usuario nesta empresa.</p>
          ) : (
            usuarios.map((u) => (
              <button
                key={u.login}
                onClick={() => selecionar(u.nome)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                  {u.nome.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{u.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.role}</p>
                </div>
                {naoLidasPorNome[u.nome] > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {naoLidasPorNome[u.nome]}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-0.5rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden bg-background sm:h-[calc(100vh-1rem)] sm:rounded-2xl sm:border sm:border-border">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-3 sm:px-4">
        <button onClick={() => { setAtivo(""); setParams({}); }} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
          {ativo.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{ativo}</p>
          {usuarioAtivo && <p className="truncate text-xs text-muted-foreground">{usuarioAtivo.role}</p>}
        </div>
        <button
          onClick={() => void atualizarTudo()}
          disabled={atualizando}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-background px-3 py-4 sm:px-4">
        {mensagens.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem mensagens ainda. Diga oi!</p>
        ) : (
          mensagens.map((m) => {
            const meu = m.remetente === meuNome;
            return (
              <div key={m.id} className={`flex ${meu ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${meu ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`}>
                  {m.tipo === "recomendacao" && (
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-80">🔄 Recomendacao de troca</div>
                  )}
                  {m.fotoUrl && (
                    <img src={m.fotoUrl} alt="foto" className="mb-1 max-h-52 w-full rounded-lg object-cover" loading="lazy" />
                  )}
                  {m.itemCodigo && (
                    <div className={`mb-1 flex items-center gap-2 rounded-lg p-2 ${meu ? "bg-primary-foreground/15" : "bg-background"}`}>
                      {m.itemFoto ? (
                        <img src={m.itemFoto} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <ScanBarcode className="h-6 w-6 opacity-70" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{m.itemDescricao || m.itemCodigo}</p>
                        <p className="truncate font-mono text-[11px] opacity-80">{m.itemCodigo}</p>
                      </div>
                    </div>
                  )}
                  {m.conteudo && <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>}
                  <p className={`mt-0.5 text-right text-[10px] ${meu ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{horaMsg(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={fimRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-card px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={enviando}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground disabled:opacity-50"
            title="Enviar foto"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowScanner(true)}
            disabled={enviando}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground disabled:opacity-50"
            title="Escanear e enviar item"
          >
            <ScanBarcode className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_MENSAGEM))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviarTexto(); } }}
              placeholder="Mensagem (max 500)"
              rows={1}
              className="max-h-28 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <div className="text-right text-[10px] text-muted-foreground">{texto.length}/{LIMITE_MENSAGEM}</div>
          </div>
          <button
            onClick={() => void enviarTexto()}
            disabled={enviando || !texto.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
            title="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarFoto(f); e.target.value = ""; }}
        />
      </div>

      {showScanner && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-background p-6 text-center">Carregando scanner...</div>}>
          <BarcodeScanner onDetected={(code) => void enviarItem(code)} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}

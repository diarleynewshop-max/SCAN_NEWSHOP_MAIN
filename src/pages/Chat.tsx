import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  ImageIcon,
  Mic,
  Pencil,
  RefreshCw,
  ScanBarcode,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Empresa } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  LIMITE_MIDIA_CHAT_BYTES,
  LIMITE_MENSAGEM,
  apagarMensagemChat,
  editarMensagemChat,
  enviarMensagem,
  listarConversa,
  listarResumoConversas,
  listarUsuariosChat,
  marcarConversaLida,
  subscribeMensagens,
  type Mensagem,
  type ResumoConversa,
  type UsuarioChat,
} from "@/lib/chat";
import {
  buscarRecomendacaoPorId,
  responderRecomendacaoSubstituicao,
  type RecomendacaoSubstituicao,
} from "@/lib/recomendacoesSubstituicao";
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

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase() || "?";
}

function AvatarPessoa({ nome, fotoUrl, className }: { nome: string; fotoUrl?: string | null; className: string }) {
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nome} className={`${className} object-cover`} loading="lazy" />;
  }
  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-sky-500 to-emerald-500 text-sm font-black text-white`}>
      {iniciais(nome)}
    </div>
  );
}

function previewMensagem(resumo?: ResumoConversa): string {
  if (!resumo) return "Toque para iniciar conversa";
  if (resumo.tipo === "foto") return resumo.ultimaMensagem || "Foto";
  if (resumo.tipo === "audio") return resumo.ultimaMensagem || "Audio";
  if (resumo.tipo === "item") return resumo.ultimaMensagem || "Item enviado";
  if (resumo.tipo === "recomendacao") return resumo.ultimaMensagem || "Recomendacao de troca";
  return resumo.ultimaMensagem || "Mensagem";
}

function formatarMoeda(valor: number | null | undefined): string {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numero);
}

const EMPRESAS_CHAT: Empresa[] = ["NEWSHOP", "SOYE", "FACIL"];
const LIMITE_ENVIOS_MINUTO = 8;
const EMOJIS_CHAT = ["👍", "🙏", "😂", "😅", "❤️", "👏", "🔥", "✅", "❌", "👀", "📦", "🛒", "💰", "🚚", "⚠️", "🤝"];
const MIDIAS_CHAT_PERMITIDAS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

type ResumoConversaEmpresa = ResumoConversa & { empresa: Empresa };

function normalizarEmpresaChat(value: string | null | undefined, fallback: Empresa): Empresa {
  const normalized = String(value ?? "").trim().toUpperCase();
  return EMPRESAS_CHAT.includes(normalized as Empresa) ? (normalized as Empresa) : fallback;
}

function chaveConversa(empresa: Empresa, nome: string): string {
  return `${empresa}::${nome}`;
}

function formatarTamanho(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validarMidiaChat(file: File): { ok: true; tipo: "foto" | "audio" } | { ok: false; motivo: string } {
  const mime = String(file.type ?? "").toLowerCase();
  const nome = String(file.name ?? "").toLowerCase();
  const isGif = mime === "image/gif" || nome.endsWith(".gif");
  const isImagem = mime.startsWith("image/") || isGif;
  const isAudio = mime.startsWith("audio/");

  if (!MIDIAS_CHAT_PERMITIDAS.has(mime) && !isGif) {
    return { ok: false, motivo: "Envie apenas foto, GIF ou audio. PDF, ZIP, Excel e outros arquivos foram bloqueados." };
  }
  if (!isImagem && !isAudio) {
    return { ok: false, motivo: "Envie apenas foto, GIF ou audio." };
  }
  if (file.size > LIMITE_MIDIA_CHAT_BYTES) {
    return { ok: false, motivo: `Arquivo muito pesado. Limite: ${formatarTamanho(LIMITE_MIDIA_CHAT_BYTES)}.` };
  }
  return { ok: true, tipo: isAudio ? "audio" : "foto" };
}

export default function Chat() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const empresaLogin = loginSalvo?.empresa ?? "NEWSHOP";
  const meuNome = String(loginSalvo?.nomePessoa ?? "").trim();
  const flag = loginSalvo?.flag ?? "loja";
  const empresaInicial = normalizarEmpresaChat(params.get("empresa"), empresaLogin);

  const [usuariosPorEmpresa, setUsuariosPorEmpresa] = useState<Partial<Record<Empresa, UsuarioChat[]>>>({});
  const [resumos, setResumos] = useState<Record<string, ResumoConversaEmpresa>>({});
  const [ativo, setAtivo] = useState<string>(params.get("com") ?? "");
  const [empresaConversa, setEmpresaConversa] = useState<Empresa>(empresaInicial);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [recomendacoes, setRecomendacoes] = useState<Record<string, RecomendacaoSubstituicao>>({});
  const [texto, setTexto] = useState("");
  const [mostraEmojis, setMostraEmojis] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroNovaConversa, setFiltroNovaConversa] = useState("");
  const [buscandoNovaConversa, setBuscandoNovaConversa] = useState(false);
  const [empresaBusca, setEmpresaBusca] = useState<Empresa>(empresaInicial);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [respondendoRecomendacao, setRespondendoRecomendacao] = useState<string | null>(null);
  const [editandoMensagemId, setEditandoMensagemId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const carregarConversaRef = useRef<() => Promise<void>>(async () => undefined);
  const carregarResumoRef = useRef<() => Promise<void>>(async () => undefined);
  const enviosRecentesRef = useRef<number[]>([]);

  const carregarUsuarios = useCallback(async (empresaAlvo: Empresa) => {
    if (!meuNome) return [];
    try {
      setCarregandoUsuarios(true);
      const lista = await listarUsuariosChat(empresaAlvo, meuNome);
      setUsuariosPorEmpresa((prev) => ({ ...prev, [empresaAlvo]: lista }));
      return lista;
    } catch (err) {
      console.error("[Chat] falha ao listar usuarios:", err);
      return [];
    } finally {
      setCarregandoUsuarios(false);
    }
  }, [meuNome]);

  const carregarResumo = useCallback(async () => {
    if (!meuNome) return;
    try {
      const resultados = await Promise.all(
        EMPRESAS_CHAT.map(async (empresaItem) => [empresaItem, await listarResumoConversas(empresaItem, meuNome)] as const)
      );
      const novoResumo: Record<string, ResumoConversaEmpresa> = {};
      for (const [empresaItem, resumoEmpresa] of resultados) {
        for (const resumo of Object.values(resumoEmpresa)) {
          novoResumo[chaveConversa(empresaItem, resumo.nome)] = { ...resumo, empresa: empresaItem };
        }
      }
      setResumos(novoResumo);
    } catch (err) {
      console.error("[Chat] falha ao listar resumo:", err);
    }
  }, [meuNome]);

  const carregarConversa = useCallback(async () => {
    if (!meuNome || !ativo) {
      setMensagens([]);
      return;
    }
    try {
      const data = await listarConversa(empresaConversa, meuNome, ativo);
      setMensagens(data);
      await marcarConversaLida(empresaConversa, meuNome, ativo);
      await carregarResumoRef.current();
    } catch (err) {
      console.error("[Chat] falha ao carregar conversa:", err);
    }
  }, [ativo, empresaConversa, meuNome]);

  carregarConversaRef.current = carregarConversa;
  carregarResumoRef.current = carregarResumo;

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  useEffect(() => {
    if (ativo) void carregarUsuarios(empresaConversa);
  }, [ativo, carregarUsuarios, empresaConversa]);

  useEffect(() => {
    if (buscandoNovaConversa && !usuariosPorEmpresa[empresaBusca]) void carregarUsuarios(empresaBusca);
  }, [buscandoNovaConversa, carregarUsuarios, empresaBusca, usuariosPorEmpresa]);

  useEffect(() => {
    void carregarConversa();
  }, [carregarConversa]);

  const atualizarTudo = useCallback(async () => {
    if (!meuNome) return;
    setAtualizando(true);
    try {
      await Promise.all([
        ativo ? carregarUsuarios(empresaConversa) : Promise.resolve([]),
        buscandoNovaConversa ? carregarUsuarios(empresaBusca) : Promise.resolve([]),
        carregarResumoRef.current(),
        carregarConversaRef.current(),
      ]);
    } finally {
      setAtualizando(false);
    }
  }, [ativo, buscandoNovaConversa, carregarUsuarios, empresaBusca, empresaConversa, meuNome]);

  useEffect(() => {
    if (!meuNome) return;
    const unsubs = EMPRESAS_CHAT.map((empresaItem) => subscribeMensagens(empresaItem, () => {
      void carregarResumoRef.current();
      void carregarConversaRef.current();
    }));
    return () => unsubs.forEach((unsub) => unsub());
  }, [meuNome]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    const ids = [...new Set(mensagens.map((m) => m.recomendacaoId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) {
      setRecomendacoes({});
      return;
    }

    let cancelado = false;
    void (async () => {
      const pares = await Promise.all(ids.map(async (id) => {
        try {
          const rec = await buscarRecomendacaoPorId(id);
          return rec ? [id, rec] as const : null;
        } catch (err) {
          console.warn("[Chat] falha ao buscar recomendacao:", err);
          return null;
        }
      }));
      if (cancelado) return;
      setRecomendacoes(Object.fromEntries(pares.filter((item): item is readonly [string, RecomendacaoSubstituicao] => Boolean(item))));
    })();

    return () => {
      cancelado = true;
    };
  }, [mensagens]);

  const contatos = useMemo(() => {
    const busca = filtro.trim().toLowerCase();
    return Object.values(resumos)
      .filter((resumo) => {
        if (!busca) return true;
        return `${resumo.nome} ${resumo.empresa} ${resumo.ultimaMensagem}`.toLowerCase().includes(busca);
      })
      .sort((a, b) => {
        const dataA = a.ultimoHorario ? new Date(a.ultimoHorario ?? "").getTime() : 0;
        const dataB = b.ultimoHorario ? new Date(b.ultimoHorario ?? "").getTime() : 0;
        if (dataA !== dataB) return dataB - dataA;
        return a.nome.localeCompare(b.nome);
      });
  }, [filtro, resumos]);

  const usuariosBusca = usuariosPorEmpresa[empresaBusca] ?? [];
  const usuariosFiltrados = useMemo(() => {
    const busca = filtroNovaConversa.trim().toLowerCase();
    return usuariosBusca
      .filter((u) => {
        if (!busca) return true;
        return `${u.nome} ${u.login} ${u.role}`.toLowerCase().includes(busca);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtroNovaConversa, usuariosBusca]);

  const usuarioAtivo = useMemo(
    () => (usuariosPorEmpresa[empresaConversa] ?? []).find((u) => u.nome === ativo),
    [ativo, empresaConversa, usuariosPorEmpresa]
  );

  const podeEnviarAgora = (): boolean => {
    const agora = Date.now();
    enviosRecentesRef.current = enviosRecentesRef.current.filter((time) => agora - time < 60_000);
    if (enviosRecentesRef.current.length >= LIMITE_ENVIOS_MINUTO) {
      toast({
        title: "Muitas mensagens seguidas",
        description: "Aguarde um pouco antes de enviar de novo.",
        variant: "destructive",
      });
      return false;
    }
    enviosRecentesRef.current.push(agora);
    return true;
  };

  const selecionar = (nome: string, empresaSelecionada: Empresa) => {
    setAtivo(nome);
    setEmpresaConversa(empresaSelecionada);
    setBuscandoNovaConversa(false);
    setFiltroNovaConversa("");
    setParams({ com: nome, empresa: empresaSelecionada });
  };

  const inserirEmoji = (emoji: string) => {
    const campo = textoRef.current;
    if (!campo) {
      setTexto((prev) => `${prev}${emoji}`.slice(0, LIMITE_MENSAGEM));
      return;
    }
    const start = campo.selectionStart ?? texto.length;
    const end = campo.selectionEnd ?? texto.length;
    const novoTexto = `${texto.slice(0, start)}${emoji}${texto.slice(end)}`.slice(0, LIMITE_MENSAGEM);
    setTexto(novoTexto);
    window.requestAnimationFrame(() => {
      campo.focus();
      const pos = Math.min(start + emoji.length, novoTexto.length);
      campo.setSelectionRange(pos, pos);
    });
  };

  const voltarParaLista = () => {
    setAtivo("");
    setParams({});
  };

  const enviarTexto = async () => {
    const conteudo = texto.trim();
    if (!conteudo || !ativo || enviando) return;
    if (!podeEnviarAgora()) return;
    setEnviando(true);
    try {
      await enviarMensagem({ empresa: empresaConversa, remetente: meuNome, destinatario: ativo, conteudo });
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enviarMidia = async (file: File) => {
    if (!ativo) return;
    const validacao = validarMidiaChat(file);
    if (!validacao.ok) {
      toast({ title: "Arquivo bloqueado", description: validacao.motivo, variant: "destructive" });
      return;
    }
    if (!podeEnviarAgora()) return;
    setEnviando(true);
    try {
      const dataUrl = await lerArquivoComoDataUrl(file);
      if (validacao.tipo === "audio") {
        await enviarMensagem({
          empresa: empresaConversa,
          remetente: meuNome,
          destinatario: ativo,
          midiaDataUrl: dataUrl,
          midiaMime: file.type,
          midiaNome: file.name,
          midiaTamanho: file.size,
          conteudo: texto.trim(),
        });
      } else {
        await enviarMensagem({ empresa: empresaConversa, remetente: meuNome, destinatario: ativo, fotoDataUrl: dataUrl, conteudo: texto.trim() });
      }
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar midia", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enviarItem = async (codigo: string) => {
    setShowScanner(false);
    const cod = codigo.trim();
    if (!cod || !ativo) return;
    if (!podeEnviarAgora()) return;
    setEnviando(true);
    try {
      let descricao: string | null = null;
      let foto: string | null = null;
      let resumoItem = texto.trim();
      try {
        const prod = await buscarProdutoVarejoFacil(cod, { empresa: empresaConversa, flag });
        if (prod) {
          descricao = prod.descricao ?? null;
          foto = prod.imagem ?? null;
          const linhas = [
            prod.descricao ? `Item: ${prod.descricao}` : null,
            `Codigo: ${prod.codigo_barras || cod}`,
            prod.secao ? `Secao: ${prod.secao}` : "Secao: Nao informado",
            `Varejo: ${formatarMoeda(prod.precoVarejo)}`,
            `Atacado: ${formatarMoeda(prod.precoAtacado)}`,
            texto.trim() ? `Obs: ${texto.trim()}` : null,
          ].filter(Boolean);
          resumoItem = linhas.join("\n").slice(0, LIMITE_MENSAGEM);
        }
      } catch {
        // item no chat e best-effort; mensagem ainda pode ser enviada sem dados do ERP
      }
      await enviarMensagem({
        empresa: empresaConversa,
        remetente: meuNome,
        destinatario: ativo,
        item: { codigo: cod, descricao, foto },
        conteudo: resumoItem,
      });
      setTexto("");
      await carregarConversa();
    } catch (err) {
      toast({ title: "Falha ao enviar item", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const responderRecomendacao = async (id: string, decisao: "aceita" | "recusada") => {
    if (!id || respondendoRecomendacao) return;
    setRespondendoRecomendacao(id);
    try {
      await responderRecomendacaoSubstituicao(id, decisao, meuNome);
      const atualizada = await buscarRecomendacaoPorId(id);
      if (atualizada) {
        setRecomendacoes((prev) => ({ ...prev, [id]: atualizada }));
      }
      toast({
        title: decisao === "aceita" ? "Troca aceita" : "Troca recusada",
        description: decisao === "aceita" ? "O item foi atualizado no pedido." : "A recomendacao foi recusada.",
      });
      await carregarConversa();
    } catch (err) {
      toast({
        title: "Falha ao responder recomendacao",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRespondendoRecomendacao(null);
    }
  };

  const iniciarEdicaoMensagem = (mensagem: Mensagem) => {
    setEditandoMensagemId(mensagem.id);
    setTextoEdicao(mensagem.conteudo ?? "");
  };

  const cancelarEdicaoMensagem = () => {
    setEditandoMensagemId(null);
    setTextoEdicao("");
  };

  const salvarEdicaoMensagem = async (mensagem: Mensagem) => {
    const conteudo = textoEdicao.trim();
    if (!conteudo) return;
    setSalvandoEdicaoId(mensagem.id);
    try {
      await editarMensagemChat({
        id: mensagem.id,
        empresa: empresaConversa,
        remetente: meuNome,
        conteudo,
      });
      cancelarEdicaoMensagem();
      await carregarConversa();
      await carregarResumoRef.current();
    } catch (err) {
      toast({
        title: "Falha ao editar mensagem",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSalvandoEdicaoId(null);
    }
  };

  const apagarMensagem = async (mensagem: Mensagem) => {
    if (!window.confirm("Apagar esta mensagem?")) return;
    try {
      await apagarMensagemChat({
        id: mensagem.id,
        empresa: empresaConversa,
        remetente: meuNome,
      });
      await carregarConversa();
      await carregarResumoRef.current();
    } catch (err) {
      toast({
        title: "Falha ao apagar mensagem",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (!meuNome) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Faca login para usar o chat.</div>;
  }

  return (
    <div className="mx-auto grid h-[calc(100dvh-0.5rem)] min-h-0 w-full max-w-6xl overflow-hidden bg-background md:h-[calc(100vh-1rem)] md:grid-cols-[340px_minmax(0,1fr)] md:rounded-2xl md:border md:border-border">
      <aside className={`${ativo ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-border bg-card`}>
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Chat interno</p>
              <h1 className="truncate text-xl font-black text-foreground">Conversas</h1>
            </div>
            <button
              onClick={() => void atualizarTudo()}
              disabled={atualizando}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
            </button>
          </div>
          <button
            onClick={() => setBuscandoNovaConversa((value) => !value)}
            className="mb-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 text-sm font-black text-white"
          >
            <Users className="h-4 w-4" />
            Iniciar conversa
          </button>
          {buscandoNovaConversa ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1 rounded-full bg-background p-1 ring-1 ring-border">
                {EMPRESAS_CHAT.map((empresaItem) => (
                  <button
                    key={empresaItem}
                    onClick={() => {
                      setEmpresaBusca(empresaItem);
                      if (!usuariosPorEmpresa[empresaItem]) void carregarUsuarios(empresaItem);
                    }}
                    className={`h-8 rounded-full text-[11px] font-black ${
                      empresaBusca === empresaItem ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {empresaItem}
                  </button>
                ))}
              </div>
              <div className="flex h-10 items-center gap-2 rounded-full bg-background px-3 text-muted-foreground ring-1 ring-border focus-within:ring-primary/60">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={filtroNovaConversa}
                  onChange={(e) => setFiltroNovaConversa(e.target.value)}
                  placeholder={`Buscar em ${empresaBusca}`}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-10 items-center gap-2 rounded-full bg-background px-3 text-muted-foreground ring-1 ring-border focus-within:ring-primary/60">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar nas conversas"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {buscandoNovaConversa ? (
            carregandoUsuarios && usuariosFiltrados.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Carregando usuarios...
              </div>
            ) : usuariosFiltrados.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <Users className="h-8 w-8" />
                Nenhuma pessoa encontrada em {empresaBusca}.
              </div>
            ) : (
              usuariosFiltrados.map((u) => (
                <button
                  key={`${empresaBusca}-${u.login}`}
                  onClick={() => selecionar(u.nome, empresaBusca)}
                  className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition hover:bg-muted/60"
                >
                  <AvatarPessoa nome={u.nome} fotoUrl={u.fotoUrl} className="h-12 w-12 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{u.nome}</p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">{empresaBusca}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{u.role || u.login}</p>
                  </div>
                </button>
              ))
            )
          ) : contatos.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8" />
              Nenhuma conversa ainda. Clique em Iniciar conversa.
            </div>
          ) : (
            contatos.map((resumo) => {
              const detalhe = (usuariosPorEmpresa[resumo.empresa] ?? []).find((u) => u.nome === resumo.nome);
              const selecionado = ativo === resumo.nome && empresaConversa === resumo.empresa;
              return (
                <button
                  key={chaveConversa(resumo.empresa, resumo.nome)}
                  onClick={() => selecionar(resumo.nome, resumo.empresa)}
                  className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition ${
                    selecionado ? "bg-primary/10" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="relative h-12 w-12 shrink-0">
                    <AvatarPessoa nome={resumo.nome} fotoUrl={detalhe?.fotoUrl} className="h-12 w-12 rounded-full" />
                    {resumo?.naoLidas ? (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-black text-white ring-2 ring-card">
                        {resumo.naoLidas}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{resumo.nome}</p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">{resumo.empresa}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{horaMsg(resumo?.ultimoHorario ?? null)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{previewMensagem(resumo)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className={`${ativo ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-background`}>
        {!ativo ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Send className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Selecione uma conversa</h2>
              <p className="mt-1 text-sm">Escolha alguem na lista para enviar mensagem, foto ou item.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-3 md:px-4">
              <button
                onClick={voltarParaLista}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground md:hidden"
                title="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <AvatarPessoa nome={ativo} fotoUrl={usuarioAtivo?.fotoUrl} className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-foreground">{ativo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {empresaConversa} · {usuarioAtivo?.role || "Conversa interna"}
                </p>
              </div>
              <button
                onClick={() => void atualizarTudo()}
                disabled={atualizando}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground disabled:opacity-50"
                title="Atualizar"
              >
                <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] bg-[length:22px_22px] px-3 py-4 md:px-5">
              {mensagens.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl bg-card/90 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">
                    Sem mensagens ainda. Envie a primeira.
                  </div>
                </div>
              ) : (
                mensagens.map((m) => {
                  const meu = m.remetente === meuNome;
                  const recomendacao = m.recomendacaoId ? recomendacoes[m.recomendacaoId] : null;
                  const podeResponderRecomendacao = Boolean(
                    recomendacao &&
                    recomendacao.status === "pendente" &&
                    recomendacao.destinatario.trim().toLowerCase() === meuNome.trim().toLowerCase()
                  );
                  return (
                    <div key={m.id} className={`flex ${meu ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[68%] ${
                          meu
                            ? "rounded-br-md bg-emerald-500 text-white"
                            : "rounded-bl-md bg-card text-foreground ring-1 ring-border"
                        }`}
                      >
                        {m.tipo === "recomendacao" && (
                          <div className={`mb-1 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                            meu ? "bg-white/15 text-white" : "bg-amber-100 text-amber-800"
                          }`}>
                            Recomendacao de troca{recomendacao ? ` - ${recomendacao.status}` : ""}
                          </div>
                        )}
                        {recomendacao && (
                          <div className={`mb-2 rounded-xl p-2 ${meu ? "bg-white/15" : "bg-muted"}`}>
                            <div className="flex items-center gap-2">
                              {recomendacao.fotoSugerida ? (
                                <img src={recomendacao.fotoSugerida} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                              ) : (
                                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${meu ? "bg-white/10" : "bg-background"}`}>
                                  <ScanBarcode className="h-6 w-6 opacity-70" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black">{recomendacao.descricaoSugerida || recomendacao.codigoSugerido}</p>
                                <p className="truncate font-mono text-[11px] opacity-80">
                                  {recomendacao.codigoOriginal} {"->"} {recomendacao.codigoSugerido}
                                </p>
                              </div>
                            </div>
                            {podeResponderRecomendacao && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => void responderRecomendacao(recomendacao.id, "recusada")}
                                  disabled={respondendoRecomendacao === recomendacao.id}
                                  className={`h-9 rounded-lg text-xs font-black ${meu ? "bg-white/10 text-white" : "bg-background text-destructive ring-1 ring-border"} disabled:opacity-60`}
                                >
                                  Recusar
                                </button>
                                <button
                                  onClick={() => void responderRecomendacao(recomendacao.id, "aceita")}
                                  disabled={respondendoRecomendacao === recomendacao.id}
                                  className="h-9 rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-60"
                                >
                                  Aceitar
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {m.fotoUrl && (
                          <img src={m.fotoUrl} alt="foto" className="mb-2 max-h-64 w-full rounded-xl object-cover" loading="lazy" />
                        )}
                        {m.midiaUrl && m.tipo === "audio" && (
                          <div className={`mb-2 rounded-xl p-2 ${meu ? "bg-white/15" : "bg-muted"}`}>
                            <div className="mb-1 flex items-center gap-2 text-xs font-bold">
                              <Mic className="h-4 w-4" />
                              <span className="truncate">{m.midiaNome || "Audio"}</span>
                            </div>
                            <audio controls src={m.midiaUrl} className="w-full" preload="metadata" />
                          </div>
                        )}
                        {m.itemCodigo && (
                          <div className={`mb-2 flex items-center gap-2 rounded-xl p-2 ${meu ? "bg-white/15" : "bg-muted"}`}>
                            {m.itemFoto ? (
                              <img src={m.itemFoto} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                            ) : (
                              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${meu ? "bg-white/10" : "bg-background"}`}>
                                <ScanBarcode className="h-6 w-6 opacity-70" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold">{m.itemDescricao || m.itemCodigo}</p>
                              <p className="truncate font-mono text-[11px] opacity-80">{m.itemCodigo}</p>
                            </div>
                          </div>
                        )}
                        {editandoMensagemId === m.id ? (
                          <div className="mt-1 space-y-2">
                            <textarea
                              value={textoEdicao}
                              onChange={(event) => setTextoEdicao(event.target.value.slice(0, LIMITE_MENSAGEM))}
                              className={`min-h-20 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none ${
                                meu ? "bg-white text-slate-900" : "bg-background text-foreground ring-1 ring-border"
                              }`}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={cancelarEdicaoMensagem}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${meu ? "bg-white/15 text-white" : "bg-muted text-muted-foreground"}`}
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => void salvarEdicaoMensagem(m)}
                                disabled={salvandoEdicaoId === m.id || !textoEdicao.trim()}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-white disabled:opacity-50"
                                title="Salvar"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.conteudo && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.conteudo}</p>}
                            <div className="mt-1 flex items-center justify-end gap-1">
                              {meu && (
                                <>
                                  <button
                                    onClick={() => iniciarEdicaoMensagem(m)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full opacity-75 hover:bg-white/15 hover:opacity-100"
                                    title="Editar mensagem"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => void apagarMensagem(m)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full opacity-75 hover:bg-white/15 hover:opacity-100"
                                    title="Apagar mensagem"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                              <span className={`text-[10px] ${meu ? "text-white/75" : "text-muted-foreground"}`}>
                                {horaMsg(m.createdAt)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={fimRef} />
            </div>

            <footer className="shrink-0 border-t border-border bg-card px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:px-4">
              {mostraEmojis && (
                <div className="mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-background p-2 ring-1 ring-border">
                  {EMOJIS_CHAT.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => inserirEmoji(emoji)}
                      className="flex h-9 items-center justify-center rounded-xl text-lg hover:bg-muted"
                      title="Inserir emoji"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl bg-background p-1.5 ring-1 ring-border focus-within:ring-primary/60">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={enviando}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
                  title="Enviar foto, GIF ou audio"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowScanner(true)}
                  disabled={enviando}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
                  title="Escanear e enviar item"
                >
                  <ScanBarcode className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMostraEmojis((value) => !value)}
                  disabled={enviando}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
                  title="Emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <textarea
                  ref={textoRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_MENSAGEM))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviarTexto();
                    }
                  }}
                  placeholder="Mensagem"
                  rows={1}
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {texto.trim() ? (
                  <button
                    onClick={() => void enviarTexto()}
                    disabled={enviando}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white disabled:opacity-50"
                    title="Enviar"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                  disabled={enviando}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                    title="Enviar midia"
                >
                    <Camera className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-1 pr-2 text-right text-[10px] text-muted-foreground">{texto.length}/{LIMITE_MENSAGEM}</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void enviarMidia(f);
                  e.target.value = "";
                }}
              />
            </footer>
          </>
        )}
      </section>

      {showScanner && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-background p-6 text-center">Carregando scanner...</div>}>
          <BarcodeScanner onDetected={(code) => void enviarItem(code)} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}

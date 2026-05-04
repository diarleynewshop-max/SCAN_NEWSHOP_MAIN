import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, RefreshCw, Check, ThumbsDown, ThumbsUp, Upload, Loader2, ShoppingCart, X, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useMemo, useEffect } from "react";
import { useProdutosComprar, type ProdutoComprar } from "@/hooks/useProdutosComprar";
import { blobToDataUrl, isDataPhotoUrl } from "@/lib/photoUtils";
import { useToast } from "@/hooks/use-toast";
import { buscarProdutoVarejoFacil, type VarejoFacilProduct } from "@/lib/varejoFacilIntegration";

const PAGE_SIZE = 10;

type FotoFonte = "ERP" | "CLICKUP_TASK" | "CLICKUP_LIST";

type FotoOpcao = {
  src: string;
  fonte: FotoFonte;
};

type StatusFiltro = "todos" | "todo" | "produto_ruim" | "produto_bom" | "fazer_pedido";

const STATUS_FILTROS: Array<{ value: StatusFiltro; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "fazer_pedido", label: "Fazer Pedido" },
  { value: "produto_bom", label: "Galpao" },
  { value: "produto_ruim", label: "Ruim" },
  { value: "todo", label: "Pendente" },
];

const SECOES_FIXAS = ["Eletronico", "Papelaria", "Bijuteria"];

const STATUS_PRIORITY: Record<string, number> = {
  fazer_pedido: 0,
  produto_bom: 1,
  produto_ruim: 2,
  todo: 3,
  pedido_andamento: 4,
  compra_realizada: 5,
  concluido: 6,
};

function isValidImageSrc(foto: string | null): boolean {
  if (!foto) return false;
  if (foto.startsWith("http://") || foto.startsWith("https://")) return true;
  return isDataPhotoUrl(foto);
}

async function baixarImagemParaDataUrl(src: string): Promise<string> {
  if (isDataPhotoUrl(src)) return src;

  const response = await fetch(src);
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const detail = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    throw new Error(`Falha ao baixar imagem (${response.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (typeof data?.dataUrl === "string" && isDataPhotoUrl(data.dataUrl)) return data.dataUrl;
    throw new Error(data?.error || "Proxy retornou JSON sem dataUrl");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(`Resposta nao e imagem (${blob.type || "sem content-type"})`);
  }

  return await blobToDataUrl(blob);
}

function getCodigoConsulta(codigo: string): string {
  const inicio = codigo.match(/^\s*(\d{6,14})(?=\D|$)/);
  if (inicio) return inicio[1];

  const qualquerCodigo = codigo.match(/\d{6,14}/);
  return qualquerCodigo?.[0] ?? codigo;
}

function normalizarFiltro(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function secaoCombinaFiltro(secao: string | null | undefined, filtro: string): boolean {
  if (filtro === "todos") return true;

  const secaoNormalizada = normalizarFiltro(secao);
  const filtroNormalizado = normalizarFiltro(filtro);
  if (!secaoNormalizada || !filtroNormalizado) return false;

  return (
    secaoNormalizada === filtroNormalizado ||
    secaoNormalizada.includes(filtroNormalizado) ||
    filtroNormalizado.includes(secaoNormalizada)
  );
}

function getImagemErroKey(produtoId: string, fonte: FotoFonte, foto: string | null): string {
  return `${produtoId}:${fonte}:${foto || "sem-foto"}`;
}

function montarOpcoesFoto(
  produto: ProdutoComprar,
  produtoErp: VarejoFacilProduct | null | undefined,
  fotosClickUp: Record<string, string | null>
): FotoOpcao[] {
  return [
    produtoErp?.imagem ? { src: produtoErp.imagem, fonte: "ERP" as const } : null,
    fotosClickUp[produto.id] ? { src: fotosClickUp[produto.id] as string, fonte: "CLICKUP_TASK" as const } : null,
    produto.foto ? { src: produto.foto, fonte: "CLICKUP_LIST" as const } : null,
  ].filter((opcao): opcao is FotoOpcao => Boolean(opcao?.src && isValidImageSrc(opcao.src)));
}

function selecionarFotoProduto(
  produto: ProdutoComprar,
  produtoErp: VarejoFacilProduct | null | undefined,
  fotosClickUp: Record<string, string | null>,
  imagemComErro: Record<string, boolean>
): FotoOpcao | null {
  return montarOpcoesFoto(produto, produtoErp, fotosClickUp).find((opcao) => (
    !imagemComErro[getImagemErroKey(produto.id, opcao.fonte, opcao.src)]
  )) ?? null;
}

const Compras = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>("todos");
  const [filtroSecao, setFiltroSecao] = useState("todos");
  const [filtroSecaoAnalise, setFiltroSecaoAnalise] = useState("todos");
  const [importando, setImportando] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [imagemComErro, setImagemComErro] = useState<Record<string, boolean>>({});
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);
  const [produtosErp, setProdutosErp] = useState<Record<string, VarejoFacilProduct | null>>({});
  const [fotosClickUp, setFotosClickUp] = useState<Record<string, string | null>>({});
  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [escolhaDireita, setEscolhaDireita] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const semFotoLogRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    produtos,
    loading,
    error,
    refetch,
    like,
    dislike,
    fazerPedido,
    pedidoAndamento,
    compraRealizada,
    concluir,
    ultimaAtualizacao,
    empresa,
  } = useProdutosComprar();

  const handleImportarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportando(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/clickup-importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, empresa }),
      });

      const data = await response.json();

      if (data.sucesso) {
        alert(`Importacao concluida!\n${data.criadas} itens criados\n${data.erros} erros`);
        refetch();
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch (err) {
      alert("Erro ao importar: " + String(err));
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const executarAcao = async (
    actionKey: string,
    action: () => Promise<void>,
    sucesso: string
  ) => {
    setAcaoEmAndamento(actionKey);
    try {
      await action();
      toast({ title: sucesso });
    } catch (err) {
      toast({
        title: "Erro em Compras",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setAcaoEmAndamento(null);
    }
  };

  const produtosPorBuscaStatus = useMemo(() => {
    const termo = searchTerm.toLowerCase();
    return produtos.filter((p) => (
      (filtroStatus === "todos" || p.status === filtroStatus) &&
      (
        p.codigo.toLowerCase().includes(termo) ||
        p.descricao.toLowerCase().includes(termo) ||
        (p.sku || "").toLowerCase().includes(termo)
      )
    ));
  }, [filtroStatus, produtos, searchTerm]);

  const secoesDisponiveis = useMemo(() => {
    const secoes = new Map<string, string>();

    for (const secao of SECOES_FIXAS) {
      secoes.set(normalizarFiltro(secao), secao);
    }

    for (const produtoErp of Object.values(produtosErp)) {
      const secao = produtoErp?.secao?.trim();
      if (!secao) continue;
      secoes.set(normalizarFiltro(secao), secao);
    }

    return Array.from(secoes.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtosErp]);

  const filteredProdutos = useMemo(() => {
    return produtosPorBuscaStatus.filter((p) => (
      secaoCombinaFiltro(produtosErp[p.id]?.secao, filtroSecao)
    ));
  }, [filtroSecao, produtosErp, produtosPorBuscaStatus]);

  const produtosOrdenados = useMemo(() => {
    return [...filteredProdutos].sort((a, b) => {
      const prioridadeA = STATUS_PRIORITY[a.status] ?? 99;
      const prioridadeB = STATUS_PRIORITY[b.status] ?? 99;
      if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
      return Number(b.date_created || 0) - Number(a.date_created || 0);
    });
  }, [filteredProdutos]);

  const totalPaginas = Math.max(1, Math.ceil(produtosOrdenados.length / PAGE_SIZE));

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroSecao, filtroStatus, searchTerm, produtos.length]);

  useEffect(() => {
    if (paginaAtual > totalPaginas) {
      setPaginaAtual(totalPaginas);
    }
  }, [paginaAtual, totalPaginas]);

  const inicio = (paginaAtual - 1) * PAGE_SIZE;
  const fim = inicio + PAGE_SIZE;
  const produtosPaginados = produtosOrdenados.slice(inicio, fim);
  const produtosPendentesAnalise = useMemo(() => {
    return [...produtos.filter((produto) => produto.status === "todo")].sort((a, b) => (
      Number(b.date_created || 0) - Number(a.date_created || 0)
    ));
  }, [produtos]);
  const produtosAnalise = useMemo(
    () => produtosPendentesAnalise.filter((produto) => (
      secaoCombinaFiltro(produtosErp[produto.id]?.secao, filtroSecaoAnalise)
    )),
    [filtroSecaoAnalise, produtosErp, produtosPendentesAnalise]
  );
  const produtoAnalise = produtosAnalise[0] ?? null;
  const produtoAnaliseErp = produtoAnalise ? produtosErp[produtoAnalise.id] : null;
  const fotoAnaliseSelecionada = produtoAnalise
    ? selecionarFotoProduto(produtoAnalise, produtoAnaliseErp, fotosClickUp, imagemComErro)
    : null;
  const fotoAnalise = fotoAnaliseSelecionada?.src ?? null;
  const descricaoAnalise = produtoAnalise ? (produtoAnaliseErp?.descricao || produtoAnalise.descricao) : "";
  const podeMostrarFotoAnalise = Boolean(produtoAnalise && fotoAnaliseSelecionada);

  useEffect(() => {
    let cancelado = false;

    const carregarProdutosErp = async () => {
      const origemTela = filtroSecao === "todos" ? produtosPaginados : produtosPorBuscaStatus;
      const origemAnalise = analiseAberta
        ? [
            produtoAnalise,
            ...(filtroSecaoAnalise === "todos" ? [] : produtosPendentesAnalise),
          ].filter((produto): produto is ProdutoComprar => Boolean(produto))
        : [];
      const origem = Array.from(
        new Map([...origemTela, ...origemAnalise].map((produto) => [produto.id, produto])).values()
      );
      const limite = filtroSecao !== "todos" || (analiseAberta && filtroSecaoAnalise !== "todos") ? 25 : PAGE_SIZE;
      const pendentes = origem.filter((produto) => !(produto.id in produtosErp)).slice(0, limite);
      if (pendentes.length === 0) return;

      const resultados = await Promise.all(
        pendentes.map(async (produto) => {
          const codigo = getCodigoConsulta(produto.codigo);
          try {
            let dados = await buscarProdutoVarejoFacil(codigo, { empresa, flag: "loja" });
            if (dados?.imagem) {
              console.info("[Compras][Foto] ERP candidato", {
                produtoId: produto.id,
                codigo,
                erpId: dados.id,
                imagem: dados.imagem,
              });
              try {
                const imagemDataUrl = await baixarImagemParaDataUrl(dados.imagem);
                dados = { ...dados, imagem: imagemDataUrl };
                console.info("[Compras][Foto] ERP imagem baixada", {
                  produtoId: produto.id,
                  codigo,
                  erpId: dados.id,
                  formato: "data-url",
                });
              } catch (imageError) {
                console.warn("[Compras][Foto] ERP imagem nao baixou", {
                  produtoId: produto.id,
                  codigo,
                  erpId: dados.id,
                  imagem: dados.imagem,
                  erro: imageError instanceof Error ? imageError.message : String(imageError),
                });
              }
            } else {
              console.warn("[Compras][Foto] ERP sem imagem", {
                produtoId: produto.id,
                codigo,
                motivo: dados ? "produto encontrado sem imagem" : "produto nao encontrado",
              });
            }
            return [produto.id, dados] as const;
          } catch (err) {
            console.warn("[Compras] Produto nao enriquecido pelo ERP:", produto.codigo, err);
            console.warn("[Compras][Foto] ERP falhou", {
              produtoId: produto.id,
              codigo,
              erro: err instanceof Error ? err.message : String(err),
            });
            return [produto.id, null] as const;
          }
        })
      );

      if (cancelado) return;
      setProdutosErp((prev) => {
        const next = { ...prev };
        for (const [id, dados] of resultados) {
          next[id] = dados;
        }
        return next;
      });
    };

    void carregarProdutosErp();

    return () => {
      cancelado = true;
    };
  }, [
    analiseAberta,
    empresa,
    filtroSecao,
    filtroSecaoAnalise,
    produtoAnalise,
    produtosErp,
    produtosPaginados,
    produtosPendentesAnalise,
    produtosPorBuscaStatus,
  ]);

  useEffect(() => {
    let cancelado = false;

    const carregarFotosClickUp = async () => {
      const origem = Array.from(
        new Map([
          ...produtosPaginados,
          ...(produtoAnalise ? [produtoAnalise] : []),
        ].map((produto) => [produto.id, produto])).values()
      );
      const pendentes = origem.filter((produto) => {
        return !(produto.id in fotosClickUp);
      });

      if (pendentes.length === 0) return;

      const resultados = await Promise.all(
        pendentes.map(async (produto) => {
          try {
            const response = await fetch(
              `/api/clickup-compras-proxy?action=buscar-foto&empresa=${empresa}&taskId=${produto.id}`
            );
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              console.warn("[Compras][Foto] ClickUp falhou", {
                produtoId: produto.id,
                codigo: produto.codigo,
                status: response.status,
                erro: data.error || data.message || "erro desconhecido",
              });
              return [produto.id, null] as const;
            }
            const data = await response.json();
            const foto = typeof data.foto === "string" ? data.foto : null;
            if (foto) {
              console.info("[Compras][Foto] ClickUp candidato", {
                produtoId: produto.id,
                codigo: produto.codigo,
                sourceUrl: data.imageUrl,
                mensagem: data.message,
              });
            } else {
              console.warn("[Compras][Foto] ClickUp sem imagem", {
                produtoId: produto.id,
                codigo: produto.codigo,
                mensagem: data.message || "task sem anexo de imagem",
              });
            }
            return [produto.id, foto] as const;
          } catch (err) {
            console.warn("[Compras] Foto da task nao carregada:", produto.id, err);
            console.warn("[Compras][Foto] ClickUp falhou", {
              produtoId: produto.id,
              codigo: produto.codigo,
              erro: err instanceof Error ? err.message : String(err),
            });
            return [produto.id, null] as const;
          }
        })
      );

      if (cancelado) return;
      setFotosClickUp((prev) => {
        const next = { ...prev };
        for (const [id, foto] of resultados) {
          next[id] = foto;
        }
        return next;
      });
    };

    void carregarFotosClickUp();

    return () => {
      cancelado = true;
    };
  }, [empresa, fotosClickUp, produtoAnalise, produtosErp, produtosPaginados]);

  useEffect(() => {
    for (const produto of produtosPaginados) {
      const erpCarregado = produto.id in produtosErp;
      const clickUpCarregado = produto.id in fotosClickUp;
      if (!erpCarregado || !clickUpCarregado) continue;

      const fotoSelecionada = selecionarFotoProduto(produto, produtosErp[produto.id], fotosClickUp, imagemComErro);
      if (fotoSelecionada) continue;

      const opcoes = montarOpcoesFoto(produto, produtosErp[produto.id], fotosClickUp);
      const erros = opcoes
        .filter((opcao) => imagemComErro[getImagemErroKey(produto.id, opcao.fonte, opcao.src)])
        .map((opcao) => opcao.fonte);
      const logKey = `${produto.id}:${opcoes.map((opcao) => opcao.fonte).join(",")}:${erros.join(",")}`;
      if (semFotoLogRef.current.has(logKey)) continue;

      semFotoLogRef.current.add(logKey);
      console.warn("[Compras][Foto] Produto sem foto exibivel", {
        produtoId: produto.id,
        codigo: produto.codigo,
        fontesTestadas: opcoes.map((opcao) => opcao.fonte),
        fontesComErro: erros,
        motivo: opcoes.length === 0 ? "ERP e ClickUp nao retornaram imagem" : "todas as fontes de imagem falharam no navegador",
      });
    }
  }, [fotosClickUp, imagemComErro, produtosErp, produtosPaginados]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "todo":
        return <Badge className="bg-zinc-100 text-zinc-800">Pendente</Badge>;
      case "produto_bom":
        return <Badge className="bg-slate-100 text-slate-800">Pode ter no Galpao</Badge>;
      case "produto_ruim":
        return <Badge className="bg-rose-100 text-rose-800">Produtos Ruim</Badge>;
      case "fazer_pedido":
        return <Badge className="bg-amber-100 text-amber-800">Fazer Pedido</Badge>;
      case "pedido_andamento":
        return <Badge className="bg-orange-100 text-orange-800">Pedido em Andamento</Badge>;
      case "compra_realizada":
        return <Badge className="bg-red-100 text-red-800">Compra Realizada</Badge>;
      case "concluido":
        return <Badge className="bg-green-100 text-green-800">Concluido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filtrosAtivos = Boolean(searchTerm || filtroStatus !== "todos" || filtroSecao !== "todos");
  const carregandoFiltroSecao = filtroSecao !== "todos" && produtosPorBuscaStatus.some((produto) => !(produto.id in produtosErp));
  const carregandoFiltroSecaoAnalise = analiseAberta && filtroSecaoAnalise !== "todos" && produtosPendentesAnalise.some((produto) => !(produto.id in produtosErp));

  const executarAnalise = async (
    acao: "DISLIKE" | "LIKE" | "FAZER_PEDIDO",
    action: () => Promise<void>,
    sucesso: string
  ) => {
    if (!produtoAnalise) return;
    setEscolhaDireita(false);
    setDragX(0);
    await executarAcao(`${produtoAnalise.id}:${acao}`, action, sucesso);
  };

  const iniciarDrag = (clientX: number) => {
    if (!produtoAnalise || !!acaoEmAndamento) return;
    dragStartRef.current = clientX;
    setEscolhaDireita(false);
  };

  const moverDrag = (clientX: number) => {
    if (dragStartRef.current === null) return;
    const delta = Math.max(-150, Math.min(150, clientX - dragStartRef.current));
    setDragX(delta);
  };

  const finalizarDrag = () => {
    if (!produtoAnalise || dragStartRef.current === null) return;
    dragStartRef.current = null;

    if (dragX <= -90) {
      void executarAnalise("DISLIKE", () => dislike(produtoAnalise.id), "Produto marcado como ruim");
      return;
    }

    if (dragX >= 90) {
      setEscolhaDireita(true);
      setDragX(96);
      return;
    }

    setDragX(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Gestao de Compras</h1>
            <p className="text-gray-600 mt-1">Puxando o ClickUp de Compras ({empresa})</p>
            {ultimaAtualizacao && (
              <p className="text-xs text-gray-500 mt-1">
                Ultima atualizacao: {ultimaAtualizacao.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleImportarPlanilha}
              className="hidden"
            />
            <Button
              onClick={() => {
                setFiltroSecaoAnalise(filtroSecao);
                setAnaliseAberta(true);
              }}
              disabled={loading || produtosPendentesAnalise.length === 0}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Iniciar Analise
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importando}>
              {importando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar Planilha
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{produtos.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {produtos.filter((p) => p.status === "todo").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Galpao</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">
                {produtos.filter((p) => p.status === "produto_bom").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Ruim</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-600">
                {produtos.filter((p) => p.status === "produto_ruim").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Fazer Pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">
                {produtos.filter((p) => p.status === "fazer_pedido").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Andamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">
                {produtos.filter((p) => p.status === "pedido_andamento").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Realizada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {produtos.filter((p) => p.status === "compra_realizada").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Concluido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {produtos.filter((p) => p.status === "concluido").length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_auto] gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar por codigo, descricao ou SKU..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                value={filtroSecao}
                onChange={(e) => setFiltroSecao(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="todos">Todas as secoes</option>
                {secoesDisponiveis.map((secao) => (
                  <option key={secao} value={secao}>
                    {secao}
                  </option>
                ))}
              </select>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as StatusFiltro)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STATUS_FILTROS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setFiltroSecao("todos");
                  setFiltroStatus("todos");
                }}
                disabled={!filtrosAtivos}
              >
                <Filter className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
              <span>
                Filtro: {filteredProdutos.length} de {produtos.length} produto(s)
              </span>
              {carregandoFiltroSecao && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando secoes
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos para Compra</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            )}
            {error && (
              <div className="text-center py-12 text-red-600">
                <p>Erro: {error}</p>
              </div>
            )}
            {!loading && !error && filteredProdutos.length === 0 && carregandoFiltroSecao && (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando secoes do ERP
              </div>
            )}
            {!loading && !error && filteredProdutos.length === 0 && !carregandoFiltroSecao && (
              <div className="text-center py-12 text-gray-500">Nenhum produto encontrado</div>
            )}
            {!loading && !error && filteredProdutos.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Mostrando {inicio + 1}-{Math.min(fim, produtosOrdenados.length)} de {produtosOrdenados.length}
                  </span>
                  <span>Pagina {paginaAtual} de {totalPaginas}</span>
                </div>

                {produtosPaginados.map((produto) => {
                  const isActionLoading = (acao: string) => acaoEmAndamento === `${produto.id}:${acao}`;
                  const produtoErp = produtosErp[produto.id];
                  const descricao = produtoErp?.descricao || produto.descricao;
                  const fotoSelecionada = selecionarFotoProduto(produto, produtoErp, fotosClickUp, imagemComErro);
                  const foto = fotoSelecionada?.src ?? null;
                  const podeMostrarImagem = Boolean(fotoSelecionada);

                  return (
                    <div key={produto.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {podeMostrarImagem ? (
                          <img
                            src={foto as string}
                            alt={produto.codigo}
                            className="w-16 h-16 object-cover rounded shrink-0"
                            onError={() => {
                              if (!fotoSelecionada) return;
                              console.warn("[Compras][Foto] Fonte falhou no navegador", {
                                produtoId: produto.id,
                                codigo: produto.codigo,
                                fonte: fotoSelecionada.fonte,
                                src: fotoSelecionada.src,
                              });
                              setImagemComErro((prev) => ({
                                ...prev,
                                [getImagemErroKey(produto.id, fotoSelecionada.fonte, fotoSelecionada.src)]: true,
                              }));
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center shrink-0">
                            <span className="text-gray-400 text-xs">sem foto</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold">{produto.codigo}</div>
                          <div className="text-sm text-gray-600 break-words">{descricao}</div>
                          {produtoErp?.secao && <div className="text-xs text-indigo-600">Secao: {produtoErp.secao}</div>}
                          {produto.sku && <div className="text-xs text-gray-400">SKU: {produto.sku}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {getStatusBadge(produto.status)}

                        {produto.status === "todo" && (
                          <>
                            <Button size="sm" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:LIKE`, () => like(produto.id), "Produto marcado como bom")}>
                              {isActionLoading("LIKE") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
                              Galpao
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:DISLIKE`, () => dislike(produto.id), "Produto marcado como ruim")} className="text-red-600">
                              {isActionLoading("DISLIKE") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsDown className="h-4 w-4 mr-1" />}
                              Ruim
                            </Button>
                          </>
                        )}

                        {produto.status === "produto_bom" && (
                          <>
                            <Button size="sm" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:FAZER_PEDIDO`, () => fazerPedido(produto.id), "Produto movido para fazer pedido")}>
                              {isActionLoading("FAZER_PEDIDO") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
                              Fazer Pedido
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:DISLIKE`, () => dislike(produto.id), "Produto marcado como ruim")} className="text-red-600">
                              {isActionLoading("DISLIKE") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsDown className="h-4 w-4 mr-1" />}
                              Ruim
                            </Button>
                          </>
                        )}

                        {produto.status === "produto_ruim" && (
                          <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:LIKE`, () => like(produto.id), "Produto marcado como bom")} className="text-emerald-700">
                            {isActionLoading("LIKE") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
                            Galpao
                          </Button>
                        )}

                        {produto.status === "fazer_pedido" && (
                          <>
                            <Button size="sm" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:PEDIDO_ANDAMENTO`, () => pedidoAndamento(produto.id), "Pedido em andamento")}>
                              {isActionLoading("PEDIDO_ANDAMENTO") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                              Em Andamento
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:LIKE`, () => like(produto.id), "Produto voltou para bom")} className="text-emerald-700">
                              {isActionLoading("LIKE") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
                              Voltar Galpao
                            </Button>
                          </>
                        )}

                        {produto.status === "pedido_andamento" && (
                          <>
                            <Button size="sm" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:COMPRA_REALIZADA`, () => compraRealizada(produto.id), "Compra realizada")}>
                              {isActionLoading("COMPRA_REALIZADA") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                              Compra Realizada
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:FAZER_PEDIDO`, () => fazerPedido(produto.id), "Produto voltou para fazer pedido")}>
                              {isActionLoading("FAZER_PEDIDO") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
                              Voltar Pedido
                            </Button>
                          </>
                        )}

                        {produto.status === "compra_realizada" && (
                          <>
                            <Button size="sm" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:CONCLUIR`, () => concluir(produto.id), "Produto concluido")}>
                              {isActionLoading("CONCLUIR") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                              Concluir
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:PEDIDO_ANDAMENTO`, () => pedidoAndamento(produto.id), "Produto voltou para pedido em andamento")}>
                              {isActionLoading("PEDIDO_ANDAMENTO") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                              Voltar Andamento
                            </Button>
                          </>
                        )}

                        {produto.status === "concluido" && (
                          <Button size="sm" variant="outline" disabled={!!acaoEmAndamento} onClick={() => executarAcao(`${produto.id}:COMPRA_REALIZADA`, () => compraRealizada(produto.id), "Produto reaberto")}>
                            {isActionLoading("COMPRA_REALIZADA") ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                    disabled={paginaAtual === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaAtual === totalPaginas}
                  >
                    Proxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-gray-500 text-sm mt-8">
          <p>{"Fluxo ClickUp Compras: PENDENTE -> PRODUTOS RUIM | PODE SER QUE TEM NO GALPAO -> FAZER PEDIDO -> PEDIDO EM ANDAMENTO -> COMPRA REALIZADA -> CONCLUIDO"}</p>
        </div>
      </div>

      {analiseAberta && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[calc(100vh-2rem)] bg-white rounded-xl shadow-2xl p-4 relative overflow-y-auto">
            <button
              type="button"
              className="absolute right-3 top-3 h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
              onClick={() => {
                setAnaliseAberta(false);
                setEscolhaDireita(false);
                setDragX(0);
              }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-10 mb-4">
              <h2 className="text-xl font-bold text-gray-900">Analise de Compras</h2>
              <p className="text-sm text-gray-500">{produtosAnalise.length} de {produtosPendentesAnalise.length} item(ns) pendente(s)</p>
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Secao</label>
              <select
                value={filtroSecaoAnalise}
                onChange={(e) => {
                  setFiltroSecaoAnalise(e.target.value);
                  setEscolhaDireita(false);
                  setDragX(0);
                }}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="todos">Todas as secoes</option>
                {secoesDisponiveis.map((secao) => (
                  <option key={secao} value={secao}>
                    {secao}
                  </option>
                ))}
              </select>
              {carregandoFiltroSecaoAnalise && (
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando secoes dos pendentes
                </div>
              )}
            </div>

            {!produtoAnalise && carregandoFiltroSecaoAnalise ? (
              <div className="py-16 flex items-center justify-center gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando itens
              </div>
            ) : !produtoAnalise ? (
              <div className="py-16 text-center text-gray-500">Nenhum item pendente</div>
            ) : (
              <>
                <div className="relative h-[560px] sm:h-[620px]">
                  <div className="absolute inset-y-10 left-0 w-1/2 rounded-xl bg-red-50 flex items-center justify-start pl-5 text-red-600 font-bold opacity-80">
                    Produto Ruim
                  </div>
                  <div className="absolute inset-y-10 right-0 w-1/2 rounded-xl bg-emerald-50 flex items-center justify-end pr-5 text-emerald-700 font-bold opacity-80">
                    Galpao / Pedido
                  </div>

                  <div
                    className="absolute inset-x-0 top-0 mx-auto w-full rounded-xl bg-white border border-gray-200 shadow-xl overflow-hidden select-none"
                    style={{
                      transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
                      transition: dragStartRef.current === null ? "transform 0.18s ease" : "none",
                    }}
                    onMouseDown={(event) => iniciarDrag(event.clientX)}
                    onMouseMove={(event) => moverDrag(event.clientX)}
                    onMouseUp={finalizarDrag}
                    onMouseLeave={finalizarDrag}
                    onTouchStart={(event) => iniciarDrag(event.touches[0]?.clientX ?? 0)}
                    onTouchMove={(event) => moverDrag(event.touches[0]?.clientX ?? 0)}
                    onTouchEnd={finalizarDrag}
                  >
                    {podeMostrarFotoAnalise ? (
                      <img
                        src={fotoAnalise as string}
                        alt={produtoAnalise.codigo}
                        className="h-[390px] sm:h-[460px] w-full object-contain bg-gray-100"
                        onError={() => {
                          if (!fotoAnaliseSelecionada) return;
                          console.warn("[Compras][Foto] Fonte falhou no navegador", {
                            produtoId: produtoAnalise.id,
                            codigo: produtoAnalise.codigo,
                            fonte: fotoAnaliseSelecionada.fonte,
                            src: fotoAnaliseSelecionada.src,
                          });
                          setImagemComErro((prev) => ({
                            ...prev,
                            [getImagemErroKey(produtoAnalise.id, fotoAnaliseSelecionada.fonte, fotoAnaliseSelecionada.src)]: true,
                          }));
                        }}
                      />
                    ) : (
                      <div className="h-[390px] sm:h-[460px] w-full bg-gray-100 flex items-center justify-center text-gray-400">
                        sem foto
                      </div>
                    )}

                    <div className="p-4">
                      <div className="text-lg font-bold text-gray-900">{produtoAnalise.codigo}</div>
                      <div className="text-sm text-gray-700 mt-1">{descricaoAnalise}</div>
                      {produtoAnaliseErp?.secao && (
                        <div className="text-xs text-indigo-600 mt-2">Secao: {produtoAnaliseErp.secao}</div>
                      )}
                      <div className="mt-3">{getStatusBadge(produtoAnalise.status)}</div>
                    </div>
                  </div>
                </div>

                {escolhaDireita ? (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button
                      variant="outline"
                      disabled={!!acaoEmAndamento}
                      onClick={() => executarAnalise("LIKE", () => like(produtoAnalise.id), "Produto enviado para Galpao")}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Galpao
                    </Button>
                    <Button
                      disabled={!!acaoEmAndamento}
                      onClick={() => executarAnalise("FAZER_PEDIDO", () => fazerPedido(produtoAnalise.id), "Produto enviado para Fazer Pedido")}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Fazer Pedido
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200"
                      disabled={!!acaoEmAndamento}
                      onClick={() => executarAnalise("DISLIKE", () => dislike(produtoAnalise.id), "Produto marcado como ruim")}
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Ruim
                    </Button>
                    <Button
                      disabled={!!acaoEmAndamento}
                      onClick={() => {
                        setEscolhaDireita(true);
                        setDragX(96);
                      }}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Direita
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Compras;

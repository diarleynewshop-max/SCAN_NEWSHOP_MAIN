import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, RefreshCw, Check, ThumbsDown, ThumbsUp, Upload, Loader2, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useMemo, useEffect } from "react";
import { useProdutosComprar } from "@/hooks/useProdutosComprar";
import { isDataPhotoUrl } from "@/lib/photoUtils";

const PAGE_SIZE = 10;

const STATUS_PRIORITY: Record<string, number> = {
  todo: 0,
  produto_bom: 1,
  produto_ruim: 2,
  fazer_pedido: 3,
  concluido: 4,
};

function isValidImageSrc(foto: string | null): boolean {
  if (!foto) return false;
  if (foto.startsWith("http://") || foto.startsWith("https://")) return true;
  return isDataPhotoUrl(foto);
}

const Compras = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [importando, setImportando] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [imagemComErro, setImagemComErro] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    produtos,
    loading,
    error,
    refetch,
    like,
    dislike,
    fazerPedido,
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

  const filteredProdutos = useMemo(() => {
    const termo = searchTerm.toLowerCase();
    return produtos.filter((p) => (
      p.codigo.toLowerCase().includes(termo) ||
      p.descricao.toLowerCase().includes(termo) ||
      (p.sku || "").toLowerCase().includes(termo)
    ));
  }, [produtos, searchTerm]);

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
  }, [searchTerm, produtos.length]);

  useEffect(() => {
    if (paginaAtual > totalPaginas) {
      setPaginaAtual(totalPaginas);
    }
  }, [paginaAtual, totalPaginas]);

  const inicio = (paginaAtual - 1) * PAGE_SIZE;
  const fim = inicio + PAGE_SIZE;
  const produtosPaginados = produtosOrdenados.slice(inicio, fim);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "todo":
        return <Badge className="bg-blue-100 text-blue-800">TO DO</Badge>;
      case "produto_bom":
        return <Badge className="bg-emerald-100 text-emerald-800">Produto Bom</Badge>;
      case "produto_ruim":
        return <Badge className="bg-rose-100 text-rose-800">Produto Ruim</Badge>;
      case "fazer_pedido":
        return <Badge className="bg-amber-100 text-amber-800">Fazer Pedido</Badge>;
      case "concluido":
        return <Badge className="bg-green-100 text-green-800">Concluido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
              <CardTitle className="text-lg">TO DO</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {produtos.filter((p) => p.status === "todo").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Produto Bom</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">
                {produtos.filter((p) => p.status === "produto_bom").length}
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
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por codigo, descricao ou SKU..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
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
            {!loading && !error && filteredProdutos.length === 0 && (
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
                  const podeMostrarImagem = Boolean(
                    produto.foto &&
                    isValidImageSrc(produto.foto) &&
                    !imagemComErro[produto.id]
                  );

                  return (
                    <div key={produto.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {podeMostrarImagem ? (
                          <img
                            src={produto.foto as string}
                            alt={produto.codigo}
                            className="w-16 h-16 object-cover rounded shrink-0"
                            onError={() => setImagemComErro((prev) => ({ ...prev, [produto.id]: true }))}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center shrink-0">
                            <span className="text-gray-400 text-xs">sem foto</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold">{produto.codigo}</div>
                          <div className="text-sm text-gray-600 break-words">{produto.descricao}</div>
                          {produto.sku && <div className="text-xs text-gray-400">SKU: {produto.sku}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {getStatusBadge(produto.status)}

                        {produto.status === "todo" && (
                          <>
                            <Button size="sm" onClick={() => like(produto.id)}>
                              <ThumbsUp className="h-4 w-4 mr-1" />
                              Like
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => dislike(produto.id)} className="text-red-600">
                              <ThumbsDown className="h-4 w-4 mr-1" />
                              Deslike
                            </Button>
                          </>
                        )}

                        {produto.status === "produto_bom" && (
                          <>
                            <Button size="sm" onClick={() => fazerPedido(produto.id)}>
                              <ShoppingCart className="h-4 w-4 mr-1" />
                              Fazer Pedido
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => dislike(produto.id)} className="text-red-600">
                              <ThumbsDown className="h-4 w-4 mr-1" />
                              Deslike
                            </Button>
                          </>
                        )}

                        {produto.status === "produto_ruim" && (
                          <Button size="sm" variant="outline" onClick={() => like(produto.id)} className="text-emerald-700">
                            <ThumbsUp className="h-4 w-4 mr-1" />
                            Like
                          </Button>
                        )}

                        {produto.status === "fazer_pedido" && (
                          <>
                            <Button size="sm" onClick={() => concluir(produto.id)}>
                              <Check className="h-4 w-4 mr-1" />
                              Concluir
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => like(produto.id)} className="text-emerald-700">
                              <ThumbsUp className="h-4 w-4 mr-1" />
                              Voltar Bom
                            </Button>
                          </>
                        )}

                        {produto.status === "concluido" && (
                          <Button size="sm" variant="outline" onClick={() => fazerPedido(produto.id)}>
                            <RefreshCw className="h-4 w-4 mr-1" />
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
          <p>{"Fluxo ClickUp Compras: TO DO -> PRODUTO RUIM | PRODUTO BOM -> FAZER PEDIDO -> CONCLUIDO"}</p>
        </div>
      </div>
    </div>
  );
};

export default Compras;

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, RefreshCw, Check, X, Eye, Upload, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useProdutosComprar } from "@/hooks/useProdutosComprar";

const Compras = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { produtos, loading, error, refetch, analisar, aprovar, rejeitar, ultimaAtualizacao, empresa } = useProdutosComprar();

  const handleImportarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportando(true);
    
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/clickup-importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      alert('Erro ao importar: ' + String(err));
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredProdutos = produtos.filter((p) =>
    p.codigo.includes(searchTerm) ||
    p.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "novo":
        return <Badge className="bg-blue-100 text-blue-800">Novo</Badge>;
      case "analisado":
        return <Badge className="bg-yellow-100 text-yellow-800">Analisado</Badge>;
      case "comprado":
        return <Badge className="bg-green-100 text-green-800">Comprado</Badge>;
      case "reprovado":
        return <Badge className="bg-red-100 text-red-800">Reprovado</Badge>;
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
            <p className="text-gray-600 mt-1">
              Produtos aguardando analise no ClickUp ({empresa})
            </p>
            {ultimaAtualizacao && (
              <p className="text-xs text-gray-500 mt-1">
                Ultima atualizacao: {ultimaAtualizacao.toLocaleString('pt-BR')}
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
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={importando}
            >
              {importando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar Planilha
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
              <CardTitle className="text-lg">Novos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {produtos.filter((p) => p.status === 'novo').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Analisando</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {produtos.filter((p) => p.status === 'analisado').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Comprados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {produtos.filter((p) => p.status === 'comprado').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por codigo..."
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
              <div className="text-center py-12 text-gray-500">
                Nenhum produto encontrado
              </div>
            )}
            {!loading && !error && filteredProdutos.length > 0 && (
              <div className="space-y-3">
                {filteredProdutos.map((produto) => (
                  <div key={produto.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      {produto.foto ? (
                        <img src={produto.foto} alt={produto.codigo} className="w-16 h-16 object-cover rounded" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                          <span className="text-gray-400 text-xs">sem foto</span>
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{produto.codigo}</div>
                        <div className="text-sm text-gray-600">{produto.descricao}</div>
                        {produto.sku && <div className="text-xs text-gray-400">SKU: {produto.sku}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(produto.status)}
                      {produto.status === 'novo' && (
                        <>
                          <Button size="sm" onClick={() => analisar(produto.id)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Analisar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejeitar(produto.id)} className="text-red-600">
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {produto.status === 'analisado' && (
                        <>
                          <Button size="sm" onClick={() => aprovar(produto.id)}>
                            <Check className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejeitar(produto.id)} className="text-red-600">
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Interface de Compras - ClickUp</p>
        </div>
      </div>
    </div>
  );
};

export default Compras;


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Plus, Filter, Download, Eye, Edit, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useConferenciaItens } from "@/hooks/useConferenciaItens";

const Compras = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { produtos, loading, error, refetch } = useConferenciaItens();

  console.log("🔥 Compras render:", { produtos: produtos.length, loading, error, primeiraAmostragem: produtos.slice(0, 3) });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Estoque OK</Badge>;
      case "baixo":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Estoque Baixo</Badge>;
      case "critico":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Estoque Crítico</Badge>;
      default:
        return <Badge>Desconhecido</Badge>;
    }
  };

  const filteredProdutos = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    produto.fornecedor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Gestão de Compras</h1>
            <p className="text-gray-600 mt-1">
              Controle de estoque e pedidos de compra para o setor de compras
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Novo Pedido
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total de Itens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{produtos.length}</div>
              <div className="text-sm text-gray-600 mt-1">Itens únicos</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Estoque Crítico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {produtos.filter(p => p.status === 'critico').length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Precisam reposição</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Estoque Baixo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {produtos.filter(p => p.status === 'baixo').length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Atenção</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Estoque OK</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {produtos.filter(p => p.status === 'ok').length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Itens OK</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar produto ou fornecedor..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Controle de Estoque</CardTitle>
            <CardDescription>
              Monitoramento de produtos com alertas de reposição
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-3 text-gray-600">Carregando itens...</span>
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center py-12 text-red-600">
                <p className="font-medium">Erro ao carregar dados</p>
                <p className="text-sm">{error}</p>
              </div>
            )}
            {!loading && !error && produtos.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                Nenhum item encontrado na tabela conferencia_itens
              </div>
            )}
            {!loading && !error && produtos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Produto</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Fornecedor</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Estoque</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Mínimo</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Última Compra</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProdutos.map((produto) => (
                      <tr key={produto.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{produto.nome}</div>
                        </td>
                        <td className="py-3 px-4">{produto.fornecedor}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold">{produto.estoque}</div>
                        </td>
                        <td className="py-3 px-4">{produto.minimo}</td>
                        <td className="py-3 px-4">{getStatusBadge(produto.status)}</td>
                        <td className="py-3 px-4">{produto.ultimaCompra}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                Gerar Relatório de Estoque
              </Button>
              <Button variant="outline" className="w-full justify-start">
                Enviar Pedidos Pendentes
              </Button>
              <Button variant="outline" className="w-full justify-start">
                Contatar Fornecedores
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Próximas Reposições</CardTitle>
              <CardDescription>Produtos que precisam de atenção</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {produtos
                  .filter(p => p.status === "critico" || p.status === "baixo")
                  .map((produto) => (
                    <div key={produto.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium">{produto.nome}</div>
                        <div className="text-sm text-gray-600">{produto.fornecedor}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{produto.estoque} / {produto.minimo}</div>
                        <div className="text-sm">
                          {produto.status === "critico" ? "URGENTE" : "Atenção"}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Note */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Interface de Compras - Acesso restrito ao setor de compras, admin e super admin</p>
          <p className="mt-1">Sistema otimizado para mobile e desktop • Versão 1.0</p>
        </div>
      </div>
    </div>
  );
};

export default Compras;
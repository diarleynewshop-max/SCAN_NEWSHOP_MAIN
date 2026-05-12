import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BarChart3, RefreshCw, Check, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  type EmpresaKey, type FlagKey, type RelatorioDiario,
  type RelatorioDataOption, type RelatorioSalvo,
  listarDatasRelatorio, listarRelatoriosSalvos,
  salvarRelatorioDashboard, buscarRelatorioSalvo,
} from "@/lib/clickupApi";
import { useAuth } from "@/hooks/useAuth";

const EMPRESAS: EmpresaKey[] = ["NEWSHOP", "SOYE", "FACIL"];

const STATUS_COLORS = {
  separado: "#22c55e",
  naoTem: "#ef4444",
  parcial: "#eab308",
  pendente: "#9ca3af",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { loginSalvo } = useAuth();
  const { toast } = useToast();

  const [empresa, setEmpresa] = useState<EmpresaKey>(
    () => (loginSalvo?.empresa as EmpresaKey) ?? "NEWSHOP"
  );
  const [flag, setFlag] = useState<FlagKey>("loja");

  const [datasDisponiveis, setDatasDisponiveis] = useState<RelatorioDataOption[]>([]);
  const [relatoriosSalvos, setRelatoriosSalvos] = useState<RelatorioSalvo[]>([]);
  const [relatorioAtivo, setRelatorioAtivo] = useState<RelatorioDiario | null>(null);
  const [dataAtiva, setDataAtiva] = useState<string | null>(null);

  const [carregandoDatas, setCarregandoDatas] = useState(false);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregandoDatas(true);
    setRelatorioAtivo(null);
    setDataAtiva(null);
    try {
      const [datas, salvos] = await Promise.all([
        listarDatasRelatorio(empresa, flag),
        listarRelatoriosSalvos(empresa, flag),
      ]);
      setDatasDisponiveis(datas);
      setRelatoriosSalvos(salvos);
    } catch (err: any) {
      toast({ title: "Erro ao carregar datas", description: err.message, variant: "destructive" });
    } finally {
      setCarregandoDatas(false);
    }
  }, [empresa, flag]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const getSalvo = (dateKey: string) => relatoriosSalvos.find((r) => r.data === dateKey);

  const handleGerarSalvar = async (dateKey: string) => {
    setGerando(dateKey);
    try {
      const report = await salvarRelatorioDashboard(empresa, flag, dateKey);
      setRelatorioAtivo(report);
      setDataAtiva(dateKey);
      const salvos = await listarRelatoriosSalvos(empresa, flag);
      setRelatoriosSalvos(salvos);
      toast({ title: "Relatório gerado", description: `${dateKey} salvo no ClickUp` });
    } catch (err: any) {
      toast({ title: "Erro ao gerar relatório", description: err.message, variant: "destructive" });
    } finally {
      setGerando(null);
    }
  };

  const handleAbrirSalvo = async (dateKey: string) => {
    if (dataAtiva === dateKey) return;
    setCarregandoRelatorio(true);
    setDataAtiva(dateKey);
    setRelatorioAtivo(null);
    try {
      const report = await buscarRelatorioSalvo(empresa, flag, dateKey);
      if (!report) throw new Error("Relatório não encontrado no ClickUp");
      setRelatorioAtivo(report);
    } catch (err: any) {
      toast({ title: "Erro ao abrir relatório", description: err.message, variant: "destructive" });
      setDataAtiva(null);
    } finally {
      setCarregandoRelatorio(false);
    }
  };

  const pieData = relatorioAtivo
    ? [
        { name: "Separado", value: relatorioAtivo.resumo.separado, color: STATUS_COLORS.separado },
        { name: "Não tem", value: relatorioAtivo.resumo.naoTem, color: STATUS_COLORS.naoTem },
        { name: "Parcial", value: relatorioAtivo.resumo.parcial, color: STATUS_COLORS.parcial },
        { name: "Pendente", value: relatorioAtivo.resumo.pendente, color: STATUS_COLORS.pendente },
      ].filter((d) => d.value > 0)
    : [];

  const conferenteData = (relatorioAtivo?.porConferente ?? []).slice(0, 8).map((c) => ({
    nome: c.nome.split(" ")[0],
    Separado: c.separado,
    "Não tem": c.naoTem,
    Parcial: c.parcial,
  }));

  const secaoData = (relatorioAtivo?.porSecao ?? []).slice(0, 10).map((s) => ({
    nome: s.nome.length > 14 ? `${s.nome.slice(0, 14)}…` : s.nome,
    "Não tem": s.naoTem,
    Parcial: s.parcial,
  }));

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Relatórios de conferência por dia</p>
          </div>
        </div>

        {/* Seletor empresa/flag */}
        <div className="flex gap-2 mb-5 flex-wrap items-center">
          {EMPRESAS.map((e) => (
            <Button key={e} variant={empresa === e ? "default" : "outline"} size="sm" onClick={() => setEmpresa(e)}>
              {e}
            </Button>
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          {(["loja", "cd"] as FlagKey[]).map((f) => (
            <Button key={f} variant={flag === f ? "default" : "outline"} size="sm" onClick={() => setFlag(f)}>
              {f.toUpperCase()}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={carregarDados} disabled={carregandoDatas} className="ml-auto">
            <RefreshCw className={`h-3 w-3 mr-1 ${carregandoDatas ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Lista de datas */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Datas com conferências</CardTitle>
                <CardDescription className="text-xs">Status Complete no ClickUp</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {carregandoDatas && (
                  <p className="p-4 text-sm text-muted-foreground text-center">Carregando...</p>
                )}
                {!carregandoDatas && datasDisponiveis.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma data encontrada</p>
                )}
                <div className="divide-y">
                  {datasDisponiveis.map((d) => {
                    const salvo = getSalvo(d.data);
                    const isAtivo = dataAtiva === d.data;
                    return (
                      <div
                        key={d.data}
                        className={`flex items-center justify-between px-3 py-2.5 transition-colors ${salvo ? "cursor-pointer hover:bg-muted/50" : ""} ${isAtivo ? "bg-muted" : ""}`}
                        onClick={() => salvo && handleAbrirSalvo(d.data)}
                      >
                        <div>
                          <p className="font-medium text-sm">{d.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.total} conferência{d.total !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {salvo ? (
                          <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                            <Check className="h-3 w-3" />
                            Salvo
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 shrink-0"
                            disabled={gerando === d.data}
                            onClick={(e) => { e.stopPropagation(); handleGerarSalvar(d.data); }}
                          >
                            {gerando === d.data ? (
                              <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Gerando</>
                            ) : "Gerar"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Área de gráficos */}
          <div className="lg:col-span-2 space-y-4">
            {!relatorioAtivo && !carregandoRelatorio && (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-25" />
                  <p className="text-sm">Selecione uma data salva para ver os gráficos</p>
                  <p className="text-xs mt-1 opacity-70">Datas sem relatório precisam ser geradas primeiro</p>
                </CardContent>
              </Card>
            )}

            {carregandoRelatorio && (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-40" />
                  <p className="text-sm">Carregando relatório do ClickUp...</p>
                </CardContent>
              </Card>
            )}

            {relatorioAtivo && !carregandoRelatorio && (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "Total", value: relatorioAtivo.resumo.totalItens },
                    { label: "Separado", value: relatorioAtivo.resumo.separado },
                    { label: "Não tem", value: relatorioAtivo.resumo.naoTem },
                    { label: "Parcial", value: relatorioAtivo.resumo.parcial },
                    { label: "Pendente", value: relatorioAtivo.resumo.pendente },
                  ].map((item) => (
                    <Card key={item.label}>
                      <CardContent className="p-3 text-center">
                        <p className="text-xl font-bold">{item.value}</p>
                        <p className="text-xs text-muted-foreground leading-tight">{item.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Distribuição de status */}
                {pieData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm">Distribuição de status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              outerRadius={75}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name}: ${(percent * 100).toFixed(0)}%`
                              }
                              labelLine={false}
                            >
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Por conferente */}
                {conferenteData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm">Por conferente</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={conferenteData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend iconSize={10} />
                            <Bar dataKey="Separado" fill={STATUS_COLORS.separado} stackId="a" />
                            <Bar dataKey="Parcial" fill={STATUS_COLORS.parcial} stackId="a" />
                            <Bar dataKey="Não tem" fill={STATUS_COLORS.naoTem} stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Seções com mais faltas */}
                {secaoData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm">Seções com mais faltas (top 10)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={secaoData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={100} />
                            <Tooltip />
                            <Legend iconSize={10} />
                            <Bar dataKey="Não tem" fill={STATUS_COLORS.naoTem} stackId="a" />
                            <Bar dataKey="Parcial" fill={STATUS_COLORS.parcial} stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Itens críticos */}
                {relatorioAtivo.itensCriticos.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        Itens críticos ({relatorioAtivo.itensCriticos.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-52 overflow-y-auto divide-y text-sm">
                        {relatorioAtivo.itensCriticos.slice(0, 60).map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 gap-2">
                            <div className="min-w-0">
                              <span className="font-mono text-xs">{item.codigo}</span>
                              {item.secao && (
                                <span className="text-muted-foreground ml-2 text-xs truncate">{item.secao}</span>
                              )}
                            </div>
                            <Badge
                              variant={item.status === "nao_tem" ? "destructive" : "secondary"}
                              className="text-xs shrink-0"
                            >
                              {item.status === "nao_tem" ? "Não tem" : "Parcial"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

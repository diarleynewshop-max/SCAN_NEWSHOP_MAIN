import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  type EmpresaKey, type FlagKey, type RelatorioDiario, type RelatorioSalvo,
  listarRelatoriosSalvos, buscarRelatorioSalvo,
} from "@/lib/clickupApi";

type ModoPeriodo = "dia" | "semana" | "periodo" | "mes";

function normalizarNomePessoa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function capitalizarNome(nome: string): string {
  return nome.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getHojeKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getInicioSemana(): string {
  const d = new Date();
  const dia = d.getDay();
  d.setDate(d.getDate() - dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface PessoaAgregada {
  nomeDisplay: string;
  chave: string;
  conferencias: number;
  totalItens: number;
  separado: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  tempoTotalMin: number;
  tempoConfs: number;
  diasAtivos: Set<string>;
  porDia: Map<string, number>;
}

const RelatorioPessoas = () => {
  const navigate = useNavigate();
  const { loginSalvo } = useAuth();
  const { toast } = useToast();

  const role = loginSalvo?.role;
  const isAdmin = role === "admin" || role === "super";

  const [empresa, setEmpresa] = useState<EmpresaKey>(
    () => (loginSalvo?.empresa as EmpresaKey) ?? "NEWSHOP"
  );
  const [flag, setFlag] = useState<FlagKey>(
    () => (loginSalvo?.flag as FlagKey) ?? "loja"
  );
  const [modo, setModo] = useState<ModoPeriodo>("semana");
  const [mesSelecionado, setMesSelecionado] = useState(() => new Date().toISOString().slice(0, 7));
  const [periodoInicio, setPeriodoInicio] = useState<string | null>(null);
  const [periodoFim, setPeriodoFim] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const [salvos, setSalvos] = useState<RelatorioSalvo[]>([]);
  const [carregandoSalvos, setCarregandoSalvos] = useState(false);
  const [relatorios, setRelatorios] = useState<RelatorioDiario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    setCarregandoSalvos(true);
    listarRelatoriosSalvos(empresa, flag)
      .then(setSalvos)
      .catch(() => toast({ title: "Erro ao carregar datas", variant: "destructive" }))
      .finally(() => setCarregandoSalvos(false));
  }, [empresa, flag, isAdmin]);

  const datasParaCarregar = useMemo<string[]>(() => {
    const hoje = getHojeKey();
    const datas = salvos.map((s) => s.data).filter((d) => d < hoje);
    if (modo === "dia") return diaSelecionado ? datas.filter((d) => d === diaSelecionado) : [];
    if (modo === "semana") {
      const inicio = getInicioSemana();
      return datas.filter((d) => d >= inicio && d <= hoje);
    }
    if (modo === "periodo") {
      if (!periodoInicio || !periodoFim) return [];
      const ini = periodoInicio <= periodoFim ? periodoInicio : periodoFim;
      const fim = periodoInicio <= periodoFim ? periodoFim : periodoInicio;
      return datas.filter((d) => d >= ini && d <= fim);
    }
    return datas.filter((d) => d.startsWith(mesSelecionado));
  }, [modo, salvos, diaSelecionado, periodoInicio, periodoFim, mesSelecionado]);

  const carregarRelatorios = useCallback(async () => {
    if (datasParaCarregar.length === 0) {
      toast({ title: "Nenhuma data disponivel no periodo", variant: "destructive" });
      return;
    }
    setCarregando(true);
    setRelatorios([]);
    setProgresso({ atual: 0, total: datasParaCarregar.length });
    const reports: RelatorioDiario[] = [];
    for (let i = 0; i < datasParaCarregar.length; i += 4) {
      const lote = datasParaCarregar.slice(i, i + 4);
      const results = await Promise.allSettled(
        lote.map((d) => buscarRelatorioSalvo(empresa, flag, d))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) reports.push(r.value);
      }
      setProgresso({ atual: Math.min(i + 4, datasParaCarregar.length), total: datasParaCarregar.length });
    }
    setRelatorios(reports);
    setCarregando(false);
  }, [datasParaCarregar, empresa, flag]);

  const pessoas = useMemo(() => {
    if (relatorios.length === 0) return [];
    const map = new Map<string, PessoaAgregada>();

    for (const rel of relatorios) {
      for (const c of rel.porConferente ?? []) {
        const chave = normalizarNomePessoa(c.nome);
        if (!chave) continue;
        const ex = map.get(chave) ?? {
          nomeDisplay: capitalizarNome(chave),
          chave,
          conferencias: 0, totalItens: 0, separado: 0, naoTem: 0, parcial: 0, pendente: 0,
          tempoTotalMin: 0, tempoConfs: 0,
          diasAtivos: new Set<string>(),
          porDia: new Map<string, number>(),
        };
        ex.conferencias += c.conferencias;
        ex.totalItens += c.totalItens;
        ex.separado += c.separado;
        ex.naoTem += c.naoTem;
        ex.parcial += c.parcial;
        ex.pendente += c.pendente;
        ex.tempoTotalMin += c.tempoTotalMinutos ?? 0;
        ex.tempoConfs += c.tempoConfs ?? 0;
        ex.diasAtivos.add(rel.data);
        ex.porDia.set(rel.data, (ex.porDia.get(rel.data) ?? 0) + c.totalItens);
        map.set(chave, ex);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.totalItens - a.totalItens);
  }, [relatorios]);

  const diaPicoPessoa = (p: PessoaAgregada): string => {
    let max = 0;
    let dia = "";
    for (const [d, v] of p.porDia) {
      if (v > max) { max = v; dia = d; }
    }
    return dia ? `${dia.slice(8)}/${dia.slice(5, 7)}` : "—";
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Voltar</Button>
      </div>
    );
  }

  const totalGeral = pessoas.reduce((s, p) => s + p.totalItens, 0);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5" />Relatorio por Pessoa
          </h1>
          <p className="text-xs text-muted-foreground">Desempenho individual dos conferentes</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Empresa + Flag */}
          <div className="flex gap-2 flex-wrap">
            {(["NEWSHOP", "SOYE", "FACIL"] as EmpresaKey[]).map((e) => (
              <Button key={e} size="sm" variant={empresa === e ? "default" : "outline"}
                onClick={() => setEmpresa(e)} className="text-xs h-7">
                {e === "SOYE" || e === "FACIL" ? `SF - ${e}` : e}
              </Button>
            ))}
            <div className="w-px bg-border mx-1" />
            {(["loja", "cd"] as FlagKey[]).map((f) => (
              <Button key={f} size="sm" variant={flag === f ? "default" : "outline"}
                onClick={() => setFlag(f)} className="text-xs h-7">{f.toUpperCase()}</Button>
            ))}
          </div>

          {/* Periodo */}
          <div className="flex gap-1">
            {(["dia", "semana", "periodo", "mes"] as ModoPeriodo[]).map((m) => (
              <Button key={m} size="sm" variant={modo === m ? "default" : "outline"}
                className="flex-1 text-xs h-7"
                onClick={() => { setModo(m); setRelatorios([]); }}>
                {m === "dia" ? "Dia" : m === "semana" ? "Semana" : m === "periodo" ? "Periodo" : "Mes"}
              </Button>
            ))}
          </div>

          {modo === "dia" && (
            <select className="w-full text-sm border rounded p-1.5 bg-background"
              value={diaSelecionado ?? ""} onChange={(e) => setDiaSelecionado(e.target.value || null)}>
              <option value="">— selecione —</option>
              {salvos.map((s) => <option key={s.data} value={s.data}>{s.label}</option>)}
            </select>
          )}

          {modo === "periodo" && (
            <div className="grid grid-cols-2 gap-2">
              <select className="text-sm border rounded p-1.5 bg-background"
                value={periodoInicio ?? ""} onChange={(e) => setPeriodoInicio(e.target.value || null)}>
                <option value="">De</option>
                {salvos.map((s) => <option key={s.data} value={s.data}>{s.label}</option>)}
              </select>
              <select className="text-sm border rounded p-1.5 bg-background"
                value={periodoFim ?? ""} onChange={(e) => setPeriodoFim(e.target.value || null)}>
                <option value="">Ate</option>
                {salvos.map((s) => <option key={s.data} value={s.data}>{s.label}</option>)}
              </select>
            </div>
          )}

          {modo === "mes" && (
            <input type="month" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}
              className="w-full text-sm border rounded p-1.5 bg-background" />
          )}

          <Button size="sm" className="w-full" onClick={carregarRelatorios}
            disabled={carregando || datasParaCarregar.length === 0}>
            {carregando
              ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />{progresso.atual}/{progresso.total}</>
              : `Carregar (${datasParaCarregar.length} dia(s))`}
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      {pessoas.length > 0 && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{pessoas.length}</p>
              <p className="text-xs text-muted-foreground">Conferentes</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{relatorios.length}</p>
              <p className="text-xs text-muted-foreground">Dias</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{totalGeral.toLocaleString("pt-BR")}</p>
              <p className="text-xs text-muted-foreground">Total Itens</p>
            </CardContent></Card>
          </div>

          {/* Tabela */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Desempenho por Pessoa</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 pl-4 font-medium">Pessoa</th>
                      <th className="text-center p-2 font-medium">Conf.</th>
                      <th className="text-center p-2 font-medium">Itens</th>
                      <th className="text-center p-2 font-medium text-green-600">Sep.</th>
                      <th className="text-center p-2 font-medium text-red-500">N/Tem</th>
                      <th className="text-center p-2 font-medium text-yellow-600">Parc.</th>
                      <th className="text-center p-2 font-medium text-gray-500">Pend.</th>
                      <th className="text-center p-2 font-medium">Tempo Med.</th>
                      <th className="text-center p-2 font-medium">Pico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map((p, i) => {
                      const mediaMin = p.tempoConfs > 0 ? Math.round(p.tempoTotalMin / p.tempoConfs) : null;
                      const pct = totalGeral > 0 ? ((p.totalItens / totalGeral) * 100).toFixed(0) : "0";
                      return (
                        <tr key={p.chave} className={`border-b ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="p-2 pl-4">
                            <p className="font-semibold text-sm">{p.nomeDisplay}</p>
                            <p className="text-xs text-muted-foreground">{p.diasAtivos.size} dia(s) · {pct}%</p>
                          </td>
                          <td className="text-center p-2 font-mono">{p.conferencias}</td>
                          <td className="text-center p-2 font-mono font-bold">{p.totalItens}</td>
                          <td className="text-center p-2 font-mono text-green-600">{p.separado}</td>
                          <td className="text-center p-2 font-mono text-red-500">{p.naoTem}</td>
                          <td className="text-center p-2 font-mono text-yellow-600">{p.parcial}</td>
                          <td className="text-center p-2 font-mono text-gray-500">{p.pendente}</td>
                          <td className="text-center p-2 font-mono text-xs">
                            {mediaMin !== null ? `${mediaMin}min` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="text-center p-2">
                            <Badge variant="outline" className="text-xs">{diaPicoPessoa(p)}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Ranking rápido */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ranking — Mais Itens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pessoas.slice(0, 5).map((p, i) => {
                const pct = totalGeral > 0 ? (p.totalItens / totalGeral) * 100 : 0;
                return (
                  <div key={p.chave} className="flex items-center gap-3">
                    <span className="text-lg font-bold w-6 text-center text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium truncate">{p.nomeDisplay}</span>
                        <span className="font-mono text-xs shrink-0">{p.totalItens} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {relatorios.length > 0 && pessoas.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Nenhum conferente encontrado nos relatorios do periodo.
        </CardContent></Card>
      )}
    </div>
  );
};

export default RelatorioPessoas;

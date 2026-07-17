import { useEffect, useState } from "react";
import { Clock3, RefreshCw, Save, X } from "lucide-react";
import type { Empresa, LoginData } from "@/hooks/useAuth";
import { buscarSecoesComprasDisponiveis } from "@/lib/secoesCompras";
import {
  obterRelatoriosWhatsapp,
  salvarRelatorioWhatsapp,
  type RelatorioWhatsappConfig,
} from "@/lib/relatorioWhatsapp";
import { useToast } from "@/hooks/use-toast";

const CRITERIOS: Array<{
  value: RelatorioWhatsappConfig["criterio"];
  label: string;
  descricao: string;
  resumo: string;
}> = [
  {
    value: "diario",
    label: "Diario",
    descricao: "Todo dia as 07:00 envia o dia anterior.",
    resumo: "Dia anterior",
  },
  {
    value: "semanal",
    label: "Semanal",
    descricao: "Toda segunda as 07:00 envia segunda a domingo da semana anterior.",
    resumo: "Segunda a domingo",
  },
  {
    value: "mensal",
    label: "Mensal",
    descricao: "No dia 1 as 07:00 envia o mes calendario anterior.",
    resumo: "Mes anterior",
  },
];

function criarPadrao(login: LoginData): RelatorioWhatsappConfig {
  return {
    empresas:
      login.empresasPermitidas && login.empresasPermitidas.length > 0
        ? login.empresasPermitidas
        : [login.empresa],
    flag: login.flag,
    secoes: [],
    numeroWhatsapp: "5585992019010",
    criterio: "diario",
    ativo: true,
  };
}

function resumoCriterio(criterio: RelatorioWhatsappConfig["criterio"]) {
  return CRITERIOS.find((item) => item.value === criterio)?.descricao ?? CRITERIOS[0].descricao;
}

function ordenarEmpresas(empresas: Empresa[]) {
  return Array.from(new Set(empresas)).sort((a, b) => a.localeCompare(b));
}

export function RelatorioWhatsappConfigDialog({
  login,
  onClose,
}: {
  login: LoginData;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [senha, setSenha] = useState("");
  const [actor, setActor] = useState<{ login: string; senha: string } | null>(null);
  const [config, setConfig] = useState<RelatorioWhatsappConfig>(() => criarPadrao(login));
  const [secoes, setSecoes] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);

  const empresasDisponiveis = ordenarEmpresas(
    login.empresasPermitidas && login.empresasPermitidas.length > 0
      ? login.empresasPermitidas
      : [login.empresa]
  );

  useEffect(() => {
    if (!actor) return;
    void buscarSecoesComprasDisponiveis(config.empresas)
      .then(setSecoes)
      .catch(() => setSecoes([]));
  }, [actor, config.empresas]);

  const validarAcesso = async () => {
    if (!login.login) {
      setErroAcesso("Login nao encontrado.");
      return;
    }
    if (!senha.trim()) {
      setErroAcesso("Digite a senha do usuario Super.");
      return;
    }

    setCarregando(true);
    setErroAcesso(null);
    const credenciais = { login: login.login, senha };

    try {
      const lista = await obterRelatoriosWhatsapp(credenciais);
      setActor(credenciais);
      setConfig(lista[0] ?? criarPadrao(login));
    } catch (error) {
      setActor(null);
      setErroAcesso(error instanceof Error ? error.message : "Falha ao validar acesso.");
    } finally {
      setCarregando(false);
    }
  };

  const toggleEmpresa = (empresa: Empresa) => {
    setConfig((atual) => {
      const empresas = atual.empresas.includes(empresa)
        ? atual.empresas.filter((item) => item !== empresa)
        : [...atual.empresas, empresa];
      if (empresas.length === 0) return atual;
      return { ...atual, empresas: ordenarEmpresas(empresas), secoes: [] };
    });
  };

  const toggleSecao = (secao: string) => {
    setConfig((atual) => ({
      ...atual,
      secoes: atual.secoes.includes(secao)
        ? atual.secoes.filter((item) => item !== secao)
        : [...atual.secoes, secao],
    }));
  };

  const salvar = async () => {
    if (!actor) return;

    setSalvando(true);
    try {
      const id = await salvarRelatorioWhatsapp(actor, config);
      setConfig((atual) => ({ ...atual, id }));
      toast({
        title: "Configuracao salva",
        description: resumoCriterio(config.criterio),
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-3xl border border-border bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Relatorio WhatsApp
            </p>
            <h2 className="mt-2 text-2xl font-black text-foreground">
              Configuracao automatica do Dashboard
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Somente nivel Super pode alterar numero, criterio e secoes.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:bg-accent"
            aria-label="Fechar configuracao"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!actor ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-background p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Senha do usuario Super
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void validarAcesso();
                }}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                placeholder="Digite a senha para liberar a configuracao"
                autoFocus
              />
            </label>

            <button
              type="button"
              onClick={() => void validarAcesso()}
              disabled={carregando}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
              {carregando ? "Validando..." : "Abrir configuracao"}
            </button>

            {erroAcesso ? (
              <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {erroAcesso}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Destino
                    </p>
                    <h3 className="mt-1 text-lg font-black text-foreground">
                      Qual numero vai receber o relatorio
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-bold text-foreground">
                    <Clock3 className="h-4 w-4" />
                    07:00
                  </span>
                </div>

                <label className="mt-4 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Numero WhatsApp
                  <input
                    value={config.numeroWhatsapp}
                    onChange={(event) =>
                      setConfig((atual) => ({ ...atual, numeroWhatsapp: event.target.value }))
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                    placeholder="5585992019010"
                  />
                  <span className="mt-1 block text-[11px] normal-case text-muted-foreground">
                    Use DDI + DDD + numero.
                  </span>
                </label>

                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                  <input
                    type="checkbox"
                    checked={config.ativo}
                    onChange={(event) =>
                      setConfig((atual) => ({ ...atual, ativo: event.target.checked }))
                    }
                  />
                  <span className="text-sm font-bold text-foreground">Envio automatico ativo</span>
                </label>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Criterio do relatorio
                </p>
                <h3 className="mt-1 text-lg font-black text-foreground">
                  Diario, semanal ou mensal
                </h3>

                <div className="mt-4 grid gap-3">
                  {CRITERIOS.map((item) => {
                    const ativo = config.criterio === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setConfig((atual) => ({ ...atual, criterio: item.value }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          ativo
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-black">{item.label}</span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
                            {item.resumo}
                          </span>
                        </div>
                        <p className="mt-1 text-sm opacity-80">{item.descricao}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-2xl border border-border bg-background p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Secoes
              </p>
              <h3 className="mt-1 text-lg font-black text-foreground">
                Pode marcar mais de uma
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhuma marcada envia todas as secoes das empresas selecionadas.
              </p>

              <div className="mt-4 flex max-h-52 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-border bg-card p-3">
                {secoes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma secao disponivel para as empresas selecionadas.
                  </div>
                ) : (
                  secoes.map((secao) => (
                    <button
                      key={secao}
                      type="button"
                      onClick={() => toggleSecao(secao)}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                        config.secoes.includes(secao)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      }`}
                    >
                      {secao}
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="mt-4 grid gap-4 rounded-2xl border border-border bg-background p-4 md:grid-cols-[1fr_280px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Escopo
                </p>
                <h3 className="mt-1 text-lg font-black text-foreground">Empresas e origem</h3>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Empresas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {empresasDisponiveis.map((empresa) => (
                      <button
                        key={empresa}
                        type="button"
                        onClick={() => toggleEmpresa(empresa)}
                        className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                          config.empresas.includes(empresa)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:bg-accent"
                        }`}
                      >
                        {empresa}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Loja / CD
                <select
                  value={config.flag}
                  onChange={(event) =>
                    setConfig((atual) => ({
                      ...atual,
                      flag: event.target.value as RelatorioWhatsappConfig["flag"],
                    }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                >
                  <option value="loja">Loja</option>
                  <option value="cd">CD</option>
                  <option value="todos">Loja e CD</option>
                </select>
              </label>
            </section>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{resumoCriterio(config.criterio)}</p>
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={salvando}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {salvando ? "Salvando..." : "Salvar configuracao"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

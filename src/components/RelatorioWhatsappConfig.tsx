import { useEffect, useState } from "react";
import { Clock3, Save } from "lucide-react";
import type { Empresa } from "@/hooks/useAuth";
import type { ActorCredenciais } from "@/lib/usuarios";
import { buscarSecoesComprasDisponiveis } from "@/lib/secoesCompras";
import { obterRelatoriosWhatsapp, salvarRelatorioWhatsapp, type RelatorioWhatsappConfig } from "@/lib/relatorioWhatsapp";
import { useToast } from "@/hooks/use-toast";

const EMPRESAS: Empresa[] = ["NEWSHOP", "SOYE", "FACIL"];
const PADRAO: RelatorioWhatsappConfig = {
  empresas: ["NEWSHOP"], flag: "loja", secoes: [], numeroWhatsapp: "5585992019010", ativo: true,
};

export function RelatorioWhatsappConfigPanel({ actor }: { actor: ActorCredenciais }) {
  const { toast } = useToast();
  const [config, setConfig] = useState(PADRAO);
  const [secoes, setSecoes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void obterRelatoriosWhatsapp(actor).then((lista) => setConfig(lista[0] ?? PADRAO)).catch((err) =>
      toast({ title: "Falha ao carregar relatorio automatico", description: err.message, variant: "destructive" })
    );
  }, [actor.login, actor.senha]);

  useEffect(() => {
    void buscarSecoesComprasDisponiveis(config.empresas).then(setSecoes).catch(() => setSecoes([]));
  }, [config.empresas.join("|")]);

  const toggleEmpresa = (empresa: Empresa) => setConfig((atual) => {
    const empresas = atual.empresas.includes(empresa)
      ? atual.empresas.filter((item) => item !== empresa)
      : [...atual.empresas, empresa];
    return { ...atual, empresas: empresas.length ? empresas : atual.empresas, secoes: [] };
  });
  const toggleSecao = (secao: string) => setConfig((atual) => ({
    ...atual,
    secoes: atual.secoes.includes(secao) ? atual.secoes.filter((item) => item !== secao) : [...atual.secoes, secao],
  }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const id = await salvarRelatorioWhatsapp(actor, config);
      setConfig((atual) => ({ ...atual, id }));
      toast({ title: "Configuracao salva", description: "Envio diario programado para 07:00." });
    } catch (err) {
      toast({ title: "Falha ao salvar", description: err instanceof Error ? err.message : "Erro desconhecido.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Relatorio WhatsApp</p>
          <h2 className="mt-1 text-xl font-black text-foreground">Resumo do dia anterior</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configuracao exclusiva do nivel Super.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-bold">
          <Clock3 className="h-4 w-4" /> Diario, 07:00
        </span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Empresas</p>
          <div className="flex flex-wrap gap-2">{EMPRESAS.map((empresa) => (
            <button key={empresa} type="button" onClick={() => toggleEmpresa(empresa)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${config.empresas.includes(empresa) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              {empresa}
            </button>
          ))}</div>
        </div>
        <label className="text-xs font-bold uppercase text-muted-foreground">Loja / CD
          <select value={config.flag} onChange={(e) => setConfig((c) => ({ ...c, flag: e.target.value as RelatorioWhatsappConfig["flag"] }))}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
            <option value="loja">Loja</option><option value="cd">CD</option><option value="todos">Loja e CD</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase text-muted-foreground">WhatsApp
          <input value={config.numeroWhatsapp} onChange={(e) => setConfig((c) => ({ ...c, numeroWhatsapp: e.target.value }))}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
          <span className="mt-1 block font-normal normal-case">DDI + DDD + numero</span>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
          <input type="checkbox" checked={config.ativo} onChange={(e) => setConfig((c) => ({ ...c, ativo: e.target.checked }))} />
          <span className="text-sm font-bold">Envio automatico ativo</span>
        </label>
      </div>
      <div className="mt-5">
        <p className="text-xs font-bold uppercase text-muted-foreground">Secoes ({config.secoes.length || "todas"})</p>
        <p className="my-2 text-xs text-muted-foreground">Nenhuma marcada inclui todas.</p>
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border p-3">
          {secoes.map((secao) => (
            <button key={secao} type="button" onClick={() => toggleSecao(secao)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${config.secoes.includes(secao) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              {secao}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={salvar} disabled={salvando}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-60">
        <Save className="h-4 w-4" /> {salvando ? "Salvando..." : "Salvar configuracao"}
      </button>
    </section>
  );
}

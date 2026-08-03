import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Search, UserPlus, UsersRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLogo, getCompanyName } from "@/lib/companyTheme";
import {
  buscarClientesVarejoFacil,
  cadastrarClienteVarejoFacil,
  type ClientePdv,
  type TipoContribuinteCliente,
} from "@/lib/erpClientes";
import { buscarEnderecoPorCep } from "@/lib/cepBrasil";
import { consultarFornecedorDanfe, separarEnderecoDanfe } from "@/lib/danfeFornecedor";

const PAGE_SIZE = 50;
const TELEFONE_PADRAO_CLIENTE = "99999999999";

const tipoContribuinteOptions: Array<{ value: TipoContribuinteCliente; label: string }> = [
  { value: "ISENTO", label: "ISENTO" },
  { value: "NAO_CONTRIBUINTE", label: "NAO CONTRIBUINTE" },
  { value: "CONTRIBUINTE", label: "CONTRIBUINTE" },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatDoc(value?: string | null): string {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits || "Sem documento";
}

function formatPhone(value?: string | null): string {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits || "-";
}

function mergeClientes(current: ClientePdv[], incoming: ClientePdv[]): ClientePdv[] {
  const map = new Map<string, ClientePdv>();
  for (const cliente of current) map.set(`${cliente.codigo}-${cliente.cpfCnpj ?? ""}`, cliente);
  for (const cliente of incoming) map.set(`${cliente.codigo}-${cliente.cpfCnpj ?? ""}`, cliente);
  return [...map.values()];
}

const initialForm = {
  nome: "",
  fantasia: "",
  cpfCnpj: "",
  telefone: "",
  email: "",
  tipoContribuinte: "ISENTO" as TipoContribuinteCliente,
  inscricaoEstadual: "",
  cep: "",
  endereco: "",
  numeroEndereco: "",
  bairro: "",
  cidade: "",
  uf: "",
  codigoIbge: "",
  complemento: "",
};

const Clientes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const login = obterLoginSalvo();
  const empresa = login?.empresa ?? "NEWSHOP";
  const logoEmpresa = getCompanyLogo(empresa);
  const nomeEmpresaLogo = getCompanyName(empresa);

  const [search, setSearch] = useState("");
  const [clientes, setClientes] = useState<ClientePdv[]>([]);
  const [nextStart, setNextStart] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [danfeLoading, setDanfeLoading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const ultimoCnpjDanfeRef = useRef("");

  const termoBusca = useMemo(() => search.trim(), [search]);
  const documentoAtual = onlyDigits(form.cpfCnpj);
  const isCnpjForm = documentoAtual.length === 14;

  const carregar = useCallback(async (reset = false) => {
    const start = reset ? 0 : nextStart;
    setLoading(reset);
    setLoadingMore(!reset);
    setError(null);
    try {
      const data = await buscarClientesVarejoFacil({
        empresa,
        search: termoBusca,
        limit: PAGE_SIZE,
        start,
      });
      setClientes((current) => reset ? data : mergeClientes(current, data));
      setNextStart(start + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar clientes.");
      if (reset) setClientes([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [empresa, nextStart, termoBusca]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void carregar(true);
    }, termoBusca ? 350 : 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, termoBusca]);

  const preencherCep = async (cepValue = form.cep) => {
    const cep = onlyDigits(cepValue);
    if (cep.length !== 8) return;
    setCepLoading(true);
    setFormError("");
    try {
      const endereco = await buscarEnderecoPorCep(cep);
      if (!endereco) {
        setFormError("CEP nao encontrado. Preencha o endereco manualmente.");
        return;
      }
      setForm((current) => ({
        ...current,
        cep: endereco.cep,
        endereco: current.endereco || endereco.logradouro,
        bairro: current.bairro || endereco.bairro,
        cidade: current.cidade || endereco.cidade,
        uf: current.uf || endereco.uf,
        codigoIbge: current.codigoIbge || endereco.codigoIbge,
      }));
    } catch {
      setFormError("Nao foi possivel consultar o CEP. Preencha o endereco manualmente.");
    } finally {
      setCepLoading(false);
    }
  };

  const consultarCnpjDanfe = useCallback(async (force = false) => {
    const cnpj = onlyDigits(form.cpfCnpj);
    if (cnpj.length !== 14) return;
    const ufAtual = form.uf.trim().toUpperCase().slice(0, 2);
    const cacheKey = `${cnpj}:${ufAtual}`;
    if (!force && ultimoCnpjDanfeRef.current === cacheKey) return;

    ultimoCnpjDanfeRef.current = cacheKey;
    setDanfeLoading(true);
    setFormError("");
    try {
      const dados = await consultarFornecedorDanfe(cnpj, ufAtual || undefined);
      const endereco = separarEnderecoDanfe(dados.endereco);
      let enderecoCep: Awaited<ReturnType<typeof buscarEnderecoPorCep>> = null;
      if (dados.cep) {
        enderecoCep = await buscarEnderecoPorCep(dados.cep).catch(() => null);
      }

      setForm((current) => ({
        ...current,
        nome: current.nome || dados.razaoSocial || "",
        cpfCnpj: dados.cnpj || current.cpfCnpj,
        tipoContribuinte: dados.tipoContribuinte,
        inscricaoEstadual: dados.tipoContribuinte === "CONTRIBUINTE" ? dados.inscricaoEstadual || current.inscricaoEstadual : "",
        cep: current.cep || dados.cep || enderecoCep?.cep || "",
        endereco: current.endereco || enderecoCep?.logradouro || endereco.endereco,
        numeroEndereco: current.numeroEndereco || endereco.numeroEndereco,
        bairro: current.bairro || enderecoCep?.bairro || endereco.bairro,
        cidade: current.cidade || enderecoCep?.cidade || dados.cidade || "",
        uf: current.uf || enderecoCep?.uf || dados.uf || "",
        codigoIbge: current.codigoIbge || enderecoCep?.codigoIbge || "",
      }));

      toast({
        title: "CNPJ consultado no Danfe",
        description: dados.aviso || dados.fonteResumo || dados.razaoSocial || "Dados preenchidos no cadastro.",
      });
    } catch (err) {
      ultimoCnpjDanfeRef.current = "";
      setFormError(err instanceof Error ? err.message : "Falha ao consultar CNPJ no DanfeCollector.");
    } finally {
      setDanfeLoading(false);
    }
  }, [form.cpfCnpj, form.uf, toast]);

  useEffect(() => {
    const cnpj = onlyDigits(form.cpfCnpj);
    if (!cadastroAberto || cnpj.length !== 14) return;
    const handle = window.setTimeout(() => {
      void consultarCnpjDanfe(false);
    }, 500);
    return () => window.clearTimeout(handle);
  }, [cadastroAberto, form.cpfCnpj, consultarCnpjDanfe]);

  const salvarCliente = async () => {
    if (saving) return;
    const documento = onlyDigits(form.cpfCnpj);
    const telefoneInformado = onlyDigits(form.telefone);
    const telefone = telefoneInformado || TELEFONE_PADRAO_CLIENTE;
    const cep = onlyDigits(form.cep);
    const isCnpj = documento.length === 14;
    if (!form.nome.trim()) {
      setFormError("Informe o nome do cliente.");
      return;
    }
    if (![11, 14].includes(documento.length)) {
      setFormError("Informe CPF ou CNPJ valido.");
      return;
    }
    if (telefoneInformado && telefoneInformado.length < 10) {
      setFormError("Telefone invalido.");
      return;
    }
    if (isCnpj && form.tipoContribuinte === "CONTRIBUINTE" && !form.inscricaoEstadual.trim()) {
      setFormError("Informe a IE quando o CNPJ for contribuinte.");
      return;
    }
    if (cep.length !== 8 || !form.uf.trim() || !form.cidade.trim() || !form.codigoIbge.trim() || !form.endereco.trim() || !form.numeroEndereco.trim() || !form.bairro.trim()) {
      setFormError("Preencha CEP, UF, cidade, codigo IBGE, logradouro, numero e bairro.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const cliente = await cadastrarClienteVarejoFacil({
        empresa,
        nome: form.nome,
        fantasia: form.nome,
        cpfCnpj: documento,
        telefone,
        email: form.email,
        tipoContribuinte: isCnpj ? form.tipoContribuinte : "ISENTO",
        inscricaoEstadual: isCnpj && form.tipoContribuinte === "CONTRIBUINTE" ? form.inscricaoEstadual : "ISENTO",
        cep,
        uf: form.uf,
        cidade: form.cidade,
        codigoIbge: form.codigoIbge,
        endereco: form.endereco,
        numeroEndereco: form.numeroEndereco,
        bairro: form.bairro,
        complemento: form.complemento,
      });
      setClientes((current) => {
        const key = `${cliente.codigo}-${cliente.cpfCnpj ?? ""}`;
        return [cliente, ...current.filter((item) => `${item.codigo}-${item.cpfCnpj ?? ""}` !== key)];
      });
      setCadastroAberto(false);
      setForm(initialForm);
      toast({ title: "Cliente cadastrado", description: cliente.nome });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao cadastrar cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary px-5 py-4 text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/scanner")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <img src={logoEmpresa} alt={nomeEmpresaLogo} className="h-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/60">
                Cadastro
              </p>
              <h1 className="truncate text-lg font-black">Cliente</h1>
            </div>
          </div>
          <p className="shrink-0 text-right text-xs font-semibold text-primary-foreground/75">
            {empresa}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <section className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-primary" />
                <h2 className="text-base font-black text-foreground">Clientes da base</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {clientes.length} cliente(s) carregado(s)
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nome, CPF/CNPJ ou telefone"
                  className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => void carregar(true)}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold text-foreground disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setFormError("");
                  setCepLoading(false);
                  setDanfeLoading(false);
                  ultimoCnpjDanfeRef.current = "";
                  setCadastroAberto(true);
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Cadastrar
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-sm font-bold text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm font-semibold text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
            Carregando clientes...
          </div>
        ) : clientes.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm font-semibold text-muted-foreground">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clientes.map((cliente) => (
              <article key={`${cliente.codigo}-${cliente.cpfCnpj ?? ""}`} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{cliente.nome}</p>
                    {cliente.fantasia && cliente.fantasia !== cliente.nome && (
                      <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{cliente.fantasia}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] font-black text-primary">
                    {cliente.codigo}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <p><span className="font-bold text-foreground">Documento:</span> {formatDoc(cliente.cpfCnpj)}</p>
                  <p><span className="font-bold text-foreground">Telefone:</span> {formatPhone(cliente.telefone)}</p>
                  {cliente.email && <p className="truncate"><span className="font-bold text-foreground">Email:</span> {cliente.email}</p>}
                  {(cliente.cidade || cliente.uf) && (
                    <p className="truncate"><span className="font-bold text-foreground">Cidade:</span> {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ")}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => void carregar(false)}
            disabled={loadingMore}
            className="mx-auto flex h-11 min-w-44 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-bold text-foreground disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar mais
          </button>
        )}
      </main>

      {cadastroAberto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setCadastroAberto(false)}>
          <div className="w-full max-w-lg rounded-lg border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Novo cliente</p>
                <h2 className="mt-1 text-lg font-black text-foreground">Cadastrar cliente</h2>
              </div>
              <button
                type="button"
                onClick={() => setCadastroAberto(false)}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground disabled:opacity-60"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <Field label="Nome" value={form.nome} onChange={(value) => setForm((current) => ({ ...current, nome: value }))} autoFocus />
              <Field label="Fantasia" value={form.nome} onChange={() => {}} readOnly placeholder="Replica do nome" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Holding" value="GERAL" onChange={() => {}} readOnly />
                <Field label="Pais" value="BRASIL" onChange={() => {}} readOnly />
              </div>
              <Field
                label="CPF/CNPJ"
                value={form.cpfCnpj}
                onChange={(value) => {
                  const nextDoc = onlyDigits(value);
                  if (nextDoc.length !== 14) ultimoCnpjDanfeRef.current = "";
                  setForm((current) => ({
                    ...current,
                    cpfCnpj: value,
                    tipoContribuinte: nextDoc.length > 11 ? current.tipoContribuinte : "ISENTO",
                    inscricaoEstadual: nextDoc.length > 11 ? current.inscricaoEstadual : "",
                  }));
                }}
                inputMode="numeric"
                placeholder="Somente numeros"
              />
              {isCnpjForm && (
                <button
                  type="button"
                  onClick={() => void consultarCnpjDanfe(true)}
                  disabled={danfeLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-black text-foreground disabled:opacity-60"
                >
                  {danfeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {danfeLoading ? "Consultando Danfe..." : "Consultar CNPJ no Danfe"}
                </button>
              )}
              {isCnpjForm ? (
                <div className={`grid gap-3 ${form.tipoContribuinte === "CONTRIBUINTE" ? "sm:grid-cols-2" : ""}`}>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tipo contribuinte</span>
                    <select
                      value={form.tipoContribuinte}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        tipoContribuinte: event.target.value as TipoContribuinteCliente,
                        inscricaoEstadual: event.target.value === "CONTRIBUINTE" ? current.inscricaoEstadual : "",
                      }))}
                      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
                    >
                      {tipoContribuinteOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {form.tipoContribuinte === "CONTRIBUINTE" && (
                    <Field label="RG/IE *" value={form.inscricaoEstadual} onChange={(value) => setForm((current) => ({ ...current, inscricaoEstadual: value }))} placeholder="Inscricao estadual" />
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo contribuinte" value="ISENTO" onChange={() => {}} readOnly />
                  <Field label="RG/IE" value="ISENTO" onChange={() => {}} readOnly />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telefone" value={form.telefone} onChange={(value) => setForm((current) => ({ ...current, telefone: value }))} inputMode="tel" placeholder="Opcional; vazio usa 99999999999" />
                <Field label="Email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" placeholder="Opcional" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="CEP *" value={form.cep} onChange={(value) => setForm((current) => ({ ...current, cep: value }))} onBlur={() => void preencherCep()} inputMode="numeric" placeholder="Somente numeros" />
                <button
                  type="button"
                  onClick={() => void preencherCep()}
                  disabled={cepLoading || onlyDigits(form.cep).length !== 8}
                  className="h-11 rounded-lg border border-border bg-background px-4 text-sm font-bold text-foreground disabled:opacity-60"
                >
                  {cepLoading ? "Buscando..." : "Buscar CEP"}
                </button>
              </div>
              <Field label="Logradouro *" value={form.endereco} onChange={(value) => setForm((current) => ({ ...current, endereco: value }))} placeholder="Rua / Avenida" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Numero *" value={form.numeroEndereco} onChange={(value) => setForm((current) => ({ ...current, numeroEndereco: value }))} placeholder="Numero" />
                <Field label="Bairro *" value={form.bairro} onChange={(value) => setForm((current) => ({ ...current, bairro: value }))} placeholder="Bairro" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_84px_1fr]">
                <Field label="Municipio (IBGE) *" value={form.cidade} onChange={(value) => setForm((current) => ({ ...current, cidade: value }))} placeholder="Cidade" />
                <Field label="UF *" value={form.uf} onChange={(value) => setForm((current) => ({ ...current, uf: value.toUpperCase().slice(0, 2) }))} placeholder="UF" maxLength={2} />
                <Field label="Codigo municipio *" value={form.codigoIbge} onChange={(value) => setForm((current) => ({ ...current, codigoIbge: value }))} inputMode="numeric" placeholder="Codigo" />
              </div>
              <Field label="Complemento" value={form.complemento} onChange={(value) => setForm((current) => ({ ...current, complemento: value }))} placeholder="Opcional" />
              {formError && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs font-bold text-destructive">
                  {formError}
                </div>
              )}
              <button
                type="button"
                onClick={() => void salvarCliente()}
                disabled={saving}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-black text-primary-foreground disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Salvar cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  onBlur,
  autoFocus,
  inputMode,
  placeholder,
  type = "text",
  maxLength,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
  placeholder?: string;
  type?: string;
  maxLength?: number;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        inputMode={inputMode}
        placeholder={placeholder}
        type={type}
        maxLength={maxLength}
        readOnly={readOnly}
        className={`h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary ${readOnly ? "opacity-75" : ""}`}
      />
    </label>
  );
}

export default Clientes;

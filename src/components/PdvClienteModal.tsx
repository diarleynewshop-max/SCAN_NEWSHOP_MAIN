import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Search, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buscarClientesVarejoFacil,
  cadastrarClienteVarejoFacil,
  type ClientePdv,
  type TipoContribuinteCliente,
} from "@/lib/erpClientes";
import { buscarEnderecoPorCep } from "@/lib/cepBrasil";
import { consultarFornecedorDanfe, separarEnderecoDanfe } from "@/lib/danfeFornecedor";

interface PdvClienteModalProps {
  open: boolean;
  empresa: string;
  onCancel: () => void;
  onSelect: (cliente: ClientePdv) => void;
  createButtonLabel?: string;
}

const fieldStyle = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 8,
  border: "1.5px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--foreground))",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "hsl(var(--muted-foreground))",
  marginBottom: 5,
  display: "block",
};

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
  return digits;
}

const TELEFONE_PADRAO_CLIENTE = "99999999999";

const tipoContribuinteOptions: Array<{ value: TipoContribuinteCliente; label: string }> = [
  { value: "ISENTO", label: "ISENTO" },
  { value: "NAO_CONTRIBUINTE", label: "NAO CONTRIBUINTE" },
  { value: "CONTRIBUINTE", label: "CONTRIBUINTE" },
];

export function PdvClienteModal({ open, empresa, onCancel, onSelect, createButtonLabel = "Cadastrar e enviar" }: PdvClienteModalProps) {
  const [mode, setMode] = useState<"buscar" | "cadastrar">("buscar");
  const [search, setSearch] = useState("");
  const [clientes, setClientes] = useState<ClientePdv[]>([]);
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [danfeLoading, setDanfeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ultimoCnpjDanfeRef = useRef("");
  const [form, setForm] = useState({
    nome: "",
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
  });

  useEffect(() => {
    if (!open) return;
    setMode("buscar");
    setSearch("");
    setError("");
    setClientes([]);
    setCepLoading(false);
    setDanfeLoading(false);
    ultimoCnpjDanfeRef.current = "";
    setForm({
      nome: "",
      cpfCnpj: "",
      telefone: "",
      email: "",
      tipoContribuinte: "ISENTO",
      inscricaoEstadual: "",
      cep: "",
      endereco: "",
      numeroEndereco: "",
      bairro: "",
      cidade: "",
      uf: "",
      codigoIbge: "",
      complemento: "",
    });
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "buscar") return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await buscarClientesVarejoFacil({ empresa, search, limit: 20 });
        if (!cancelled) setClientes(data);
      } catch (err) {
        if (!cancelled) {
          setClientes([]);
          setError(err instanceof Error ? err.message : "Falha ao buscar clientes.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 350 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, mode, empresa, search]);

  const preencherCep = async (cepValue = form.cep) => {
    const cep = onlyDigits(cepValue);
    if (cep.length !== 8) return;
    setCepLoading(true);
    setError("");
    try {
      const endereco = await buscarEnderecoPorCep(cep);
      if (!endereco) {
        setError("CEP nao encontrado. Preencha o endereco manualmente.");
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
      setError("Nao foi possivel consultar o CEP. Preencha o endereco manualmente.");
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
    setError("");
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
    } catch (err) {
      ultimoCnpjDanfeRef.current = "";
      setError(err instanceof Error ? err.message : "Falha ao consultar CNPJ no DanfeCollector.");
    } finally {
      setDanfeLoading(false);
    }
  }, [form.cpfCnpj, form.uf]);

  const documentoAtual = onlyDigits(form.cpfCnpj);
  const isCnpjForm = documentoAtual.length === 14;

  useEffect(() => {
    const cnpj = onlyDigits(form.cpfCnpj);
    if (!open || mode !== "cadastrar" || cnpj.length !== 14) return;
    const handle = window.setTimeout(() => {
      void consultarCnpjDanfe(false);
    }, 500);
    return () => window.clearTimeout(handle);
  }, [open, mode, form.cpfCnpj, consultarCnpjDanfe]);

  const cadastrar = async () => {
    if (saving) return;
    const documento = onlyDigits(form.cpfCnpj);
    const telefoneInformado = onlyDigits(form.telefone);
    const telefone = telefoneInformado || TELEFONE_PADRAO_CLIENTE;
    const cep = onlyDigits(form.cep);
    const isCnpj = documento.length === 14;
    if (!form.nome.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (![11, 14].includes(documento.length)) {
      setError("Informe CPF ou CNPJ valido para cadastrar.");
      return;
    }
    if (telefoneInformado && telefoneInformado.length < 10) {
      setError("Telefone invalido.");
      return;
    }
    if (isCnpj && form.tipoContribuinte === "CONTRIBUINTE" && !form.inscricaoEstadual.trim()) {
      setError("Informe a IE quando o CNPJ for contribuinte.");
      return;
    }
    if (cep.length !== 8 || !form.uf.trim() || !form.cidade.trim() || !form.codigoIbge.trim() || !form.endereco.trim() || !form.numeroEndereco.trim() || !form.bairro.trim()) {
      setError("Preencha CEP, UF, cidade, codigo IBGE, logradouro, numero e bairro.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const cliente = await cadastrarClienteVarejoFacil({
        empresa,
        nome: form.nome,
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
      onSelect(cliente);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] max-w-lg overflow-y-auto" style={{ borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>
            Cliente do PDV
          </DialogTitle>
          <DialogDescription style={{ fontSize: 13 }}>
            Selecione um cliente do Varejo Facil ou cadastre com os dados obrigatorios do ERP.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={() => setMode("buscar")}
            style={{
              height: 40,
              borderRadius: 8,
              border: "1.5px solid hsl(var(--border))",
              background: mode === "buscar" ? "hsl(var(--primary))" : "hsl(var(--secondary))",
              color: mode === "buscar" ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Search style={{ width: 15, height: 15 }} /> Buscar
          </button>
          <button
            onClick={() => setMode("cadastrar")}
            style={{
              height: 40,
              borderRadius: 8,
              border: "1.5px solid hsl(var(--border))",
              background: mode === "cadastrar" ? "hsl(var(--primary))" : "hsl(var(--secondary))",
              color: mode === "cadastrar" ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <UserPlus style={{ width: 15, height: 15 }} /> Cadastrar
          </button>
        </div>

        {mode === "buscar" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <div>
              <label style={labelStyle}>Nome, CPF/CNPJ ou telefone</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite para buscar"
                style={fieldStyle}
                autoFocus
              />
            </div>
            <div style={{ minHeight: 210, maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {loading ? (
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))" }}>
                  <Loader2 style={{ width: 18, height: 18, animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : clientes.length > 0 ? (
                clientes.map((cliente) => (
                  <button
                    key={`${cliente.codigo}-${cliente.cpfCnpj ?? ""}`}
                    onClick={() => onSelect(cliente)}
                    style={{
                      width: "100%",
                      borderRadius: 10,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      padding: "11px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "hsl(var(--foreground))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cliente.nome}
                      </div>
                      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                        Cod. {cliente.codigo} | {formatDoc(cliente.cpfCnpj)} {cliente.telefone ? `| ${formatPhone(cliente.telefone)}` : ""}
                      </div>
                    </div>
                    <Check style={{ width: 16, height: 16, color: "hsl(var(--primary))" }} />
                  </button>
                ))
              ) : (
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))}
                placeholder="Nome do cliente"
                style={fieldStyle}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Fantasia</label>
              <input
                value={form.nome}
                readOnly
                placeholder="Replica do nome"
                style={{ ...fieldStyle, opacity: 0.78 }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Holding</label>
                <input value="GERAL" readOnly style={{ ...fieldStyle, opacity: 0.78 }} />
              </div>
              <div>
                <label style={labelStyle}>Pais</label>
                <input value="BRASIL" readOnly style={{ ...fieldStyle, opacity: 0.78 }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>CPF/CNPJ</label>
              <input
                value={form.cpfCnpj}
                onChange={(e) => {
                  const nextDoc = onlyDigits(e.target.value);
                  if (nextDoc.length !== 14) ultimoCnpjDanfeRef.current = "";
                  setForm((current) => ({
                    ...current,
                    cpfCnpj: e.target.value,
                    tipoContribuinte: nextDoc.length > 11 ? current.tipoContribuinte : "ISENTO",
                    inscricaoEstadual: nextDoc.length > 11 ? current.inscricaoEstadual : "",
                  }));
                }}
                placeholder="Somente numeros"
                inputMode="numeric"
                style={fieldStyle}
              />
            </div>
            {isCnpjForm && (
              <button
                type="button"
                onClick={() => void consultarCnpjDanfe(true)}
                disabled={danfeLoading}
                style={{
                  height: 38,
                  borderRadius: 8,
                  border: "1.5px solid hsl(var(--border))",
                  background: "hsl(var(--secondary))",
                  color: "hsl(var(--foreground))",
                  padding: "0 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: danfeLoading ? "not-allowed" : "pointer",
                  opacity: danfeLoading ? 0.65 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
              >
                {danfeLoading ? <Loader2 style={{ width: 15, height: 15, animation: "spin 0.8s linear infinite" }} /> : <RefreshCw style={{ width: 15, height: 15 }} />}
                {danfeLoading ? "Consultando Danfe..." : "Consultar CNPJ no Danfe"}
              </button>
            )}
            {isCnpjForm ? (
              <div style={{ display: "grid", gridTemplateColumns: form.tipoContribuinte === "CONTRIBUINTE" ? "1fr 1fr" : "1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Tipo contribuinte</label>
                  <select
                    value={form.tipoContribuinte}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      tipoContribuinte: e.target.value as TipoContribuinteCliente,
                      inscricaoEstadual: e.target.value === "CONTRIBUINTE" ? current.inscricaoEstadual : "",
                    }))}
                    style={fieldStyle}
                  >
                    {tipoContribuinteOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {form.tipoContribuinte === "CONTRIBUINTE" && (
                  <div>
                    <label style={labelStyle}>RG/IE *</label>
                    <input
                      value={form.inscricaoEstadual}
                      onChange={(e) => setForm((current) => ({ ...current, inscricaoEstadual: e.target.value }))}
                      placeholder="Inscricao estadual"
                      style={fieldStyle}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Tipo contribuinte</label>
                  <input value="ISENTO" readOnly style={{ ...fieldStyle, opacity: 0.78 }} />
                </div>
                <div>
                  <label style={labelStyle}>RG/IE</label>
                  <input value="ISENTO" readOnly style={{ ...fieldStyle, opacity: 0.78 }} />
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm((current) => ({ ...current, telefone: e.target.value }))}
                  placeholder="Opcional; vazio usa 99999999999"
                  inputMode="tel"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="Opcional"
                  type="email"
                  style={fieldStyle}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>CEP *</label>
                <input
                  value={form.cep}
                  onChange={(e) => setForm((current) => ({ ...current, cep: e.target.value }))}
                  onBlur={() => void preencherCep()}
                  placeholder="Somente numeros"
                  inputMode="numeric"
                  style={fieldStyle}
                />
              </div>
              <button
                type="button"
                onClick={() => void preencherCep()}
                disabled={cepLoading || onlyDigits(form.cep).length !== 8}
                style={{
                  height: 42,
                  borderRadius: 8,
                  border: "1.5px solid hsl(var(--border))",
                  background: "hsl(var(--secondary))",
                  color: "hsl(var(--foreground))",
                  padding: "0 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: cepLoading ? "not-allowed" : "pointer",
                  opacity: cepLoading || onlyDigits(form.cep).length !== 8 ? 0.6 : 1,
                }}
              >
                {cepLoading ? "..." : "Buscar"}
              </button>
            </div>
            <div>
              <label style={labelStyle}>Logradouro *</label>
              <input
                value={form.endereco}
                onChange={(e) => setForm((current) => ({ ...current, endereco: e.target.value }))}
                placeholder="Rua / Avenida"
                style={fieldStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Numero *</label>
                <input
                  value={form.numeroEndereco}
                  onChange={(e) => setForm((current) => ({ ...current, numeroEndereco: e.target.value }))}
                  placeholder="Numero"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Bairro *</label>
                <input
                  value={form.bairro}
                  onChange={(e) => setForm((current) => ({ ...current, bairro: e.target.value }))}
                  placeholder="Bairro"
                  style={fieldStyle}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Municipio (IBGE) *</label>
                <input
                  value={form.cidade}
                  onChange={(e) => setForm((current) => ({ ...current, cidade: e.target.value }))}
                  placeholder="Cidade"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>UF *</label>
                <input
                  value={form.uf}
                  onChange={(e) => setForm((current) => ({ ...current, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="UF"
                  maxLength={2}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Codigo municipio *</label>
                <input
                  value={form.codigoIbge}
                  onChange={(e) => setForm((current) => ({ ...current, codigoIbge: e.target.value }))}
                  placeholder="Codigo"
                  inputMode="numeric"
                  style={fieldStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Complemento</label>
              <input
                value={form.complemento}
                onChange={(e) => setForm((current) => ({ ...current, complemento: e.target.value }))}
                placeholder="Opcional"
                style={fieldStyle}
              />
            </div>
            <button
              onClick={cadastrar}
              disabled={saving}
              style={{
                marginTop: 4,
                height: 44,
                borderRadius: 10,
                border: "none",
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                fontWeight: 800,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.75 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin 0.8s linear infinite" }} /> : <UserPlus style={{ width: 16, height: 16 }} />}
              {createButtonLabel}
            </button>
          </div>
        )}

        {error && (
          <div style={{ borderRadius: 10, background: "hsl(var(--destructive) / 0.08)", color: "hsl(var(--destructive))", padding: 10, fontSize: 12, fontWeight: 700 }}>
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

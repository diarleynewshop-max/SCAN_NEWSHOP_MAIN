import { useEffect, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buscarClientesVarejoFacil,
  cadastrarClienteVarejoFacil,
  type ClientePdv,
} from "@/lib/erpClientes";

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

export function PdvClienteModal({ open, empresa, onCancel, onSelect, createButtonLabel = "Cadastrar e enviar" }: PdvClienteModalProps) {
  const [mode, setMode] = useState<"buscar" | "cadastrar">("buscar");
  const [search, setSearch] = useState("");
  const [clientes, setClientes] = useState<ClientePdv[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ nome: "", cpfCnpj: "", telefone: "", email: "" });

  useEffect(() => {
    if (!open) return;
    setMode("buscar");
    setSearch("");
    setError("");
    setClientes([]);
    setForm({ nome: "", cpfCnpj: "", telefone: "", email: "" });
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

  const cadastrar = async () => {
    if (saving) return;
    const documento = onlyDigits(form.cpfCnpj);
    if (!form.nome.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (![11, 14].includes(documento.length)) {
      setError("Informe CPF ou CNPJ valido para cadastrar.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const cliente = await cadastrarClienteVarejoFacil({
        empresa,
        nome: form.nome,
        cpfCnpj: documento,
        telefone: form.telefone,
        email: form.email,
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
      <DialogContent aria-describedby={undefined} className="max-w-md" style={{ borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>
            Cliente do PDV
          </DialogTitle>
          <DialogDescription style={{ fontSize: 13 }}>
            Selecione um cliente do Varejo Facil ou cadastre antes de enviar.
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
              <label style={labelStyle}>CPF/CNPJ</label>
              <input
                value={form.cpfCnpj}
                onChange={(e) => setForm((current) => ({ ...current, cpfCnpj: e.target.value }))}
                placeholder="Somente numeros"
                inputMode="numeric"
                style={fieldStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm((current) => ({ ...current, telefone: e.target.value }))}
                  placeholder="Opcional"
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

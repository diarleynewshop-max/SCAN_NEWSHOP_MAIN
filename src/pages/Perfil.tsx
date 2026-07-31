import { useRef, useState } from "react";
import { ArrowLeft, Camera, KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLogo, getCompanyName } from "@/lib/companyTheme";
import { alterarMinhaSenha, LIMITE_FOTO_PERFIL_BYTES, salvarMinhaFotoPerfil } from "@/lib/usuarios";

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-secondary px-4 py-3">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value || "-"}</p>
    </div>
  );
}

const Perfil = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginSalvo, atualizarLoginSalvo, fazerLogout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoEmpresa = getCompanyLogo(loginSalvo?.empresa);
  const nomeEmpresaLogo = getCompanyName(loginSalvo?.empresa);

  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [msgSenha, setMsgSenha] = useState("");

  const nomePessoa = loginSalvo?.nomePessoa?.trim() || "Usuario";
  const vendedorPdv = loginSalvo?.nomePessoa?.trim() || "Sem vendedor";

  const trocarFoto = async (file?: File) => {
    if (!file) return;
    if (!loginSalvo?.usuarioId || !loginSalvo.login) {
      toast({ title: "Conta sem identificacao", variant: "destructive" });
      return;
    }
    if (file.size > LIMITE_FOTO_PERFIL_BYTES) {
      toast({ title: "Foto muito grande", description: "Use imagem de ate 2MB.", variant: "destructive" });
      return;
    }

    setSalvandoFoto(true);
    try {
      const fotoUrl = await salvarMinhaFotoPerfil({
        usuarioId: loginSalvo.usuarioId,
        login: loginSalvo.login,
        arquivo: file,
      });
      atualizarLoginSalvo({ fotoUrl });
      toast({ title: "Foto atualizada" });
    } catch (err) {
      toast({
        title: "Falha ao salvar foto",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSalvandoFoto(false);
    }
  };

  const trocarSenha = async () => {
    setMsgSenha("");
    if (!loginSalvo?.login) {
      setMsgSenha("Conta sem login no Supabase.");
      return;
    }
    if (!senhaAtual.trim() || !novaSenha.trim()) {
      setMsgSenha("Preencha a senha atual e a nova.");
      return;
    }
    if (novaSenha.trim().length < 3) {
      setMsgSenha("A nova senha e muito curta.");
      return;
    }

    setTrocandoSenha(true);
    try {
      const ok = await alterarMinhaSenha(loginSalvo.login, senhaAtual, novaSenha);
      if (!ok) {
        setMsgSenha("Senha atual incorreta.");
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setMsgSenha("Senha alterada.");
      toast({ title: "Senha alterada" });
    } catch (err) {
      setMsgSenha(err instanceof Error ? err.message : "Nao foi possivel alterar a senha.");
    } finally {
      setTrocandoSenha(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background">
      <header className="bg-primary px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-primary-foreground/10 flex items-center justify-center"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <img src={logoEmpresa} alt={nomeEmpresaLogo} className="h-9 object-contain" />
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary-foreground/55">
            Perfil
          </p>
          <p className="text-xs font-semibold text-primary-foreground/85">
            {loginSalvo?.empresa ?? "NEWSHOP"}
          </p>
        </div>
      </header>

      <main className="flex-1 p-5 space-y-4">
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-4">
            {loginSalvo?.fotoUrl ? (
              <img
                src={loginSalvo.fotoUrl}
                alt={nomePessoa}
                className="h-20 w-20 rounded-full border object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-black">
                {nomePessoa.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-black text-foreground">{nomePessoa}</h1>
              <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
                {loginSalvo?.grupoAcessoNome || loginSalvo?.role || "operador"}
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={salvandoFoto}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border bg-secondary px-3 text-xs font-bold text-foreground disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
                {salvandoFoto ? "Salvando..." : "Alterar foto"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void trocarFoto(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <InfoField label="Vendedor PDV" value={vendedorPdv} />
          <InfoField label="Login" value={loginSalvo?.login ?? "-"} />
          <InfoField label="Empresa" value={loginSalvo?.empresa ?? "-"} />
          <InfoField label="Perfil" value={(loginSalvo?.flag ?? "loja").toUpperCase()} />
          <InfoField
            label="Secao"
            value={loginSalvo?.flag === "cd" ? "Nao se aplica" : (loginSalvo?.tituloPadrao || "-")}
          />
        </section>

        {loginSalvo?.login && (
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="text-base font-black text-foreground">Senha</h2>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Senha atual"
                value={senhaAtual}
                onChange={(event) => {
                  setSenhaAtual(event.target.value);
                  setMsgSenha("");
                }}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <input
                type="password"
                placeholder="Nova senha"
                value={novaSenha}
                onChange={(event) => {
                  setNovaSenha(event.target.value);
                  setMsgSenha("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void trocarSenha();
                }}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              {msgSenha && (
                <p className="text-xs font-semibold text-muted-foreground">{msgSenha}</p>
              )}
              <button
                onClick={() => void trocarSenha()}
                disabled={trocandoSenha}
                className="h-11 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {trocandoSenha ? "Salvando..." : "Salvar nova senha"}
              </button>
            </div>
          </section>
        )}

        <button
          onClick={() => {
            fazerLogout();
            navigate("/login", { replace: true });
          }}
          className="h-11 w-full rounded-lg border border-destructive/30 bg-destructive/10 text-sm font-bold text-destructive inline-flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </main>
    </div>
  );
};

export default Perfil;

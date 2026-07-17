import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Pencil, Plus, RefreshCw, RotateCcw, Save, Shield, Trash2, Users } from "lucide-react";
import { useAuth, type Empresa, type LoginFlag, type UserRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { buscarSecoesComprasDisponiveis, getSecoesFixasPorEmpresa } from "@/lib/secoesCompras";
import {
  atualizarGrupoAcesso,
  atualizarUsuario,
  criarGrupoAcesso,
  criarUsuario,
  excluirUsuario,
  listarGruposAcesso,
  listarUsuarios,
  redefinirSenhaUsuario,
  type ActorCredenciais,
  type GrupoAcesso,
  type GrupoAcessoPayload,
  type UsuarioAdmin,
  type UsuarioFormPayload,
} from "@/lib/usuarios";
import { ACCESS_PERMISSION_GROUPS, ACCESS_PERMISSION_LABELS, contarPermissoesAtivas, type AccessPermission } from "@/lib/accessControl";

const EMPRESAS: Empresa[] = ["NEWSHOP", "SOYE", "FACIL"];
const ROLES: UserRole[] = ["operador", "compras", "admin", "super"];
const FLAGS: LoginFlag[] = ["loja", "cd"];

const emptyUserForm: UsuarioFormPayload = {
  login: "",
  nome: "",
  senha: "",
  role: "operador",
  empresas: ["NEWSHOP"],
  flagDefault: "loja",
  secoesCompras: [],
  secaoPadrao: "",
  grupoAcessoId: "",
  ativo: true,
};

const emptyGroupForm: GrupoAcessoPayload = {
  nome: "",
  descricao: "",
  permissoes: {},
  ativo: true,
};

function labelRole(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    operador: "Operador",
    compras: "Compras",
    admin: "Admin",
    super: "Super",
  };
  return labels[role];
}

export default function Usuarios() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [actorSenha, setActorSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [grupos, setGrupos] = useState<GrupoAcesso[]>([]);
  const [userForm, setUserForm] = useState<UsuarioFormPayload>(emptyUserForm);
  const [groupForm, setGroupForm] = useState<GrupoAcessoPayload>(emptyGroupForm);
  const [secaoFixa, setSecaoFixa] = useState(false);
  const [editandoUsuarioId, setEditandoUsuarioId] = useState<string | null>(null);
  const [editandoGrupoId, setEditandoGrupoId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [secoesBanco, setSecoesBanco] = useState<string[]>([]);

  const actor: ActorCredenciais | null = loginSalvo?.login ? { login: loginSalvo.login, senha: actorSenha } : null;

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const secoes = await buscarSecoesComprasDisponiveis(userForm.empresas);
        if (!cancelado) setSecoesBanco(secoes);
      } catch {
        if (!cancelado) setSecoesBanco([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [userForm.empresas]);

  const secoesDisponiveis = useMemo(() => {
    const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    const porChave = new Map<string, string>();
    const adicionar = (arr: string[]) => {
      arr.forEach((secao) => {
        const key = chave(secao);
        if (key && !porChave.has(key)) porChave.set(key, secao);
      });
    };

    if (secoesBanco.length > 0) adicionar(secoesBanco);
    else for (const empresa of userForm.empresas) adicionar(getSecoesFixasPorEmpresa(empresa));
    adicionar(userForm.secoesCompras);

    return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [secoesBanco, userForm.empresas, userForm.secoesCompras]);

  const gruposAtivos = useMemo(() => grupos.filter((grupo) => grupo.ativo || grupo.id === userForm.grupoAcessoId), [grupos, userForm.grupoAcessoId]);
  const grupoSelecionado = useMemo(() => grupos.find((grupo) => grupo.id === userForm.grupoAcessoId) ?? null, [grupos, userForm.grupoAcessoId]);

  const usuariosFiltrados = useMemo(() => {
    const busca = buscaUsuario.trim().toLowerCase();
    if (!busca) return usuarios;
    return usuarios.filter((usuario) =>
      `${usuario.nome} ${usuario.login} ${usuario.role} ${usuario.grupoAcessoNome ?? ""}`.toLowerCase().includes(busca)
    );
  }, [usuarios, buscaUsuario]);

  const gruposFiltrados = useMemo(() => {
    const busca = buscaGrupo.trim().toLowerCase();
    if (!busca) return grupos;
    return grupos.filter((grupo) => `${grupo.nome} ${grupo.descricao ?? ""}`.toLowerCase().includes(busca));
  }, [grupos, buscaGrupo]);

  async function carregarTudo(senha = actorSenha) {
    if (!loginSalvo?.login) {
      toast({ title: "Refaca o login", description: "Conta sem login salvo.", variant: "destructive" });
      return;
    }
    if (!senha.trim()) {
      toast({ title: "Informe sua senha", variant: "destructive" });
      return;
    }

    setCarregando(true);
    try {
      const [listaUsuarios, listaGrupos] = await Promise.all([
        listarUsuarios({ login: loginSalvo.login, senha }),
        listarGruposAcesso({ login: loginSalvo.login, senha }),
      ]);
      setUsuarios(listaUsuarios);
      setGrupos(listaGrupos);
      setActorSenha(senha);
      setConfirmado(true);
    } catch (err) {
      toast({
        title: "Acesso negado",
        description: err instanceof Error ? err.message : "Nao foi possivel validar sua senha.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  function limparUsuarioForm() {
    setEditandoUsuarioId(null);
    setSecaoFixa(false);
    setUserForm(emptyUserForm);
  }

  function limparGrupoForm() {
    setEditandoGrupoId(null);
    setGroupForm(emptyGroupForm);
  }

  function editarUsuario(usuario: UsuarioAdmin) {
    setEditandoUsuarioId(usuario.id);
    setUserForm({
      login: usuario.login,
      nome: usuario.nome,
      senha: "",
      role: usuario.role,
      empresas: usuario.empresas.length > 0 ? usuario.empresas : ["NEWSHOP"],
      flagDefault: usuario.flagDefault,
      secoesCompras: usuario.secoesCompras,
      secaoPadrao: usuario.secaoPadrao ?? "",
      grupoAcessoId: usuario.grupoAcessoId ?? "",
      ativo: usuario.ativo,
    });
    setSecaoFixa(Boolean(usuario.secaoPadrao?.trim()));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editarGrupo(grupo: GrupoAcesso) {
    setEditandoGrupoId(grupo.id);
    setGroupForm({
      nome: grupo.nome,
      descricao: grupo.descricao ?? "",
      permissoes: grupo.permissoes,
      ativo: grupo.ativo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleEmpresa(empresa: Empresa) {
    setUserForm((prev) => {
      const existe = prev.empresas.includes(empresa);
      const empresas = existe ? prev.empresas.filter((item) => item !== empresa) : [...prev.empresas, empresa];
      return { ...prev, empresas: empresas.length > 0 ? empresas : prev.empresas };
    });
  }

  function toggleSecao(secao: string) {
    setUserForm((prev) => ({
      ...prev,
      secoesCompras: prev.secoesCompras.includes(secao)
        ? prev.secoesCompras.filter((item) => item !== secao)
        : [...prev.secoesCompras, secao],
    }));
  }

  function togglePermissao(permissao: AccessPermission) {
    setGroupForm((prev) => ({
      ...prev,
      permissoes: {
        ...prev.permissoes,
        [permissao]: prev.permissoes[permissao] === true ? false : true,
      },
    }));
  }

  async function salvarGrupo() {
    if (!actor) return;
    if (!groupForm.nome.trim()) {
      toast({ title: "Informe o nome do grupo", variant: "destructive" });
      return;
    }

    setCarregando(true);
    try {
      if (editandoGrupoId) {
        await atualizarGrupoAcesso(actor, editandoGrupoId, groupForm);
        toast({ title: "Grupo atualizado" });
      } else {
        await criarGrupoAcesso(actor, groupForm);
        toast({ title: "Grupo criado" });
      }
      limparGrupoForm();
      await carregarTudo();
    } catch (err) {
      toast({
        title: "Falha ao salvar grupo",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  async function salvarUsuario() {
    if (!actor) return;
    if (!userForm.nome.trim() || (!editandoUsuarioId && !userForm.login.trim())) {
      toast({ title: "Preencha login e nome", variant: "destructive" });
      return;
    }
    if (!editandoUsuarioId && !userForm.senha?.trim()) {
      toast({ title: "Informe a senha inicial", variant: "destructive" });
      return;
    }
    if (userForm.empresas.length === 0) {
      toast({ title: "Selecione ao menos uma loja", variant: "destructive" });
      return;
    }
    if (secaoFixa && !userForm.secaoPadrao.trim()) {
      toast({ title: "Informe a secao fixa", variant: "destructive" });
      return;
    }

    setCarregando(true);
    try {
      if (editandoUsuarioId) {
        await atualizarUsuario(actor, editandoUsuarioId, userForm);
        toast({ title: "Usuario atualizado" });
      } else {
        await criarUsuario(actor, userForm);
        toast({ title: "Usuario criado" });
      }
      limparUsuarioForm();
      await carregarTudo();
    } catch (err) {
      toast({
        title: "Falha ao salvar usuario",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  async function redefinirSenha(id: string) {
    if (!actor) return;
    if (!novaSenha.trim()) {
      toast({ title: "Informe a nova senha", variant: "destructive" });
      return;
    }

    setCarregando(true);
    try {
      await redefinirSenhaUsuario(actor, id, novaSenha);
      setResetId(null);
      setNovaSenha("");
      toast({ title: "Senha redefinida" });
    } catch (err) {
      toast({
        title: "Falha ao redefinir",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  async function excluirConta(usuario: UsuarioAdmin) {
    if (!actor || loginSalvo?.role !== "super") return;
    if (usuario.id === loginSalvo.usuarioId) {
      toast({ title: "Sua propria conta nao pode ser excluida", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Excluir permanentemente a conta de ${usuario.nome} (${usuario.login})?`)) return;

    setExcluindoId(usuario.id);
    try {
      await excluirUsuario(actor, usuario.id);
      if (editandoUsuarioId === usuario.id) limparUsuarioForm();
      setResetId((id) => id === usuario.id ? null : id);
      setUsuarios((lista) => lista.filter((item) => item.id !== usuario.id));
      toast({ title: "Conta excluida" });
    } catch (err) {
      toast({
        title: "Falha ao excluir conta",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div style={{ maxWidth: 1380, margin: "0 auto", padding: "24px 16px 56px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <p style={monoLabelStyle}>Admin</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "hsl(var(--foreground))", margin: "4px 0 0" }}>Usuarios e grupos</h1>
          <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
            Grupo define o que a pessoa pode abrir e fazer. Role continua como base de compatibilidade.
          </p>
        </div>
        {confirmado && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatCard label="Usuarios" value={String(usuarios.length)} />
            <StatCard label="Grupos" value={String(grupos.length)} />
            <button onClick={() => carregarTudo()} disabled={carregando} style={secondaryButtonStyle}>
              <RefreshCw size={15} /> Atualizar
            </button>
          </div>
        )}
      </div>

      {!confirmado ? (
        <section style={{ maxWidth: 420, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: 18 }}>
          <label style={monoLabelStyle}>Confirme sua senha</label>
          <div style={{ position: "relative" }}>
            <input
              type={senhaVisivel ? "text" : "password"}
              value={actorSenha}
              onChange={(event) => setActorSenha(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && carregarTudo()}
              autoFocus
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button type="button" onClick={() => setSenhaVisivel((value) => !value)} style={iconGhostStyle}>
              {senhaVisivel ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button onClick={() => carregarTudo()} disabled={carregando} style={{ ...primaryButtonStyle, width: "100%", marginTop: 12, justifyContent: "center" }}>
            Validar
          </button>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 410px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ position: "sticky", top: 16, display: "grid", gap: 16 }}>
            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div>
                  <p style={monoLabelStyle}>Grupo</p>
                  <p style={panelTitleStyle}>{editandoGrupoId ? "Editar grupo" : "Novo grupo"}</p>
                </div>
                <Shield size={18} color="hsl(var(--primary))" />
              </div>

              <Field label="Nome">
                <input value={groupForm.nome} onChange={(event) => setGroupForm((prev) => ({ ...prev, nome: event.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Descricao">
                <textarea value={groupForm.descricao} onChange={(event) => setGroupForm((prev) => ({ ...prev, descricao: event.target.value }))} style={{ ...inputStyle, minHeight: 84, padding: 12, resize: "vertical" }} />
              </Field>

              <div style={{ marginTop: 14 }}>
                <Label>Permissoes do grupo</Label>
                <div style={{ display: "grid", gap: 12 }}>
                  {ACCESS_PERMISSION_GROUPS.map((grupo) => (
                    <div key={grupo.titulo} style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 12, background: "hsl(var(--secondary) / 0.55)" }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "hsl(var(--foreground))", marginBottom: 10 }}>{grupo.titulo}</p>
                      <div style={{ display: "grid", gap: 8 }}>
                        {grupo.permissoes.map((permissao) => {
                          const ativo = groupForm.permissoes[permissao] === true;
                          return (
                            <button key={permissao} type="button" onClick={() => togglePermissao(permissao)} style={toggleRowStyle}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>{ACCESS_PERMISSION_LABELS[permissao]}</span>
                              <Switch enabled={ativo} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <Chip selected={groupForm.ativo} onClick={() => setGroupForm((prev) => ({ ...prev, ativo: !prev.ativo }))}>
                  {groupForm.ativo ? "Grupo ativo" : "Grupo inativo"}
                </Chip>
                <button onClick={salvarGrupo} disabled={carregando} style={primaryButtonStyle}>
                  {editandoGrupoId ? <Save size={16} /> : <Plus size={16} />} {editandoGrupoId ? "Salvar grupo" : "Criar grupo"}
                </button>
                {editandoGrupoId && (
                  <button onClick={limparGrupoForm} style={secondaryButtonStyle}>
                    <RotateCcw size={16} /> Cancelar
                  </button>
                )}
              </div>
            </section>

            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div>
                  <p style={monoLabelStyle}>Usuario</p>
                  <p style={panelTitleStyle}>{editandoUsuarioId ? "Editar usuario" : "Novo usuario"}</p>
                </div>
                <Users size={18} color="hsl(var(--primary))" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Login">
                  <input value={userForm.login} disabled={!!editandoUsuarioId} onChange={(event) => setUserForm((prev) => ({ ...prev, login: event.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Nome">
                  <input value={userForm.nome} onChange={(event) => setUserForm((prev) => ({ ...prev, nome: event.target.value }))} style={inputStyle} />
                </Field>
                {!editandoUsuarioId && (
                  <Field label="Senha inicial">
                    <input type="password" value={userForm.senha ?? ""} onChange={(event) => setUserForm((prev) => ({ ...prev, senha: event.target.value }))} style={inputStyle} />
                  </Field>
                )}
                <Field label="Role">
                  <select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value as UserRole }))} style={inputStyle}>
                    {ROLES.map((role) => <option key={role} value={role}>{labelRole(role)}</option>)}
                  </select>
                </Field>
                <Field label="Flag">
                  <select value={userForm.flagDefault} onChange={(event) => setUserForm((prev) => ({ ...prev, flagDefault: event.target.value as LoginFlag }))} style={inputStyle}>
                    {FLAGS.map((flag) => <option key={flag} value={flag}>{flag.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label="Grupo de acesso">
                  <select value={userForm.grupoAcessoId} onChange={(event) => setUserForm((prev) => ({ ...prev, grupoAcessoId: event.target.value }))} style={inputStyle}>
                    <option value="">Sem grupo (usa role)</option>
                    {gruposAtivos.map((grupo) => <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>)}
                  </select>
                </Field>
              </div>

              {grupoSelecionado && (
                <div style={{ marginTop: 12, border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 12, background: "hsl(var(--secondary) / 0.6)" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "hsl(var(--foreground))" }}>{grupoSelecionado.nome}</p>
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                    {contarPermissoesAtivas(grupoSelecionado.permissoes)} permissao(oes) ativa(s).
                  </p>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <Label>Secao no login</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: secaoFixa ? 10 : 0 }}>
                  <Chip selected={!secaoFixa} onClick={() => { setSecaoFixa(false); setUserForm((prev) => ({ ...prev, secaoPadrao: "" })); }}>Aberta</Chip>
                  <Chip selected={secaoFixa} onClick={() => { setSecaoFixa(true); if (!userForm.secaoPadrao) setUserForm((prev) => ({ ...prev, secaoPadrao: secoesDisponiveis[0] ?? "" })); }}>Fixa</Chip>
                </div>
                {secaoFixa && (
                  <>
                    <input
                      list="usuario-secoes-fixas"
                      value={userForm.secaoPadrao}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, secaoPadrao: event.target.value }))}
                      placeholder="Ex: Utilidade"
                      style={inputStyle}
                    />
                    <datalist id="usuario-secoes-fixas">
                      {secoesDisponiveis.map((secao) => <option key={secao} value={secao} />)}
                    </datalist>
                  </>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <Label>Lojas</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {EMPRESAS.map((empresa) => (
                    <Chip key={empresa} selected={userForm.empresas.includes(empresa)} onClick={() => toggleEmpresa(empresa)}>
                      {empresa}
                    </Chip>
                  ))}
                </div>
              </div>

              {userForm.role === "compras" && (
                <div style={{ marginTop: 14 }}>
                  <Label>Secoes de compras</Label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {secoesDisponiveis.map((secao) => (
                      <Chip key={secao} selected={userForm.secoesCompras.includes(secao)} onClick={() => toggleSecao(secao)}>
                        {secao}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <Chip selected={userForm.ativo} onClick={() => setUserForm((prev) => ({ ...prev, ativo: !prev.ativo }))}>
                  {userForm.ativo ? "Ativo" : "Inativo"}
                </Chip>
                <button onClick={salvarUsuario} disabled={carregando} style={primaryButtonStyle}>
                  {editandoUsuarioId ? <Save size={16} /> : <Plus size={16} />} {editandoUsuarioId ? "Salvar usuario" : "Criar usuario"}
                </button>
                {editandoUsuarioId && (
                  <button onClick={limparUsuarioForm} style={secondaryButtonStyle}>
                    <RotateCcw size={16} /> Cancelar
                  </button>
                )}
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <p style={monoLabelStyle}>Grupos</p>
                  <p style={panelTitleStyle}>Permissoes por liga/desliga</p>
                </div>
                <input
                  value={buscaGrupo}
                  onChange={(event) => setBuscaGrupo(event.target.value)}
                  placeholder="Buscar grupo"
                  style={{ ...inputStyle, width: 220 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                {gruposFiltrados.map((grupo) => (
                  <article key={grupo.id} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: "hsl(var(--foreground))" }}>{grupo.nome}</p>
                        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>{grupo.descricao || "Sem descricao"}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: grupo.ativo ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {grupo.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      <Tag>{contarPermissoesAtivas(grupo.permissoes)} permissoes</Tag>
                      <Tag>{grupo.usuariosVinculados} usuario(s)</Tag>
                    </div>
                    <button onClick={() => editarGrupo(grupo)} style={{ ...secondaryButtonStyle, marginTop: 12 }}>
                      <Pencil size={15} /> Editar grupo
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <p style={monoLabelStyle}>Usuarios</p>
                  <p style={panelTitleStyle}>Clique para editar sem rolar a tela</p>
                </div>
                <input
                  value={buscaUsuario}
                  onChange={(event) => setBuscaUsuario(event.target.value)}
                  placeholder="Buscar usuario"
                  style={{ ...inputStyle, width: 220 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {usuariosFiltrados.map((usuario) => (
                  <article key={usuario.id} style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: "hsl(var(--foreground))" }}>{usuario.nome}</p>
                        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                          {usuario.login} · {labelRole(usuario.role)}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: usuario.ativo ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {usuario.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      {usuario.empresas.map((empresa) => <Tag key={empresa}>{empresa}</Tag>)}
                      <Tag>{usuario.flagDefault.toUpperCase()}</Tag>
                      <Tag>{usuario.secaoPadrao ? `Secao: ${usuario.secaoPadrao}` : "Secao aberta"}</Tag>
                      <Tag>{usuario.grupoAcessoNome ? `Grupo: ${usuario.grupoAcessoNome}` : "Sem grupo"}</Tag>
                      {usuario.secoesCompras.map((secao) => <Tag key={secao}>{secao}</Tag>)}
                    </div>

                    {resetId === usuario.id ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 12 }}>
                        <input type="password" value={novaSenha} onChange={(event) => setNovaSenha(event.target.value)} placeholder="Nova senha" style={inputStyle} />
                        <button onClick={() => redefinirSenha(usuario.id)} style={primaryIconButtonStyle}><Check size={16} /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button onClick={() => editarUsuario(usuario)} style={secondaryButtonStyle}><Pencil size={15} /> Editar</button>
                        <button onClick={() => { setResetId(usuario.id); setNovaSenha(""); }} style={secondaryButtonStyle}>Senha</button>
                        {loginSalvo?.role === "super" && usuario.id !== loginSalvo.usuarioId && (
                          <button
                            onClick={() => excluirConta(usuario)}
                            disabled={excluindoId === usuario.id}
                            style={dangerButtonStyle}
                          >
                            <Trash2 size={15} /> {excluindoId === usuario.id ? "Excluindo..." : "Excluir conta"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={monoLabelStyle}>{children}</label>;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      minHeight: 34,
      padding: "0 12px",
      borderRadius: 9,
      border: selected ? "1.5px solid hsl(var(--primary))" : "1.5px solid hsl(var(--border))",
      background: selected ? "hsl(var(--primary) / 0.1)" : "hsl(var(--secondary))",
      color: selected ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
    }}>
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 7, padding: "4px 7px" }}>{children}</span>;
}

function Switch({ enabled }: { enabled: boolean }) {
  return (
    <span style={{
      width: 46,
      height: 26,
      borderRadius: 999,
      background: enabled ? "hsl(var(--primary))" : "hsl(var(--muted))",
      position: "relative",
      flexShrink: 0,
      transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute",
        top: 2,
        left: enabled ? 22 : 2,
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
      }} />
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 98, padding: "10px 12px", borderRadius: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <p style={{ ...monoLabelStyle, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: "hsl(var(--foreground))" }}>{value}</p>
    </div>
  );
}

const monoLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "hsl(var(--muted-foreground))",
  display: "block",
  marginBottom: 6,
};

const panelStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 14,
  padding: 18,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "hsl(var(--foreground))",
};

const cardStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 10,
  border: "1.5px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--foreground))",
  padding: "0 12px",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 10,
  border: 0,
  background: "hsl(var(--primary))",
  color: "hsl(var(--primary-foreground))",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--foreground))",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: "1px solid hsl(var(--destructive) / 0.4)",
  background: "hsl(var(--destructive) / 0.08)",
  color: "hsl(var(--destructive))",
};

const primaryIconButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 10,
  border: 0,
  background: "hsl(var(--primary))",
  color: "hsl(var(--primary-foreground))",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const toggleRowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
};

const iconGhostStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  background: "transparent",
  border: 0,
  color: "hsl(var(--muted-foreground))",
  cursor: "pointer",
  display: "flex",
};

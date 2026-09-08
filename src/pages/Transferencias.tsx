import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowRight, Ban, Building2, ClipboardList, Repeat2 } from "lucide-react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import { useToast } from "@/hooks/use-toast";
import { loginTemFeature } from "@/lib/lojaFeatures";
import {
  lojasParceiras,
  normalizarLojaTransferencia,
  montarTituloTransferencia,
  resolverRotaTransferencia,
  rotuloLoja,
  type DirecaoTransferencia,
  type LojaTransferencia,
} from "@/lib/transferencias";

const TransferenciaScanner = lazy(() => import("@/components/TransferenciaScanner"));
const TransferenciaHistorico = lazy(() => import("@/components/TransferenciaHistorico"));

const LAZY_FALLBACK = (
  <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
);

/**
 * Transferencia entre lojas — tela PROPRIA de proposito.
 *
 * Fica fora do Scanner para ninguem mandar mercadoria para outra loja achando
 * que esta pedindo reposicao pro CD: rota separada, card separado na Home e
 * ate as listas em rascunho ficam num balde de storage proprio
 * (`useInventory` com userKey sufixado), entao nunca se misturam com as
 * listas normais.
 */
const Transferencias = () => {
  const { toast } = useToast();
  const login = obterLoginSalvo();
  const minhaLoja = normalizarLojaTransferencia(login?.empresa);
  const lojaHabilitada = loginTemFeature(login, "transferencia_loja");

  const [aba, setAba] = useState<"nova" | "acompanhar">("nova");
  const [direcao, setDirecao] = useState<DirecaoTransferencia>("enviar");
  const [parceira, setParceira] = useState<LojaTransferencia | null>(null);

  // Balde de rascunho separado do Scanner: uma transferencia em montagem
  // nunca aparece no historico de listas normais, e vice-versa.
  const usuarioKey = login?.usuarioId ?? login?.login ?? "anon";
  const { activeList, openList, addProduct, deleteProduct, updateProduct, closeList } =
    useInventory(usuarioKey + "::transferencia");

  const parceiras = useMemo(() => lojasParceiras(minhaLoja), [minhaLoja]);

  // A lista em montagem ja guarda a rota: `empresa` e a origem (quem separa) e
  // `transferenciaDestino` e quem recebe — os mesmos papeis que vao para o banco.
  const rotaAtiva = useMemo(() => {
    if (!activeList) return null;
    const origem = normalizarLojaTransferencia(activeList.empresa);
    const destino = normalizarLojaTransferencia(activeList.transferenciaDestino);
    if (!origem || !destino || origem === destino) return null;
    return { origem, destino };
  }, [activeList]);

  if (!minhaLoja || !lojaHabilitada) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <Ban className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-black text-foreground">Transferencia indisponivel</h1>
        <p className="text-sm text-muted-foreground">
          A loja {String(login?.empresa ?? "").trim() || "atual"} nao participa de transferencia entre
          lojas. Disponivel para NEWSHOP, SOYE e FACIL ATACADO.
        </p>
      </div>
    );
  }

  const abrirTransferencia = () => {
    try {
      const rota = resolverRotaTransferencia({ minhaLoja, parceira, direcao });
      const pessoa = String(login?.nomePessoa ?? "").trim();
      if (!pessoa) {
        toast({
          title: "Configure seu perfil antes",
          description: "Preencha o nome da pessoa para abrir uma transferencia.",
          variant: "destructive",
        });
        return;
      }

      openList({
        title: montarTituloTransferencia({ origem: rota.origem, destino: rota.destino, pessoa }),
        person: pessoa,
        flag: "loja",
        empresa: rota.origem,
        transferenciaDestino: rota.destino,
      });
    } catch (err) {
      toast({
        title: "Nao deu pra abrir",
        description: err instanceof Error ? err.message : "Verifique a loja escolhida.",
        variant: "destructive",
      });
    }
  };

  const encerrarRascunho = () => {
    closeList();
    setParceira(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      {/* Faixa de identidade: cor e texto diferentes do Scanner de proposito. */}
      <div className="border-b-2 border-foreground bg-foreground px-4 py-4 text-background">
        <div className="flex items-center gap-2">
          <Repeat2 className="h-5 w-5" />
          <h1 className="text-base font-black uppercase tracking-wide">Transferencia entre lojas</h1>
        </div>
        <p className="mt-1 text-[11px] opacity-80">
          Isto NAO e pedido de reposicao pro CD. Aqui uma loja separa e manda mercadoria para outra.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold">
          <Building2 className="h-3.5 w-3.5" /> Voce esta na {rotuloLoja(minhaLoja)}
        </p>
      </div>

      <div className="flex border-b border-border">
        {(
          [
            { chave: "nova" as const, texto: "Nova", Icone: Repeat2 },
            { chave: "acompanhar" as const, texto: "Acompanhar", Icone: ClipboardList },
          ]
        ).map(({ chave, texto, Icone }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold uppercase tracking-wide " +
              (aba === chave
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground")
            }
          >
            <Icone className="h-4 w-4" /> {texto}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4">
        {aba === "acompanhar" && (
          <Suspense fallback={LAZY_FALLBACK}>
            <TransferenciaHistorico minhaLoja={minhaLoja} />
          </Suspense>
        )}

        {aba === "nova" && activeList && rotaAtiva && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border-2 border-foreground bg-card p-4">
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Rota desta transferencia
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-sm font-black text-foreground">
                <span>{rotuloLoja(rotaAtiva.origem)}</span>
                <ArrowRight className="h-4 w-4" />
                <span>{rotuloLoja(rotaAtiva.destino)}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Quem separa e confere: <span className="font-bold">{rotuloLoja(rotaAtiva.origem)}</span>.
                Quem recebe: <span className="font-bold">{rotuloLoja(rotaAtiva.destino)}</span>.
              </p>
            </div>

            <Suspense fallback={LAZY_FALLBACK}>
              <TransferenciaScanner
                lista={activeList}
                origem={rotaAtiva.origem}
                destino={rotaAtiva.destino}
                onAddProduct={addProduct}
                onDeleteProduct={deleteProduct}
                onUpdateProduct={updateProduct}
                onEnviada={encerrarRascunho}
                onCancelar={() => {
                  if (window.confirm("Cancelar esta transferencia? Os itens montados serao descartados.")) {
                    encerrarRascunho();
                  }
                }}
              />
            </Suspense>
          </div>
        )}

        {aba === "nova" && !activeList && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                1. O que voce quer fazer?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setDirecao("enviar")}
                  className={
                    "rounded-xl border-2 p-4 text-left " +
                    (direcao === "enviar" ? "border-foreground bg-card" : "border-border bg-card/50")
                  }
                >
                  <p className="text-sm font-black text-foreground">Enviar para outra loja</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    A {rotuloLoja(minhaLoja)} separa e manda. A conferencia acontece aqui.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDirecao("pedir")}
                  className={
                    "rounded-xl border-2 p-4 text-left " +
                    (direcao === "pedir" ? "border-foreground bg-card" : "border-border bg-card/50")
                  }
                >
                  <p className="text-sm font-black text-foreground">Pedir para outra loja</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    A outra loja separa e manda para a {rotuloLoja(minhaLoja)}. A conferencia acontece la.
                  </p>
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                2. {direcao === "enviar" ? "Qual loja recebe?" : "Qual loja separa e manda?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {parceiras.map((loja) => (
                  <button
                    key={loja}
                    type="button"
                    onClick={() => setParceira(loja)}
                    className={
                      "rounded-lg border-2 px-4 py-2.5 text-xs font-bold " +
                      (parceira === loja
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground")
                    }
                  >
                    {rotuloLoja(loja)}
                  </button>
                ))}
              </div>
            </div>

            {parceira && (
              <div className="rounded-xl border-2 border-foreground bg-card p-4">
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Confira a rota
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-sm font-black text-foreground">
                  <span>{rotuloLoja(direcao === "enviar" ? minhaLoja : parceira)}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span>{rotuloLoja(direcao === "enviar" ? parceira : minhaLoja)}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Quem separa e confere:{" "}
                  <span className="font-bold">
                    {rotuloLoja(direcao === "enviar" ? minhaLoja : parceira)}
                  </span>
                  .
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={abrirTransferencia}
              disabled={!parceira}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-4 text-sm font-black uppercase tracking-wide text-background disabled:opacity-40"
            >
              <Repeat2 className="h-4 w-4" /> Abrir transferencia
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transferencias;

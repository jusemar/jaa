"use client";

import type { ContaAtual } from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { MensageiroTecnico } from "@/features/conversas/components/mensageiro-tecnico";
import { AreaEmpresas } from "@/features/empresas/components/area-empresas";
import { AreaMinhasEntregas } from "@/features/entregas/components/area-minhas-entregas";
import { AreaZonasEmpresa } from "@/features/entregas/components/area-zonas-empresa";
import { PainelOperacionalEmpresa } from "@/features/entregas/components/painel-operacional";
import { QuadroEntregadores } from "@/features/entregas/components/quadro-entregadores";
import { AreaSaidasEmpresa } from "@/features/entregas/components/area-saidas-empresa";
import { AreaPedidosEmpresa } from "@/features/pedidos/components/area-pedidos-empresa";
import { SeletorIdentidade } from "@/features/identidades/components/seletor-identidade";
import { useIdentidadeAtiva } from "@/features/identidades/hooks/use-identidade-ativa";
import { useConexaoRealtime } from "@/lib/realtime/use-realtime-conectado";
import { buscarContaAtual, criarIdentidadePessoal, testarRotaProtegida } from "../lib/api-conta";
import { clienteAutenticacao } from "../lib/cliente-autenticacao";
import { formatarCelularDigitado } from "../lib/formatar-celular";
import { mensagemDeErroAutenticacao } from "../lib/mensagens-erro";

// Interface TÉCNICA e TEMPORÁRIA para comprovar o fluxo de autenticação. Não é o design do Jaa.
// Toda regra (normalização, OTP, sessão, unicidade do @usuario) é imposta pela API.

type Etapa =
  | { nome: "carregando" }
  | { nome: "telefone" }
  | { nome: "codigo"; telefone: string }
  | { nome: "cadastro" }
  | { nome: "autenticado"; conta: ContaAtual };

export function FluxoAutenticacao() {
  const [etapa, setEtapa] = useState<Etapa>({ nome: "carregando" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Realtime só com sessão válida e identidade pessoal; logout (etapa volta ao telefone) desconecta.
  useConexaoRealtime(etapa.nome === "autenticado");

  function aplicarConta(conta: Awaited<ReturnType<typeof buscarContaAtual>>) {
    if (!conta.ok) {
      setEtapa({ nome: "telefone" });
      if (conta.status !== 401) setErro(conta.mensagem);
      return;
    }

    setEtapa(conta.dados.cadastroCompleto ? { nome: "autenticado", conta: conta.dados } : { nome: "cadastro" });
  }

  async function seguirConformeConta() {
    aplicarConta(await buscarContaAtual());
  }

  useEffect(() => {
    let ativo = true;
    // A API decide o estado: sem sessão (401), cadastro incompleto ou completo.
    void buscarContaAtual().then((conta) => {
      if (ativo) aplicarConta(conta);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function executar(acao: () => Promise<void>) {
    setErro(null);
    setEnviando(true);
    try {
      await acao();
    } finally {
      setEnviando(false);
    }
  }

  function solicitarCodigo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const telefone = String(new FormData(evento.currentTarget).get("telefone") ?? "");

    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.sendOtp({ phoneNumber: telefone });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      setEtapa({ nome: "codigo", telefone });
    });
  }

  function verificarCodigo(telefone: string, evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const codigo = String(new FormData(evento.currentTarget).get("codigo") ?? "");

    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.verify({ phoneNumber: telefone, code: codigo });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      await seguirConformeConta();
    });
  }

  function concluirCadastro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    void executar(async () => {
      const resultado = await criarIdentidadePessoal({
        nomeExibicao: String(dados.get("nomeExibicao") ?? ""),
        nomeUsuario: String(dados.get("nomeUsuario") ?? ""),
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      await seguirConformeConta();
    });
  }

  function sair() {
    void executar(async () => {
      const { error } = await clienteAutenticacao.signOut();
      if (error) {
        setErro("Não foi possível sair. Tente novamente.");
        return;
      }
      setEtapa({ nome: "telefone" });
    });
  }

  return (
    <section
      aria-label="Autenticação"
      className={`flex w-full flex-col gap-4 ${etapa.nome === "autenticado" ? "max-w-4xl" : "max-w-sm"}`}
    >
      <p className="text-xs uppercase tracking-wide text-amber-700">Interface técnica temporária</p>

      {etapa.nome === "carregando" && <p>Carregando…</p>}

      {etapa.nome === "telefone" && (
        <form onSubmit={solicitarCodigo} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Entrar no Jaa</h1>
          <CampoCelular />
          <Botao desabilitado={enviando}>Continuar</Botao>
        </form>
      )}

      {etapa.nome === "codigo" && (
        <form onSubmit={(evento) => verificarCodigo(etapa.telefone, evento)} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Código de verificação</h1>
          <p className="text-sm text-zinc-600">Enviado para {etapa.telefone}</p>
          <Campo rotulo="Código" nome="codigo" tipo="text" dica="000000" autoComplete="one-time-code" modoEntrada="numeric" />
          <Botao desabilitado={enviando}>Verificar</Botao>
          <button type="button" className="text-sm underline" onClick={() => setEtapa({ nome: "telefone" })}>
            Trocar número
          </button>
        </form>
      )}

      {etapa.nome === "cadastro" && (
        <form onSubmit={concluirCadastro} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Complete seu cadastro</h1>
          <Campo rotulo="Nome" nome="nomeExibicao" tipo="text" dica="Seu nome" autoComplete="name" />
          <Campo rotulo="@usuario" nome="nomeUsuario" tipo="text" dica="junior" autoComplete="username" />
          <Botao desabilitado={enviando}>Concluir cadastro</Botao>
          <button type="button" className="text-sm underline" onClick={sair}>
            Sair
          </button>
        </form>
      )}

      {etapa.nome === "autenticado" && <PainelAutenticado conta={etapa.conta} aoSair={sair} saindo={enviando} />}

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}

function PainelAutenticado({ conta, aoSair, saindo }: { conta: ContaAtual; aoSair: () => void; saindo: boolean }) {
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);

  async function testar() {
    const resultado = await testarRotaProtegida();
    setResultadoTeste(resultado.ok ? "Rota protegida: 200 OK (sessão válida)" : `Rota protegida: ${resultado.status}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Autenticado</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500">Nome</dt>
        <dd>{conta.identidadePessoal?.nomeExibicao}</dd>
        <dt className="text-zinc-500">Usuário</dt>
        <dd>@{conta.identidadePessoal?.nomeUsuario}</dd>
        <dt className="text-zinc-500">Telefone</dt>
        <dd>{conta.telefoneMascarado}</dd>
      </dl>
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void testar()}>
        Testar rota protegida
      </button>
      {resultadoTeste && <p role="status">{resultadoTeste}</p>}
      <Botao desabilitado={saindo} aoClicar={aoSair} tipo="button">
        Sair
      </Botao>
      {conta.identidadePessoal && <AreaIdentidadesEEmpresas identidadePessoalId={conta.identidadePessoal.id} />}
    </div>
  );
}

// Nesta fase o Jaa atende somente celulares brasileiros: o usuário digita DDD + número,
// sem DDI. A API assume +55, valida e armazena em E.164.
function CampoCelular() {
  const [valor, setValor] = useState("");

  return (
    <label className="flex flex-col gap-1 text-sm">
      Celular
      <input
        name="telefone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(31) 98765-4321"
        maxLength={15}
        required
        value={valor}
        onChange={(evento) => setValor(formatarCelularDigitado(evento.target.value))}
        className="rounded border border-zinc-300 px-3 py-2 text-base"
      />
    </label>
  );
}

function Campo(props: {
  rotulo: string;
  nome: string;
  tipo: "tel" | "text";
  dica: string;
  autoComplete: string;
  modoEntrada?: "numeric";
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {props.rotulo}
      <input
        name={props.nome}
        type={props.tipo}
        placeholder={props.dica}
        autoComplete={props.autoComplete}
        inputMode={props.modoEntrada}
        required
        className="rounded border border-zinc-300 px-3 py-2 text-base"
      />
    </label>
  );
}

function Botao(props: {
  children: string;
  desabilitado: boolean;
  tipo?: "submit" | "button";
  aoClicar?: () => void;
}) {
  return (
    <button
      type={props.tipo ?? "submit"}
      disabled={props.desabilitado}
      onClick={props.aoClicar}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
    >
      {props.desabilitado ? "Aguarde…" : props.children}
    </button>
  );
}

function AreaIdentidadesEEmpresas({ identidadePessoalId }: { identidadePessoalId: string }) {
  const identidades = useIdentidadeAtiva(identidadePessoalId);

  return (
    <>
      <SeletorIdentidade
        operaveis={identidades.operaveis}
        ativa={identidades.ativa}
        erro={identidades.erro}
        aoSelecionar={(identidadeId) => void identidades.selecionar(identidadeId)}
      />
      <AreaEmpresas aoEmpresaCriada={() => void identidades.recarregar()} />
      {identidades.ativa?.tipo === "empresarial" && (
        // Operação comercial acontece agindo COMO a empresa; a API autoriza cada chamada pelo vínculo.
        <>
          <AreaPedidosEmpresa key={identidades.ativa.empresa.id} empresaId={identidades.ativa.empresa.id} nomeEmpresa={identidades.ativa.nomeExibicao} />
          <AreaSaidasEmpresa key={`saidas-${identidades.ativa.empresa.id}`} empresaId={identidades.ativa.empresa.id} nomeEmpresa={identidades.ativa.nomeExibicao} />
          <QuadroEntregadores key={`entregadores-${identidades.ativa.empresa.id}`} empresaId={identidades.ativa.empresa.id} nomeEmpresa={identidades.ativa.nomeExibicao} />
          <PainelOperacionalEmpresa key={`operacao-${identidades.ativa.empresa.id}`} empresaId={identidades.ativa.empresa.id} nomeEmpresa={identidades.ativa.nomeExibicao} />
          <AreaZonasEmpresa key={`zonas-${identidades.ativa.empresa.id}`} empresaId={identidades.ativa.empresa.id} nomeEmpresa={identidades.ativa.nomeExibicao} />
        </>
      )}
      {/* Área do ENTREGADOR: é da pessoa, nunca da empresa — e só aparece para quem tem entrega ou convite. */}
      <AreaMinhasEntregas />
      {identidades.ativa && (
        // O mensageiro opera como a identidade ATIVA (autorizada pela API em cada chamada).
        // `key`: trocar de identidade recomeça inbox, conversa aberta, confirmações e avisos do zero.
        <MensageiroTecnico key={identidades.ativa.identidadeId} identidadeId={identidades.ativa.identidadeId} tipoIdentidade={identidades.ativa.tipo} />
      )}
    </>
  );
}

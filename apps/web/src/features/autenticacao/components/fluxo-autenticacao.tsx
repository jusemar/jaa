"use client";

import Image from "next/image";
import {
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  type ContaAtual,
} from "@jaa/contratos";
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { AppJaa } from "@/components/navegacao/app-jaa";
import { Aviso, Botao, CampoTexto, Cartao } from "@/components/ui/primitivos";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";
import { useConexaoRealtime } from "@/lib/realtime/use-realtime-conectado";
import {
  buscarContaAtual,
  criarIdentidadePessoal,
  definirSenhaInicial,
  entrarComSenha,
} from "../lib/api-conta";
import { clienteAutenticacao } from "../lib/cliente-autenticacao";
import { formatarCelularDigitado } from "../lib/formatar-celular";
import { mensagemDeErroAutenticacao } from "../lib/mensagens-erro";
import { EXEMPLOS_ENTRADA, TEXTOS_ENTRADA, fraseDoDestino } from "../lib/textos-entrada";

/*
 * ENTRADA NO JAA.
 *
 * Duas perguntas respondidas logo na primeira tela: JÁ TENHO CONTA (celular ou @usuario + senha — o
 * que a pessoa faz todo dia) e SOU NOVO (criar conta com o celular). O código recebido no celular é
 * o CADASTRO de quem é novo e também a entrada sem senha de quem esqueceu a sua; os textos
 * (`textos-entrada.ts`) só prometem isso.
 *
 * Nenhuma regra mora aqui: normalização do telefone, OTP, senha, sessão e unicidade do @usuario são
 * do servidor.
 */

type Etapa =
  | { nome: "carregando" }
  | { nome: "entrar" }
  // `motivo` só muda os textos: o código é o mesmo para criar a conta e para entrar sem senha.
  | { nome: "telefone"; motivo: "criar" | "codigo" }
  | { nome: "codigo"; telefone: string; motivo: "criar" | "codigo" }
  | { nome: "cadastro" }
  | { nome: "autenticado"; conta: ContaAtual };

export function FluxoAutenticacao({
  destino,
  moldura,
  iniciarCadastro = false,
  aoSairParaPaginaPublica,
}: {
  iniciarCadastro?: boolean;
  aoSairParaPaginaPublica?: () => void;
  /*
   * Para onde a pessoa vai DEPOIS de entrar ou se cadastrar (Link do Jaa). Fica só na memória desta
   * página — o endereço `/@usuario` continua o mesmo durante todo o login —, então não existe
   * parâmetro de "voltar para" que alguém possa apontar para fora do Jaa.
   */
  destino?: DestinoDoLink | undefined;
  /*
   * Página em volta da entrada enquanto NÃO há sessão (ex.: a página pública do link, com a identidade
   * e o cardápio). Recebe a entrada pronta — os mesmos formulários, sem etapa intermediária — e uma
   * ação para trazê-la à vista. Sem moldura, a entrada é a tela inteira, como sempre.
   */
  moldura?: ((partes: { entrada: ReactNode; focarEntrada: () => void }) => ReactNode) | undefined;
} = {}) {
  const [etapa, setEtapa] = useState<Etapa>({ nome: "carregando" });
  const idEntrada = useId();
  // Tentou algo que exige conta (adicionar produto, conversar): a entrada vem à vista com o foco no campo.
  function focarEntrada() {
    const secao = document.getElementById(idEntrada);
    if (!secao) return;
    secao.scrollIntoView({ behavior: "smooth", block: "start" });
    secao.querySelector<HTMLInputElement>("input:not([disabled])")?.focus({ preventScroll: true });
  }
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Realtime só com sessão válida e identidade pessoal; sair volta à entrada e desconecta.
  useConexaoRealtime(etapa.nome === "autenticado");

  const aplicarConta = useCallback((conta: Awaited<ReturnType<typeof buscarContaAtual>>) => {
    if (!conta.ok) {
      setEtapa(iniciarCadastro ? { nome: "telefone", motivo: "criar" } : { nome: "entrar" });
      if (conta.status !== 401) setErro(conta.mensagem);
      return;
    }
    setEtapa(
      conta.dados.cadastroCompleto
        ? { nome: "autenticado", conta: conta.dados }
        : { nome: "cadastro" },
    );
  }, [iniciarCadastro]);

  async function seguirConformeConta() {
    aplicarConta(await buscarContaAtual());
  }

  useEffect(() => {
    let ativo = true;
    void buscarContaAtual().then((conta) => {
      if (ativo) aplicarConta(conta);
    });
    return () => {
      ativo = false;
    };
  }, [aplicarConta]);

  // Trocar de etapa por escolha da pessoa limpa o erro da etapa anterior.
  function irPara(proxima: Etapa) {
    setErro(null);
    setEtapa(proxima);
  }

  async function executar(acao: () => Promise<void>) {
    setErro(null);
    setEnviando(true);
    try {
      await acao();
    } finally {
      setEnviando(false);
    }
  }

  function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    void executar(async () => {
      const resultado = await entrarComSenha(
        String(dados.get("identificador") ?? ""),
        String(dados.get("senha") ?? ""),
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      await seguirConformeConta();
    });
  }

  function solicitarCodigo(motivo: "criar" | "codigo", evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const telefone = String(
      new FormData(evento.currentTarget).get("telefone") ?? "",
    );
    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.sendOtp({
        phoneNumber: telefone,
      });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      setEtapa({ nome: "codigo", telefone, motivo });
    });
  }

  function verificarCodigo(
    telefone: string,
    evento: FormEvent<HTMLFormElement>,
  ) {
    evento.preventDefault();
    const codigo = String(
      new FormData(evento.currentTarget).get("codigo") ?? "",
    );
    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.verify({
        phoneNumber: telefone,
        code: codigo,
      });
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
      const senha = String(dados.get("senha") ?? "");
      if (senha !== String(dados.get("confirmarSenha") ?? "")) {
        setErro("As senhas não coincidem.");
        return;
      }

      const resultado = await criarIdentidadePessoal({
        nomeExibicao: String(dados.get("nomeExibicao") ?? ""),
        nomeUsuario: String(dados.get("nomeUsuario") ?? ""),
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }

      // A identidade vem primeiro: um @usuario indisponível não pode deixar senha gravada em uma
      // conta ainda incompleta. Se a resposta se perdeu depois de gravar a senha, repetir o envio é
      // seguro: o servidor informa que ela já estava definida e o cadastro pode seguir.
      const senhaDefinida = await definirSenhaInicial(senha);
      if (!senhaDefinida.ok && senhaDefinida.codigo !== "SENHA_JA_DEFINIDA") {
        setErro(senhaDefinida.mensagem);
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
      setEtapa({ nome: "entrar" });
      aoSairParaPaginaPublica?.();
    });
  }

  if (etapa.nome === "autenticado") {
    return <AppJaa conta={etapa.conta} aoSair={sair} saindo={enviando} destinoInicial={destino} />;
  }

  const entrada = (
    <section id={idEntrada} aria-label="Entrar no Jaaa" data-entrada-jaa className="flex w-full scroll-mt-4 flex-col gap-4">
      {destino && etapa.nome !== "carregando" && (
        <p data-destino-apos-entrar className="text-center text-sm text-conteudo-suave">
          {fraseDoDestino(destino.nomeExibicao ?? `@${destino.nomeUsuario}`)}
        </p>
      )}

      {etapa.nome === "carregando" && <p className="text-center text-sm text-conteudo-suave">Carregando…</p>}

      {etapa.nome === "entrar" && (
        <>
          <Cartao className="p-5">
            <form onSubmit={entrar} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.entrar.titulo}</h2>
              <CampoTexto id="entrar-identificador" rotulo="Celular ou @usuario" name="identificador" required autoComplete="username" placeholder={EXEMPLOS_ENTRADA.identificador} />
              <CampoTexto id="entrar-senha" rotulo="Senha" name="senha" type="password" required autoComplete="current-password" />
              <Botao type="submit" disabled={enviando} larguraTotal>
                {enviando ? "Entrando…" : TEXTOS_ENTRADA.entrar.acao}
              </Botao>
              <Botao type="button" aparencia="discreto" data-entrar-com-codigo onClick={() => irPara({ nome: "telefone", motivo: "codigo" })}>
                {TEXTOS_ENTRADA.entrar.semSenha}
              </Botao>
            </form>
          </Cartao>

          {/* Quem é novo não precisa adivinhar: um bloco próprio, com a ação de criar conta. */}
          <Cartao className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.novo.titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.novo.descricao}</p>
            <Botao type="button" aparencia="secundario" data-criar-conta larguraTotal onClick={() => irPara({ nome: "telefone", motivo: "criar" })}>
              {TEXTOS_ENTRADA.novo.acao}
            </Botao>
          </Cartao>
        </>
      )}

      {etapa.nome === "telefone" && (
        <Cartao className="p-5">
          <form onSubmit={(evento) => solicitarCodigo(etapa.motivo, evento)} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.celular[etapa.motivo].titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.celular[etapa.motivo].descricao}</p>
            <CampoCelular />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Enviando…" : TEXTOS_ENTRADA.celular.acao}
            </Botao>
            {TEXTOS_ENTRADA.celular[etapa.motivo].observacao && <p className="text-center text-xs text-conteudo-suave">{TEXTOS_ENTRADA.celular[etapa.motivo].observacao}</p>}
            <Botao type="button" aparencia="discreto" onClick={() => irPara({ nome: "entrar" })}>
              Voltar
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "codigo" && (
        <Cartao className="p-5">
          <form onSubmit={(evento) => verificarCodigo(etapa.telefone, evento)} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.codigo.titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.codigo.descricao(etapa.telefone)}</p>
            <CampoTexto id="codigo-otp" rotulo="Código" name="codigo" required placeholder={EXEMPLOS_ENTRADA.codigo} autoComplete="one-time-code" inputMode="numeric" />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Verificando…" : TEXTOS_ENTRADA.codigo.acao}
            </Botao>
            <Botao type="button" aparencia="discreto" onClick={() => irPara({ nome: "telefone", motivo: etapa.motivo })}>
              {TEXTOS_ENTRADA.codigo.trocar}
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "cadastro" && (
        <Cartao className="p-5">
          <form onSubmit={concluirCadastro} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.cadastro.titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.cadastro.descricao}</p>
            <CampoTexto id="cadastro-nome" rotulo="Nome" name="nomeExibicao" required placeholder={EXEMPLOS_ENTRADA.nome} autoComplete="name" />
            <CampoTexto
              id="cadastro-usuario"
              rotulo="@usuario"
              name="nomeUsuario"
              required
              placeholder={EXEMPLOS_ENTRADA.usuario}
              autoComplete="username"
              dica="É assim que as pessoas encontram você no Jaaa."
            />
            <CampoTexto
              id="cadastro-senha"
              rotulo="Senha"
              name="senha"
              type="password"
              required
              minLength={SENHA_TAMANHO_MINIMO}
              maxLength={SENHA_TAMANHO_MAXIMO}
              autoComplete="new-password"
              dica={`Use pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`}
            />
            <CampoTexto
              id="cadastro-confirmar-senha"
              rotulo="Confirmar senha"
              name="confirmarSenha"
              type="password"
              required
              minLength={SENHA_TAMANHO_MINIMO}
              maxLength={SENHA_TAMANHO_MAXIMO}
              autoComplete="new-password"
            />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {TEXTOS_ENTRADA.cadastro.acao}
            </Botao>
            <Botao type="button" aparencia="discreto" onClick={sair}>
              Sair
            </Botao>
          </form>
        </Cartao>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </section>
  );

  if (moldura) return <>{moldura({ entrada, focarEntrada })}</>;

  return (
    /*
     * `items-start` + margem automática no bloco: centraliza quando sobra altura e, quando NÃO sobra
     * (celular baixo, teclado aberto), o conteúdo começa no topo e rola — nada fica cortado acima.
     */
    <main className="flex min-h-dvh items-start justify-center bg-fundo px-4 py-10">
      <div className="my-auto flex w-full max-w-sm flex-col gap-4">
        {/* A logo do Jaaa (o mesmo arquivo do app), com a proporção original e largura limitada. */}
        <h1 className="flex justify-center pb-1">
          <Image src="/jaaa-logo-login.png" alt="Jaaa" width={1020} height={275} priority className="h-auto w-56 max-w-[70%] sm:w-64" />
        </h1>
        {entrada}
      </div>
    </main>
  );
}

// Nesta fase o Jaa atende somente celulares brasileiros: a pessoa digita DDD + número, sem DDI.
// A API assume +55, valida e armazena em E.164.
function CampoCelular() {
  const [valor, setValor] = useState("");

  return (
    <CampoTexto
      id="celular"
      rotulo="Celular"
      name="telefone"
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder={EXEMPLOS_ENTRADA.celular}
      maxLength={15}
      required
      value={valor}
      onChange={(evento) =>
        setValor(formatarCelularDigitado(evento.target.value))
      }
    />
  );
}

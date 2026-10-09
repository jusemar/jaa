"use client";

import Image from "next/image";
import {
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  TAMANHO_PIN,
  somenteDigitosDoPin,
  type ContaAtual,
} from "@jaa/contratos";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AppJaa } from "@/components/navegacao/app-jaa";
import { Aviso, Botao, CampoTexto, Cartao } from "@/components/ui/primitivos";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";
import { useConexaoRealtime } from "@/lib/realtime/use-realtime-conectado";
import {
  buscarContaAtual,
  buscarMetodosDeEntrada,
  criarIdentidadePessoal,
  definirSenhaInicial,
  entrarComSenha,
} from "../lib/api-conta";
import { buscarSituacaoPin, criarPin, entrarComPin, removerPin } from "../lib/api-pin";
import { clienteAutenticacao } from "../lib/cliente-autenticacao";
import { formatarCelularDigitado } from "../lib/formatar-celular";
import { mensagemDeErroAutenticacao } from "../lib/mensagens-erro";
import { EXEMPLOS_ENTRADA, TEXTOS_ENTRADA, fraseDoDestino } from "../lib/textos-entrada";

/*
 * ENTRADA NO JAA.
 *
 * A MESMA lógica do aplicativo, adaptada ao navegador (sem biometria). PRIMEIRA TELA limpa: Usuário,
 * Senha, [Entrar], "ou", [Entrar com código] e [Criar conta]. As duas ações secundárias abrem UMA
 * etapa de escolha do canal (SMS/Celular ou E-mail) e seguem pelos mesmos fluxos de código: o código,
 * recebido no canal escolhido, CRIA a conta de quem é novo e também ENTRA na de quem já tem; os
 * textos (`textos-entrada.ts`) só prometem isso.
 *
 * Nenhuma regra mora aqui: normalização do telefone e do e-mail, código, senha, sessão e unicidade
 * do @usuario são do servidor — inclusive QUAIS canais existem (`/autenticacao/metodos`).
 *
 * PIN DO DISPOSITIVO: num navegador que a pessoa já autorizou, a primeira tela é "Entrar com PIN",
 * com "Usar SMS ou e-mail" sempre à vista. CRIAR o PIN só é oferecido logo depois de entrar com o
 * CÓDIGO (SMS ou e-mail) e só se este navegador ainda não tiver um — nunca depois de entrar só com a
 * senha (o servidor também recusaria). Quem diz se este navegador está autorizado é o servidor
 * (`api-pin.ts`).
 */

type Etapa =
  | { nome: "carregando" }
  | { nome: "entrar" }
  // "Entrar com código" / "Criar conta": onde a pessoa quer receber o código.
  | { nome: "canal"; motivo: "criar" | "codigo" }
  // `motivo` só muda os textos: o código é o mesmo para criar a conta e para entrar sem senha.
  | { nome: "telefone"; motivo: "criar" | "codigo" }
  | { nome: "email"; motivo: "criar" | "codigo" }
  // `destino` é o que a pessoa digitou (celular ou e-mail), só para a frase e para confirmar o código.
  | { nome: "codigo"; canal: "telefone" | "email"; destino: string; motivo: "criar" | "codigo" }
  | { nome: "cadastro" }
  // Dispositivo já autorizado e sem sessão: entra com o PIN, sem novo código.
  | { nome: "pin" }
  // Acabou de entrar com o código: pode autorizar este dispositivo (a conta já está pronta para abrir).
  | { nome: "criar-pin"; conta: ContaAtual }
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
  // O e-mail só aparece como opção quando o servidor diz que o tem ligado; na dúvida, só o telefone.
  const [emailDisponivel, setEmailDisponivel] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarMetodosDeEntrada().then((metodos) => {
      if (ativo && metodos.ok) setEmailDisponivel(metodos.dados.email);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Realtime só com sessão válida e identidade pessoal; sair volta à entrada e desconecta.
  useConexaoRealtime(etapa.nome === "autenticado");

  // Este navegador tem PIN? (decisão do servidor, pelo cookie protegido que só ele lê)
  const [pinDisponivel, setPinDisponivel] = useState(false);
  // Entrou pelo CÓDIGO nesta visita: é o momento em que o servidor aceita criar o PIN.
  const oferecerPin = useRef(false);

  // O mesmo valor de `pinDisponivel`, legível de dentro de `aplicarConta` sem recriá-la.
  const navegadorComPin = useRef(false);

  const aplicarConta = useCallback((conta: Awaited<ReturnType<typeof buscarContaAtual>>, comPin = false) => {
    if (!conta.ok) {
      setEtapa(iniciarCadastro ? { nome: "canal", motivo: "criar" } : comPin ? { nome: "pin" } : { nome: "entrar" });
      if (conta.status !== 401) setErro(conta.mensagem);
      return;
    }
    if (!conta.dados.cadastroCompleto) {
      setEtapa({ nome: "cadastro" });
      return;
    }
    // Entrou pelo código E este navegador ainda não tem PIN: é a hora de oferecer.
    const criarAgora = oferecerPin.current && !navegadorComPin.current;
    oferecerPin.current = false;
    setEtapa(criarAgora ? { nome: "criar-pin", conta: conta.dados } : { nome: "autenticado", conta: conta.dados });
  }, [iniciarCadastro]);

  async function seguirConformeConta() {
    aplicarConta(await buscarContaAtual());
  }

  useEffect(() => {
    let ativo = true;
    void buscarContaAtual().then(async (conta) => {
      // Sem sessão: antes de mostrar a entrada, saber se este navegador pode entrar com PIN.
      const comPin = conta.ok ? false : await buscarSituacaoPin();
      if (!ativo) return;
      definirPinDisponivel(comPin);
      aplicarConta(conta, comPin);
    });
    return () => {
      ativo = false;
    };
  }, [aplicarConta]);

  function definirPinDisponivel(disponivel: boolean) {
    navegadorComPin.current = disponivel;
    setPinDisponivel(disponivel);
  }

  /**
   * "Entrar com código" / "Criar conta": a pessoa escolhe onde receber o código. Com um canal só
   * (e-mail desligado no servidor) não há o que escolher, e a tela vai direto ao celular.
   */
  function comecarComCodigo(motivo: "criar" | "codigo") {
    irPara(emailDisponivel ? { nome: "canal", motivo } : { nome: "telefone", motivo });
  }

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
      setEtapa({ nome: "codigo", canal: "telefone", destino: telefone, motivo });
    });
  }

  function solicitarCodigoPorEmail(motivo: "criar" | "codigo", evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const email = String(new FormData(evento.currentTarget).get("email") ?? "").trim();
    void executar(async () => {
      // O mesmo pedido serve para criar a conta e para entrar: a resposta não diz qual dos dois é.
      const { error } = await clienteAutenticacao.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      setEtapa({ nome: "codigo", canal: "email", destino: email, motivo });
    });
  }

  function verificarCodigo(
    canal: "telefone" | "email",
    destino: string,
    evento: FormEvent<HTMLFormElement>,
  ) {
    evento.preventDefault();
    const codigo = String(
      new FormData(evento.currentTarget).get("codigo") ?? "",
    ).trim();
    void executar(async () => {
      const { error } =
        canal === "email"
          ? await clienteAutenticacao.signIn.emailOtp({ email: destino, otp: codigo })
          : await clienteAutenticacao.phoneNumber.verify({ phoneNumber: destino, code: codigo });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      // Identidade comprovada pelo código: ao abrir a conta, a tela oferece criar o PIN.
      oferecerPin.current = true;
      await seguirConformeConta();
    });
  }

  function entrarPeloPin(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const pin = String(new FormData(formulario).get("pin") ?? "");
    void executar(async () => {
      const resultado = await entrarComPin(pin);
      // O PIN não fica no campo depois de usado, tenha dado certo ou não.
      formulario.reset();
      if (resultado.ok) {
        await seguirConformeConta();
        return;
      }
      setErro(resultado.mensagem);
      // Depois de erros demais o servidor encerra a autorização: sem PIN, a entrada volta a ser o código.
      if (!resultado.bloqueado && !(await buscarSituacaoPin())) {
        definirPinDisponivel(false);
        setEtapa({ nome: "entrar" });
      }
    });
  }

  function criarPinDoDispositivo(conta: ContaAtual, evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const [pin, confirmacao] = [String(dados.get("pin") ?? ""), String(dados.get("confirmarPin") ?? "")];
    void executar(async () => {
      if (pin !== confirmacao) {
        setErro(TEXTOS_ENTRADA.pin.diferentes);
        return;
      }
      const resultado = await criarPin(pin, confirmacao);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      definirPinDisponivel(true);
      setEtapa({ nome: "autenticado", conta });
    });
  }

  function deixarDeUsarPin() {
    void executar(async () => {
      await removerPin();
      definirPinDisponivel(false);
      setEtapa({ nome: "entrar" });
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
      // Sair encerra a sessão; o PIN deste dispositivo continua valendo para a próxima entrada.
      setEtapa(pinDisponivel ? { nome: "pin" } : { nome: "entrar" });
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

      {etapa.nome === "pin" && (
        <Cartao className="p-5">
          <form onSubmit={entrarPeloPin} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.pin.entrar.titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.pin.entrar.descricao}</p>
            <CampoPin id="pin-entrar" rotulo={TEXTOS_ENTRADA.pin.campo} name="pin" />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Entrando…" : TEXTOS_ENTRADA.pin.entrar.acao}
            </Botao>
            <Botao type="button" aparencia="secundario" data-usar-codigo larguraTotal disabled={enviando} onClick={() => irPara({ nome: "entrar" })}>
              {TEXTOS_ENTRADA.pin.entrar.usarCodigo}
            </Botao>
            <Botao type="button" aparencia="discreto" data-remover-pin disabled={enviando} onClick={deixarDeUsarPin}>
              {TEXTOS_ENTRADA.pin.entrar.remover}
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "criar-pin" && (
        <Cartao className="p-5">
          <form onSubmit={(evento) => criarPinDoDispositivo(etapa.conta, evento)} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.pin.criar.titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.pin.criar.descricao}</p>
            <CampoPin id="pin-criar" rotulo={TEXTOS_ENTRADA.pin.campo} name="pin" novo />
            <CampoPin id="pin-confirmar" rotulo={TEXTOS_ENTRADA.pin.confirmar} name="confirmarPin" novo />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {TEXTOS_ENTRADA.pin.criar.acao}
            </Botao>
            <Botao type="button" aparencia="discreto" data-pin-agora-nao disabled={enviando} onClick={() => irPara({ nome: "autenticado", conta: etapa.conta })}>
              {TEXTOS_ENTRADA.pin.criar.agoraNao}
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "entrar" && (
        <Cartao className="p-5">
          {/* Sem título e sem frase: os campos e as três ações bastam. */}
          <form onSubmit={entrar} aria-label={TEXTOS_ENTRADA.entrar.acao} className="flex flex-col gap-4">
            <CampoTexto id="entrar-identificador" rotulo={TEXTOS_ENTRADA.entrar.identificador} name="identificador" required autoComplete="username" autoCapitalize="none" placeholder={EXEMPLOS_ENTRADA.identificador} />
            <CampoTexto id="entrar-senha" rotulo={TEXTOS_ENTRADA.entrar.senha} name="senha" type="password" required autoComplete="current-password" />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Entrando…" : TEXTOS_ENTRADA.entrar.acao}
            </Botao>
            <div aria-hidden className="flex items-center gap-3 text-xs text-conteudo-suave">
              <span className="h-px flex-1 bg-borda" />
              {TEXTOS_ENTRADA.entrar.ou}
              <span className="h-px flex-1 bg-borda" />
            </div>
            <Botao type="button" aparencia="secundario" data-entrar-com-codigo larguraTotal disabled={enviando} onClick={() => comecarComCodigo("codigo")}>
              {TEXTOS_ENTRADA.entrar.comCodigo}
            </Botao>
            <Botao type="button" aparencia="secundario" data-criar-conta larguraTotal disabled={enviando} onClick={() => comecarComCodigo("criar")}>
              {TEXTOS_ENTRADA.entrar.criarConta}
            </Botao>
            {/* Só em navegador já autorizado, para quem veio de "Usar SMS ou e-mail": o caminho de volta. */}
            {pinDisponivel && (
              <Botao type="button" aparencia="discreto" data-entrar-com-pin disabled={enviando} onClick={() => irPara({ nome: "pin" })}>
                {TEXTOS_ENTRADA.pin.entrar.atalho}
              </Botao>
            )}
          </form>
        </Cartao>
      )}

      {etapa.nome === "canal" && (
        <Cartao className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.canal[etapa.motivo].titulo}</h2>
          <Botao type="button" aparencia="secundario" data-canal-telefone larguraTotal onClick={() => irPara({ nome: "telefone", motivo: etapa.motivo })}>
            {TEXTOS_ENTRADA.canal[etapa.motivo].telefone}
          </Botao>
          {emailDisponivel && (
            <Botao type="button" aparencia="secundario" data-canal-email larguraTotal onClick={() => irPara({ nome: "email", motivo: etapa.motivo })}>
              {TEXTOS_ENTRADA.canal.email}
            </Botao>
          )}
          <Botao type="button" aparencia="discreto" data-canal-voltar onClick={() => irPara({ nome: "entrar" })}>
            {TEXTOS_ENTRADA.canal.voltar}
          </Botao>
        </Cartao>
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
            {emailDisponivel && (
              <Botao type="button" aparencia="discreto" data-usar-email onClick={() => irPara({ nome: "email", motivo: etapa.motivo })}>
                {TEXTOS_ENTRADA.celular.trocarCanal}
              </Botao>
            )}
            <Botao type="button" aparencia="discreto" onClick={() => irPara({ nome: "entrar" })}>
              Voltar
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "email" && (
        <Cartao className="p-5">
          <form onSubmit={(evento) => solicitarCodigoPorEmail(etapa.motivo, evento)} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.email[etapa.motivo].titulo}</h2>
            <p className="text-sm text-conteudo-suave">{TEXTOS_ENTRADA.email[etapa.motivo].descricao}</p>
            <CampoTexto id="email" rotulo="E-mail" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required placeholder={EXEMPLOS_ENTRADA.email} />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Enviando…" : TEXTOS_ENTRADA.email.acao}
            </Botao>
            {TEXTOS_ENTRADA.email[etapa.motivo].observacao && <p className="text-center text-xs text-conteudo-suave">{TEXTOS_ENTRADA.email[etapa.motivo].observacao}</p>}
            <Botao type="button" aparencia="discreto" data-usar-telefone onClick={() => irPara({ nome: "telefone", motivo: etapa.motivo })}>
              {TEXTOS_ENTRADA.email.trocarCanal}
            </Botao>
            <Botao type="button" aparencia="discreto" onClick={() => irPara({ nome: "entrar" })}>
              Voltar
            </Botao>
          </form>
        </Cartao>
      )}

      {etapa.nome === "codigo" && (
        <Cartao className="p-5">
          <form onSubmit={(evento) => verificarCodigo(etapa.canal, etapa.destino, evento)} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{TEXTOS_ENTRADA.codigo.titulo}</h2>
            <p className="text-sm text-conteudo-suave">
              {TEXTOS_ENTRADA.codigo.descricao(etapa.destino)} {TEXTOS_ENTRADA.codigo.validade}
            </p>
            <CampoTexto id="codigo-otp" rotulo="Código" name="codigo" required placeholder={EXEMPLOS_ENTRADA.codigo} autoComplete="one-time-code" inputMode="numeric" />
            <Botao type="submit" disabled={enviando} larguraTotal>
              {enviando ? "Verificando…" : TEXTOS_ENTRADA.codigo.acao}
            </Botao>
            <Botao type="button" aparencia="discreto" onClick={() => irPara({ nome: etapa.canal, motivo: etapa.motivo })}>
              {TEXTOS_ENTRADA.codigo.trocar[etapa.canal]}
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

// PIN: só números, exatamente 6, oculto na tela. O valor fica no campo — nunca em estado guardado,
// armazenamento do navegador ou log.
function CampoPin({ id, rotulo, name, novo = false }: { id: string; rotulo: string; name: string; novo?: boolean }) {
  const [valor, setValor] = useState("");

  return (
    <CampoTexto
      id={id}
      rotulo={rotulo}
      name={name}
      type="password"
      inputMode="numeric"
      pattern={`[0-9]{${TAMANHO_PIN}}`}
      minLength={TAMANHO_PIN}
      maxLength={TAMANHO_PIN}
      autoComplete={novo ? "new-password" : "off"}
      placeholder={EXEMPLOS_ENTRADA.pin}
      required
      value={valor}
      onChange={(evento) => setValor(somenteDigitosDoPin(evento.target.value))}
    />
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

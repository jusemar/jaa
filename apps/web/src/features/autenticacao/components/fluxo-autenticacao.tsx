"use client";

import {
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  type ContaAtual,
} from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { AppJaa } from "@/components/navegacao/app-jaa";
import { Aviso, Botao, CampoTexto, Cartao } from "@/components/ui/primitivos";
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

/*
 * ENTRADA NO JAA.
 *
 * O caminho principal é IDENTIFICADOR (celular ou @usuario) + SENHA, porque é o que uma pessoa faz
 * todo dia e não depende de SMS chegar. O código no celular continua existindo — é o CADASTRO, e é
 * também a saída para quem esqueceu a senha ou nunca criou uma.
 *
 * Nenhuma regra mora aqui: normalização do telefone, OTP, senha, sessão e unicidade do @usuario são
 * do servidor.
 */

type Etapa =
  | { nome: "carregando" }
  | { nome: "entrar" }
  | { nome: "telefone" }
  | { nome: "codigo"; telefone: string }
  | { nome: "cadastro" }
  | { nome: "autenticado"; conta: ContaAtual };

export function FluxoAutenticacao() {
  const [etapa, setEtapa] = useState<Etapa>({ nome: "carregando" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Realtime só com sessão válida e identidade pessoal; sair volta à entrada e desconecta.
  useConexaoRealtime(etapa.nome === "autenticado");

  function aplicarConta(conta: Awaited<ReturnType<typeof buscarContaAtual>>) {
    if (!conta.ok) {
      setEtapa({ nome: "entrar" });
      if (conta.status !== 401) setErro(conta.mensagem);
      return;
    }
    setEtapa(
      conta.dados.cadastroCompleto
        ? { nome: "autenticado", conta: conta.dados }
        : { nome: "cadastro" },
    );
  }

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

  function solicitarCodigo(evento: FormEvent<HTMLFormElement>) {
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
      setEtapa({ nome: "codigo", telefone });
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
    });
  }

  if (etapa.nome === "autenticado") {
    return <AppJaa conta={etapa.conta} aoSair={sair} saindo={enviando} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo px-4 py-10">
      <section
        aria-label="Entrar no Jaa"
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <h1 className="text-center text-3xl font-bold text-marca">Jaa</h1>

        {etapa.nome === "carregando" && (
          <p className="text-center text-sm text-conteudo-suave">Carregando…</p>
        )}

        {etapa.nome === "entrar" && (
          <Cartao className="p-5">
            <form onSubmit={entrar} className="flex flex-col gap-4">
              <CampoTexto
                id="entrar-identificador"
                rotulo="Celular ou @usuario"
                name="identificador"
                required
                autoComplete="username"
                placeholder="(31) 98765-4321 ou @junior"
              />
              <CampoTexto
                id="entrar-senha"
                rotulo="Senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
              />
              <Botao type="submit" disabled={enviando} larguraTotal>
                {enviando ? "Entrando…" : "Entrar"}
              </Botao>
              <Botao
                type="button"
                aparencia="discreto"
                onClick={() => setEtapa({ nome: "telefone" })}
              >
                Entrar com código no celular
              </Botao>
              <p className="text-center text-xs text-conteudo-suave">
                Primeira vez por aqui? Use o código no celular para criar sua
                conta e definir sua senha.
              </p>
            </form>
          </Cartao>
        )}

        {etapa.nome === "telefone" && (
          <Cartao className="p-5">
            <form onSubmit={solicitarCodigo} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Entrar com código</h2>
              <CampoCelular />
              <Botao type="submit" disabled={enviando} larguraTotal>
                {enviando ? "Enviando…" : "Enviar código"}
              </Botao>
              <Botao
                type="button"
                aparencia="discreto"
                onClick={() => setEtapa({ nome: "entrar" })}
              >
                Voltar
              </Botao>
            </form>
          </Cartao>
        )}

        {etapa.nome === "codigo" && (
          <Cartao className="p-5">
            <form
              onSubmit={(evento) => verificarCodigo(etapa.telefone, evento)}
              className="flex flex-col gap-4"
            >
              <h2 className="text-lg font-semibold">Código de verificação</h2>
              <p className="text-sm text-conteudo-suave">
                Enviado para {etapa.telefone}
              </p>
              <CampoTexto
                id="codigo-otp"
                rotulo="Código"
                name="codigo"
                required
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
              />
              <Botao type="submit" disabled={enviando} larguraTotal>
                {enviando ? "Verificando…" : "Verificar"}
              </Botao>
              <Botao
                type="button"
                aparencia="discreto"
                onClick={() => setEtapa({ nome: "telefone" })}
              >
                Trocar número
              </Botao>
            </form>
          </Cartao>
        )}

        {etapa.nome === "cadastro" && (
          <Cartao className="p-5">
            <form onSubmit={concluirCadastro} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Complete seu cadastro</h2>
              <CampoTexto
                id="cadastro-nome"
                rotulo="Nome"
                name="nomeExibicao"
                required
                placeholder="Seu nome"
                autoComplete="name"
              />
              <CampoTexto
                id="cadastro-usuario"
                rotulo="@usuario"
                name="nomeUsuario"
                required
                placeholder="junior"
                autoComplete="username"
                dica="É assim que as pessoas encontram você no Jaa."
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
                Concluir cadastro
              </Botao>
              <Botao type="button" aparencia="discreto" onClick={sair}>
                Sair
              </Botao>
            </form>
          </Cartao>
        )}

        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </section>
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
      placeholder="(31) 98765-4321"
      maxLength={15}
      required
      value={valor}
      onChange={(evento) =>
        setValor(formatarCelularDigitado(evento.target.value))
      }
    />
  );
}

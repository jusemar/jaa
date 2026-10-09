"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoTexto } from "@/components/ui/primitivos";
import { clienteAutenticacao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { mensagemDeErroAutenticacao } from "@/features/autenticacao/lib/mensagens-erro";
import { buscarSituacaoEmail } from "../lib/api-perfil";
import { emailVisivel, prepararNovoEmail, somenteDigitosDoCodigo, textosDoEmail } from "../lib/email-da-conta";
import { LinhaDaConta } from "./linha-da-conta";

type Passo = "ver" | "informar" | "codigo";

const FALHA_GENERICA = "Não foi possível concluir. Tente novamente.";

/**
 * E-MAIL da conta. Mostra o endereço real (nunca o técnico do cadastro por celular) e permite
 * cadastrar ou alterar — sempre com um código enviado ao endereço NOVO: só depois de confirmado o
 * e-mail da conta muda. São as rotas do Better Auth que a API já tinha (`request-email-change` e
 * `change-email`); nenhuma regra mora aqui, e o SMS não participa deste fluxo.
 *
 * A resposta do pedido é a mesma quer o endereço esteja livre, quer já seja de outra conta: neste
 * segundo caso nenhum código chega, e a confirmação simplesmente não acontece.
 */
export function FormularioEmail() {
  // undefined = ainda carregando.
  const [emailAtual, setEmailAtual] = useState<string | null | undefined>(undefined);
  const [disponivel, setDisponivel] = useState(false);
  const [passo, setPasso] = useState<Passo>("ver");
  const [novoEmail, setNovoEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoEmail().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) {
        setEmailAtual(emailVisivel(resposta.dados.email));
        setDisponivel(resposta.dados.disponivel);
      } else {
        setEmailAtual(null);
        setErro(resposta.mensagem);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const textos = textosDoEmail(emailAtual ?? null);
  const preparado = prepararNovoEmail(novoEmail, emailAtual ?? null);

  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } catch {
      setErro(FALHA_GENERICA);
    } finally {
      setOcupado(false);
    }
  }

  function irPara(proximo: Passo) {
    setErro(null);
    if (proximo !== "codigo") setCodigo("");
    if (proximo === "informar") setAviso(null);
    if (proximo === "ver") setNovoEmail("");
    setPasso(proximo);
  }

  function pedirCodigo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void executar(async () => {
      if (!preparado.ok) return;
      const { error } = await clienteAutenticacao.emailOtp.requestEmailChange({ newEmail: preparado.email });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      setCodigo("");
      setPasso("codigo");
    });
  }

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void executar(async () => {
      if (!preparado.ok) return;
      const { error } = await clienteAutenticacao.emailOtp.changeEmail({ newEmail: preparado.email, otp: codigo });
      if (error) {
        setErro(mensagemDeErroAutenticacao(error));
        return;
      }
      // O que vale é o que o servidor gravou: a tela relê o e-mail da conta.
      const situacao = await buscarSituacaoEmail();
      setEmailAtual(situacao.ok ? emailVisivel(situacao.dados.email) : emailVisivel(preparado.email));
      setNovoEmail("");
      setCodigo("");
      setPasso("ver");
      setAviso("E-mail confirmado. Agora você também pode entrar com ele.");
    });
  }

  return (
    <LinhaDaConta
      rotulo="E-mail"
      valor={emailAtual === undefined ? "Carregando…" : textos.valor}
      vazio={!emailAtual}
      acao={
        passo === "ver" &&
        emailAtual !== undefined &&
        disponivel && (
          <Botao type="button" aparencia="secundario" data-alterar-email onClick={() => irPara("informar")}>
            {textos.acao}
          </Botao>
        )
      }
    >
      {passo === "ver" && emailAtual !== undefined && !disponivel && <p className="text-sm text-conteudo-suave">No momento não é possível cadastrar ou alterar o e-mail.</p>}

      {passo === "informar" && (
        <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
          <CampoTexto
            id="conta-novo-email"
            rotulo={textos.campo}
            name="novoEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            placeholder="voce@exemplo.com"
            value={novoEmail}
            onChange={(evento) => setNovoEmail(evento.target.value)}
            dica="Enviamos um código de 6 números para este endereço. O e-mail só muda depois de você confirmar."
          />
          {!preparado.ok && preparado.mensagem && <Aviso tom="erro">{preparado.mensagem}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" disabled={ocupado || !preparado.ok}>
              {ocupado ? "Enviando…" : "Enviar código"}
            </Botao>
            <Botao type="button" aparencia="discreto" disabled={ocupado} onClick={() => irPara("ver")}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {passo === "codigo" && preparado.ok && (
        <form onSubmit={confirmar} className="flex flex-col gap-4">
          <p className="text-sm text-conteudo-suave">Se o endereço puder ser usado, enviamos um código para {preparado.email}. Ele vale por 5 minutos.</p>
          <CampoTexto
            id="conta-codigo-email"
            rotulo="Código"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="000000"
            value={codigo}
            onChange={(evento) => setCodigo(somenteDigitosDoCodigo(evento.target.value))}
          />
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" disabled={ocupado || codigo.length !== 6}>
              {ocupado ? "Confirmando…" : "Confirmar e-mail"}
            </Botao>
            <Botao type="button" aparencia="discreto" disabled={ocupado} onClick={() => irPara("informar")}>
              Trocar endereço
            </Botao>
            <Botao type="button" aparencia="discreto" disabled={ocupado} onClick={() => irPara("ver")}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {aviso && passo === "ver" && (
        <p role="status" className="text-sm text-marca">
          {aviso}
        </p>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </LinhaDaConta>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoTexto } from "@/components/ui/primitivos";
import { formatarCelularDigitado } from "@/features/autenticacao/lib/formatar-celular";
import { buscarSituacaoTelefone, confirmarTelefone, pedirCodigoTelefone } from "../lib/api-perfil";
import { somenteDigitosDoCodigo } from "../lib/email-da-conta";
import { prepararNovoTelefone, textosDoTelefone } from "../lib/telefone-da-conta";
import { LinhaDaConta } from "./linha-da-conta";

type Passo = "ver" | "informar" | "codigo";

/**
 * TELEFONE da conta. Mostra o número e permite cadastrar ou alterar — sempre com um código enviado por
 * SMS ao número NOVO: só depois de confirmado o telefone da conta muda. Número que já é de outra conta
 * é recusado pelo servidor ANTES de qualquer SMS. O e-mail não participa deste fluxo.
 *
 * É dado de CONTA: nada aqui lê ou altera a preferência de privacidade "deixar que me encontrem pelo
 * meu celular".
 */
export function FormularioTelefone() {
  // undefined = ainda carregando.
  const [telefoneAtual, setTelefoneAtual] = useState<string | null | undefined>(undefined);
  const [passo, setPasso] = useState<Passo>("ver");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoTelefone().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setTelefoneAtual(resposta.dados.telefone);
      else {
        setTelefoneAtual(null);
        setErro(resposta.mensagem);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const textos = textosDoTelefone(telefoneAtual ?? null);
  const preparado = prepararNovoTelefone(novoTelefone, telefoneAtual ?? null);

  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } finally {
      setOcupado(false);
    }
  }

  function irPara(proximo: Passo) {
    setErro(null);
    if (proximo !== "codigo") setCodigo("");
    if (proximo === "informar") setAviso(null);
    if (proximo === "ver") setNovoTelefone("");
    setPasso(proximo);
  }

  function pedirCodigo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void executar(async () => {
      if (!preparado.ok) return;
      // O servidor confere o número (inclusive se já é de outra conta) ANTES de enviar o SMS.
      const resposta = await pedirCodigoTelefone(preparado.telefone);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
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
      const resposta = await confirmarTelefone(preparado.telefone, codigo);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      // O que vale é o que o servidor gravou.
      setTelefoneAtual(resposta.dados.telefone);
      setNovoTelefone("");
      setCodigo("");
      setPasso("ver");
      setAviso("Telefone confirmado.");
    });
  }

  return (
    <LinhaDaConta
      rotulo="Telefone"
      valor={telefoneAtual === undefined ? "Carregando…" : textos.valor}
      vazio={!telefoneAtual}
      acao={
        passo === "ver" &&
        telefoneAtual !== undefined && (
          <Botao type="button" aparencia="secundario" data-alterar-telefone onClick={() => irPara("informar")}>
            {textos.acao}
          </Botao>
        )
      }
    >
      {passo === "informar" && (
        <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
          <CampoTexto
            id="conta-novo-telefone"
            rotulo={textos.campo}
            name="novoTelefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={15}
            required
            placeholder="(00) 00000-0000"
            value={novoTelefone}
            onChange={(evento) => setNovoTelefone(formatarCelularDigitado(evento.target.value))}
            dica="Enviamos um código por SMS para este número. O telefone só muda depois de você confirmar."
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
          <p className="text-sm text-conteudo-suave">Enviamos um código de 6 números por SMS para {novoTelefone}. Ele vale por 5 minutos.</p>
          <CampoTexto
            id="conta-codigo-telefone"
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
              {ocupado ? "Confirmando…" : "Confirmar telefone"}
            </Botao>
            <Botao type="button" aparencia="discreto" disabled={ocupado} onClick={() => irPara("informar")}>
              Trocar número
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

"use client";

import { SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoTexto, Cartao } from "@/components/ui/primitivos";
import { buscarSituacaoSenha, salvarSenha } from "../lib/api-perfil";

/**
 * SENHA da conta. O cadastro continua sendo por código no celular; a senha é o atalho para entrar
 * depois, sem esperar SMS.
 *
 * Trocar exige a senha atual: uma sessão esquecida aberta num aparelho não pode virar troca de senha.
 */
export function FormularioSenha() {
  const [definida, setDefinida] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoSenha().then((resposta) => {
      if (ativo && resposta.ok) setDefinida(resposta.dados.definida);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const senha = String(dados.get("senha") ?? "");
    const senhaAtual = String(dados.get("senhaAtual") ?? "");

    setSalvando(true);
    setErro(null);
    setAviso(null);
    void salvarSenha(senha, senhaAtual || undefined)
      .then((resposta) => {
        if (!resposta.ok) {
          setErro(resposta.mensagem);
          return;
        }
        setDefinida(true);
        setAviso("Senha salva. Agora você pode entrar com seu celular ou @usuario e a senha.");
        formulario.reset();
      })
      .finally(() => setSalvando(false));
  }

  return (
    <Cartao className="p-4">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        {definida && (
          <CampoTexto id="senha-atual" rotulo="Senha atual" name="senhaAtual" type="password" autoComplete="current-password" required minLength={1} />
        )}
        <CampoTexto
          id="senha-nova"
          rotulo={definida ? "Nova senha" : "Criar senha"}
          name="senha"
          type="password"
          autoComplete="new-password"
          required
          minLength={SENHA_TAMANHO_MINIMO}
          dica={`Pelo menos ${SENHA_TAMANHO_MINIMO} caracteres. Esqueceu? Você sempre pode entrar com o código enviado para o seu celular.`}
        />
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : definida ? "Alterar senha" : "Criar senha"}
        </Botao>
        {aviso && (
          <p role="status" className="text-sm text-marca">
            {aviso}
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Cartao>
  );
}

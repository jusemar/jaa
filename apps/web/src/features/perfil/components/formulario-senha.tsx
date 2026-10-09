"use client";

import { SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoTexto } from "@/components/ui/primitivos";
import { buscarSituacaoSenha, salvarSenha } from "../lib/api-perfil";
import { LinhaDaConta } from "./linha-da-conta";

/**
 * SENHA da conta. O cadastro é por código (SMS ou e-mail); a senha é o atalho para entrar depois,
 * sem esperar o código.
 *
 * Trocar exige a senha atual: uma sessão esquecida aberta num aparelho não pode virar troca de senha.
 *
 * Fechada, a linha mostra só "••••••••" (ou que ainda não há senha) e UMA ação; os campos aparecem
 * quando a pessoa toca em "Alterar senha" / "Criar senha" — e somem de novo ao salvar ou cancelar.
 */
export function FormularioSenha() {
  const [definida, setDefinida] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

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
        setAviso(
          "Senha salva. Agora você pode entrar com seu @usuario, celular ou e-mail e a senha.",
        );
        formulario.reset();
        setAberto(false);
      })
      .finally(() => setSalvando(false));
  }

  return (
    <LinhaDaConta
      rotulo="Senha"
      valor={
        definida === null
          ? "Carregando…"
          : definida
            ? "••••••••"
            : "Nenhuma senha criada"
      }
      vazio={!definida}
      acao={
        !aberto &&
        definida !== null && (
          <Botao
            type="button"
            aparencia="secundario"
            data-alterar-senha
            onClick={() => {
              setErro(null);
              setAviso(null);
              setAberto(true);
            }}
          >
            {definida ? "Alterar senha" : "Criar senha"}
          </Botao>
        )
      }
    >
      {aberto && (
        <form onSubmit={enviar} className="flex flex-col gap-4">
          {definida && (
            <CampoTexto
              id="senha-atual"
              rotulo="Senha atual"
              name="senhaAtual"
              type="password"
              autoComplete="current-password"
              required
              minLength={1}
            />
          )}
          <CampoTexto
            id="senha-nova"
            rotulo={definida ? "Nova senha" : "Criar senha"}
            name="senha"
            type="password"
            autoComplete="new-password"
            required
            minLength={SENHA_TAMANHO_MINIMO}
            dica={`Pelo menos ${SENHA_TAMANHO_MINIMO} caracteres. Esqueceu? Você pode entrar com código por SMS ou e-mail.`}
          />
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" disabled={salvando}>
              {salvando
                ? "Salvando…"
                : definida
                  ? "Salvar nova senha"
                  : "Criar senha"}
            </Botao>
            <Botao
              type="button"
              aparencia="discreto"
              disabled={salvando}
              onClick={() => {
                setErro(null);
                setAberto(false);
              }}
            >
              Cancelar
            </Botao>
          </div>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>
      )}
      {aviso && !aberto && (
        <p role="status" className="text-sm text-marca">
          {aviso}
        </p>
      )}
    </LinhaDaConta>
  );
}

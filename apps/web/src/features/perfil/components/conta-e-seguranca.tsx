"use client";

import { useEffect, useState } from "react";
import { Botao, Cartao, Secao } from "@/components/ui/primitivos";
import { buscarSituacaoPin, removerPin } from "@/features/autenticacao/lib/api-pin";
import { FormularioEmail } from "./formulario-email";
import { FormularioSenha } from "./formulario-senha";
import { FormularioTelefone } from "./formulario-telefone";
import { LinhaDaConta } from "./linha-da-conta";

/**
 * CONTA E SEGURANÇA: como a pessoa entra no Jaaa. Um cartão só, uma linha por dado — Telefone, E-mail,
 * Senha e PIN — cada uma com o valor atual e UMA ação. Nenhum formulário fica aberto: ele aparece
 * dentro da própria linha quando a pessoa toca em "Alterar…".
 *
 * Telefone e e-mail novos são sempre confirmados por um código enviado ao PRÓPRIO número/endereço novo.
 */
export function ContaESeguranca() {
  return (
    <Secao titulo="Conta e segurança" descricao="Como você entra no Jaaa.">
      <Cartao className="divide-y divide-borda px-4 py-4">
        <FormularioTelefone />
        <FormularioEmail />
        <FormularioSenha />
        <LinhaPin />
      </Cartao>
    </Secao>
  );
}

/**
 * PIN deste navegador: só a situação e a remoção. Criar o PIN continua sendo oferecido logo depois de
 * entrar com o código (SMS ou e-mail) — não há outra forma de criá-lo, por segurança.
 */
function LinhaPin() {
  // undefined = ainda carregando.
  const [ativo, setAtivo] = useState<boolean | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let montado = true;
    void buscarSituacaoPin().then((autorizado) => montado && setAtivo(autorizado));
    return () => {
      montado = false;
    };
  }, []);

  function remover() {
    setOcupado(true);
    void removerPin()
      .then(() => setAtivo(false))
      .finally(() => setOcupado(false));
  }

  return (
    <LinhaDaConta
      rotulo="PIN deste navegador"
      valor={ativo === undefined ? "Carregando…" : ativo ? "Ativo" : "Não configurado"}
      vazio={!ativo}
      acao={
        ativo && (
          <Botao type="button" aparencia="secundario" data-remover-pin disabled={ocupado} onClick={remover}>
            {ocupado ? "Removendo…" : "Remover PIN"}
          </Botao>
        )
      }
    >
      {ativo === false && <p className="text-sm text-conteudo-suave">Para criar um PIN, entre com código por SMS ou e-mail.</p>}
    </LinhaDaConta>
  );
}

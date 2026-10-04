import type { Banco } from "@jaa/banco";
import type { ContaAtual } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirSessao, obterSessaoExigida } from "../../autenticacao/lib/exigir-sessao.js";
import { mascararTelefone } from "../../autenticacao/lib/telefone.js";
import { serializarIdentidadePessoal } from "../../identidades/lib/serializar-identidade.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import { montarContextoConta } from "../casos-de-uso/montar-contexto-conta.js";

export function registrarRotasUsuarios(
  servidor: FastifyInstance,
  { banco, autenticacao, armazenamento }: { banco: Banco; autenticacao: Autenticacao; armazenamento: ArmazenamentoDeArquivos },
) {
  // Estado da conta autenticada. Cadastro incompleto = conta sem identidade pessoal.
  servidor.get("/usuarios/eu", { preHandler: exigirSessao(autenticacao) }, async (requisicao) => {
    const { user } = obterSessaoExigida(requisicao);
    const identidade = await buscarIdentidadePessoalDoUsuario(banco, user.id);

    const conta: ContaAtual = {
      telefoneMascarado: user.phoneNumber ? mascararTelefone(user.phoneNumber) : null,
      cadastroCompleto: identidade !== null,
      identidadePessoal: identidade ? serializarIdentidadePessoal(identidade) : null,
    };

    return conta;
  });

  /*
   * Contexto da CONTA para navegação (identidades operáveis + capacidades resumidas). Só exige sessão,
   * como `/usuarios/eu`, para responder também com cadastro incompleto; ignora `x-jaa-identidade`.
   */
  servidor.get("/conta/contexto", { preHandler: exigirSessao(autenticacao) }, async (requisicao) => {
    const { user } = obterSessaoExigida(requisicao);
    return montarContextoConta(banco, user.id, user.phoneNumber, (chave) => armazenamento.urlPublica(chave));
  });
}

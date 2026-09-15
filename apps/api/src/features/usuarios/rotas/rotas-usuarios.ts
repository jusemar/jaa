import type { Banco } from "@jaa/banco";
import type { ContaAtual } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirSessao, obterSessaoExigida } from "../../autenticacao/lib/exigir-sessao.js";
import { mascararTelefone } from "../../autenticacao/lib/telefone.js";
import { serializarIdentidadePessoal } from "../../identidades/lib/serializar-identidade.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";

export function registrarRotasUsuarios(
  servidor: FastifyInstance,
  { banco, autenticacao }: { banco: Banco; autenticacao: Autenticacao },
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
}

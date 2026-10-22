import type { Banco } from "@jaa/banco";
import type { ContaAtual, ErroApi } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirSessao, obterSessaoExigida } from "../../autenticacao/lib/exigir-sessao.js";
import { mascararTelefone } from "../../autenticacao/lib/telefone.js";
import { serializarIdentidadePessoal } from "../../identidades/lib/serializar-identidade.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import { montarContextoConta } from "../casos-de-uso/montar-contexto-conta.js";
import { expiracaoDoVisitante, situacaoDoVisitante } from "../../visitantes/lib/situacao-visitante.js";
import { buscarVisitanteDoUsuario, registrarAtividadeVisitante } from "../../visitantes/repositorios/repositorio-visitantes.js";

export function registrarRotasUsuarios(
  servidor: FastifyInstance,
  { banco, autenticacao, armazenamento }: { banco: Banco; autenticacao: Autenticacao; armazenamento: ArmazenamentoDeArquivos },
) {
  // Estado da conta autenticada. Cadastro incompleto = conta sem identidade pessoal.
  servidor.get("/usuarios/eu", { preHandler: exigirSessao(autenticacao) }, async (requisicao, resposta) => {
    const { user } = obterSessaoExigida(requisicao);
    const identidade = await buscarIdentidadePessoalDoUsuario(banco, user.id);

    /*
     * Sem identidade pessoal pode ser um VISITANTE do Link do Jaa: o cliente fica sabendo para abrir
     * a conversa dele (e oferecer "Criar conta"/"Entrar"). Visitante vencido é sessão que não vale.
     */
    const visitante = identidade ? null : await buscarVisitanteDoUsuario(banco, user.id);
    const situacao = visitante ? situacaoDoVisitante(visitante, new Date()) : null;
    if (situacao === "expirada" || situacao === "encerrada") {
      const erro: ErroApi = { codigo: "NAO_AUTENTICADO", mensagem: "Sessão ausente ou expirada." };
      return resposta.code(401).send(erro);
    }
    if (visitante && situacao === "ativa") await registrarAtividadeVisitante(banco, visitante.identidadeId);

    const conta: ContaAtual = {
      telefoneMascarado: user.phoneNumber ? mascararTelefone(user.phoneNumber) : null,
      cadastroCompleto: identidade !== null,
      identidadePessoal: identidade ? serializarIdentidadePessoal(identidade) : null,
      // Só existe para sessão de visitante: a conta comum continua com o mesmo formato de sempre.
      ...(visitante && situacao === "ativa"
        ? { visitante: { identidadeId: visitante.identidadeId, nomeExibicao: visitante.nomeExibicao, expiraEm: expiracaoDoVisitante({ ultimaAtividadeEm: new Date() }).toISOString() } }
        : {}),
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

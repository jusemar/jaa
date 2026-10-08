import type { Banco } from "@jaa/banco";
import { nomeUsuarioSchema, podeVer, type ErroApi, type IdentidadePublica } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import { buscarEmpresaPublicaPorIdentidade } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { buscarIdentidadeContatavelPorNomeUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import { listarProdutosDisponiveisDaEmpresa } from "../../produtos/repositorios/repositorio-produtos.js";
import type { ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { buscarPerfil } from "../repositorios/repositorio-perfil.js";

/*
 * LINK DO JAA (`/@usuario` na Web): resolve o @usuario para a identidade que pode receber conversa —
 * a MESMA regra de `POST /conversas/diretas` (pessoa, ou empresa ativa). SEM autenticação: é o que um
 * visitante vindo do WhatsApp vê antes de ter conta.
 *
 * Quem olha é um DESCONHECIDO: nunca é contato e não tem exceção de privacidade. Por isso foto e frase
 * de status só saem quando o dono escolheu "todos" — a mesma função (`podeVer`) do perfil entre contas.
 * Inexistente e indisponível são indistinguíveis (404).
 */
export function registrarRotasIdentidadePublica(servidor: FastifyInstance, dependencias: { banco: Banco; armazenamento: ArmazenamentoDeArquivos }) {
  const { banco, armazenamento } = dependencias;

  servidor.get("/publico/identidades/:nomeUsuario", async (requisicao, resposta) => {
    const naoEncontrada = () => {
      const erro: ErroApi = { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Este endereço do Jaaa não existe." };
      return resposta.code(404).send(erro);
    };
    const parametros = requisicao.params as { nomeUsuario?: unknown };
    const nomeUsuario = nomeUsuarioSchema.safeParse(parametros.nomeUsuario);
    // @usuario fora do formato não existe: mesma resposta, sem ensinar o formato a quem sonda.
    if (!nomeUsuario.success) return naoEncontrada();

    const identidade = await buscarIdentidadeContatavelPorNomeUsuario(banco, nomeUsuario.data);
    const perfil = identidade ? await buscarPerfil(banco, identidade.id) : null;
    if (!perfil) return naoEncontrada();

    const paraDesconhecido = (visibilidade: typeof perfil.preferencias.visibilidadeFoto) => podeVer({ visibilidade, ehContato: false, excecao: null });
    const ehEmpresa = perfil.tipo === "empresarial";
    const empresa = ehEmpresa ? await buscarEmpresaPublicaPorIdentidade(banco, perfil.identidadeId) : null;
    const temCardapio = empresa ? (await listarProdutosDisponiveisDaEmpresa(banco, empresa.empresaId)).length > 0 : false;

    const publica: IdentidadePublica = {
      identidadeId: perfil.identidadeId,
      tipo: perfil.tipo,
      nomeExibicao: perfil.nomeExibicao,
      nomeUsuario: perfil.nomeUsuario,
      fotoUrl: perfil.fotoChave && paraDesconhecido(perfil.preferencias.visibilidadeFoto) ? armazenamento.urlPublica(perfil.fotoChave) : null,
      fraseStatus: paraDesconhecido(perfil.preferencias.visibilidadeStatus) ? perfil.fraseStatus : null,
      sobre: ehEmpresa ? perfil.sobre : null,
      temCardapio,
    };
    return publica;
  });
}

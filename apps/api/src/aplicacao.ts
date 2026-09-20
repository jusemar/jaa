import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { Banco } from "@jaa/banco";
import { TAMANHO_MAXIMO_IMAGEM_BYTES } from "@jaa/contratos";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Autenticacao } from "./features/autenticacao/autenticacao.js";
import { registrarRotasBetterAuth } from "./features/autenticacao/rotas/rotas-better-auth.js";
import { registrarRotasCredenciais } from "./features/autenticacao/rotas/rotas-credenciais.js";
import { registrarRotaTesteProtegido } from "./features/autenticacao/rotas/rotas-teste-protegido.js";
import { registrarRotasCatalogoPublico } from "./features/catalogo/rotas/rotas-catalogo-publico.js";
import { registrarRotasContatos } from "./features/contatos/rotas/rotas-contatos.js";
import { registrarRotasConversas } from "./features/conversas/rotas/rotas-conversas.js";
import { registrarRotasEmpresas } from "./features/empresas/rotas/rotas-empresas.js";
import { geocodificadorIndisponivel, type GeocodificadorEndereco } from "./features/enderecos/lib/geocodificador.js";
import { criarCanalEventosEntregas, type CanalEventosEntregas } from "./features/entregas/lib/eventos-entregas.js";
import { criarMotorDeRotas, type MotorDeRotas } from "./features/entregas/lib/motor-rotas.js";
import { registrarRotasEntregas } from "./features/entregas/rotas/rotas-entregas.js";
import { alterarStatusPedidoAutorizado, executarAlteracaoStatusPedido } from "./features/pedidos/casos-de-uso/gerir-pedidos-empresa.js";
import { registrarRotasEnderecos } from "./features/enderecos/rotas/rotas-enderecos.js";
import { criarCanalEventosPedidos, type CanalEventosPedidos } from "./features/pedidos/lib/eventos-pedidos.js";
import { registrarRotasPedidos } from "./features/pedidos/rotas/rotas-pedidos.js";
import { registrarRotasPedidosEmpresa } from "./features/pedidos/rotas/rotas-pedidos-empresa.js";
import { registrarRotasCategorias } from "./features/produtos/rotas/rotas-categorias.js";
import { registrarRotasProdutosAdministracao } from "./features/produtos/rotas/rotas-produtos-administracao.js";
import { registrarRotasPerfil } from "./features/perfil/rotas/rotas-perfil.js";
import { registrarRotasIdentidades } from "./features/identidades/rotas/rotas-identidades.js";
import type { CanalEventosMensagens } from "./features/mensagens/lib/eventos-mensagens.js";
import { registrarRotasMensagens } from "./features/mensagens/rotas/rotas-mensagens.js";
import { registrarRotasUsuarios } from "./features/usuarios/rotas/rotas-usuarios.js";
import type { Ambiente } from "./lib/ambiente.js";
import { armazenamentoIndisponivel, type ArmazenamentoDeArquivos } from "./lib/armazenamento/armazenamento-arquivos.js";

interface DependenciasAplicacao {
  ambiente: Ambiente;
  banco: Banco;
  autenticacao: Autenticacao;
  eventosMensagens: CanalEventosMensagens;
  // Opcional: sem realtime de pedidos (ex.: teste focado em HTTP), os eventos caem num canal sem ouvintes.
  eventosPedidos?: CanalEventosPedidos;
  eventosEntregas?: CanalEventosEntregas;
  // Fronteira de geocodificação (endereço → coordenada SUGERIDA). Sem provedor configurado, o mapa
  // abre sem palpite: a confirmação do ponto continua sendo do cliente.
  geocodificador?: GeocodificadorEndereco;
  // Motor de rotas do Jaa. Sem provedor configurado, ele já cai na aproximação local (sem rede).
  motorRotas?: MotorDeRotas;
  // Fronteira com o storage. Sem credenciais, o upload é recusado com aviso claro (nunca "salvou" falso).
  armazenamento?: ArmazenamentoDeArquivos;
  logger: FastifyServerOptions["logger"];
}

// Monta a aplicação HTTP sem abrir porta, para ser usada pelo servidor e pelos testes.
export async function criarAplicacao({
  ambiente,
  banco,
  autenticacao,
  eventosMensagens,
  eventosPedidos = criarCanalEventosPedidos(),
  eventosEntregas = criarCanalEventosEntregas(),
  geocodificador = geocodificadorIndisponivel,
  motorRotas = criarMotorDeRotas(null),
  armazenamento = armazenamentoIndisponivel,
  logger,
}: DependenciasAplicacao) {
  const servidor = Fastify({ logger });

  await servidor.register(cors, {
    origin: ambiente.ORIGENS_WEB_PERMITIDAS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  // Upload de imagens (foto de perfil, logo, imagem de produto). O limite de bytes é a primeira
  // barreira: o corpo nem é lido inteiro quando passa do teto.
  await servidor.register(multipart, { limits: { fileSize: TAMANHO_MAXIMO_IMAGEM_BYTES, files: 1 } });

  servidor.decorateRequest("sessao", null);
  servidor.decorateRequest("identidadeAutenticada", null);

  servidor.get("/saude", async () => {
    return {
      status: "ok",
      servico: "jaa-api",
    };
  });

  registrarRotasBetterAuth(servidor, autenticacao, ambiente.BETTER_AUTH_URL);
  registrarRotasCredenciais(servidor, { banco, autenticacao, urlBase: ambiente.BETTER_AUTH_URL });
  registrarRotaTesteProtegido(servidor, autenticacao);
  registrarRotasUsuarios(servidor, { banco, autenticacao });
  registrarRotasIdentidades(servidor, { banco, autenticacao });
  registrarRotasEmpresas(servidor, { banco, autenticacao });
  registrarRotasProdutosAdministracao(servidor, { banco, autenticacao, armazenamento });
  registrarRotasCategorias(servidor, { banco, autenticacao });
  registrarRotasPerfil(servidor, { banco, autenticacao, armazenamento });
  registrarRotasCatalogoPublico(servidor, { banco, autenticacao });
  registrarRotasEnderecos(servidor, { banco, autenticacao, geocodificador });
  registrarRotasPedidos(servidor, { banco, autenticacao, eventosMensagens, eventosEntregas });
  registrarRotasPedidosEmpresa(servidor, { banco, autenticacao, eventosPedidos, eventosEntregas });
  registrarRotasEntregas(servidor, {
    banco,
    autenticacao,
    eventosEntregas,
    geocodificador,
    motorRotas,
    // Iniciar a saída avança cada pedido pronto pela MESMA máquina de estados da empresa (com
    // histórico, realtime e as validações de sempre) — nunca por atalho.
    avancarPedidoParaEntrega: async (usuarioId, empresaId, pedidoId) => {
      await alterarStatusPedidoAutorizado({ banco, eventosPedidos, eventosEntregas }, usuarioId, empresaId, pedidoId, { tipo: "avancar", statusAtual: "pronto" });
    },
    // Início pelo entregador: a saída já foi autorizada para ele; o pedido passa pela mesma máquina.
    avancarPedidoPeloEntregador: async (usuarioId, empresaId, pedidoId) => {
      await executarAlteracaoStatusPedido({ banco, eventosPedidos, eventosEntregas }, usuarioId, empresaId, pedidoId, { tipo: "avancar", statusAtual: "pronto" });
    },
  });
  registrarRotasContatos(servidor, { banco, autenticacao });
  registrarRotasConversas(servidor, { banco, autenticacao });
  registrarRotasMensagens(servidor, { banco, autenticacao, eventosMensagens });

  return servidor;
}

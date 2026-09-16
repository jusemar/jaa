import { criarConexaoBanco } from "@jaa/banco";
import { criarAplicacao } from "./aplicacao.js";
import { criarAutenticacao } from "./features/autenticacao/autenticacao.js";
import { criarEntregadorOtp } from "./features/autenticacao/entrega-otp/entregador-otp.js";
import { criarAvisoSessoesEncerradas } from "./features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "./features/mensagens/lib/eventos-mensagens.js";
import { criarCanalEventosPedidos } from "./features/pedidos/lib/eventos-pedidos.js";
import { carregarAmbiente } from "./lib/ambiente.js";
import { configurarRealtime } from "./realtime/configurar-realtime.js";

const ambiente = carregarAmbiente();
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const sessoesEncerradas = criarAvisoSessoesEncerradas();
const eventosMensagens = criarCanalEventosMensagens();
const eventosPedidos = criarCanalEventosPedidos();

const autenticacao = criarAutenticacao({
  banco: conexao.banco,
  ambiente,
  entregadorOtp: criarEntregadorOtp(ambiente),
  sessoesEncerradas,
});

const servidor = await criarAplicacao({
  ambiente,
  banco: conexao.banco,
  autenticacao,
  eventosMensagens,
  eventosPedidos,
  logger: true,
});

configurarRealtime(servidor, {
  autenticacao,
  banco: conexao.banco,
  sessoesEncerradas,
  eventosMensagens,
  eventosPedidos,
  origensPermitidas: ambiente.ORIGENS_WEB_PERMITIDAS,
});

servidor.addHook("onClose", async () => {
  await conexao.encerrar();
});

const iniciar = async () => {
  try {
    await servidor.listen({
      port: 3333,
      host: "0.0.0.0",
    });
  } catch (erro) {
    servidor.log.error(erro);
    process.exit(1);
  }
};

void iniciar();

import { criarConexaoBanco } from "@jaa/banco";
import { criarAplicacao } from "./aplicacao.js";
import { criarAutenticacao } from "./features/autenticacao/autenticacao.js";
import { criarEntregadorOtp } from "./features/autenticacao/entrega-otp/entregador-otp.js";
import { criarAvisoSessoesEncerradas } from "./features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "./features/mensagens/lib/eventos-mensagens.js";
import { criarGeocodificadorMapbox } from "./features/enderecos/lib/geocodificador-mapbox.js";
import { geocodificadorIndisponivel } from "./features/enderecos/lib/geocodificador.js";
import { criarCanalEventosEntregas } from "./features/entregas/lib/eventos-entregas.js";
import { criarMotorDeRotas } from "./features/entregas/lib/motor-rotas.js";
import { criarProvedorMapbox } from "./features/entregas/lib/provedores/provedor-mapbox.js";
import { iniciarRotinaDespacho } from "./features/entregas/lib/rotina-despacho.js";
import { criarCanalEventosPedidos } from "./features/pedidos/lib/eventos-pedidos.js";
import { carregarAmbiente } from "./lib/ambiente.js";
import { criarArmazenamento } from "./lib/armazenamento/criar-armazenamento.js";
import { configurarRealtime } from "./realtime/configurar-realtime.js";

const ambiente = carregarAmbiente();
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const sessoesEncerradas = criarAvisoSessoesEncerradas();
const eventosMensagens = criarCanalEventosMensagens();
const eventosPedidos = criarCanalEventosPedidos();
const eventosEntregas = criarCanalEventosEntregas();
// O mesmo token server-side das rotas atende a geocodificação; nunca é enviado ao navegador.
const geocodificador = ambiente.MAPBOX_TOKEN
  ? criarGeocodificadorMapbox({ token: ambiente.MAPBOX_TOKEN, urlBase: ambiente.MAPBOX_URL })
  : geocodificadorIndisponivel;

/*
 * Motor de rotas: com MAPBOX_TOKEN, o Jaa calcula sequência e percurso reais; sem ele, NENHUMA
 * chamada externa acontece e a operação segue na aproximação local determinística.
 */
const motorRotas = criarMotorDeRotas(
  ambiente.MAPBOX_TOKEN ? criarProvedorMapbox({ token: ambiente.MAPBOX_TOKEN, urlBase: ambiente.MAPBOX_URL }) : null,
);

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
  eventosEntregas,
  geocodificador,
  motorRotas,
  armazenamento: criarArmazenamento(ambiente),
  logger: true,
});

configurarRealtime(servidor, {
  autenticacao,
  banco: conexao.banco,
  sessoesEncerradas,
  eventosMensagens,
  eventosPedidos,
  eventosEntregas,
  origensPermitidas: ambiente.ORIGENS_WEB_PERMITIDAS,
});

/*
 * Fechamento por TEMPO das saídas em formação: o prazo vive no banco, esta rotina só processa o que
 * venceu. Na primeira volta ela também recupera o que venceu enquanto a API esteve fora do ar.
 */
const rotinaDespacho = iniciarRotinaDespacho({ banco: conexao.banco, eventosEntregas, motorRotas });
void rotinaDespacho.executarAgora();

servidor.addHook("onClose", async () => {
  rotinaDespacho.encerrar();
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

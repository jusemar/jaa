import { criarConexaoBanco } from "@jaa/banco";
import { criarAplicacao } from "./aplicacao.js";
import { criarAutenticacao } from "./features/autenticacao/autenticacao.js";
import { criarEntregadorOtp } from "./features/autenticacao/entrega-otp/entregador-otp.js";
import { criarEntregadorOtpEmail } from "./features/autenticacao/entrega-otp/entregador-otp-email.js";
import { criarAvisoSessoesEncerradas } from "./features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "./features/mensagens/lib/eventos-mensagens.js";
import { criarGeocodificadorMapbox } from "./features/enderecos/lib/geocodificador-mapbox.js";
import { geocodificadorIndisponivel } from "./features/enderecos/lib/geocodificador.js";
import { criarCanalEventosEntregas } from "./features/entregas/lib/eventos-entregas.js";
import { criarMotorDeRotas } from "./features/entregas/lib/motor-rotas.js";
import { criarProvedorMapbox } from "./features/entregas/lib/provedores/provedor-mapbox.js";
import { iniciarRotinaDespacho } from "./features/entregas/lib/rotina-despacho.js";
import { criarCanalEventosPedidos } from "./features/pedidos/lib/eventos-pedidos.js";
import { NOMES_VARIAVEIS_ARMAZENAMENTO, carregarAmbiente, situacaoArmazenamentoPrivado, situacaoArmazenamentoPublico } from "./lib/ambiente.js";
import { criarArmazenamento, criarArmazenamentoPrivado } from "./lib/armazenamento/criar-armazenamento.js";
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
  entregadorOtpEmail: criarEntregadorOtpEmail(ambiente),
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
  armazenamentoPrivado: criarArmazenamentoPrivado(ambiente),
  logger: true,
});

// Só NOMES de variáveis no aviso, nunca valores. (Em produção, configuração parcial nem chega aqui.)
if (situacaoArmazenamentoPublico(ambiente) === "parcial") {
  servidor.log.warn(
    `Armazenamento R2 PÚBLICO configurado pela metade: preencha ${NOMES_VARIAVEIS_ARMAZENAMENTO.publico.join(", ")}. Até lá o envio de imagens responde 503.`,
  );
}
if (situacaoArmazenamentoPrivado(ambiente) === "parcial") {
  servidor.log.warn(
    `Armazenamento R2 PRIVADO configurado pela metade: preencha ${NOMES_VARIAVEIS_ARMAZENAMENTO.privado.join(", ")}. Até lá ele fica indisponível.`,
  );
}

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

// A hospedagem encerra o processo com SIGTERM a cada novo deploy: fecha conexões e o pool antes de sair.
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.once(sinal, () => {
    void servidor.close().finally(() => process.exit(0));
  });
}

const iniciar = async () => {
  try {
    await servidor.listen({
      port: ambiente.PORT ?? 3333,
      host: "0.0.0.0",
    });
  } catch (erro) {
    servidor.log.error(erro);
    process.exit(1);
  }
};

void iniciar();

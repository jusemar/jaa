import Fastify from "fastify";
import { configurarRealtime } from "./realtime/configurar-realtime.js";

const servidor = Fastify({
  logger: true,
});

configurarRealtime(servidor);

servidor.get("/saude", async () => {
  return {
    status: "ok",
    servico: "jaa-api",
  };
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

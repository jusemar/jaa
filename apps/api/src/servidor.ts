import Fastify from "fastify";

const servidor = Fastify({
  logger: true,
});

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

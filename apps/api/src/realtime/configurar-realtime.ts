import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

export function configurarRealtime(servidor: FastifyInstance) {
  const realtime = new Server(servidor.server, {
    cors: {
      origin: ["http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST"],
    },
  });

  realtime.on("connection", (socket) => {
    servidor.log.info(
      { socketId: socket.id },
      "Cliente conectado ao realtime",
    );

    socket.on("disconnect", (motivo) => {
      servidor.log.info(
        { socketId: socket.id, motivo },
        "Cliente desconectado do realtime",
      );
    });
  });

  return realtime;
}

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Uso exclusivo de código confiável do servidor (API). Mobile e web nunca importam este pacote.
// Recebe a URL por parâmetro para que quem consome decida como carregar o ambiente.
export function criarConexaoBanco(urlBanco: string) {
  const pool = new Pool({ connectionString: urlBanco });

  const banco = drizzle({ client: pool, schema, casing: "snake_case" });

  return {
    banco,
    encerrar: () => pool.end(),
  };
}

export type ConexaoBanco = ReturnType<typeof criarConexaoBanco>;
export type Banco = ConexaoBanco["banco"];

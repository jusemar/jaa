import { sql } from "drizzle-orm";
import { criarConexaoBanco } from "../src/conexao.js";

// Verifica, pela mesma camada que a API usará, se o PostgreSQL local responde.
// Não imprime DATABASE_URL para não expor credenciais em logs.
const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "DATABASE_URL não definida. Copie packages/banco/.env.example para packages/banco/.env.",
  );
  process.exit(1);
}

const { banco, encerrar } = criarConexaoBanco(url);

try {
  const resultado = await banco.execute<{ banco: string; versao: string }>(
    sql`select current_database() as banco, current_setting('server_version') as versao`,
  );
  const [linha] = resultado.rows;

  console.log(`Conexão OK: banco "${linha?.banco}", PostgreSQL ${linha?.versao}`);
} catch (erro) {
  console.error("Falha ao conectar ao PostgreSQL:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await encerrar();
}

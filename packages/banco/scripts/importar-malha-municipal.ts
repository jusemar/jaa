import { parseArgs } from "node:util";
import { ehHostLocal } from "../src/banco-de-teste.js";
import { criarConexaoBanco } from "../src/conexao.js";
import { importarMalhaOficial } from "../src/territorio/importacao-malha.js";

/*
 * Importa a Malha Municipal Digital OFICIAL do IBGE de uma UF para `municipios` + `malhas_municipio`.
 *
 *   npm run ibge:importar-malha -- --uf MG [--edicao 2025]
 *
 * Idempotente (rodar de novo não duplica). Por segurança só escreve em PostgreSQL LOCAL; para outro
 * ambiente é preciso `--permitir-remoto`, de propósito. A URL do banco nunca é impressa.
 */
const { values } = parseArgs({
  options: {
    uf: { type: "string" },
    edicao: { type: "string", default: "2025" },
    "permitir-remoto": { type: "boolean", default: false },
  },
});

const url = process.env.DATABASE_URL;
if (!values.uf || !url) {
  console.error("Uso: npm run ibge:importar-malha -- --uf MG [--edicao 2025]  (DATABASE_URL precisa estar definida)");
  process.exit(1);
}
if (!ehHostLocal(url) && !values["permitir-remoto"]) {
  console.error("Recusado: DATABASE_URL aponta para host remoto. Use --permitir-remoto só com decisão explícita.");
  process.exit(1);
}

const { banco, encerrar } = criarConexaoBanco(url);
try {
  const inicio = Date.now();
  const resultado = await importarMalhaOficial(banco, values.uf, values.edicao);
  console.log(
    [
      `Malha Municipal ${resultado.fonte.edicao} — ${resultado.fonte.uf}`,
      `  fonte: ${resultado.fonte.url}`,
      `  arquivo: ${resultado.arquivo.caminho} (${(resultado.arquivo.bytes / 1024 / 1024).toFixed(1)} MB, sha256 ${resultado.arquivo.sha256})${resultado.arquivo.baixadoAgora ? " — baixado agora" : " — do cache"}`,
      `  municípios importados: ${resultado.municipios}`,
      `  geometrias corrigidas (ST_MakeValid): ${resultado.geometriasCorrigidas}`,
      `  versões anteriores desativadas: ${resultado.versoesAnterioresDesativadas}`,
      `  tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
    ].join("\n"),
  );
} catch (erro) {
  console.error("Falha na importação:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await encerrar();
}

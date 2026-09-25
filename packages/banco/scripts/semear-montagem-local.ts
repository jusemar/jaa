import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { criarConexaoBanco } from "../src/conexao.js";
import { categoriasProduto, empresas, gruposOpcoesProduto, identidades, opcoesProduto, produtos } from "../src/schema.js";

/*
 * SEMENTE LOCAL para conferir o produto personalizável ("Monte seu prato") com dados REAIS.
 *
 * Por que um script e não uma migration: isto é CONTEÚDO de uma empresa de teste, não estrutura.
 * Migration versiona schema; dado de demonstração entra por aqui, só no ambiente de desenvolvimento.
 *
 * É IDEMPOTENTE: rodar de novo não duplica nada — cada categoria, produto, grupo e opção é procurado
 * pelo nome dentro do escopo dele antes de ser criado, e o que já existe é reaproveitado.
 *
 * A empresa é resolvida pelo SLUG (nenhum id fica escrito aqui), e tudo passa pelas mesmas tabelas e
 * restrições que a aplicação usa. A aplicação continua lendo tudo do banco: nada aqui é hardcode de
 * produto na interface.
 *
 * Uso: npm run semear-montagem -w @jaa/banco -- [slug-da-empresa]
 */

if (existsSync(".env")) process.loadEnvFile(".env");

if (process.env.NODE_ENV === "production") {
  throw new Error("A semente de demonstração é somente para desenvolvimento local.");
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida. Copie packages/banco/.env.example para packages/banco/.env.");

const SLUG_PADRAO = "pizzaria-isaque";
const slug = process.argv[2] ?? SLUG_PADRAO;

// Preço BASE do produto. O tamanho "Pequeno" não acrescenta nada; "Grande" acrescenta R$ 5,00,
// resultando nos R$ 24,90 e R$ 29,90 — sem inventar um segundo preço fora do modelo.
const PRECO_BASE_CENTAVOS = 2490;

const GRUPOS = [
  {
    nome: "Tamanho",
    instrucao: null,
    minimoEscolhas: 1,
    maximoEscolhas: 1,
    opcoes: [
      { nome: "Pequeno", precoAdicionalCentavos: 0 },
      { nome: "Grande", precoAdicionalCentavos: 500 },
    ],
  },
  {
    nome: "Guarnições",
    instrucao: "As guarnições são as mesmas para os dois tamanhos.",
    // Opcional (mínimo 0) e até 5, como pedido: o limite é do GRUPO, não do código da aplicação.
    minimoEscolhas: 0,
    maximoEscolhas: 5,
    opcoes: [
      "Arroz branco",
      "Feijão",
      "Batata frita",
      "Purê de batata",
      "Legumes salteados",
      "Farofa",
      "Salada",
      "Vinagrete",
      "Macarrão",
      "Couve refogada",
    ].map((nome) => ({ nome, precoAdicionalCentavos: 0 })),
  },
  {
    nome: "Carne",
    instrucao: null,
    minimoEscolhas: 1,
    maximoEscolhas: 1,
    opcoes: [
      { nome: "Bife bovino", precoAdicionalCentavos: 0 },
      { nome: "Frango grelhado", precoAdicionalCentavos: 0 },
      { nome: "Linguiça", precoAdicionalCentavos: 0 },
      { nome: "Carne de panela", precoAdicionalCentavos: 0 },
      { nome: "Peixe", precoAdicionalCentavos: 300 },
    ],
  },
] as const;

const { banco, encerrar } = criarConexaoBanco(url);

try {
  const [empresa] = await banco
    .select({ id: empresas.id, nome: identidades.nomeExibicao })
    .from(empresas)
    .innerJoin(identidades, eq(identidades.empresaId, empresas.id))
    .where(eq(empresas.slug, slug))
    .limit(1);
  if (!empresa) throw new Error(`Empresa com slug "${slug}" não encontrada neste banco.`);
  console.log(`Empresa: ${empresa.nome} (${slug})`);

  // CATEGORIA: reaproveita a existente; senão cria no fim da ordem atual.
  const categoriasAtuais = await banco.select().from(categoriasProduto).where(eq(categoriasProduto.empresaId, empresa.id));
  const categoriaExistente = categoriasAtuais.find((categoria) => categoria.nome.toLowerCase() === "monte seu prato");
  const categoria =
    categoriaExistente ??
    (
      await banco
        .insert(categoriasProduto)
        .values({ empresaId: empresa.id, nome: "Monte seu prato", posicao: categoriasAtuais.length })
        .returning()
    )[0]!;
  console.log(`${categoriaExistente ? "Categoria já existia" : "Categoria criada"}: ${categoria.nome} (${categoria.id})`);

  /*
   * PRODUTO da categoria. A regra da interface é "categoria com UM único produto personalizável vira
   * o montador", então esta categoria fica com um produto só.
   */
  const produtosDaCategoria = await banco
    .select()
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresa.id), eq(produtos.categoriaId, categoria.id)));
  const produtoExistente = produtosDaCategoria.find((item) => item.nome.toLowerCase() === "monte seu prato");
  const produto =
    produtoExistente ??
    (
      await banco
        .insert(produtos)
        .values({
          empresaId: empresa.id,
          categoriaId: categoria.id,
          nome: "Monte seu prato",
          descricao: "Escolha o tamanho, as guarnições e a carne do seu jeito.",
          precoCentavos: PRECO_BASE_CENTAVOS,
          disponibilidade: "disponivel",
        })
        .returning()
    )[0]!;
  console.log(`${produtoExistente ? "Produto já existia" : "Produto criado"}: ${produto.nome} (${produto.id})`);

  for (const [indice, definicao] of GRUPOS.entries()) {
    const gruposAtuais = await banco
      .select()
      .from(gruposOpcoesProduto)
      .where(and(eq(gruposOpcoesProduto.empresaId, empresa.id), eq(gruposOpcoesProduto.produtoId, produto.id)));
    const grupoExistente = gruposAtuais.find((grupo) => grupo.nome.toLowerCase() === definicao.nome.toLowerCase());
    const grupo =
      grupoExistente ??
      (
        await banco
          .insert(gruposOpcoesProduto)
          .values({
            empresaId: empresa.id,
            produtoId: produto.id,
            nome: definicao.nome,
            instrucao: definicao.instrucao,
            minimoEscolhas: definicao.minimoEscolhas,
            maximoEscolhas: definicao.maximoEscolhas,
            posicao: indice,
          })
          .returning()
      )[0]!;

    const opcoesAtuais = await banco
      .select()
      .from(opcoesProduto)
      .where(and(eq(opcoesProduto.empresaId, empresa.id), eq(opcoesProduto.grupoId, grupo.id)));
    const faltantes = definicao.opcoes
      .map((opcao, posicao) => ({ ...opcao, posicao }))
      .filter((opcao) => !opcoesAtuais.some((atual) => atual.nome.toLowerCase() === opcao.nome.toLowerCase()));
    if (faltantes.length > 0) {
      await banco.insert(opcoesProduto).values(
        faltantes.map((opcao) => ({
          empresaId: empresa.id,
          grupoId: grupo.id,
          nome: opcao.nome,
          precoAdicionalCentavos: opcao.precoAdicionalCentavos,
          disponibilidade: "disponivel" as const,
          posicao: opcao.posicao,
        })),
      );
    }

    const regra = `mín ${grupo.minimoEscolhas} / máx ${grupo.maximoEscolhas}`;
    console.log(`  Grupo ${grupo.nome} (${regra}): ${opcoesAtuais.length + faltantes.length} opções (${faltantes.length} novas)`);
  }

  console.log("\nSemente concluída. Abra a conversa com a empresa e toque em “Ver cardápio”.");
} finally {
  await encerrar();
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IdentidadeOperavel } from "@jaa/contratos";
import { resolverIdentidadeAtiva } from "./selecao-identidade.ts";

const pessoal: IdentidadeOperavel = { tipo: "pessoal", identidadeId: "aaaaaaaa-0000-4000-8000-000000000000", nomeExibicao: "Junior Rocha", nomeUsuario: "junior" };
const empresa: IdentidadeOperavel = {
  tipo: "empresarial",
  identidadeId: "bbbbbbbb-0000-4000-8000-000000000000",
  nomeExibicao: "Pizzaria BH",
  nomeUsuario: "pizzariabh",
  empresa: { id: "cccccccc-0000-4000-8000-000000000000", slug: "pizzaria-bh", papel: "proprietario" },
};

describe("resolverIdentidadeAtiva", () => {
  it("usa a preferência só se ela estiver entre as identidades operáveis informadas pelo servidor", () => {
    assert.equal(resolverIdentidadeAtiva([pessoal, empresa], empresa.identidadeId), empresa);
    assert.equal(resolverIdentidadeAtiva([pessoal, empresa], null), pessoal);
  });

  it("id forjado/alterado no navegador ou de empresa sem acesso cai para a identidade pessoal", () => {
    assert.equal(resolverIdentidadeAtiva([pessoal, empresa], "dddddddd-0000-4000-8000-000000000000"), pessoal);
    assert.equal(resolverIdentidadeAtiva([pessoal], empresa.identidadeId), pessoal, "acesso removido → pessoal");
    assert.equal(resolverIdentidadeAtiva([], empresa.identidadeId), null);
  });
});

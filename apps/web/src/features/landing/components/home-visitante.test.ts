import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { areaComPainelLateral } from "../../../components/navegacao/areas.ts";

/*
 * HOME como porta de entrada do VISITANTE: o MESMO caminho do Link do Jaa, sem sistema paralelo. As peças
 * de Next (useRouter, dynamic) não renderizam fora dele; as garantias são conferidas na fonte, como nos
 * demais testes de visitante.
 */
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("Home → visitante → busca → conversa", () => {
  const comecar = fonte("./comecar-conversa.tsx");
  const entrada = fonte("./entrada-publica.tsx");
  const landing = fonte("./landing-page.tsx");

  it("o campo é real: pesquisa do mensageiro + sessão de visitante de sempre, nada de demonstração", () => {
    assert.ok(landing.includes("<ComecarConversa />"));
    assert.ok(comecar.includes('import { pesquisarNoJaa } from "@/features/contatos/lib/api-contatos"'));
    assert.ok(comecar.includes("garantirSessaoDeVisitante()"));
    assert.ok(!comecar.includes("./demonstracoes"), "nenhum dado das demonstrações da landing");
    // Sugestões = consulta pública de perfis reais, sem sessão.
    assert.ok(comecar.includes("buscarIdentidadePublica(usuario)") && comecar.includes("usuariosSugeridosNaHome("));
  });

  it("atalhos por intenção vêm do dado público real; serviço é só texto (profissional exige conta)", () => {
    assert.ok(comecar.includes("agruparPorIntencao(sugestoes)"));
    assert.ok(comecar.includes('"Quer falar com alguém?"') && comecar.includes('"Quer pedir comida?"'));
    assert.ok(comecar.includes('data-intencao="servico"') && comecar.includes('<Link href="/cadastro">Com uma conta</Link>'));
    // Nada de busca de profissionais para o visitante nesta fase.
    assert.ok(!comecar.includes("profissionais/busca") && !comecar.includes("buscarProfissionais"));
    assert.ok(comecar.includes("Ou comece por um destes:"));
  });

  it("a sessão só nasce quando a pessoa pesquisa (2+ caracteres) ou escolhe alguém", () => {
    assert.ok(comecar.includes("termoLimpo.length >= TERMO_BUSCA_TAMANHO_MINIMO"));
    assert.ok(/if \(!deveBuscar\) return;/.test(comecar));
    const sessao = fonte("../../link/lib/api-visitante.ts");
    // Reaproveita a sessão existente; só 401 abre visitante; outra falha não manda entrar.
    assert.ok(/if \(conta\.ok \|\| conta\.status !== 401\) return conta;/.test(sessao));
  });

  it("escolher converge para o fluxo do Link do Jaa: FluxoAutenticacao com o destino, sem nova página", () => {
    assert.ok(entrada.includes("destino?: DestinoDoLink | undefined;"));
    assert.ok(/<Fluxo\s+\{\.\.\.\(destino \? \{ destino \} : \{\}\)\}/.test(entrada));
    assert.ok(entrada.includes("<ComecarConversaNaHome.Provider value={setDestino}>"));
    // Fora da Home: o próprio Link do Jaa.
    assert.ok(comecar.includes("router.push(`/@${pessoa.nomeUsuario}`)"));
    // Falha da sessão/pesquisa é falha com "Tentar novamente", nunca a tela de entrar.
    assert.ok(comecar.includes("data-falha-comecar") && comecar.includes("Tentar novamente"));
    assert.ok(!/\/entrar|FluxoAutenticacao/.test(comecar));
  });

  it("movimento respeita prefers-reduced-motion e o campo tem foco visível próprio", () => {
    const css = fonte("../landing.css");
    const reduzido = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const classe of [".lp-comecar-mascote", ".lp-comecar-digitando i", ".lp-comecar-campo", ".lp-entrar-no-jaa"]) assert.ok(reduzido.includes(classe), classe);
    assert.ok(css.includes(".lp-comecar-campo:focus-within {"));
    // 16px: o celular não amplia a página ao focar o campo.
    assert.ok(/\.lp-comecar-campo input \{[^}]*font-size: 16px;/.test(css));
  });
});

describe("regressões da restauração do visitante", () => {
  it("Conversas/Contatos na navegação abrem o painel lateral; o botão próprio continua alternando", () => {
    assert.ok(areaComPainelLateral("conversas") && areaComPainelLateral("contatos"));
    assert.ok(!areaComPainelLateral("perfil") && !areaComPainelLateral("pedidos"));
    const app = fonte("../../../components/navegacao/app-jaa.tsx");
    assert.ok(app.includes("if (areaComPainelLateral(id)) preferenciaPainel.definir(false);"));
    assert.ok(app.includes("aoAbrir={abrirPelaNavegacao}"));
    // Aberturas por código ("Conversar com…") usam `abrir`, que não mexe na preferência.
    assert.ok(/function abrirConversaCom[\s\S]*?abrir\("conversas"\);/.test(app));
    assert.ok(fonte("../../../components/navegacao/mestre-detalhe.tsx").includes("alternar: preferenciaPainel.alternar"));
  });

  it("pesquisa do mensageiro sem anel/contorno de foco (cursor indica o foco, como no compositor)", () => {
    const pesquisa = fonte("../../contatos/components/pesquisa-jaa.tsx");
    assert.ok(!pesquisa.includes("focus-within:ring"));
    assert.ok(pesquisa.includes('className="campo-sem-contorno min-w-0 flex-1'));
    // A exceção é só do campo de texto: o foco visível global continua para o resto.
    const css = fonte("../../../app/globals.css");
    assert.ok(css.includes(":focus-visible {\n  outline: 2px solid var(--cor-marca);"));
    assert.ok(css.includes(".campo-sem-contorno:focus-visible {"));
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { abasDoPerfil } from "../components/area-perfil.tsx";
import { SEM_TELEFONE, prepararNovoTelefone, textosDoTelefone } from "./telefone-da-conta.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "");

describe("Perfil Web organizado por áreas", () => {
  const perfil = ler("../components/area-perfil.tsx");

  it("pessoa: Perfil, Privacidade, Conta e segurança, Perfil profissional, Minhas empresas; empresa: Perfil, Privacidade, Horários", () => {
    assert.deepEqual(abasDoPerfil(false, { empresas: true, horarios: false }), ["perfil", "privacidade", "conta", "profissional", "empresas"]);
    assert.deepEqual(abasDoPerfil(true, { empresas: false, horarios: true }), ["perfil", "privacidade", "horarios"]);
    // Empresa não tem conta/senha próprias, nem perfil profissional.
    assert.ok(!abasDoPerfil(true, { empresas: true, horarios: true }).some((aba) => aba === "conta" || aba === "profissional" || aba === "empresas"));
    for (const rotulo of ['perfil: "Perfil"', 'privacidade: "Privacidade"', 'conta: "Conta e segurança"', 'profissional: "Perfil profissional"', 'empresas: "Minhas empresas"', 'horarios: "Horários"']) assert.ok(perfil.includes(rotulo), rotulo);
  });

  it("só UMA área aparece por vez (abas acessíveis), em vez de tudo empilhado", () => {
    assert.ok(perfil.includes('role="tablist"') && perfil.includes('role="tab"') && perfil.includes('role="tabpanel"') && perfil.includes("aria-selected={aba === item}"));
    for (const condicao of ['{aba === "perfil" && (', '{aba === "privacidade" && (', '{aba === "conta" && !ehEmpresa && <ContaESeguranca />}', '{aba === "profissional" && !ehEmpresa && <EntradaPerfilProfissional', '{aba === "empresas" && !ehEmpresa && empresas}', '{aba === "horarios" && ehEmpresa && horarios}']) {
      assert.ok(perfil.includes(condicao), condicao);
    }
    // Quem monta as áreas da conta e da empresa é a navegação, que conhece as duas.
    const navegacao = ler("../../../components/navegacao/app-jaa.tsx");
    assert.ok(navegacao.includes("horarios: <HorariosDeFuncionamento") && navegacao.includes("<AreaEmpresas aoEmpresaCriada"));
  });

  it("nenhuma funcionalidade do Perfil saiu: foto, dados, link, status e todos os controles de privacidade", () => {
    for (const parte of ["<FotoDoPerfil", 'id="perfil-nome"', 'id="perfil-usuario"', 'id="perfil-frase"', 'id="perfil-cidade"', 'id="perfil-sobre"', "data-salvar-perfil", "<LinkDoJaa", 'role="radiogroup"', 'id="visibilidadeFoto"', 'id="visibilidadeStatus"', 'id="visibilidadePresenca"', 'name="buscavelPorTelefone"']) {
      assert.ok(perfil.includes(parte), parte);
    }
    // Cada coisa na sua área: status e link no Perfil; os quatro controles na Privacidade.
    const abaPerfil = perfil.slice(perfil.indexOf('{aba === "perfil" && ('), perfil.indexOf('{aba === "privacidade" && ('));
    const abaPrivacidade = perfil.slice(perfil.indexOf('{aba === "privacidade" && ('), perfil.indexOf('{aba === "conta"'));
    assert.ok(abaPerfil.includes("<LinkDoJaa") && abaPerfil.includes('role="radiogroup"') && !abaPerfil.includes("buscavelPorTelefone"));
    assert.ok(abaPrivacidade.includes('name="buscavelPorTelefone"') && abaPrivacidade.includes('id="visibilidadeFoto"') && !abaPrivacidade.includes("FormularioTelefone"));
  });
});

describe("Conta e segurança: linhas compactas, formulários só quando pedidos", () => {
  const conta = ler("../components/conta-e-seguranca.tsx");
  const linha = ler("../components/linha-da-conta.tsx");
  const telefone = ler("../components/formulario-telefone.tsx");
  const email = ler("../components/formulario-email.tsx");
  const senha = ler("../components/formulario-senha.tsx");

  it("um cartão só, na ordem Telefone, E-mail, Senha, PIN", () => {
    const ordem = ["<FormularioTelefone />", "<FormularioEmail />", "<FormularioSenha />", "<LinhaPin />"].map((parte) => conta.indexOf(parte));
    assert.ok(ordem.every((posicao) => posicao >= 0), String(ordem));
    assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
    assert.equal((conta.match(/<Cartao /g) ?? []).length, 1);
    for (const fonte of [telefone, email, senha]) assert.ok(fonte.includes("<LinhaDaConta") && !fonte.includes("<Cartao"), "cada dado é uma linha, sem cartão próprio");
    assert.ok(linha.includes("{rotulo}") && linha.includes("{valor}") && linha.includes("{acao}") && linha.includes("{children}"));
  });

  it("senha: fechada mostra •••••••• e UMA ação; os campos só existem depois do clique", () => {
    assert.ok(senha.includes("const [aberto, setAberto] = useState(false);"));
    assert.ok(senha.includes('"••••••••"') && senha.includes('"Nenhuma senha criada"') && senha.includes("data-alterar-senha"));
    assert.ok(senha.includes('{definida ? "Alterar senha" : "Criar senha"}'));
    const formulario = senha.slice(senha.indexOf("{aberto && ("));
    assert.ok(formulario.includes('id="senha-atual"') && formulario.includes('id="senha-nova"') && formulario.includes("Cancelar"));
    assert.ok(!senha.slice(0, senha.indexOf("{aberto && (")).includes('id="senha-nova"'), "campo de senha fora do formulário fechado");
    // A regra não mudou: trocar continua exigindo a senha atual, pela mesma rota.
    assert.ok(senha.includes("salvarSenha(senha, senhaAtual || undefined)") && senha.includes("minLength={SENHA_TAMANHO_MINIMO}"));
  });

  it("telefone e e-mail: valor + ação; o formulário abre em passos e fecha ao confirmar ou cancelar", () => {
    for (const fonte of [telefone, email]) {
      assert.ok(fonte.includes('const [passo, setPasso] = useState<Passo>("ver");'));
      assert.ok(fonte.includes('{passo === "informar" && (') && fonte.includes('{passo === "codigo" && preparado.ok && ('));
      assert.ok(fonte.includes('setPasso("ver");') && fonte.includes('irPara("ver")'));
    }
    assert.ok(telefone.includes("data-alterar-telefone") && email.includes("data-alterar-email"));
  });

  it("PIN: só a situação e a remoção; criar continua sendo depois do código, e a Web segue sem biometria", () => {
    assert.ok(conta.includes('rotulo="PIN deste navegador"') && conta.includes("removerPin()") && conta.includes("buscarSituacaoPin()"));
    assert.ok(conta.includes("Para criar um PIN, entre com código por SMS ou e-mail."));
    assert.ok(!conta.includes("criarPin") && !semComentarios(conta + telefone + email + senha).toLowerCase().includes("biometria"));
  });

  it("nada interno aparece: sem e-mail técnico, sem id de conta, sem formato E.164", () => {
    const codigo = semComentarios(conta + linha + telefone + email + senha);
    for (const proibido of ["email-tecnico", "usuarioId", "userId", "+55", "console.", "Resend", "Comtele", "Better Auth"]) assert.ok(!codigo.includes(proibido), proibido);
  });
});

describe("telefone da conta no Perfil (Web)", () => {
  const tela = ler("../components/formulario-telefone.tsx");

  it("conta com telefone: número + Alterar telefone; conta sem: 'Nenhum telefone cadastrado' + Cadastrar telefone", () => {
    assert.deepEqual(textosDoTelefone("(31) 99999-9999"), { valor: "(31) 99999-9999", acao: "Alterar telefone", campo: "Novo telefone" });
    assert.deepEqual(textosDoTelefone(null), { valor: SEM_TELEFONE, acao: "Cadastrar telefone", campo: "Telefone" });
    assert.equal(SEM_TELEFONE, "Nenhum telefone cadastrado");
  });

  it("o número novo só é enviado completo, e o MESMO número de hoje nem pede código", () => {
    assert.deepEqual(prepararNovoTelefone("(31) 98765-4321", null), { ok: true, telefone: "31987654321" });
    assert.deepEqual(prepararNovoTelefone("+55 31 98765-4321", "(31) 99999-9999"), { ok: true, telefone: "31987654321" });
    for (const incompleto of ["", "(31", "(31) 9876", "3198765432"]) assert.deepEqual(prepararNovoTelefone(incompleto, null), { ok: false, mensagem: null }, incompleto);
    assert.deepEqual(prepararNovoTelefone("319876543210", null), { ok: false, mensagem: "Número de celular inválido." });
    for (const mesmo of ["(31) 99999-9999", "31999999999", "+5531999999999"]) {
      assert.deepEqual(prepararNovoTelefone(mesmo, "(31) 99999-9999"), { ok: false, mensagem: "Este já é o telefone da sua conta." }, mesmo);
    }
  });

  it("usa as rotas do Jaaa: o servidor confere o número ANTES do SMS e só a confirmação grava", () => {
    const api = ler("./api-perfil.ts");
    assert.ok(api.includes('requisitarApi("/conta/telefone", situacaoTelefoneContaSchema, comIdentidade())'));
    assert.ok(api.includes('requisitarApi("/conta/telefone/codigo", codigoTelefoneEnviadoSchema, { method: "POST", body: JSON.stringify({ telefone })'));
    assert.ok(api.includes('requisitarApi("/conta/telefone", situacaoTelefoneContaSchema, { method: "POST", body: JSON.stringify({ telefone, codigo })'));
    // O telefone exibido só muda na confirmação, com o que o servidor devolveu.
    const pedido = tela.slice(tela.indexOf("function pedirCodigo"), tela.indexOf("function confirmar"));
    const confirmacao = tela.slice(tela.indexOf("function confirmar"), tela.indexOf("<LinhaDaConta"));
    assert.ok(!pedido.includes("setTelefoneAtual"));
    assert.ok(confirmacao.indexOf("confirmarTelefone(") < confirmacao.indexOf("setTelefoneAtual(resposta.dados.telefone)"));
    // A recusa do servidor ("já vinculado a outra conta") aparece como veio, e o fluxo não segue para o código.
    assert.ok(pedido.includes("setErro(resposta.mensagem);") && pedido.indexOf("setErro(resposta.mensagem);") < pedido.indexOf('setPasso("codigo")'));
    // O e-mail não participa da confirmação do telefone.
    assert.ok(!semComentarios(tela).includes("emailOtp") && !semComentarios(tela).includes("requestEmailChange"));
    assert.ok(tela.includes("Ele vale por 5 minutos.") && tela.includes("codigo.length !== 6"));
  });

  it("telefone da CONTA não toca na preferência de PRIVACIDADE de busca pelo celular", () => {
    const codigo = semComentarios(tela + ler("./telefone-da-conta.ts"));
    for (const proibido of ["buscavelPorTelefone", "salvarPrivacidade", "privacidade"]) assert.ok(!codigo.includes(proibido), proibido);
  });
});

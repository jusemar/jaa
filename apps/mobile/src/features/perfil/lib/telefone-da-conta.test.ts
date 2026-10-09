import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SEM_TELEFONE, formatarCelularDigitado, prepararNovoTelefone, textosDoTelefone } from "./telefone-da-conta.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "");

describe("telefone da conta no Perfil (app)", () => {
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

  it("a máscara acompanha a digitação", () => {
    assert.deepEqual(["", "3", "31", "319", "3198765", "31987654321", "+5531987654321"].map(formatarCelularDigitado), ["", "(3", "(31", "(31) 9", "(31) 98765", "(31) 98765-4321", "(31) 98765-4321"]);
  });
});

describe("tela do telefone: mesmas rotas da Web, sem fluxo paralelo", () => {
  const tela = ler("../components/formulario-telefone.tsx");
  const api = ler("./api-telefone.ts");
  const perfil = ler("../components/tela-perfil.tsx");

  it("Conta e segurança no app: Telefone, E-mail e Senha, nessa ordem, sem tirar nada do Perfil", () => {
    assert.ok(perfil.includes('<Secao titulo="Conta e segurança"'));
    const ordem = ["<FormularioTelefone />", "<FormularioEmail />", "<FormularioSenha />"].map((parte) => perfil.indexOf(parte));
    assert.ok(ordem.every((posicao) => posicao >= 0) && ordem[0]! < ordem[1]! && ordem[1]! < ordem[2]!, String(ordem));
    for (const secao of ['"Meu perfil"', 'titulo="Seu link público"', 'titulo="Status"', 'titulo="Privacidade"', 'titulo="Perfil profissional"', 'titulo="Minhas empresas"', "<MinhasEmpresas />", "<SobreApp />"]) assert.ok(perfil.includes(secao), secao);
  });

  it("o servidor confere o número ANTES do SMS, e só a confirmação grava o telefone", () => {
    assert.ok(api.includes('requisitarApi("/conta/telefone", situacaoTelefoneContaSchema)'));
    assert.ok(api.includes('enviar("/conta/telefone/codigo", { telefone })') && api.includes('enviar("/conta/telefone", { telefone, codigo })'));
    // Pelo cliente do Better Auth (plugin do Expo): é ele que identifica o app e leva a sessão.
    assert.ok(api.includes("clienteAutenticacao.$fetch<unknown>(`${URL_API}${caminho}`"));
    const pedido = tela.slice(tela.indexOf("const pedirCodigo"), tela.indexOf("const confirmar"));
    const confirmacao = tela.slice(tela.indexOf("const confirmar"), tela.indexOf("<Cartao"));
    assert.ok(!pedido.includes("setTelefoneAtual"));
    assert.ok(confirmacao.indexOf("confirmarTelefone(") < confirmacao.indexOf("setTelefoneAtual(resposta.dados.telefone)"));
    // "Este número já está vinculado a outra conta." vem do servidor e interrompe o fluxo antes do código.
    assert.ok(pedido.includes("setErro(resposta.mensagem);") && pedido.indexOf("setErro(resposta.mensagem);") < pedido.indexOf('setPasso("codigo")'));
    assert.ok(tela.includes("Ele vale por 5 minutos.") && tela.includes("codigo.length !== 6") && tela.includes('autoComplete="sms-otp"'));
  });

  it("o e-mail não participa da troca de telefone, e nada é guardado no aparelho", () => {
    const codigo = semComentarios(tela + api + ler("./telefone-da-conta.ts"));
    for (const proibido of ["emailOtp", "requestEmailChange", "SecureStore", "AsyncStorage", "console.", "Comtele", "Better Auth\""]) assert.ok(!codigo.includes(proibido), proibido);
  });

  it("telefone da CONTA não toca na preferência de PRIVACIDADE de busca pelo celular", () => {
    const codigo = semComentarios(tela + api + ler("./telefone-da-conta.ts"));
    for (const proibido of ["buscavelPorTelefone", "salvarPrivacidade"]) assert.ok(!codigo.includes(proibido), proibido);
    // E a preferência continua onde sempre esteve: na seção Privacidade.
    assert.ok(perfil.includes('titulo="Privacidade"') && perfil.includes("buscavelPorTelefone"));
  });
});

describe("senha no app: cartão compacto", () => {
  const senha = ler("../components/formulario-senha.tsx");

  it("fechado mostra •••••••• e UMA ação; os campos só existem depois do toque", () => {
    assert.ok(senha.includes("const [aberto, setAberto] = useState(false);") && senha.includes('"••••••••"') && senha.includes('"Nenhuma senha criada"'));
    assert.ok(senha.includes('rotulo={definida ? "Alterar senha" : "Criar senha"}') && senha.includes("{!aberto && definida !== null && ("));
    assert.ok(senha.includes("{aberto && definida && (") && senha.includes('rotulo="Cancelar"'));
    // A regra não mudou: trocar exige a senha atual, pela mesma rota.
    assert.ok(senha.includes("salvarSenha(senha, definida ? senhaAtual : undefined)") && senha.includes("podeEnviarSenha({ definida, senha, senhaAtual })"));
    assert.ok(senha.includes("Esqueceu? Você pode entrar com código por SMS ou e-mail.") && !senha.includes("enviado para o seu celular"));
  });
});

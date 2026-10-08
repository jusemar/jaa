import {
  APELIDO_ENDERECO_TAMANHO_MAXIMO,
  BAIRRO_TAMANHO_MAXIMO,
  CIDADE_TAMANHO_MAXIMO,
  COMPLEMENTO_TAMANHO_MAXIMO,
  LOGRADOURO_TAMANHO_MAXIMO,
  NUMERO_ENDERECO_TAMANHO_MAXIMO,
  PONTO_REFERENCIA_TAMANHO_MAXIMO,
  alteracaoInvalidaLocalizacao,
  enderecoTemLocalizacaoConfirmada,
  type EnderecoCliente,
} from "@jaa/contratos";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { consultarCepNaApi } from "../lib/api-enderecos";
import { MENSAGEM_CEP, criarConsultorCep, type SituacaoCep } from "../lib/consulta-cep";
import { ENDERECO_VAZIO, dadosDoEndereco, mascararCep, normalizarUf, validarEndereco, type CampoDoEndereco, type DadosDoEndereco, type ErrosDoEndereco } from "../lib/formulario-endereco";

/*
 * CADASTRO/EDIÇÃO do endereço, dentro de "Seu pedido" — os mesmos campos e as mesmas regras da Web.
 * O texto é do cliente: o mapa (próximo passo) nunca o corrige.
 */
export function FormularioEndereco({
  endereco,
  enviando,
  aoSalvar,
  aoCancelar,
}: {
  endereco?: EnderecoCliente | undefined;
  // Buscando o ponto provável para abrir o mapa: sem toque duplo.
  enviando: boolean;
  aoSalvar: (dados: DadosDoEndereco) => void;
  aoCancelar: () => void;
}) {
  const [dados, setDados] = useState<DadosDoEndereco>(endereco ? dadosDoEndereco(endereco) : ENDERECO_VAZIO);
  const [erros, setErros] = useState<ErrosDoEndereco>({});
  const [situacaoCep, setSituacaoCep] = useState<SituacaoCep>("ocioso");

  const alterar = (campo: CampoDoEndereco) => (valor: string) => {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    // O erro do campo some quando a pessoa volta a mexer nele.
    setErros((atuais) => (atuais[campo] ? { ...atuais, [campo]: undefined } : atuais));
  };

  // CEP preenche o TEXTO (pelo servidor). Número, complemento e o PONTO continuam com quem cadastra.
  const consultorCep = useRef<ReturnType<typeof criarConsultorCep> | null>(null);
  const consultarCep = (cep: string) => {
    consultorCep.current ??= criarConsultorCep({
      requisitar: consultarCepNaApi,
      aoMudarSituacao: setSituacaoCep,
      aoPreencher: (doCep) =>
        setDados((atual) => ({
          ...atual,
          logradouro: doCep.logradouro ?? atual.logradouro,
          bairro: doCep.bairro ?? atual.bairro,
          cidade: doCep.cidade ?? atual.cidade,
          uf: (doCep.uf as DadosDoEndereco["uf"]) ?? atual.uf,
        })),
    });
    return consultorCep.current(cep);
  };

  // Aviso honesto antes de salvar: mudar endereço estrutural derruba o ponto já confirmado.
  const perderaConfirmacao =
    endereco !== undefined &&
    enderecoTemLocalizacaoConfirmada(endereco) &&
    alteracaoInvalidaLocalizacao(endereco, { ...dados, cep: dados.cep.replace(/\D/g, ""), complemento: dados.complemento || null });

  function enviar() {
    if (enviando) return;
    const validacao = validarEndereco(dados);
    if (!validacao.ok) {
      setErros(validacao.erros);
      return;
    }
    setErros({});
    aoSalvar(dados);
  }

  return (
    <View accessibilityLabel={endereco ? "Editar endereço" : "Novo endereço"} style={estilos.formulario}>
      <CampoTexto rotulo="Apelido (opcional)" value={dados.apelido ?? ""} maxLength={APELIDO_ENDERECO_TAMANHO_MAXIMO} placeholder="Casa" erro={erros.apelido} onChangeText={alterar("apelido")} returnKeyType="next" />
      <CampoTexto
        rotulo="CEP"
        value={dados.cep}
        maxLength={9}
        placeholder="00000-000"
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
        erro={erros.cep}
        {...(MENSAGEM_CEP[situacaoCep] ? { dica: MENSAGEM_CEP[situacaoCep] } : {})}
        onChangeText={(texto) => {
          const cep = mascararCep(texto);
          alterar("cep")(cep);
          void consultarCep(cep);
        }}
        onBlur={() => void consultarCep(dados.cep)}
      />
      <CampoTexto rotulo="Logradouro" value={dados.logradouro} maxLength={LOGRADOURO_TAMANHO_MAXIMO} autoCapitalize="words" erro={erros.logradouro} onChangeText={alterar("logradouro")} returnKeyType="next" />
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <CampoTexto rotulo="Número" value={dados.numero} maxLength={NUMERO_ENDERECO_TAMANHO_MAXIMO} placeholder="150 ou S/N" erro={erros.numero} onChangeText={alterar("numero")} returnKeyType="next" />
        </View>
        <View style={estilos.coluna}>
          <CampoTexto rotulo="Complemento" value={dados.complemento ?? ""} maxLength={COMPLEMENTO_TAMANHO_MAXIMO} placeholder="Apto 302" erro={erros.complemento} onChangeText={alterar("complemento")} returnKeyType="next" />
        </View>
      </View>
      <CampoTexto rotulo="Bairro" value={dados.bairro} maxLength={BAIRRO_TAMANHO_MAXIMO} autoCapitalize="words" erro={erros.bairro} onChangeText={alterar("bairro")} returnKeyType="next" />
      <View style={estilos.linha}>
        <View style={estilos.cidade}>
          <CampoTexto rotulo="Cidade" value={dados.cidade} maxLength={CIDADE_TAMANHO_MAXIMO} autoCapitalize="words" erro={erros.cidade} onChangeText={alterar("cidade")} returnKeyType="next" />
        </View>
        <View style={estilos.uf}>
          <CampoTexto rotulo="UF" value={dados.uf} maxLength={2} autoCapitalize="characters" autoCorrect={false} placeholder="MG" erro={erros.uf ? "UF inválida." : null} onChangeText={(texto) => alterar("uf")(normalizarUf(texto))} returnKeyType="next" />
        </View>
      </View>
      <CampoTexto rotulo="Ponto de referência" value={dados.pontoReferencia ?? ""} maxLength={PONTO_REFERENCIA_TAMANHO_MAXIMO} placeholder="Portão azul" erro={erros.pontoReferencia} onChangeText={alterar("pontoReferencia")} returnKeyType="done" onSubmitEditing={enviar} />

      {perderaConfirmacao && (
        <Texto variante="pequeno" cor="aviso">
          Você mudou dados do endereço. Vamos pedir para confirmar de novo no mapa onde entregar.
        </Texto>
      )}

      <View style={estilos.acoes}>
        <View style={estilos.principal}>
          <Botao rotulo="Continuar para o mapa" larguraTotal carregando={enviando} textoCarregando="Abrindo o mapa…" onPress={enviar} />
        </View>
        <Botao rotulo="Cancelar" aparencia="secundario" disabled={enviando} onPress={aoCancelar} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  formulario: { gap: Espaco.tres },
  linha: { flexDirection: "row", gap: Espaco.tres },
  coluna: { flex: 1 },
  cidade: { flex: 1 },
  uf: { width: 72 },
  acoes: { flexDirection: "row", gap: Espaco.dois, marginTop: Espaco.dois },
  principal: { flex: 1 },
});

import { enderecoTemLocalizacaoConfirmada, formatarCep, formatarEnderecoResumido, rotuloEndereco, type EnderecoCliente } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { listarEnderecos, validarCoberturaEntrega } from "../lib/api-enderecos";

/*
 * ESCOLHA DO ENDEREÇO de entrega, dentro de "Seu pedido" — a mesma etapa da Web, com a mesma regra:
 * só entra no pedido endereço com PONTO CONFIRMADO, e o servidor confere se a empresa atende ali.
 *
 * O que ainda não veio para o app: cadastrar, editar e confirmar o ponto no MAPA (a Web faz isso com
 * mapa; o app ainda não tem mapa). Por isso aqui se ESCOLHE entre os endereços já confirmados — e o
 * que falta é dito com todas as letras, em vez de um botão que não funciona.
 */
export function EtapaEnderecoEntrega({
  empresaIdentidadeId,
  aoSelecionar,
  aoVoltar,
}: {
  empresaIdentidadeId: string;
  aoSelecionar: (endereco: EnderecoCliente) => void;
  aoVoltar: () => void;
}) {
  const [enderecos, setEnderecos] = useState<EnderecoCliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [validando, setValidando] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void listarEnderecos().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEnderecos(resultado.dados.enderecos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function usar(endereco: EnderecoCliente) {
    if (!enderecoTemLocalizacaoConfirmada(endereco)) return;
    setValidando(endereco.id);
    try {
      const cobertura = await validarCoberturaEntrega(empresaIdentidadeId, { latitude: endereco.latitude as number, longitude: endereco.longitude as number });
      if (!cobertura.ok || !cobertura.dados.atendida) {
        setErro(cobertura.ok ? "Esta empresa ainda não realiza entregas neste endereço." : cobertura.mensagem);
        return;
      }
      setErro(null);
      aoSelecionar(endereco);
    } finally {
      setValidando(null);
    }
  }

  const algumPendente = enderecos?.some((endereco) => !enderecoTemLocalizacaoConfirmada(endereco)) ?? false;

  return (
    <Cartao accessibilityLabel="Endereço de entrega" style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Texto variante="corpoForte">Escolha um endereço</Texto>
        <Pressable accessibilityRole="button" onPress={aoVoltar} hitSlop={8}>
          <Texto variante="pequeno" style={estilos.sublinhado}>
            Voltar ao carrinho
          </Texto>
        </Pressable>
      </View>

      {enderecos === null && !erro && <Texto cor="conteudoSuave">Carregando endereços…</Texto>}
      {enderecos?.length === 0 && <Texto cor="conteudoSuave">Você ainda não possui endereço de entrega cadastrado.</Texto>}

      {enderecos && enderecos.length > 0 && (
        <View accessibilityLabel="Endereços salvos" style={estilos.lista}>
          {enderecos.map((endereco, indice) => {
            const confirmado = enderecoTemLocalizacaoConfirmada(endereco);
            return (
              <View key={endereco.id} style={[estilos.item, indice > 0 && estilos.divisor]}>
                <View style={estilos.texto}>
                  {endereco.apelido && <Texto variante="pequenoForte">{endereco.apelido}</Texto>}
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {formatarEnderecoResumido(endereco)}
                  </Texto>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {endereco.bairro}, {endereco.cidade}/{endereco.uf} · CEP {formatarCep(endereco.cep)}
                  </Texto>
                  {/* Reutilização: endereço já confirmado não exige passar pelo mapa de novo. */}
                  <View style={estilos.situacao}>
                    {confirmado && <Icone nome="local" tamanho={12} cor="marca" />}
                    <Texto variante="pequeno" cor={confirmado ? "marca" : "aviso"}>
                      {confirmado ? "Localização confirmada" : "Ponto de entrega ainda não confirmado"}
                    </Texto>
                  </View>
                </View>
                {confirmado && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Usar este endereço: ${rotuloEndereco(endereco)}`}
                    disabled={validando !== null}
                    onPress={() => void usar(endereco)}
                    style={({ pressed }) => [estilos.usar, (pressed || validando === endereco.id) && estilos.pressionado]}>
                    <Texto variante="pequenoMedio" cor="marcaConteudo">
                      {validando === endereco.id ? "Conferindo…" : "Usar este"}
                    </Texto>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {enderecos !== null && (
        <Aviso>
          {enderecos.length === 0 || algumPendente
            ? "Para cadastrar um endereço ou confirmar o ponto de entrega no mapa, use o Jaa Web por enquanto: o aplicativo ainda não tem mapa. Depois de confirmado lá, o endereço aparece aqui."
            : "Novos endereços e ajustes do ponto no mapa são feitos no Jaa Web por enquanto."}
        </Aviso>
      )}

      {erro && (
        <Texto cor="perigo" accessibilityRole="alert">
          {erro}
        </Texto>
      )}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  cartao: { gap: Espaco.dois, padding: Espaco.tres },
  cabecalho: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between" },
  sublinhado: { textDecorationLine: "underline" },
  lista: { borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1 },
  item: { gap: Espaco.dois, paddingHorizontal: Espaco.tres, paddingVertical: 10 },
  divisor: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  texto: { gap: 1 },
  situacao: { alignItems: "center", flexDirection: "row", gap: 4 },
  usar: { alignItems: "center", alignSelf: "flex-start", backgroundColor: Cores.marca, borderRadius: Raio.compacto, justifyContent: "center", minHeight: 36, paddingHorizontal: Espaco.tres },
  pressionado: { opacity: 0.7 },
});

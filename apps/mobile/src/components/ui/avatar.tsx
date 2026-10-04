import { iniciaisDoNome, type ParticipanteConversa } from "@jaa/contratos";
import { Image } from "expo-image";
import { fotoDoAvatar } from "./foto-avatar";
import { StyleSheet, View } from "react-native";
import { Cores } from "@/constants/theme";
import { Texto } from "./texto";

/*
 * AVATAR de qualquer identidade — a mesma regra do `AvatarIdentidade` da Web: foto quando existir,
 * iniciais do nome quando não. Pessoa em um de três tons CALMOS (marca, escuro, realce), estável por
 * identidade; EMPRESA sempre em ouro, o mesmo código de cor do selo "Empresa" e do card de pedido.
 */
const TONS_PESSOA = [
  { fundo: Cores.marca, texto: Cores.marcaConteudo },
  { fundo: Cores.conteudo, texto: Cores.fundo },
  { fundo: Cores.realce, texto: Cores.conteudo },
] as const;

const TOM_EMPRESA = { fundo: Cores.avatarEmpresa, texto: Cores.conteudo } as const;

const TAMANHOS = {
  pequeno: { lado: 32, fonte: 10 },
  medio: { lado: 44, fonte: 12 },
  grande: { lado: 64, fonte: 18 },
} as const;

export type TamanhoAvatar = keyof typeof TAMANHOS;

function tomDe(identificador: string) {
  let soma = 0;
  for (const caractere of identificador) soma = (soma + caractere.charCodeAt(0)) % 997;
  return TONS_PESSOA[soma % TONS_PESSOA.length] ?? TONS_PESSOA[0];
}

export function AvatarIdentidade({
  identidade,
  fotoUrl,
  tamanho = "medio",
}: {
  // Mesma regra da Web: a foto vem NA identidade (já filtrada pela privacidade no servidor); a prop
  // `fotoUrl`, se informada, prevalece.
  identidade: Pick<ParticipanteConversa, "identidadeId" | "nomeExibicao" | "tipo"> & { fotoUrl?: string | null };
  fotoUrl?: string | null;
  tamanho?: TamanhoAvatar;
}) {
  const { lado, fonte } = TAMANHOS[tamanho];
  const forma = { width: lado, height: lado, borderRadius: lado / 2 };
  const foto = fotoDoAvatar(identidade, fotoUrl);

  if (foto) return <Image source={{ uri: foto }} style={forma} accessibilityIgnoresInvertColors />;

  const tom = identidade.tipo === "empresarial" ? TOM_EMPRESA : tomDe(identidade.identidadeId);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[estilos.circulo, forma, { backgroundColor: tom.fundo }]}>
      <Texto style={{ color: tom.texto, fontSize: fonte, fontWeight: "700", lineHeight: fonte + 4 }}>{iniciaisDoNome(identidade.nomeExibicao)}</Texto>
    </View>
  );
}

const estilos = StyleSheet.create({ circulo: { alignItems: "center", justifyContent: "center" } });

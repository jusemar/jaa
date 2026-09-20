import type { Coordenadas } from "@jaa/contratos";
import * as z from "zod";
import type { EnderecoGeocodificavel, GeocodificadorEndereco } from "./geocodificador.js";

const MAPBOX_URL_PADRAO = "https://api.mapbox.com";
const TIMEOUT_PADRAO_MS = 6000;

type BuscarHttp = (url: string, opcoes: { signal: AbortSignal }) => Promise<Response>;

export interface OpcoesGeocodificadorMapbox {
  token: string;
  urlBase?: string | undefined;
  buscar?: BuscarHttp | undefined;
  timeoutMs?: number | undefined;
}

const componenteContextoSchema = z.object({
  name: z.string().optional(),
  address_number: z.string().optional(),
  street_name: z.string().optional(),
  region_code: z.string().optional(),
  region_code_full: z.string().optional(),
  country_code: z.string().optional(),
});

const valorMatchSchema = z.enum(["matched", "unmatched", "not_applicable", "inferred", "plausible"]);
const matchCodeSchema = z
  .object({
    address_number: valorMatchSchema.optional(),
    street: valorMatchSchema.optional(),
    postcode: valorMatchSchema.optional(),
    place: valorMatchSchema.optional(),
    region: valorMatchSchema.optional(),
    locality: valorMatchSchema.optional(),
    neighborhood: valorMatchSchema.optional(),
    country: valorMatchSchema.optional(),
    confidence: z.enum(["exact", "high", "medium", "low"]).optional(),
  })
  .optional();

const featureSchema = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    feature_type: z.enum(["address", "street", "postcode", "neighborhood", "locality", "place"]).optional(),
    coordinates: z.object({ longitude: z.number(), latitude: z.number() }).optional(),
    match_code: matchCodeSchema,
    context: z
      .object({
        address: componenteContextoSchema.optional(),
        street: componenteContextoSchema.optional(),
        postcode: componenteContextoSchema.optional(),
        neighborhood: componenteContextoSchema.optional(),
        locality: componenteContextoSchema.optional(),
        place: componenteContextoSchema.optional(),
        region: componenteContextoSchema.optional(),
        country: componenteContextoSchema.optional(),
      })
      .default({}),
  }),
});

const respostaSchema = z.object({ features: z.array(featureSchema) });
type Feature = z.infer<typeof featureSchema>;

const normalizar = (valor: string | undefined) =>
  (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
const somenteDigitos = (valor: string | undefined) => (valor ?? "").replace(/\D/g, "");
const formatarCepBrasileiro = (valor: string) => {
  const digitos = somenteDigitos(valor);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
};
const mesmoTexto = (a: string | undefined, b: string | undefined) => normalizar(a) !== "" && normalizar(a) === normalizar(b);

function codigoUf(feature: Feature): string | null {
  const regiao = feature.properties.context.region;
  if (!regiao) return null;
  const completo = regiao.region_code_full?.split("-").at(-1);
  return (completo ?? regiao.region_code ?? "").toUpperCase() || null;
}

function avaliar(feature: Feature, endereco: EnderecoGeocodificavel): number | null {
  const { context, match_code: match } = feature.properties;
  const cepInformado = somenteDigitos(endereco.cep);
  const cepResultado = somenteDigitos(context.postcode?.name);
  const pais = context.country?.country_code?.toUpperCase();
  const uf = codigoUf(feature);

  // Conflitos administrativos explícitos são eliminatórios: um bom nome de rua em outro lugar não serve.
  if (pais && pais !== "BR") return null;
  if (uf && uf !== endereco.uf.toUpperCase()) return null;
  if (match?.region === "unmatched" || match?.place === "unmatched" || match?.country === "unmatched") return null;
  if (context.place?.name && !mesmoTexto(context.place.name, endereco.cidade) && match?.place !== "matched") return null;
  // CEP é o principal desempate: resultado que declara outro CEP nunca vence por estar primeiro.
  if (cepResultado && cepResultado !== cepInformado) return null;
  if (match?.postcode === "unmatched") return null;

  let pontos = 0;
  const numeroResultado = context.address?.address_number;
  const ruaResultado = context.address?.street_name ?? context.street?.name;
  const bairroCompativel = mesmoTexto(context.neighborhood?.name, endereco.bairro) || mesmoTexto(context.locality?.name, endereco.bairro);
  const numeroCompativel = mesmoTexto(numeroResultado, endereco.numero);
  const ruaCompativel = mesmoTexto(ruaResultado, endereco.logradouro);
  const cepCompativel = cepResultado !== "" && cepResultado === cepInformado;

  if (feature.properties.feature_type === "address" && (match?.address_number === "unmatched" || (numeroResultado && !numeroCompativel))) return null;
  if (feature.properties.feature_type === "address" && match?.street === "unmatched") return null;

  pontos += cepCompativel || match?.postcode === "matched" ? 60 : 0;
  pontos += numeroCompativel || match?.address_number === "matched" ? 35 : match?.address_number === "plausible" ? 20 : 0;
  pontos += ruaCompativel || match?.street === "matched" ? 35 : 0;
  pontos += mesmoTexto(context.place?.name, endereco.cidade) || match?.place === "matched" ? 20 : 0;
  pontos += uf === endereco.uf.toUpperCase() || match?.region === "matched" ? 20 : 0;
  pontos += pais === "BR" || match?.country === "matched" || match?.country === "inferred" ? 10 : 0;
  pontos += bairroCompativel || match?.neighborhood === "matched" || match?.locality === "matched" ? 10 : 0;
  pontos += { exact: 15, high: 10, medium: 5, low: -10 }[match?.confidence ?? "low"];
  pontos += { address: 15, street: 8, postcode: 5, neighborhood: 3, locality: 3, place: 0 }[feature.properties.feature_type ?? "place"];

  // Exige evidência do endereço, CEP ou bairro; cidade/UF sozinhos seriam um palpite genérico demais.
  if (!ruaCompativel && match?.street !== "matched" && !cepCompativel && match?.postcode !== "matched" && !bairroCompativel) return null;
  return pontos >= 45 ? pontos : null;
}

export function selecionarMelhorResultadoMapbox(features: Feature[], endereco: EnderecoGeocodificavel): Coordenadas | null {
  const candidatos = features
    .map((feature, indice) => ({ feature, indice, pontos: avaliar(feature, endereco) }))
    .filter((item): item is typeof item & { pontos: number } => item.pontos !== null)
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
  const melhor = candidatos[0]?.feature;
  if (!melhor) return null;

  const longitude = melhor.properties.coordinates?.longitude ?? melhor.geometry.coordinates[0];
  const latitude = melhor.properties.coordinates?.latitude ?? melhor.geometry.coordinates[1];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function criarGeocodificadorMapbox({
  token,
  urlBase = MAPBOX_URL_PADRAO,
  buscar = fetch,
  timeoutMs = TIMEOUT_PADRAO_MS,
}: OpcoesGeocodificadorMapbox): GeocodificadorEndereco {
  return {
    disponivel: true,
    async sugerir(endereco) {
      const consulta = new URL("/search/geocode/v6/forward", urlBase);
      consulta.searchParams.set("access_token", token);
      consulta.searchParams.set("country", "br");
      consulta.searchParams.set("address_number", endereco.numero);
      consulta.searchParams.set("street", endereco.logradouro);
      consulta.searchParams.set("neighborhood", endereco.bairro);
      consulta.searchParams.set("place", endereco.cidade);
      consulta.searchParams.set("region", endereco.uf);
      // A busca estruturada da v6 considera a pontuação do CEP no match_code. Enviar apenas os
      // dígitos faz o Mapbox devolver o mesmo CEP formatado, mas classificá-lo como "unmatched".
      consulta.searchParams.set("postcode", formatarCepBrasileiro(endereco.cep));
      consulta.searchParams.set("language", "pt-BR");
      consulta.searchParams.set("autocomplete", "false");
      consulta.searchParams.set("types", "address,street,postcode,neighborhood,locality");
      consulta.searchParams.set("limit", "10");
      // O usuário pode confirmar e persistir exatamente esta sugestão; portanto a consulta é permanente.
      consulta.searchParams.set("permanent", "true");

      try {
        const resposta = await buscar(consulta.toString(), { signal: AbortSignal.timeout(timeoutMs) });
        if (!resposta.ok) return null;
        const corpo = respostaSchema.safeParse(await resposta.json());
        return corpo.success ? selecionarMelhorResultadoMapbox(corpo.data.features, endereco) : null;
      } catch {
        return null;
      }
    },
  };
}

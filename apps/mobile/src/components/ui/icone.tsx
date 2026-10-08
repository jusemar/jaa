import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Cores, type Cor } from "@/constants/theme";

/*
 * Conjunto ÚNICO de ícones do Jaa no Mobile — os mesmos papéis do `icones.tsx` da Web (conversa, loja,
 * cesta, pedidos, enviar…), desenhados com os símbolos do sistema: Material Symbols no Android e
 * SF Symbols no iOS. Sempre por NOME SEMÂNTICO, nunca emoji.
 */
const SIMBOLOS = {
  conversa: { ios: "bubble.left.fill", android: "chat", web: "chat" },
  pessoas: { ios: "person.2.fill", android: "group", web: "group" },
  entrega: { ios: "shippingbox.fill", android: "local_shipping", web: "local_shipping" },
  perfil: { ios: "person.fill", android: "person", web: "person" },
  busca: { ios: "magnifyingglass", android: "search", web: "search" },
  voltar: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  enviar: { ios: "paperplane.fill", android: "send", web: "send" },
  loja: { ios: "storefront.fill", android: "storefront", web: "storefront" },
  cesta: { ios: "basket.fill", android: "shopping_basket", web: "shopping_basket" },
  sacola: { ios: "bag", android: "shopping_bag", web: "shopping_bag" },
  pedidos: { ios: "list.bullet.rectangle", android: "receipt_long", web: "receipt_long" },
  fechar: { ios: "xmark", android: "close", web: "close" },
  mais: { ios: "plus", android: "add", web: "add" },
  menos: { ios: "minus", android: "remove", web: "remove" },
  lixeira: { ios: "trash", android: "delete", web: "delete" },
  local: { ios: "mappin.and.ellipse", android: "location_on", web: "location_on" },
  localizacao: { ios: "location.fill", android: "my_location", web: "my_location" },
  check: { ios: "checkmark", android: "check", web: "check" },
  checkDuplo: { ios: "checkmark.circle", android: "done_all", web: "done_all" },
  cartao: { ios: "creditcard", android: "credit_card", web: "credit_card" },
  dinheiro: { ios: "banknote", android: "payments", web: "payments" },
  imagem: { ios: "photo", android: "image", web: "image" },
  camera: { ios: "camera.fill", android: "photo_camera", web: "photo_camera" },
  seta: { ios: "arrow.right", android: "arrow_forward", web: "arrow_forward" },
  microfone: { ios: "mic.fill", android: "mic", web: "mic" },
  tocar: { ios: "play.fill", android: "play_arrow", web: "play_arrow" },
  pausar: { ios: "pause.fill", android: "pause", web: "pause" },
  parar: { ios: "stop.fill", android: "stop", web: "stop" },
  lapis: { ios: "pencil", android: "edit", web: "edit" },
  responder: { ios: "arrowshape.turn.up.left", android: "reply", web: "reply" },
  maisAcoes: { ios: "ellipsis", android: "more_vert", web: "more_vert" },
  expandir: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  bloqueio: { ios: "nosign", android: "block", web: "block" },
  ferramenta: { ios: "wrench.and.screwdriver.fill", android: "build", web: "build" },
  anexo: { ios: "paperclip", android: "attach_file", web: "attach_file" },
  olho: { ios: "eye", android: "visibility", web: "visibility" },
  olhoFechado: { ios: "eye.slash", android: "visibility_off", web: "visibility_off" },
  sair: { ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" },
  /*
   * LOGÍSTICA — os três papéis de uma entrega, sempre com o MESMO desenho (mapa, rota, pedido):
   * a BASE de onde a rota sai, o ENTREGADOR (moto) e o CLIENTE (destino).
   */
  base: { ios: "storefront.fill", android: "storefront", web: "storefront" },
  entregador: { ios: "scooter", android: "two_wheeler", web: "two_wheeler" },
  cliente: { ios: "person.fill", android: "person_pin_circle", web: "person_pin_circle" },
} as const satisfies Record<string, SymbolViewProps["name"]>;

export type NomeIcone = keyof typeof SIMBOLOS;

export function Icone({ nome, tamanho = 20, cor = "conteudoSuave" }: { nome: NomeIcone; tamanho?: number; cor?: Cor }) {
  return <SymbolView name={SIMBOLOS[nome]} size={tamanho} tintColor={Cores[cor]} />;
}

import { enderecoTemLocalizacaoConfirmada, type Coordenadas, type EnderecoCliente } from "@jaa/contratos";
import type { DadosDoEndereco } from "./formulario-endereco";

/*
 * ESTADOS da etapa "Entregar em" — os mesmos da Web: lista → (novo | editar) → mapa → escolhido.
 * Aqui ficam as decisões puras da tela; quem fala com a API é o componente.
 */
export type EtapaDoEndereco =
  | { modo: "lista" }
  | { modo: "novo" }
  | { modo: "editar"; endereco: EnderecoCliente }
  | { modo: "mapa"; dados: DadosDoEndereco; enderecoOriginal: EnderecoCliente | null; sugestao: Coordenadas | null };

/** O que acontece ao tocar em "Usar este": endereço sem ponto confirmado passa primeiro pelo mapa. */
export function aoUsarEndereco(endereco: EnderecoCliente): "conferir-cobertura" | "confirmar-no-mapa" {
  return enderecoTemLocalizacaoConfirmada(endereco) ? "conferir-cobertura" : "confirmar-no-mapa";
}

/** Onde o mapa abre para um endereço já salvo: no ponto confirmado, quando há; senão, pede um palpite. */
export function pontoSalvo(endereco: EnderecoCliente): Coordenadas | null {
  return enderecoTemLocalizacaoConfirmada(endereco) ? { latitude: endereco.latitude as number, longitude: endereco.longitude as number } : null;
}

/** "Voltar" dentro da etapa: do formulário e do mapa volta-se para a lista; da lista, para o carrinho. */
export function destinoDoVoltar(etapa: EtapaDoEndereco): "lista" | "carrinho" {
  return etapa.modo === "lista" ? "carrinho" : "lista";
}

export const rotuloDoNovoEndereco = (totalDeEnderecos: number) => (totalDeEnderecos === 0 ? "Cadastrar endereço" : "Adicionar novo endereço");

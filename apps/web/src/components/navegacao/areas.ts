import type { IdentidadeOperavel } from "@jaa/contratos";
import type { ComponentType, SVGProps } from "react";
import {
  IconeCaixa,
  IconeConversa,
  IconeEntrega,
  IconeMapa,
  IconePedidos,
  IconePerfil,
  IconePessoas,
} from "@/components/ui/icones";

/*
 * ÁREAS DO APP — a lista de telas depende de QUEM a pessoa está sendo agora.
 *
 * Agindo como PESSOA, o Jaa é um mensageiro: conversas, contatos, perfil (e entregas, se ela
 * entrega para alguma empresa). Agindo como EMPRESA aparecem as telas de operação. Não é filtro
 * visual de permissão — a API autoriza cada chamada de qualquer forma; aqui é só não mostrar à
 * pessoa um menu que não tem nada a ver com o que ela está fazendo.
 *
 * O `id` vai para o endereço (#conversas), então a tela aberta sobrevive ao F5, pode ser enviada por
 * link e o botão "voltar" do navegador funciona.
 */

export interface AreaApp {
  id: string;
  rotulo: string;
  // Componente do conjunto único de ícones do Jaa — nunca emoji, que muda de forma a cada sistema.
  Icone: ComponentType<SVGProps<SVGSVGElement>>;
  descricao: string;
}

export const AREAS_PESSOAIS: AreaApp[] = [
  { id: "conversas", rotulo: "Conversas", Icone: IconeConversa, descricao: "Suas conversas no Jaa" },
  { id: "contatos", rotulo: "Contatos", Icone: IconePessoas, descricao: "Sua agenda e a pesquisa no Jaa" },
  { id: "entregas", rotulo: "Entregas", Icone: IconeEntrega, descricao: "Convites e entregas atribuídas a você" },
  { id: "perfil", rotulo: "Perfil", Icone: IconePerfil, descricao: "Seu perfil, status, privacidade e conta" },
];

export const AREAS_EMPRESARIAIS: AreaApp[] = [
  { id: "conversas", rotulo: "Conversas", Icone: IconeConversa, descricao: "Conversas da empresa" },
  { id: "pedidos", rotulo: "Pedidos", Icone: IconePedidos, descricao: "Pedidos recebidos e a próxima ação de cada um" },
  { id: "produtos", rotulo: "Produtos", Icone: IconeCaixa, descricao: "Catálogo e categorias da empresa" },
  { id: "logistica", rotulo: "Logística", Icone: IconeMapa, descricao: "Entregadores, saídas, base e zonas" },
  { id: "perfil", rotulo: "Perfil", Icone: IconePerfil, descricao: "Perfil público da empresa e configurações" },
];

export function areasDaIdentidade(identidade: IdentidadeOperavel | null): AreaApp[] {
  return identidade?.tipo === "empresarial" ? AREAS_EMPRESARIAIS : AREAS_PESSOAIS;
}

/** Área pedida no endereço, aceita só se existir para a identidade atual (cair em "conversas" é o certo). */
export function areaValida(areas: AreaApp[], pedida: string | null): string {
  return areas.some((area) => area.id === pedida) ? (pedida as string) : (areas[0]?.id ?? "conversas");
}

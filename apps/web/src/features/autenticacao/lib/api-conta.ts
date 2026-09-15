import {
  contaAtualSchema,
  identidadePessoalSchema,
  type ContaAtual,
  type CriarIdentidadePessoalEntrada,
  type IdentidadePessoal,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

export function buscarContaAtual(): Promise<ResultadoApi<ContaAtual>> {
  return requisitarApi("/usuarios/eu", contaAtualSchema);
}

export function criarIdentidadePessoal(
  entrada: CriarIdentidadePessoalEntrada,
): Promise<ResultadoApi<IdentidadePessoal>> {
  return requisitarApi("/identidades/pessoal", identidadePessoalSchema, {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export function testarRotaProtegida(): Promise<ResultadoApi<{ autenticado: boolean }>> {
  return requisitarApi("/autenticacao/teste-protegido", {
    parse: (valor) => {
      const autenticado = typeof valor === "object" && valor !== null && "autenticado" in valor && valor.autenticado === true;
      return { autenticado };
    },
  });
}

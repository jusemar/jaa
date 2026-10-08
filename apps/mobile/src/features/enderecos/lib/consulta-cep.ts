import type { EnderecoDoCep } from "@jaa/contratos";

/**
 * Preenchimento por CEP — a mesma regra da Web (os apps não importam código um do outro). O servidor
 * consulta o provedor; o resultado é só SUGESTÃO de texto: CEP não confirma ponto geográfico.
 */
export type SituacaoCep = "ocioso" | "consultando" | "preenchido" | "nao-encontrado" | "indisponivel";

export const MENSAGEM_CEP: Record<SituacaoCep, string | null> = {
  ocioso: null,
  consultando: "Buscando endereço pelo CEP…",
  preenchido: "Endereço preenchido pelo CEP. Confira e complete o número.",
  "nao-encontrado": "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
  indisponivel: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
};

// A consulta ao servidor entra por parâmetro (`consultarCepNaApi`, em api-enderecos): esta regra fica pura.
export type RequisitarCep = (digitos: string) => Promise<{ ok: true; dados: EnderecoDoCep } | { ok: false; codigo: string | null }>;

/**
 * Só CEP com 8 dígitos consulta; o mesmo CEP não é consultado de novo depois de RESPONDIDO; falha de
 * rede/provedor não "gasta" o CEP — a próxima digitação ou saída do campo tenta outra vez.
 */
export function criarConsultorCep({
  requisitar,
  aoPreencher,
  aoMudarSituacao,
}: {
  requisitar: RequisitarCep;
  aoPreencher: (endereco: EnderecoDoCep) => void;
  aoMudarSituacao: (situacao: SituacaoCep) => void;
}) {
  let ultimoConsultado: string | null = null;

  return async function consultar(cepDigitado: string) {
    const digitos = cepDigitado.replace(/\D/g, "");
    if (digitos.length !== 8) {
      aoMudarSituacao("ocioso");
      return;
    }
    if (ultimoConsultado === digitos) return;
    ultimoConsultado = digitos;

    aoMudarSituacao("consultando");
    const resultado = await requisitar(digitos);
    if (resultado.ok) {
      aoPreencher(resultado.dados);
      aoMudarSituacao("preenchido");
      return;
    }
    if (resultado.codigo !== "CEP_NAO_ENCONTRADO") ultimoConsultado = null;
    aoMudarSituacao(resultado.codigo === "CEP_NAO_ENCONTRADO" ? "nao-encontrado" : "indisponivel");
  };
}

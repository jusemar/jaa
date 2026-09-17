import * as z from "zod";

/**
 * CONSULTA DE CEP (ViaCEP) — fronteira com o provedor, como a geocodificação e o roteamento.
 *
 * Serve só para PREENCHER o formulário: CEP não confirma coordenada. O endereço textual e o PONTO
 * GEOGRÁFICO continuam separados, e o ponto só existe quando a pessoa confirma no mapa.
 *
 * O domínio depende desta interface; trocar de provedor é escrever outra implementação.
 */
export interface EnderecoDoCep {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export type ResultadoConsultaCep =
  | { tipo: "encontrado"; endereco: EnderecoDoCep }
  // CEP no formato certo, mas que não existe na base do provedor.
  | { tipo: "nao-encontrado" }
  // Provedor fora do ar, lento ou com resposta inesperada: o formulário segue no preenchimento manual.
  | { tipo: "indisponivel" };

export interface ConsultaCep {
  consultar(cep: string): Promise<ResultadoConsultaCep>;
}

export const URL_VIACEP = "https://viacep.com.br/ws";
const TEMPO_LIMITE_MS = 5000;

// A resposta do ViaCEP traz strings vazias quando o campo não se aplica (ex.: CEP único de cidade).
const respostaViaCepSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

const soDigitos = (cep: string) => cep.replace(/\D/g, "");
const ouNulo = (valor: string | undefined) => {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
};

export type BuscarHttp = (url: string, opcoes: { signal: AbortSignal }) => Promise<Response>;

/**
 * Implementação ViaCEP: pública, sem chave e sem cobrança — a mesma escolha já usada em outro projeto
 * do Junior. Timeout curto de propósito: preencher endereço não pode travar o cadastro.
 */
export function criarConsultaViaCep({ urlBase = URL_VIACEP, buscar, tempoLimiteMs = TEMPO_LIMITE_MS }: { urlBase?: string; buscar?: BuscarHttp; tempoLimiteMs?: number } = {}): ConsultaCep {
  const requisitar = buscar ?? ((url, opcoes) => fetch(url, opcoes));

  return {
    async consultar(cep) {
      const digitos = soDigitos(cep);
      if (digitos.length !== 8) return { tipo: "nao-encontrado" };

      const controle = new AbortController();
      const expirar = setTimeout(() => controle.abort(), tempoLimiteMs);
      try {
        const resposta = await requisitar(`${urlBase}/${digitos}/json/`, { signal: controle.signal });
        if (!resposta.ok) return { tipo: "indisponivel" };

        const corpo: unknown = await resposta.json();
        const dados = respostaViaCepSchema.safeParse(corpo);
        if (!dados.success) return { tipo: "indisponivel" };
        // O ViaCEP responde 200 com `erro` quando o CEP não existe.
        if (dados.data.erro === true || dados.data.erro === "true") return { tipo: "nao-encontrado" };

        return {
          tipo: "encontrado",
          endereco: {
            cep: digitos,
            // Resposta incompleta é normal (CEP geral de cidade): o que faltar a pessoa preenche.
            logradouro: ouNulo(dados.data.logradouro),
            bairro: ouNulo(dados.data.bairro),
            cidade: ouNulo(dados.data.localidade),
            uf: ouNulo(dados.data.uf),
          },
        };
      } catch {
        return { tipo: "indisponivel" };
      } finally {
        clearTimeout(expirar);
      }
    },
  };
}

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
  // Código IBGE do município (7 dígitos) — o ViaCEP informa; antes era descartado.
  codigoIbge: string | null;
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
export const URL_BRASILAPI = "https://brasilapi.com.br/api/cep/v1";
// Por provedor: com a reserva, o pior caso (os dois fora) fica em ~6 s em vez de travar o formulário.
const TEMPO_LIMITE_MS = 3000;

// A resposta do ViaCEP traz strings vazias quando o campo não se aplica (ex.: CEP único de cidade).
const respostaViaCepSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
  ibge: z.string().optional(),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

const soDigitos = (cep: string) => cep.replace(/\D/g, "");
const ouNulo = (valor: string | undefined) => {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
};

const codigoIbgeValido = (valor: string | undefined) => {
  const limpo = valor?.trim();
  return limpo && /^\d{7}$/.test(limpo) ? limpo : null;
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
            // Só um código no formato oficial é aproveitado; qualquer outra coisa vira null.
            codigoIbge: codigoIbgeValido(dados.data.ibge),
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

// BrasilAPI: responde 404 para CEP inexistente e já traz o código IBGE do município em `ibge.city`.
const respostaBrasilApiSchema = z.object({
  street: z.string().nullish(),
  neighborhood: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  ibge: z.object({ city: z.string().nullish() }).nullish(),
});

/** Implementação BrasilAPI (pública, sem chave): mesma saída normalizada do ViaCEP. */
export function criarConsultaBrasilApi({ urlBase = URL_BRASILAPI, buscar, tempoLimiteMs = TEMPO_LIMITE_MS }: { urlBase?: string; buscar?: BuscarHttp; tempoLimiteMs?: number } = {}): ConsultaCep {
  const requisitar = buscar ?? ((url, opcoes) => fetch(url, opcoes));

  return {
    async consultar(cep) {
      const digitos = soDigitos(cep);
      if (digitos.length !== 8) return { tipo: "nao-encontrado" };

      const controle = new AbortController();
      const expirar = setTimeout(() => controle.abort(), tempoLimiteMs);
      try {
        const resposta = await requisitar(`${urlBase}/${digitos}`, { signal: controle.signal });
        if (resposta.status === 404) return { tipo: "nao-encontrado" };
        if (!resposta.ok) return { tipo: "indisponivel" };

        const dados = respostaBrasilApiSchema.safeParse(await resposta.json());
        if (!dados.success) return { tipo: "indisponivel" };
        return {
          tipo: "encontrado",
          endereco: {
            cep: digitos,
            logradouro: ouNulo(dados.data.street ?? undefined),
            bairro: ouNulo(dados.data.neighborhood ?? undefined),
            cidade: ouNulo(dados.data.city ?? undefined),
            uf: ouNulo(dados.data.state ?? undefined),
            codigoIbge: codigoIbgeValido(dados.data.ibge?.city ?? undefined),
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

/**
 * Provedor principal + RESERVA: a reserva só é consultada quando o principal está INDISPONÍVEL
 * (fora do ar, lento, bloqueado pela rede). "Não encontrado" do principal é resposta, não falha:
 * nada de consultar dois provedores quando o primeiro respondeu.
 */
export function criarConsultaCepComReserva(principal: ConsultaCep, reserva: ConsultaCep): ConsultaCep {
  return {
    async consultar(cep) {
      const resultado = await principal.consultar(cep);
      return resultado.tipo === "indisponivel" ? reserva.consultar(cep) : resultado;
    },
  };
}

// Padrão da API: ViaCEP e, se ele estiver inacessível, BrasilAPI — o formulário não percebe a troca.
export const criarConsultaCepPadrao = (): ConsultaCep => criarConsultaCepComReserva(criarConsultaViaCep(), criarConsultaBrasilApi());

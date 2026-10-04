import { arquivoEnviadoSchema, erroApiSchema, type ArquivoEnviado } from "@jaa/contratos";
import type { RespostaApi } from "./api";

/*
 * ENVIO DE ARQUIVO (multipart) para a API do Jaa — o equivalente do `enviarArquivo` da Web.
 *
 * Não passa pelo `requisitarApi` porque lá todo corpo é JSON. Aqui o `Content-Type` NÃO é definido à
 * mão: o runtime precisa escrevê-lo junto com o boundary do multipart. A sessão e a identidade atuante
 * vão como em qualquer outra chamada; nenhuma credencial de armazenamento existe no aparelho — o
 * arquivo vai para a API, que valida, processa e grava.
 *
 * Sem dependência de módulo nativo: tudo o que toca o aparelho chega por parâmetro, para os testes
 * rodarem em Node.
 */

/** Arquivo local do aparelho, no formato que o FormData do React Native entende. */
export interface ArquivoLocal {
  uri: string;
  nome: string;
  tipo: string;
}

// O FormData do React Native aceita `{ uri, name, type }` como valor de arquivo (e texto nos demais campos).
export interface FormularioArquivo {
  append(campo: string, valor: string | { uri: string; name: string; type: string }): void;
}

// Mesmo nome de campo que a API lê (`requisicao.file()`) e que a Web envia.
export const CAMPO_ARQUIVO = "arquivo";

// Upload em rede móvel leva mais que uma chamada JSON; ainda assim, nunca uma tela presa.
const LIMITE_ENVIO_MS = 60_000;

/**
 * Campos de texto NA ORDEM dada e o arquivo POR ÚLTIMO: a API lê as partes em sequência e para no
 * arquivo (campo depois dele não existe para ela).
 */
export function montarFormulario<F extends FormularioArquivo>(formulario: F, envio: { campos?: readonly (readonly [string, string])[]; arquivo: ArquivoLocal; campoArquivo?: string }): F {
  for (const [nome, valor] of envio.campos ?? []) formulario.append(nome, valor);
  formulario.append(envio.campoArquivo ?? CAMPO_ARQUIVO, { uri: envio.arquivo.uri, name: envio.arquivo.nome, type: envio.arquivo.tipo });
  return formulario;
}

export function montarFormularioArquivo<F extends FormularioArquivo>(formulario: F, arquivo: ArquivoLocal): F {
  return montarFormulario(formulario, { arquivo });
}

export interface DependenciasEnvio {
  urlApi: string;
  buscar: typeof fetch;
  // Sessão (Cookie) + identidade atuante, resolvidos na hora do envio.
  cabecalhos: () => Promise<Record<string, string>>;
  criarFormulario: () => FormularioArquivo;
}

/** Multipart genérico (o equivalente do `enviarMultipart` da Web): resposta validada pelo schema dado. */
export async function enviarMultipart<T>(
  dependencias: DependenciasEnvio,
  caminho: string,
  schema: { safeParse: (valor: unknown) => { success: true; data: T } | { success: false } },
  envio: { campos?: readonly (readonly [string, string])[]; arquivo: ArquivoLocal; campoArquivo?: string },
): Promise<RespostaApi<T>> {
  const limite = new AbortController();
  const temporizador = setTimeout(() => limite.abort(), LIMITE_ENVIO_MS);
  try {
    const resposta = await dependencias.buscar(`${dependencias.urlApi}${caminho}`, {
      method: "POST",
      signal: limite.signal,
      credentials: "omit",
      headers: await dependencias.cabecalhos(),
      // O FormData do React Native (com `{ uri, name, type }`) é um corpo válido para o fetch nativo;
      // o tipo `BodyInit` do DOM só não conhece esse formato de arquivo.
      body: montarFormulario(dependencias.criarFormulario(), envio) as unknown as BodyInit,
    });
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = erroApiSchema.safeParse(corpo);
      return {
        ok: false,
        status: resposta.status,
        codigo: erro.success ? erro.data.codigo : null,
        mensagem: erro.success ? erro.data.mensagem : "Não foi possível enviar a imagem.",
      };
    }
    const lido = schema.safeParse(corpo);
    if (!lido.success) return { ok: false, status: resposta.status, codigo: null, mensagem: "Resposta inesperada do servidor." };
    return { ok: true, status: resposta.status, dados: lido.data };
  } catch {
    return { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." };
  } finally {
    clearTimeout(temporizador);
  }
}

export function enviarArquivoMultipart(dependencias: DependenciasEnvio, caminho: string, arquivo: ArquivoLocal): Promise<RespostaApi<ArquivoEnviado>> {
  return enviarMultipart(dependencias, caminho, arquivoEnviadoSchema, { arquivo });
}

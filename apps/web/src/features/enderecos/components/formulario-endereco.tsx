"use client";

import {
  APELIDO_ENDERECO_TAMANHO_MAXIMO,
  BAIRRO_TAMANHO_MAXIMO,
  CIDADE_TAMANHO_MAXIMO,
  COMPLEMENTO_TAMANHO_MAXIMO,
  LOGRADOURO_TAMANHO_MAXIMO,
  NUMERO_ENDERECO_TAMANHO_MAXIMO,
  PONTO_REFERENCIA_TAMANHO_MAXIMO,
  UNIDADES_FEDERACAO,
  alteracaoInvalidaLocalizacao,
  enderecoTemLocalizacaoConfirmada,
  formatarCep,
  type CriarEnderecoEntrada,
  type EnderecoCliente,
} from "@jaa/contratos";
import { useState, type FormEvent } from "react";

// Interface TÉCNICA do cadastro/edição de endereço. O texto é do cliente: o mapa nunca o corrige.

export type DadosFormularioEndereco = CriarEnderecoEntrada;

const vazio: DadosFormularioEndereco = {
  apelido: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "MG",
  pontoReferencia: "",
};

export function FormularioEndereco({
  endereco,
  enviando,
  aoSalvar,
  aoCancelar,
}: {
  endereco?: EnderecoCliente | undefined;
  enviando: boolean;
  aoSalvar: (dados: DadosFormularioEndereco) => void;
  aoCancelar: () => void;
}) {
  const [dados, setDados] = useState<DadosFormularioEndereco>(
    endereco
      ? {
          apelido: endereco.apelido,
          cep: formatarCep(endereco.cep),
          logradouro: endereco.logradouro,
          numero: endereco.numero,
          complemento: endereco.complemento ?? "",
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf,
          pontoReferencia: endereco.pontoReferencia ?? "",
        }
      : vazio,
  );

  const alterar = (campo: keyof DadosFormularioEndereco) => (valor: string) => setDados((atual) => ({ ...atual, [campo]: valor }));
  // Aviso honesto antes de salvar: mudar endereço estrutural derruba o ponto já confirmado.
  const perderaConfirmacao =
    endereco !== undefined &&
    enderecoTemLocalizacaoConfirmada(endereco) &&
    alteracaoInvalidaLocalizacao(endereco, { ...dados, cep: dados.cep.replace(/\D/g, ""), complemento: dados.complemento || null });

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aoSalvar(dados);
  }

  return (
    <form aria-label={endereco ? "Editar endereço" : "Novo endereço"} onSubmit={enviar} className="grid gap-2 rounded border border-zinc-200 p-3 text-sm sm:grid-cols-6">
      <Campo rotulo="Apelido" nome="apelido" valor={dados.apelido} maximo={APELIDO_ENDERECO_TAMANHO_MAXIMO} aoMudar={alterar("apelido")} classe="sm:col-span-2" requerido placeholder="Casa" />
      <Campo rotulo="CEP" nome="cep" valor={dados.cep} maximo={9} aoMudar={alterar("cep")} classe="sm:col-span-2" requerido placeholder="30123-000" />
      <Campo rotulo="Logradouro" nome="logradouro" valor={dados.logradouro} maximo={LOGRADOURO_TAMANHO_MAXIMO} aoMudar={alterar("logradouro")} classe="sm:col-span-4" requerido />
      <Campo rotulo="Número" nome="numero" valor={dados.numero} maximo={NUMERO_ENDERECO_TAMANHO_MAXIMO} aoMudar={alterar("numero")} classe="sm:col-span-2" requerido placeholder="150 ou S/N" />
      <Campo rotulo="Complemento" nome="complemento" valor={dados.complemento ?? ""} maximo={COMPLEMENTO_TAMANHO_MAXIMO} aoMudar={alterar("complemento")} classe="sm:col-span-2" placeholder="Apto 302" />
      <Campo rotulo="Bairro" nome="bairro" valor={dados.bairro} maximo={BAIRRO_TAMANHO_MAXIMO} aoMudar={alterar("bairro")} classe="sm:col-span-2" requerido />
      <Campo rotulo="Cidade" nome="cidade" valor={dados.cidade} maximo={CIDADE_TAMANHO_MAXIMO} aoMudar={alterar("cidade")} classe="sm:col-span-2" requerido />
      <label className="flex flex-col gap-1 sm:col-span-2">
        UF
        <select name="uf" value={dados.uf} onChange={(evento) => alterar("uf")(evento.target.value)} className="rounded border border-zinc-300 px-2 py-1.5">
          {UNIDADES_FEDERACAO.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </label>
      <Campo
        rotulo="Ponto de referência"
        nome="pontoReferencia"
        valor={dados.pontoReferencia ?? ""}
        maximo={PONTO_REFERENCIA_TAMANHO_MAXIMO}
        aoMudar={alterar("pontoReferencia")}
        classe="sm:col-span-4"
        placeholder="Portão azul"
      />

      {perderaConfirmacao && (
        <p data-aviso-confirmacao role="status" className="text-xs text-amber-700 sm:col-span-6">
          Você mudou dados do endereço. Vamos pedir para confirmar de novo no mapa onde entregar.
        </p>
      )}

      <div className="flex gap-2 sm:col-span-6">
        <button type="submit" disabled={enviando} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">
          Salvar endereço
        </button>
        <button type="button" onClick={aoCancelar} className="rounded border px-3 py-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Campo({
  rotulo,
  nome,
  valor,
  maximo,
  aoMudar,
  classe,
  requerido = false,
  placeholder,
}: {
  rotulo: string;
  nome: string;
  valor: string;
  maximo: number;
  aoMudar: (valor: string) => void;
  classe?: string;
  requerido?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${classe ?? ""}`}>
      {rotulo}
      <input
        name={nome}
        value={valor}
        required={requerido}
        maxLength={maximo}
        placeholder={placeholder}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="rounded border border-zinc-300 px-2 py-1.5"
      />
    </label>
  );
}

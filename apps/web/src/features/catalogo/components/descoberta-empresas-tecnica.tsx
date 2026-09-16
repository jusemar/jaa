"use client";

import type { EmpresaPublica } from "@jaa/contratos";
import { useState, type FormEvent } from "react";
import { buscarEmpresas } from "../lib/api-catalogo";

// Interface TÉCNICA e TEMPORÁRIA para iniciar conversa com uma empresa. NÃO é o "Encontrar" definitivo.

export function ListaEmpresasEncontradas({ empresas, aoConversar }: { empresas: EmpresaPublica[]; aoConversar: (empresa: EmpresaPublica) => void }) {
  return (
    <ol aria-label="Empresas encontradas" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {empresas.map((empresa) => (
        <li key={empresa.identidadeId} className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{empresa.nome}</span>
            <span className="block truncate text-xs text-zinc-500">@{empresa.nomeUsuario}</span>
          </span>
          <button type="button" onClick={() => aoConversar(empresa)} className="shrink-0 rounded border px-2 py-1 text-xs">
            Conversar
          </button>
        </li>
      ))}
    </ol>
  );
}

export function DescobertaEmpresasTecnica({ aoConversar }: { aoConversar: (empresa: EmpresaPublica) => void }) {
  const [busca, setBusca] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaPublica[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoBuscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = await buscarEmpresas(busca);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setEmpresas(resultado.dados.empresas);
  }

  return (
    <section aria-label="Encontrar empresa (técnico)" className="flex flex-col gap-2 rounded border border-dashed border-zinc-300 p-2">
      <form onSubmit={(evento) => void aoBuscar(evento)} className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Encontrar empresa (técnico)
          <input name="buscaEmpresa" value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="nome ou @usuario" className="min-w-0 rounded border border-zinc-300 px-2 py-1.5" />
        </label>
        <button type="submit" className="shrink-0 rounded border px-2 py-1.5 text-sm">
          Buscar
        </button>
      </form>
      {empresas && empresas.length === 0 && <p className="text-xs text-zinc-500">Nenhuma empresa encontrada.</p>}
      {empresas && empresas.length > 0 && <ListaEmpresasEncontradas empresas={empresas} aoConversar={aoConversar} />}
      {erro && (
        <p role="alert" className="text-xs text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}

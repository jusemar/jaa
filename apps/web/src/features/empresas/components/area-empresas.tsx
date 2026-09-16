"use client";

import type { Empresa } from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { AreaProdutos } from "@/features/produtos/components/area-produtos";
import { criarEmpresa, listarMinhasEmpresas, obterEmpresa } from "../lib/api-empresas";
import { sugerirSlug } from "../lib/sugerir-slug";
import { ListaEmpresas } from "./lista-empresas";

// Interface TÉCNICA e TEMPORÁRIA: "Minhas empresas". Loja pública ainda não existe. Não é o design final.

export function AreaEmpresas({ aoEmpresaCriada }: { aoEmpresaCriada: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [aberta, setAberta] = useState<Empresa | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto o usuário não editar o endereço, ele acompanha a sugestão feita a partir do nome.
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const resultado = await listarMinhasEmpresas();
    if (resultado.ok) setEmpresas(resultado.dados.empresas);
    else setErro(resultado.mensagem);
  }

  useEffect(() => {
    let ativo = true;
    void listarMinhasEmpresas().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEmpresas(resultado.dados.empresas);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function abrir(empresa: Empresa) {
    // Sempre relê do servidor: a lista local não é autorização.
    const resultado = await obterEmpresa(empresa.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      setAberta(null);
      return;
    }
    setErro(null);
    setAberta(resultado.dados);
  }

  async function aoCriar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await criarEmpresa({ nome, nomeUsuario, slug });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setNome("");
      setNomeUsuario("");
      setSlug("");
      setSlugEditado(false);
      setCriando(false);
      setAberta(resultado.dados);
      await carregar();
      aoEmpresaCriada();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Minhas empresas" className="flex flex-col gap-3 border-t border-zinc-200 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Minhas empresas</h2>
        <button type="button" onClick={() => setCriando((atual) => !atual)} className="rounded border px-3 py-1.5 text-sm">
          {criando ? "Cancelar" : "+ Criar empresa"}
        </button>
      </div>

      {criando && (
        <form aria-label="Criar empresa" onSubmit={(evento) => void aoCriar(evento)} className="grid gap-2 rounded border border-zinc-200 p-3 text-sm sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            Nome da empresa
            <input
              name="nomeEmpresa"
              value={nome}
              required
              maxLength={50}
              onChange={(evento) => {
                setNome(evento.target.value);
                if (!slugEditado) setSlug(sugerirSlug(evento.target.value));
              }}
              className="rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            @usuario da empresa
            <input name="nomeUsuarioEmpresa" value={nomeUsuario} required maxLength={31} onChange={(evento) => setNomeUsuario(evento.target.value)} placeholder="pizzariabh" className="rounded border border-zinc-300 px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Endereço da loja (/loja/…)
            <input
              name="slugEmpresa"
              value={slug}
              required
              maxLength={60}
              onChange={(evento) => {
                setSlug(evento.target.value);
                setSlugEditado(true);
              }}
              placeholder="pizzaria-bh"
              className="rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
          <button type="submit" disabled={enviando} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 sm:col-span-3">
            Criar empresa
          </button>
        </form>
      )}

      <ListaEmpresas empresas={empresas} aoAbrir={(empresa) => void abrir(empresa)} />

      {aberta && (
        <dl aria-label="Empresa aberta" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-zinc-50 p-3 text-sm">
          <dt className="text-zinc-500">Empresa</dt>
          <dd>{aberta.nome}</dd>
          <dt className="text-zinc-500">@usuario</dt>
          <dd>@{aberta.nomeUsuario}</dd>
          <dt className="text-zinc-500">Loja (futura)</dt>
          <dd>/loja/{aberta.slug}</dd>
          <dt className="text-zinc-500">Seu papel</dt>
          <dd data-papel={aberta.papel}>Proprietário</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd>{aberta.status === "ativa" ? "Ativa" : aberta.status}</dd>
        </dl>
      )}

      {aberta && (
        // `key`: trocar de empresa recomeça a administração do zero (produtos de uma empresa nunca se misturam).
        <AreaProdutos key={aberta.id} empresa={aberta} />
      )}

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}

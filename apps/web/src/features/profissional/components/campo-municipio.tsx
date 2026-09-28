"use client";

import type { MunicipioCatalogo } from "@jaa/contratos";
import { useEffect, useState, type KeyboardEvent } from "react";
import { buscarMunicipios } from "../lib/api-perfil-profissional";

/**
 * Busca de município (combobox, padrão ARIA 1.2): digita-se o nome e a API responde do catálogo LOCAL
 * (nunca IBGE/ViaCEP/Mapbox). Setas navegam, Enter escolhe, Esc fecha. Só 10 resultados por vez —
 * nada de uma lista com todos os municípios.
 */
export function CampoMunicipio({ id, aoEscolher }: { id: string; aoEscolher: (municipio: MunicipioCatalogo | null) => void }) {
  const [texto, setTexto] = useState("");
  const [opcoes, setOpcoes] = useState<MunicipioCatalogo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(-1);
  const [situacao, setSituacao] = useState<"ocioso" | "buscando" | "vazio" | "erro">("ocioso");
  const idLista = `${id}-lista`;

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let ativo = true;
    const temporizador = setTimeout(() => {
      setSituacao("buscando");
      void buscarMunicipios(termo).then((resposta) => {
        if (!ativo) return;
        const encontrados = resposta.ok ? resposta.dados : [];
        setOpcoes(encontrados);
        setDestaque(encontrados.length > 0 ? 0 : -1);
        setSituacao(resposta.ok ? (encontrados.length > 0 ? "ocioso" : "vazio") : "erro");
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [texto]);

  function escolher(municipio: MunicipioCatalogo) {
    setTexto(`${municipio.nome} – ${municipio.uf}`);
    setAberto(false);
    aoEscolher(municipio);
  }

  function teclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      setAberto(true);
      if (opcoes.length === 0) return;
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setDestaque((atual) => (atual + passo + opcoes.length) % opcoes.length);
    } else if (evento.key === "Enter" && aberto && opcoes[destaque]) {
      evento.preventDefault();
      escolher(opcoes[destaque]);
    } else if (evento.key === "Escape") {
      setAberto(false);
    }
  }

  const mostrarLista = aberto && texto.trim().length >= 2;
  const mensagem = situacao === "buscando" ? "Buscando…" : situacao === "vazio" ? "Nenhum município encontrado" : situacao === "erro" ? "Não foi possível buscar agora" : null;

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-conteudo">
        Município
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={mostrarLista && opcoes.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrarLista && destaque >= 0 ? `${idLista}-${destaque}` : undefined}
        autoComplete="off"
        placeholder="Digite o nome"
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          setAberto(true);
          aoEscolher(null);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={teclar}
        className="min-h-11 w-full rounded-jaa-compacto border border-borda bg-superficie px-3 text-base text-conteudo"
      />
      {mostrarLista && mensagem && (
        <p role="status" className="text-xs text-conteudo-suave">
          {mensagem}
        </p>
      )}
      {mostrarLista && opcoes.length > 0 && (
        <ul id={idLista} role="listbox" aria-label="Municípios" className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-jaa-compacto border border-borda bg-superficie shadow-cartao">
          {opcoes.map((municipio, indice) => (
            <li
              key={municipio.codigoIbge}
              id={`${idLista}-${indice}`}
              role="option"
              aria-selected={indice === destaque}
              // mousedown (e não click): escolhe antes do blur do campo fechar a lista.
              onMouseDown={(evento) => {
                evento.preventDefault();
                escolher(municipio);
              }}
              className={`min-h-11 cursor-pointer px-3 py-2 text-sm ${indice === destaque ? "bg-marca-suave text-marca" : "text-conteudo"}`}
            >
              {municipio.nome} – {municipio.uf}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

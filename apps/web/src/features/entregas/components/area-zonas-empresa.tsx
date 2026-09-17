"use client";

import {
  EVENTO_DESPACHO_ATUALIZADO,
  EVENTO_SAIDA_ATUALIZADA,
  MINIMO_VERTICES_ZONA,
  eventoDespachoAtualizadoSchema,
  eventoSaidaAtualizadaSchema,
  type ConfiguracaoDespacho,
  type PainelDespacho,
  type Coordenadas,
  type PoligonoZona,
  type SaidaEntrega,
  type ZonaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { CENTRO_PADRAO } from "@/features/enderecos/mapa/provedor-mapa";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { criarMapaZonaLeaflet } from "../mapa/mapa-zona-leaflet";
import type { MapaZona } from "../mapa/provedor-mapa-zona";
import { atualizarZona, criarZona, definirCompatibilidades, listarSaidasDaEmpresa, obterBase, obterPainelDespacho, salvarConfiguracaoDespacho } from "../lib/api-entregas";
import { ConfiguracaoAutomacao, PendenciasForaDeZona, QuadroDeSaidas } from "./painel-despacho";

/**
 * ZONAS DE ENTREGA e AUTOMAÇÃO (visão da empresa): desenhar as áreas no mapa, dizer quais podem ser
 * combinadas, configurar quantidade/tempo e acompanhar a formação das saídas.
 *
 * O cliente nunca escolhe zona nem vê nada disto; o entregador vê só a saída atribuída a ele.
 */
export function AreaZonasEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [painel, setPainel] = useState<PainelDespacho | null>(null);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  const [editando, setEditando] = useState<ZonaEntrega | "nova" | null>(null);
  /*
   * Onde o mapa abre ao desenhar uma zona NOVA: a base confirmada da empresa.
   * Antes ele abria sempre num centro fixo de Belo Horizonte — quem tem a base em outro bairro (ou
   * outra cidade) caía longe do próprio negócio e não conseguia desenhar a zona.
   */
  const [centroDaEmpresa, setCentroDaEmpresa] = useState<Coordenadas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [despacho, lista] = await Promise.all([obterPainelDespacho(empresaId), listarSaidasDaEmpresa(empresaId)]);
    if (despacho.ok) setPainel(despacho.dados);
    else setErro(despacho.mensagem);
    if (lista.ok) setSaidas(lista.dados.saidas);
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void Promise.all([obterPainelDespacho(empresaId), listarSaidasDaEmpresa(empresaId), obterBase(empresaId)]).then(([despacho, lista, base]) => {
      if (!ativo) return;
      if (despacho.ok) setPainel(despacho.dados);
      else setErro(despacho.mensagem);
      if (lista.ok) setSaidas(lista.dados.saidas);
      // Só a base com ponto CONFIRMADO serve de centro; sem ela o mapa continua no padrão.
      if (base.ok && base.dados.latitude !== null && base.dados.longitude !== null) {
        setCentroDaEmpresa({ latitude: base.dados.latitude, longitude: base.dados.longitude });
      }
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  /*
   * Realtime: a formação anda sozinha (pedido entrou, saída fechou, entregador foi escolhido) e um
   * pedido pode cair fora das zonas. A empresa acompanha sem F5 — mas nada disso depende da tela.
   */
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoDespacho = (evento: unknown) => {
      const resultado = eventoDespachoAtualizadoSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    const aoSaida = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizada = resultado.data.saida;
      setSaidas((atuais) => {
        const semEla = atuais.filter((item) => item.id !== atualizada.id);
        return atualizada.status === "concluida" ? semEla : [atualizada, ...semEla];
      });
    };
    socket.on(EVENTO_DESPACHO_ATUALIZADO, aoDespacho);
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoSaida);
    return () => {
      socket.off(EVENTO_DESPACHO_ATUALIZADO, aoDespacho);
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoSaida);
    };
  }, []);

  async function salvarConfiguracao(configuracao: ConfiguracaoDespacho) {
    setOcupado(true);
    try {
      const resultado = await salvarConfiguracaoDespacho(empresaId, configuracao);
      if (resultado.ok) {
        setPainel(resultado.dados);
        setErro(null);
      } else setErro(resultado.mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function salvarZona(nome: string, vertices: PoligonoZona, ativa: boolean) {
    setOcupado(true);
    try {
      const resultado =
        editando && editando !== "nova" ? await atualizarZona(empresaId, editando.id, { nome, vertices, ativa }) : await criarZona(empresaId, { nome, vertices, ativa });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setEditando(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function alternarCompatibilidade(zona: ZonaEntrega, outraId: string) {
    const novas = zona.compativeisCom.includes(outraId) ? zona.compativeisCom.filter((id) => id !== outraId) : [...zona.compativeisCom, outraId];
    setOcupado(true);
    try {
      const resultado = await definirCompatibilidades(empresaId, zona.id, novas);
      if (!resultado.ok) setErro(resultado.mensagem);
      else {
        setErro(null);
        setPainel((atual) => (atual ? { ...atual, zonas: resultado.dados.zonas } : atual));
      }
    } finally {
      setOcupado(false);
    }
  }

  const zonas = painel?.zonas ?? [];

  return (
    <section aria-label="Zonas de entrega" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Zonas e automação — {nomeEmpresa}</h3>
        <button type="button" onClick={() => void carregar()} className="rounded-jaa border px-2 py-1 text-xs">
          Atualizar
        </button>
      </div>

      <ol aria-label="Zonas" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
        {zonas.length === 0 && <li className="px-3 py-2 text-xs text-conteudo-suave">Nenhuma zona ainda. Desenhe a primeira no mapa.</li>}
        {zonas.map((zona) => (
          <li key={zona.id} data-zona={zona.id} className="flex flex-col gap-1 px-3 py-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {zona.nome} <span data-zona-ativa={zona.ativa} className={zona.ativa ? "text-marca" : "text-conteudo-suave"}>{zona.ativa ? "ativa" : "desativada"}</span>
              </span>
              <span className="flex gap-2">
                <button type="button" data-editar-zona onClick={() => setEditando(zona)} className="rounded-jaa border px-2 py-1 text-xs">
                  Editar
                </button>
                <button
                  type="button"
                  data-alternar-zona
                  disabled={ocupado}
                  onClick={() => void salvarZonaExistente(zona, !zona.ativa)}
                  className="rounded-jaa border px-2 py-1 text-xs disabled:opacity-50"
                >
                  {zona.ativa ? "Desativar" : "Ativar"}
                </button>
              </span>
            </span>
            {/* Compatibilidade é decisão explícita: sem motor de rotas, o Jaa não adivinha vizinhança. */}
            {zonas.length > 1 && (
              <span className="flex flex-wrap gap-2 text-xs text-conteudo-suave">
                Pode combinar com:
                {zonas
                  .filter((outra) => outra.id !== zona.id)
                  .map((outra) => (
                    <label key={outra.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        data-compatibilidade={`${zona.id}:${outra.id}`}
                        checked={zona.compativeisCom.includes(outra.id)}
                        disabled={ocupado}
                        onChange={() => void alternarCompatibilidade(zona, outra.id)}
                      />
                      {outra.nome}
                    </label>
                  ))}
              </span>
            )}
          </li>
        ))}
      </ol>

      <button type="button" data-nova-zona onClick={() => setEditando("nova")} className="self-start rounded bg-marca px-3 py-1.5 text-xs text-white">
        Criar zona
      </button>

      {editando && (
        <EditorDeZona
          zona={editando === "nova" ? null : editando}
          centroDaEmpresa={centroDaEmpresa}
          outras={zonas.filter((zona) => editando === "nova" || zona.id !== editando.id)}
          ocupado={ocupado}
          aoSalvar={(nome, vertices) => void salvarZona(nome, vertices, editando === "nova" ? true : editando.ativa)}
          aoCancelar={() => setEditando(null)}
        />
      )}

      {painel && <ConfiguracaoAutomacao configuracao={painel.configuracao} ocupado={ocupado} aoSalvar={(entrada) => void salvarConfiguracao(entrada)} />}
      {painel && <PendenciasForaDeZona painel={painel} />}
      <QuadroDeSaidas saidas={saidas} />

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );

  async function salvarZonaExistente(zona: ZonaEntrega, ativa: boolean) {
    setOcupado(true);
    try {
      const resultado = await atualizarZona(empresaId, zona.id, { nome: zona.nome, vertices: zona.vertices, ativa });
      if (!resultado.ok) setErro(resultado.mensagem);
      else setErro(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }
}

/**
 * Desenho da zona: o gestor toca no mapa para marcar cada canto e o contorno se fecha sozinho.
 * A geometria final é validada no SERVIDOR (polígono simples, sem sobrepor outra zona ativa).
 */
function EditorDeZona({
  zona,
  centroDaEmpresa,
  outras,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  zona: ZonaEntrega | null;
  // Base confirmada da empresa: é ali que faz sentido começar a desenhar a área de entrega.
  centroDaEmpresa: Coordenadas | null;
  outras: ZonaEntrega[];
  ocupado: boolean;
  aoSalvar: (nome: string, vertices: PoligonoZona) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaZona | null>(null);
  const [vertices, setVertices] = useState<PoligonoZona>(zona?.vertices ?? []);
  const [nome, setNome] = useState(zona?.nome ?? "");

  const pendencias = [
    nome.trim() === "" ? "dê um nome à zona" : null,
    vertices.length < MINIMO_VERTICES_ZONA ? `marque ao menos ${MINIMO_VERTICES_ZONA} pontos no mapa` : null,
  ].filter((pendencia): pendencia is string => pendencia !== null);
  const faltaParaSalvar = pendencias.join(" e ");

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;

    void criarMapaZonaLeaflet({
      elemento,
      // Editando: o primeiro vértice. Nova: a base da empresa. Sem base confirmada: o padrão.
      centro: zona?.vertices[0] ?? centroDaEmpresa ?? CENTRO_PADRAO,
      verticesIniciais: zona?.vertices,
      aoMudarVertices: setVertices,
      outrasZonas: outras.map((item) => ({ nome: item.nome, vertices: item.vertices })),
      urlTiles: URL_TILES_MAPA,
      atribuicao: ATRIBUICAO_TILES,
    }).then((mapa) => {
      if (!ativo) {
        mapa.destruir();
        return;
      }
      mapaRef.current = mapa;
    });

    return () => {
      ativo = false;
      mapaRef.current?.destruir();
      mapaRef.current = null;
    };
    // Monta uma vez por zona editada (e quando a base chega, para abrir no lugar certo): marcar
    // pontos não pode recriar o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona?.id, centroDaEmpresa?.latitude, centroDaEmpresa?.longitude]);

  return (
    <div aria-label="Desenhar zona" className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm">
      <h4 className="font-semibold">{zona ? `Editar ${zona.nome}` : "Nova zona"}</h4>
      <label className="flex flex-col gap-1 text-xs">
        Nome da zona
        <input name="nomeZona" value={nome} maxLength={60} onChange={(evento) => setNome(evento.target.value)} className="rounded-jaa border border-borda px-2 py-1" />
      </label>
      <p className="text-xs text-conteudo-suave">Toque no mapa para marcar os cantos da área. O contorno se fecha sozinho.</p>

      <div className="h-72 w-full overflow-hidden rounded-jaa border border-borda">
        <div ref={containerRef} data-mapa-zona className="h-full w-full" />
      </div>

      <p data-vertices-zona={vertices.length} className="text-xs text-conteudo-suave">
        {vertices.length} {vertices.length === 1 ? "ponto marcado" : "pontos marcados"}
        {vertices.length < MINIMO_VERTICES_ZONA ? ` · marque ao menos ${MINIMO_VERTICES_ZONA}` : ""}
      </p>

      {/* Botão desabilitado sem explicação é beco sem saída: aqui a tela diz o que falta. */}
      {faltaParaSalvar && (
        <p data-falta-para-salvar role="status" className="text-xs text-aviso">
          Para salvar: {faltaParaSalvar}.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-salvar-zona
          disabled={ocupado || pendencias.length > 0}
          onClick={() => aoSalvar(nome.trim(), vertices)}
          className="rounded bg-marca px-3 py-2 text-xs text-white disabled:opacity-50"
        >
          Salvar zona
        </button>
        <button type="button" data-limpar-zona onClick={() => mapaRef.current?.limpar()} className="rounded-jaa border px-3 py-2 text-xs">
          Limpar desenho
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-jaa border px-3 py-2 text-xs">
          Voltar
        </button>
      </div>
    </div>
  );
}

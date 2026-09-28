"use client";

import {
  LIMITES_PERFIL_PROFISSIONAL,
  type AreaAtuacaoDoDono,
  type AtividadeDoPerfil,
  type Coordenadas,
  type MunicipioCatalogo,
  type PerfilProfissionalDoDono,
  type PoligonoZona,
} from "@jaa/contratos";
import { useState } from "react";
import { IconeMais } from "@/components/ui/icones";
import { Aviso, Botao, Cartao, EstadoVazio, Interruptor, Secao, Selo } from "@/components/ui/primitivos";
import { adicionarArea, editarArea, removerArea } from "../lib/api-perfil-profissional";
import { alternarId, aplicacaoArea, descricaoArea, kmParaMetros, metrosParaKm, podeAtivarMaisAreas } from "../lib/apresentacao-perfil-profissional";
import { CENTRO_PADRAO } from "@/features/enderecos/mapa/provedor-mapa";
import { CampoMunicipio } from "./campo-municipio";
import { EditorAreaDesenhada } from "./editor-area-desenhada";
import type { Aplicar, PropsEtapa } from "./tipos";

const RAIO_MAXIMO_KM = LIMITES_PERFIL_PROFISSIONAL.raioMaximoMetros / 1000;

/**
 * ÁREAS DE ATUAÇÃO: até 5 ATIVAS (desativadas ficam guardadas e não contam). Tipos: raio a partir
 * da base (depende da base confirmada), município do catálogo local e área desenhada no mapa (mesmo
 * editor das zonas de entrega; o PostGIS valida o desenho no servidor).
 */
export function SecaoAreas({ perfil, aplicar, pendente }: PropsEtapa) {
  const [criando, setCriando] = useState(false);
  const vaga = podeAtivarMaisAreas(perfil.areas);

  return (
    <Secao
      titulo="Área de atuação"
      descricao={vaga ? "Até 5 áreas ativas" : "Máximo de 5 áreas ativas"}
      acoes={
        vaga && (
          <Botao aparencia="secundario" aria-expanded={criando} onClick={() => setCriando((atual) => !atual)}>
            <IconeMais className="h-4 w-4" /> Adicionar área
          </Botao>
        )
      }
    >
      {criando && vaga && (
        <NovaArea
          perfil={perfil}
          pendente={pendente}
          aoCriar={async (entrada) => {
            if (await aplicar(adicionarArea(entrada), { sucesso: "Área adicionada", chave: "nova-area" })) setCriando(false);
          }}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {perfil.areas.length === 0 && !criando && (
        <EstadoVazio titulo="Nenhuma área" descricao="Diga onde você atende." acao={<Botao onClick={() => setCriando(true)}>Adicionar área</Botao>} />
      )}

      {perfil.areas.length > 0 && (
        <Cartao>
          <ul className="flex flex-col divide-y divide-borda">
            {perfil.areas.map((area) => (
              <li key={area.id}>
                <LinhaArea area={area} atividades={perfil.atividades} centro={centroDoDesenho(perfil)} vaga={vaga} pendente={pendente} aplicar={aplicar} />
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </Secao>
  );
}

// "Usar esta área para": todas as atividades ou só as marcadas (sempre do próprio perfil).
function SeletorAplicacao({
  id,
  atividades,
  selecionadas,
  aoMudar,
}: {
  id: string;
  atividades: readonly AtividadeDoPerfil[];
  selecionadas: string[] | null;
  aoMudar: (selecionadas: string[] | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold text-conteudo">Usar esta área para</legend>
      <label className="flex min-h-11 items-center gap-3 text-sm sm:min-h-9">
        <input type="checkbox" id={`${id}-todas`} checked={selecionadas === null} onChange={(evento) => aoMudar(evento.target.checked ? null : [])} className="h-5 w-5" />
        Todas as atividades
      </label>
      {selecionadas !== null &&
        atividades.map((atividade) => (
          <label key={atividade.id} className="flex min-h-11 items-center gap-3 pl-8 text-sm sm:min-h-9">
            <input type="checkbox" checked={selecionadas.includes(atividade.id)} onChange={() => aoMudar(alternarId(selecionadas, atividade.id))} className="h-5 w-5" />
            {atividade.nome}
          </label>
        ))}
      {selecionadas !== null && selecionadas.length === 0 && <p className="text-xs text-aviso">Marque ao menos uma atividade.</p>}
    </fieldset>
  );
}

function CampoRaio({ id, km, aoMudar }: { id: string; km: number; aoMudar: (km: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-conteudo">
        Até {String(km).replace(".", ",")} km da sua base
      </label>
      <input
        id={id}
        type="range"
        min={1}
        max={RAIO_MAXIMO_KM}
        step={0.5}
        value={km}
        aria-valuetext={`${km} quilômetros`}
        onChange={(evento) => aoMudar(Number(evento.target.value))}
        className="h-11 w-full accent-marca"
      />
    </div>
  );
}

// Onde o mapa de desenho abre: a base confirmada; sem ela, só o centro padrão da VISTA (nunca salvo).
const centroDoDesenho = (perfil: { base: { coordenadas: Coordenadas | null } | null }): Coordenadas => perfil.base?.coordenadas ?? CENTRO_PADRAO;

function CampoDesenho({
  titulo,
  centro,
  desenho,
  outrosDesenhos,
  aoMudar,
}: {
  titulo: string;
  centro: Coordenadas;
  desenho: PoligonoZona | null;
  outrosDesenhos?: PoligonoZona[];
  aoMudar: (desenho: PoligonoZona) => void;
}) {
  const [desenhando, setDesenhando] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-conteudo-suave">{desenho ? `Área desenhada com ${desenho.length} pontos.` : "Marque no mapa os cantos da área onde você atende."}</p>
      <Botao aparencia="secundario" onClick={() => setDesenhando(true)}>
        {desenho ? "Editar desenho" : "Desenhar no mapa"}
      </Botao>
      {desenhando && (
        <EditorAreaDesenhada
          titulo={titulo}
          centro={centro}
          verticesIniciais={desenho ?? []}
          {...(outrosDesenhos ? { outrosDesenhos } : {})}
          aoConcluir={(vertices) => {
            aoMudar(vertices);
            setDesenhando(false);
          }}
          aoCancelar={() => setDesenhando(false)}
        />
      )}
    </div>
  );
}

type NovaAreaEntrada =
  | { modalidade: "raio"; raioMetros: number; servicoPerfilIds: string[] }
  | { modalidade: "municipio"; codigoIbge: string; servicoPerfilIds: string[] }
  | { modalidade: "poligono"; poligonos: PoligonoZona[]; servicoPerfilIds: string[] };

function NovaArea({
  perfil,
  pendente,
  aoCriar,
  aoCancelar,
}: {
  perfil: PerfilProfissionalDoDono;
  pendente: string | null;
  aoCriar: (entrada: NovaAreaEntrada) => void;
  aoCancelar: () => void;
}) {
  const baseConfirmada = Boolean(perfil.base?.coordenadas);
  const [modalidade, setModalidade] = useState<"raio" | "municipio" | "poligono">(baseConfirmada ? "raio" : "municipio");
  const [km, setKm] = useState(10);
  const [municipio, setMunicipio] = useState<MunicipioCatalogo | null>(null);
  // O desenho fica aqui até "Adicionar": se a API recusar, ele não se perde.
  const [desenho, setDesenho] = useState<PoligonoZona | null>(null);
  const [aplicacao, setAplicacao] = useState<string[] | null>(null);
  const aplicacaoValida = aplicacao === null || aplicacao.length > 0;
  const pronta = aplicacaoValida && (modalidade === "raio" ? baseConfirmada : modalidade === "municipio" ? municipio !== null : desenho !== null);

  const tipos = [
    { valor: "raio", rotulo: "Raio" },
    { valor: "municipio", rotulo: "Município" },
    { valor: "poligono", rotulo: "Desenhar no mapa" },
  ] as const;

  return (
    <Cartao className="flex flex-col gap-4 p-4">
      <div role="radiogroup" aria-label="Tipo de área" className="flex flex-wrap gap-2">
        {tipos.map((tipo) => (
          <button
            key={tipo.valor}
            type="button"
            role="radio"
            aria-checked={modalidade === tipo.valor}
            onClick={() => setModalidade(tipo.valor)}
            className={`min-h-11 rounded-jaa-compacto border px-4 text-sm font-medium sm:min-h-9 ${
              modalidade === tipo.valor ? "border-marca bg-marca-suave text-marca" : "border-borda bg-superficie text-conteudo-suave"
            }`}
          >
            {tipo.rotulo}
          </button>
        ))}
      </div>

      {modalidade === "raio" &&
        (baseConfirmada ? <CampoRaio id="nova-area-raio" km={km} aoMudar={setKm} /> : <Aviso tom="atencao">Confirme sua base no mapa antes.</Aviso>)}
      {modalidade === "municipio" && <CampoMunicipio id="nova-area-municipio" aoEscolher={setMunicipio} />}
      {modalidade === "poligono" && <CampoDesenho titulo="Desenhar área de atuação" centro={centroDoDesenho(perfil)} desenho={desenho} aoMudar={setDesenho} />}

      {perfil.atividades.length > 1 && <SeletorAplicacao id="nova-area" atividades={perfil.atividades} selecionadas={aplicacao} aoMudar={setAplicacao} />}

      <div className="flex flex-wrap gap-2">
        <Botao
          carregando={pendente === "nova-area"}
          textoCarregando="Adicionando…"
          disabled={pendente !== null || !pronta}
          onClick={() => {
            const servicoPerfilIds = aplicacao ?? [];
            if (modalidade === "raio") aoCriar({ modalidade, raioMetros: kmParaMetros(km), servicoPerfilIds });
            else if (modalidade === "municipio" && municipio) aoCriar({ modalidade, codigoIbge: municipio.codigoIbge, servicoPerfilIds });
            else if (modalidade === "poligono" && desenho) aoCriar({ modalidade, poligonos: [desenho], servicoPerfilIds });
          }}
        >
          Adicionar
        </Botao>
        <Botao aparencia="discreto" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

function LinhaArea({
  area,
  atividades,
  centro,
  vaga,
  pendente,
  aplicar,
}: {
  area: AreaAtuacaoDoDono;
  atividades: readonly AtividadeDoPerfil[];
  centro: Coordenadas;
  vaga: boolean;
  pendente: string | null;
  aplicar: Aplicar;
}) {
  const ocupado = pendente !== null;
  const [editando, setEditando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [km, setKm] = useState(metrosParaKm(area.raioMetros ?? 10_000));
  const [aplicacao, setAplicacao] = useState<string[] | null>(area.todasAtividades ? null : area.atividadeIds);
  // Área desenhada: o desenho salvo reabre no editor. Partes extras (se houver) são preservadas.
  const [primeiraParte, ...outrasPartes] = area.poligonos ?? [];
  const [desenho, setDesenho] = useState<PoligonoZona | null>(primeiraParte ?? null);
  const desenhoMudou = area.modalidade === "poligono" && desenho !== null && JSON.stringify(desenho) !== JSON.stringify(primeiraParte);

  return (
    <div className={`flex flex-col gap-3 p-4 ${area.ativa ? "" : "opacity-75"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-bold text-conteudo">{descricaoArea(area)}</span>
          <span className="text-xs text-conteudo-suave">{aplicacaoArea(area, atividades)}</span>
        </div>
        <Selo tom={area.ativa ? "marca" : "neutro"}>{area.ativa ? "Ativa" : "Desativada"}</Selo>
      </div>

      <Interruptor
        id={`area-ativa-${area.id}`}
        rotulo="Usar esta área"
        {...(!area.ativa && !vaga ? { descricao: "Máximo de 5 áreas ativas." } : {})}
        ligado={area.ativa}
        disabled={ocupado || (!area.ativa && !vaga)}
        aoMudar={(ativa) => void aplicar(editarArea(area.id, { ativa }), { sucesso: ativa ? "Área ativada" : "Área desativada", chave: `ativa-${area.id}` })}
      />

      {editando && (
        <div className="flex flex-col gap-4 border-t border-borda pt-3">
          {area.modalidade === "raio" && <CampoRaio id={`raio-${area.id}`} km={km} aoMudar={setKm} />}
          {area.modalidade === "poligono" && (
            <CampoDesenho titulo="Editar área desenhada" centro={centro} desenho={desenho} outrosDesenhos={outrasPartes} aoMudar={setDesenho} />
          )}
          {atividades.length > 1 && <SeletorAplicacao id={`aplicacao-${area.id}`} atividades={atividades} selecionadas={aplicacao} aoMudar={setAplicacao} />}
          <div className="flex flex-wrap gap-2">
            <Botao
              carregando={pendente === `area-${area.id}`}
              disabled={ocupado || (aplicacao !== null && aplicacao.length === 0)}
              onClick={async () => {
                const entrada = {
                  ...(area.modalidade === "raio" ? { raioMetros: kmParaMetros(km) } : {}),
                  ...(desenhoMudou && desenho ? { poligonos: [desenho, ...outrasPartes] } : {}),
                  servicoPerfilIds: aplicacao ?? [],
                };
                if (await aplicar(editarArea(area.id, entrada), { sucesso: "Área salva", chave: `area-${area.id}` })) setEditando(false);
              }}
            >
              Salvar
            </Botao>
            <Botao
              aparencia="discreto"
              onClick={() => {
                setDesenho(primeiraParte ?? null);
                setEditando(false);
              }}
            >
              Cancelar
            </Botao>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!editando && (area.modalidade === "raio" || area.modalidade === "poligono" || atividades.length > 1) && (
          <Botao aparencia="secundario" onClick={() => setEditando(true)}>
            Editar
          </Botao>
        )}
        {confirmandoRemocao ? (
          <>
            <Botao
              aparencia="perigo"
              carregando={pendente === `remover-area-${area.id}`}
              textoCarregando="Removendo…"
              disabled={ocupado}
              onClick={() => void aplicar(removerArea(area.id), { sucesso: "Área removida", chave: `remover-area-${area.id}` })}
            >
              Remover
            </Botao>
            <Botao aparencia="discreto" onClick={() => setConfirmandoRemocao(false)}>
              Cancelar
            </Botao>
          </>
        ) : (
          <Botao aparencia="discreto" onClick={() => setConfirmandoRemocao(true)}>
            Remover
          </Botao>
        )}
      </div>
    </div>
  );
}

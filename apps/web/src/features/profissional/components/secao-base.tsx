"use client";

import { UNIDADES_FEDERACAO, formatarCep, type BaseProfissionalDoDono, type Coordenadas, type SalvarBaseProfissionalEntrada, type Uf } from "@jaa/contratos";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconeCheck } from "@/components/ui/icones";
import { Aviso, Botao, CampoSelecao, CampoTexto, Cartao, Secao } from "@/components/ui/primitivos";
import { MENSAGEM_CEP, useCep } from "@/features/enderecos/hooks/use-cep";
import { criarMapaPontoPreferido } from "@/features/enderecos/mapa/mapa-mapbox";
import { CENTRO_PADRAO, type MapaPonto } from "@/features/enderecos/mapa/provedor-mapa";
import { confirmarPontoBase, salvarBase, sugerirPontoBase } from "../lib/api-perfil-profissional";
import { enderecoDoFormularioMudou } from "../lib/apresentacao-perfil-profissional";
import type { PropsEtapa } from "./tipos";

type Campos = Omit<SalvarBaseProfissionalEntrada, "codigoIbge"> & { codigoIbge: string | null };

const ehUf = (valor: string | null | undefined): valor is Uf => UNIDADES_FEDERACAO.some((uf) => uf === valor);

function camposDa(base: BaseProfissionalDoDono | null): Campos {
  return {
    cep: base ? formatarCep(base.cep) : "",
    logradouro: base?.logradouro ?? "",
    numero: base?.numero ?? "",
    complemento: base?.complemento ?? "",
    bairro: base?.bairro ?? "",
    cidade: base?.cidade ?? "",
    uf: ehUf(base?.uf) ? base.uf : "MG",
    pontoReferencia: base?.pontoReferencia ?? "",
    codigoIbge: base?.codigoIbge ?? null,
  };
}

// Passo da sequência Endereço → Local no mapa, com estado dito em texto (não só pelo ícone).
function Passo({ numero, rotulo, feito }: { numero: number; rotulo: string; feito: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${feito ? "bg-marca text-marca-conteudo" : "bg-superficie-suave text-conteudo-suave"}`}>
        {feito ? <IconeCheck className="h-3.5 w-3.5" aria-hidden="true" /> : numero}
      </span>
      <span className={feito ? "text-conteudo" : "text-conteudo-suave"}>
        {rotulo}
        <span className="sr-only">{feito ? " (feito)" : " (a fazer)"}</span>
      </span>
    </li>
  );
}

/**
 * BASE PROFISSIONAL — a primeira etapa (o raio, o município e a distância partem dela).
 * Endereço → Local no mapa → Confirmar. Mudar o endereço derruba o ponto (regra do servidor) e o
 * mapa volta com a sugestão do endereço NOVO. Endereço e ponto são privados.
 */
export function SecaoBase({ perfil, aplicar, pendente }: PropsEtapa) {
  const base = perfil.base;
  const [campos, setCampos] = useState<Campos>(() => camposDa(base));
  const [editando, setEditando] = useState(base === null);
  const [noMapa, setNoMapa] = useState(false);
  const { situacao: situacaoCep, consultar: consultarCep } = useCep((doCep) =>
    setCampos((atual) => ({
      ...atual,
      logradouro: doCep.logradouro ?? atual.logradouro,
      bairro: doCep.bairro ?? atual.bairro,
      cidade: doCep.cidade ?? atual.cidade,
      uf: ehUf(doCep.uf) ? doCep.uf : atual.uf,
      codigoIbge: doCep.codigoIbge ?? null,
    })),
  );
  const confirmada = Boolean(base?.coordenadas);
  // Formulário diferente do endereço salvo: nada de mapa (o ponto seria do endereço antigo).
  const enderecoAlterado = enderecoDoFormularioMudou(base, campos);
  const alterar = (campo: keyof Campos) => (valor: string) => setCampos((atual) => ({ ...atual, [campo]: valor }));

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const atualizado = await aplicar(salvarBase(campos), { sucesso: "Endereço salvo", chave: "base" });
    if (!atualizado?.base) return;
    setEditando(false);
    // Endereço novo (ou mudado) sem ponto: segue direto para o mapa.
    setNoMapa(!atualizado.base.coordenadas);
  }

  function editarEndereco() {
    setCampos(camposDa(base));
    setNoMapa(false);
    setEditando(true);
  }

  return (
    <Secao titulo="Sua base" descricao="Seu local de referência. Só você vê.">
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Passos da base">
        <Passo numero={1} rotulo="Endereço" feito={base !== null && !editando} />
        <li aria-hidden="true" className="text-conteudo-suave">
          →
        </li>
        <Passo numero={2} rotulo="Local no mapa" feito={confirmada && !editando} />
      </ol>

      {base && !editando && (
        <Cartao className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-bold text-conteudo">
                {base.logradouro}, {base.numero}
                {base.complemento ? ` — ${base.complemento}` : ""}
              </span>
              <span className="text-sm text-conteudo-suave">
                {base.bairro} · {base.cidade}–{base.uf} · {formatarCep(base.cep)}
              </span>
            </div>
            <Botao aparencia="secundario" disabled={pendente !== null} onClick={editarEndereco}>
              Editar endereço
            </Botao>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-3">
            {confirmada ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-marca">
                <IconeCheck className="h-4 w-4" aria-hidden="true" /> Local confirmado no mapa
              </span>
            ) : (
              <span className="text-sm font-medium text-aviso">Falta confirmar o local no mapa</span>
            )}
            {!noMapa && (
              <Botao aparencia={confirmada ? "discreto" : "principal"} disabled={pendente !== null || enderecoAlterado} onClick={() => setNoMapa(true)}>
                {confirmada ? "Ajustar no mapa" : "Confirmar no mapa"}
              </Botao>
            )}
          </div>
        </Cartao>
      )}

      {editando && (
        <Cartao className="p-4">
          <form onSubmit={(evento) => void salvar(evento)} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <CampoTexto
                id="base-cep"
                rotulo="CEP"
                inputMode="numeric"
                autoComplete="postal-code"
                value={campos.cep}
                onChange={(evento) => {
                  alterar("cep")(evento.target.value);
                  void consultarCep(evento.target.value);
                }}
                onBlur={() => void consultarCep(campos.cep)}
                {...(MENSAGEM_CEP[situacaoCep] ? { dica: MENSAGEM_CEP[situacaoCep] ?? undefined } : {})}
                required
              />
            </div>
            <div className="sm:col-span-4">
              <CampoTexto id="base-logradouro" rotulo="Rua" value={campos.logradouro} onChange={(evento) => alterar("logradouro")(evento.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <CampoTexto id="base-numero" rotulo="Número" value={campos.numero} onChange={(evento) => alterar("numero")(evento.target.value)} required />
            </div>
            <div className="sm:col-span-4">
              <CampoTexto id="base-complemento" rotulo="Complemento" value={campos.complemento ?? ""} onChange={(evento) => alterar("complemento")(evento.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <CampoTexto id="base-bairro" rotulo="Bairro" value={campos.bairro} onChange={(evento) => alterar("bairro")(evento.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <CampoTexto id="base-cidade" rotulo="Cidade" value={campos.cidade} onChange={(evento) => alterar("cidade")(evento.target.value)} required />
            </div>
            <div className="sm:col-span-1">
              <CampoSelecao id="base-uf" rotulo="UF" value={campos.uf} onChange={(evento) => ehUf(evento.target.value) && alterar("uf")(evento.target.value)}>
                {UNIDADES_FEDERACAO.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </CampoSelecao>
            </div>
            {base && enderecoAlterado && confirmada && (
              <div className="sm:col-span-6">
                <Aviso tom="atencao">Ao salvar, confirme o local no mapa de novo.</Aviso>
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-6">
              <Botao type="submit" carregando={pendente === "base"} disabled={pendente !== null}>
                Salvar endereço
              </Botao>
              {base && (
                <Botao
                  aparencia="discreto"
                  disabled={pendente !== null}
                  onClick={() => {
                    setCampos(camposDa(base));
                    setEditando(false);
                  }}
                >
                  Cancelar
                </Botao>
              )}
            </div>
          </form>
        </Cartao>
      )}

      {noMapa && base && !editando && !enderecoAlterado && (
        <ConfirmarNoMapa
          // Nova versão do endereço salvo = mapa novo, com nova sugestão (nunca o marcador do anterior).
          key={base.atualizadoEm}
          pontoAtual={base.coordenadas}
          confirmando={pendente === "ponto"}
          bloqueado={pendente !== null}
          aoConfirmar={async (ponto) => {
            if (await aplicar(confirmarPontoBase(ponto, base.atualizadoEm), { sucesso: "Local confirmado", chave: "ponto" })) setNoMapa(false);
          }}
          aoCancelar={() => setNoMapa(false)}
        />
      )}
    </Secao>
  );
}

/**
 * Mapa para marcar a base. O ponto só vale depois de "Confirmar local" (mexer no mapa não grava
 * nada) e nunca nasce do centro padrão: vem do ponto já confirmado, do palpite pelo endereço ou do
 * toque da pessoa.
 */
function ConfirmarNoMapa({
  pontoAtual,
  confirmando,
  bloqueado,
  aoConfirmar,
  aoCancelar,
}: {
  pontoAtual: Coordenadas | null;
  confirmando: boolean;
  bloqueado: boolean;
  aoConfirmar: (ponto: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ponto, setPonto] = useState<Coordenadas | null>(pontoAtual);
  const [semSugestao, setSemSugestao] = useState(false);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;
    let mapa: MapaPonto | null = null;
    void (async () => {
      const sugestao = pontoAtual ? null : await sugerirPontoBase();
      const palpite = pontoAtual ?? (sugestao?.ok ? sugestao.dados.coordenadas : null);
      if (!ativo) return;
      if (!palpite) setSemSugestao(true);
      mapa = await criarMapaPontoPreferido({ elemento, centro: palpite ?? CENTRO_PADRAO, pontoInicial: palpite, aoMoverPonto: setPonto });
      if (!ativo) mapa.destruir();
    })();
    return () => {
      ativo = false;
      mapa?.destruir();
    };
    // Monta uma vez por versão do endereço (a `key` remonta): mover o ponto não recria o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <p className="text-sm text-conteudo-suave">
        {semSugestao ? "Não achamos o endereço no mapa. Toque no local exato." : "Confira o marcador. Arraste ou toque no mapa para ajustar."}
      </p>
      <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-jaa-compacto border border-borda sm:h-80" aria-label="Mapa para marcar sua base" role="application" />
      <div className="flex flex-wrap gap-2">
        <Botao carregando={confirmando} textoCarregando="Confirmando…" disabled={bloqueado || !ponto} onClick={() => ponto && aoConfirmar(ponto)}>
          Confirmar local
        </Botao>
        <Botao aparencia="discreto" disabled={bloqueado} onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

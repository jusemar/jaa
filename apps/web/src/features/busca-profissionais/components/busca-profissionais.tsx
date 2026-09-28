"use client";

import {
  RAIOS_BUSCA_PROFISSIONAIS_KM,
  RAIO_BUSCA_PROFISSIONAIS_PADRAO_KM,
  UNIDADES_FEDERACAO,
  type Coordenadas,
  type IntencaoProfissional,
  type ProfissionalEncontrado,
  type Uf,
} from "@jaa/contratos";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoSelecao, CampoTexto, CampoTextoLongo } from "@/components/ui/primitivos";
import { abrirConversaDireta, enviarMensagem } from "@/features/conversas/lib/api-conversas";
import { MENSAGEM_CEP, useCep } from "@/features/enderecos/hooks/use-cep";
import { listarEnderecos } from "@/features/enderecos/lib/api-enderecos";
import { obterBase } from "@/features/entregas/lib/api-entregas";
import { verificarIdentidadeOperavel } from "@/features/identidades/lib/api-identidades";
import { CENTRO_PADRAO } from "@/features/enderecos/mapa/provedor-mapa";
import { buscarPerfilProfissional } from "@/features/profissional/lib/api-perfil-profissional";
import { obterIdentidadeAtuante } from "@/lib/identidade-atuante";
import { buscarProfissionais, localizarEnderecoDaPesquisa } from "../lib/api-busca-profissionais";
import { MAXIMO_SELECIONADOS, alternarSelecionado, rotuloHorario, type LocalSalvo } from "../lib/apresentacao-busca";
import { enviarParaSelecionados, type SituacaoEnvio } from "../lib/enviar-para-selecionados";
import { carregarLocaisDaPesquisa } from "../lib/locais-da-pesquisa";
import { ConfirmarPontoPesquisa } from "./confirmar-ponto-pesquisa";

type LocalPesquisa = { ponto: Coordenadas; descricao: string };
type MapaAberto = { centro: Coordenadas; pontoInicial: Coordenadas | null; orientacao: string; descricao: string };

const ehUf = (valor: string): valor is Uf => UNIDADES_FEDERACAO.some((uf) => uf === valor);

/**
 * BUSCA DE PROFISSIONAIS dentro de Conversas: intenção já escolhida → LOCAL DA PESQUISA confirmado
 * no mapa → raio → resultados (paginados, só dados públicos) → escolher À MÃO → mensagem pelas
 * conversas diretas de sempre. Nada é gravado como base ou endereço.
 */
export function BuscaProfissionais({
  intencao,
  aoFechar,
  aoAbrirConversa,
}: {
  intencao: IntencaoProfissional;
  aoFechar: () => void;
  aoAbrirConversa: (nomeUsuario: string) => void;
}) {
  // Locais já cadastrados da identidade ATUANTE: da pessoa ou da empresa em nome de quem se pesquisa.
  const identidadeAtuante = obterIdentidadeAtuante();
  const [locais, setLocais] = useState<LocalSalvo[] | null>(null);
  const [localEscolhido, setLocalEscolhido] = useState<string | null>(null);
  const [digitandoEndereco, setDigitandoEndereco] = useState(false);
  const [mapa, setMapa] = useState<MapaAberto | null>(null);
  const [local, setLocal] = useState<LocalPesquisa | null>(null);
  const [gps, setGps] = useState<"ocioso" | "obtendo" | "erro">("ocioso");
  const [raioKm, setRaioKm] = useState<number>(RAIO_BUSCA_PROFISSIONAIS_PADRAO_KM);

  const [resultados, setResultados] = useState<ProfissionalEncontrado[] | null>(null);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [situacoes, setSituacoes] = useState<Map<string, SituacaoEnvio>>(new Map());
  // Uma tentativa por conteúdo: mudar o texto é outra mensagem (ids novos).
  const tentativa = useRef<{ conteudo: string; ids: Map<string, string> }>({ conteudo: "", ids: new Map() });

  useEffect(() => {
    let ativo = true;
    void carregarLocaisDaPesquisa(identidadeAtuante, { listarEnderecos, buscarPerfilProfissional, verificarIdentidadeOperavel, obterBaseEmpresa: obterBase }).then((encontrados) => {
      if (!ativo) return;
      setLocais(encontrados);
      // Um só local cadastrado já vem escolhido; com vários, a pessoa escolhe (sem precedência inventada).
      if (encontrados.length === 1) setLocalEscolhido(encontrados[0]?.chave ?? null);
    });
    return () => {
      ativo = false;
    };
  }, [identidadeAtuante]);

  // Mudar local ou raio exige pesquisar de novo: resultado velho não fica na tela.
  function limparResultados() {
    setResultados(null);
    setSelecionados([]);
    setSituacoes(new Map());
    setTemMais(false);
    setPagina(0);
  }

  function definirLocal(ponto: Coordenadas, descricao: string) {
    setLocal({ ponto, descricao });
    setMapa(null);
    setDigitandoEndereco(false);
    limparResultados();
  }

  function usarMinhaLocalizacao() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps("erro");
      return;
    }
    setGps("obtendo");
    // Só quando a pessoa pede, e a posição vira apenas o palpite do mapa — nunca base nem cadastro.
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setGps("ocioso");
        const ponto = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
        setMapa({ centro: ponto, pontoInicial: ponto, orientacao: "Confira o marcador: arraste ou toque para ajustar.", descricao: "Minha localização" });
      },
      () => setGps("erro"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function pesquisar(proximaPagina: number) {
    if (!local) return;
    setBuscando(true);
    setErroBusca(null);
    const resposta = await buscarProfissionais(intencao, local.ponto, raioKm, proximaPagina);
    setBuscando(false);
    if (!resposta.ok) {
      setErroBusca(resposta.mensagem);
      return;
    }
    setResultados((atuais) => (proximaPagina === 0 ? resposta.dados.itens : [...(atuais ?? []), ...resposta.dados.itens]));
    setPagina(resposta.dados.pagina);
    setTemMais(resposta.dados.temMais);
  }

  async function enviar() {
    const conteudo = mensagem.trim();
    if (!conteudo || !resultados) return;
    if (tentativa.current.conteudo !== conteudo) tentativa.current = { conteudo, ids: new Map() };
    const destinatarios = resultados.filter((item) => selecionados.includes(item.identidadeId)).map(({ identidadeId, nomeUsuario }) => ({ identidadeId, nomeUsuario }));
    setEnviando(true);
    const novas = await enviarParaSelecionados(
      destinatarios,
      conteudo,
      tentativa.current.ids,
      { abrirConversa: abrirConversaDireta, enviarMensagem, novoIdCliente: () => crypto.randomUUID() },
      situacoes,
    );
    setEnviando(false);
    setSituacoes(novas);
    const [unico] = destinatarios;
    // Um só destinatário: segue direto para a conversa dele, como tocar num contato.
    if (destinatarios.length === 1 && unico && novas.get(unico.identidadeId)?.tipo === "enviada") {
      aoAbrirConversa(unico.nomeUsuario);
      aoFechar();
    }
  }

  const salvoEscolhido = locais?.find((item) => item.chave === localEscolhido) ?? null;
  const enviadas = [...situacoes.values()].filter((situacao) => situacao.tipo === "enviada").length;

  return (
    <div data-busca-profissionais role="dialog" aria-modal="true" aria-label={`Procurar ${intencao.rotulo}`} className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex max-h-dvh w-full flex-col overflow-hidden bg-superficie sm:max-w-lg sm:rounded-jaa sm:shadow-cartao">
        <div className="flex items-start justify-between gap-2 border-b border-borda p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-conteudo-suave">Procurar profissionais</p>
            <h2 className="text-base font-bold text-conteudo">{intencao.rotulo}</h2>
          </div>
          <Botao aparencia="discreto" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* 1. LOCAL DA PESQUISA */}
          <section aria-label="Local da pesquisa" className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-conteudo">Local da pesquisa</h3>

            {mapa ? (
              <ConfirmarPontoPesquisa
                centro={mapa.centro}
                pontoInicial={mapa.pontoInicial}
                orientacao={mapa.orientacao}
                aoConfirmar={(ponto) => definirLocal(ponto, mapa.descricao)}
                aoCancelar={() => setMapa(null)}
              />
            ) : local ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-jaa-compacto border border-borda p-3">
                <span className="text-sm text-conteudo">
                  <span aria-hidden="true">✓ </span>
                  {local.descricao}
                </span>
                <Botao aparencia="secundario" onClick={() => setLocal(null)}>
                  Alterar
                </Botao>
              </div>
            ) : digitandoEndereco ? (
              <EnderecoDaPesquisa aoLocalizar={(abrir) => setMapa(abrir)} aoCancelar={() => setDigitandoEndereco(false)} />
            ) : (
              <div className="flex flex-col gap-2">
                {locais === null && <p className="text-xs text-conteudo-suave">Carregando seus locais…</p>}
                {locais && locais.length > 0 && (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="sr-only">Locais já cadastrados</legend>
                    {locais.map((item) => (
                      <label key={item.chave} className="flex min-h-11 items-start gap-3 rounded-jaa-compacto border border-borda p-2 text-sm">
                        <input type="radio" name="local-salvo" className="mt-1 h-4 w-4" checked={localEscolhido === item.chave} onChange={() => setLocalEscolhido(item.chave)} />
                        <span className="min-w-0">
                          <span className="block font-medium text-conteudo">{item.descricao}</span>
                          <span className="block text-xs text-conteudo-suave">✓ {item.rotulo} · local já cadastrado</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="flex flex-wrap gap-2">
                  {salvoEscolhido && (
                    <Botao
                      onClick={() =>
                        setMapa({
                          centro: salvoEscolhido.coordenadas,
                          pontoInicial: salvoEscolhido.coordenadas,
                          orientacao: "Confira o ponto. Se precisar, ajuste só para esta pesquisa (seu cadastro não muda).",
                          descricao: salvoEscolhido.descricao,
                        })
                      }
                    >
                      Usar este local
                    </Botao>
                  )}
                  <Botao aparencia="secundario" onClick={() => setDigitandoEndereco(true)}>
                    Digitar endereço
                  </Botao>
                  <Botao aparencia="secundario" carregando={gps === "obtendo"} textoCarregando="Localizando…" onClick={usarMinhaLocalizacao}>
                    Usar minha localização
                  </Botao>
                </div>
                {gps === "erro" && <Aviso tom="atencao">Não conseguimos sua localização. Digite um endereço.</Aviso>}
              </div>
            )}
          </section>

          {/* 2. RAIO */}
          <section aria-label="Raio da pesquisa" className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-conteudo">Procurar até</h3>
            <div role="radiogroup" aria-label="Raio da pesquisa" className="flex flex-wrap gap-2">
              {RAIOS_BUSCA_PROFISSIONAIS_KM.map((km) => (
                <button
                  key={km}
                  type="button"
                  role="radio"
                  aria-checked={raioKm === km}
                  onClick={() => {
                    setRaioKm(km);
                    limparResultados();
                  }}
                  className={`min-h-11 rounded-jaa-compacto border px-4 text-sm font-medium sm:min-h-9 ${raioKm === km ? "border-marca bg-marca-suave text-marca" : "border-borda text-conteudo-suave"}`}
                >
                  {km} km
                </button>
              ))}
            </div>
            <Botao disabled={!local || buscando} carregando={buscando && pagina === 0 && resultados === null} textoCarregando="Pesquisando…" onClick={() => void pesquisar(0)}>
              Pesquisar
            </Botao>
            {!local && <p className="text-xs text-conteudo-suave">Escolha e confirme o local da pesquisa.</p>}
          </section>

          {erroBusca && <Aviso tom="erro">{erroBusca}</Aviso>}

          {/* 3. RESULTADOS */}
          {resultados && (
            <section aria-label="Profissionais encontrados" className="flex flex-col gap-2">
              {resultados.length === 0 ? (
                <p className="text-sm text-conteudo-suave">Ninguém encontrado até {raioKm} km deste local. Tente um raio maior.</p>
              ) : (
                <>
                  <p className="text-xs text-conteudo-suave">
                    Escolha quem vai receber sua mensagem (até {MAXIMO_SELECIONADOS}).
                  </p>
                  <ul className="flex flex-col divide-y divide-borda overflow-hidden rounded-jaa-compacto border border-borda">
                    {resultados.map((item) => {
                      const marcado = selecionados.includes(item.identidadeId);
                      const situacao = situacoes.get(item.identidadeId);
                      const horario = rotuloHorario(item.atendeNoHorario);
                      return (
                        <li key={item.identidadeId} data-profissional-encontrado={item.nomeUsuario}>
                          <label className="flex min-h-14 items-center gap-3 px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-5 w-5 shrink-0"
                              checked={marcado}
                              disabled={enviando || (!marcado && selecionados.length >= MAXIMO_SELECIONADOS)}
                              onChange={() => setSelecionados((atuais) => alternarSelecionado(atuais, item.identidadeId))}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium text-conteudo">{item.nomeExibicao}</span>
                              <span className="truncate text-xs text-conteudo-suave">
                                @{item.nomeUsuario} · {item.regiao.cidade}/{item.regiao.uf}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                              {horario && <span className={item.atendeNoHorario ? "text-marca" : "text-conteudo-suave"}>{horario}</span>}
                              {situacao?.tipo === "enviada" && <span className="text-marca">Enviada ✓</span>}
                              {situacao?.tipo === "erro" && <span className="text-perigo">Não enviada</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {temMais && (
                    <Botao aparencia="secundario" carregando={buscando} textoCarregando="Carregando…" onClick={() => void pesquisar(pagina + 1)}>
                      Mostrar mais
                    </Botao>
                  )}
                </>
              )}
            </section>
          )}

          {/* 4. MENSAGEM */}
          {selecionados.length > 0 && (
            <section aria-label="Mensagem" className="flex flex-col gap-2 border-t border-borda pt-3">
              <CampoTextoLongo
                id="mensagem-profissionais"
                rotulo={selecionados.length === 1 ? "Mensagem" : `Mensagem (vai separada para cada um dos ${selecionados.length})`}
                value={mensagem}
                maxLength={4000}
                onChange={(evento) => setMensagem(evento.target.value)}
              />
              <Botao carregando={enviando} textoCarregando="Enviando…" disabled={enviando || mensagem.trim() === ""} onClick={() => void enviar()}>
                {selecionados.length === 1 ? "Enviar mensagem" : `Enviar para ${selecionados.length}`}
              </Botao>
              {situacoes.size > 0 && (
                <p role="status" className="text-xs text-conteudo-suave">
                  Enviada para {enviadas} de {situacoes.size}. {enviadas < situacoes.size ? "Toque em enviar de novo para tentar os que faltaram." : "As conversas aparecem na sua lista."}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Endereço digitado só para ACHAR o ponto da pesquisa (CEP preenche o resto). Não é salvo. */
function EnderecoDaPesquisa({ aoLocalizar, aoCancelar }: { aoLocalizar: (mapa: MapaAberto) => void; aoCancelar: () => void }) {
  const [campos, setCampos] = useState({ cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "MG" as Uf });
  const [localizando, setLocalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { situacao, consultar } = useCep((doCep) =>
    setCampos((atual) => ({
      ...atual,
      logradouro: doCep.logradouro ?? atual.logradouro,
      bairro: doCep.bairro ?? atual.bairro,
      cidade: doCep.cidade ?? atual.cidade,
      uf: doCep.uf && ehUf(doCep.uf) ? doCep.uf : atual.uf,
    })),
  );
  const alterar = (campo: keyof typeof campos) => (valor: string) => setCampos((atual) => ({ ...atual, [campo]: valor }));

  async function localizar(evento: FormEvent) {
    evento.preventDefault();
    setLocalizando(true);
    setErro(null);
    const resposta = await localizarEnderecoDaPesquisa(campos);
    setLocalizando(false);
    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }
    const palpite = resposta.dados.coordenadas;
    aoLocalizar({
      centro: palpite ?? CENTRO_PADRAO,
      pontoInicial: palpite,
      orientacao: palpite ? "Confira o marcador: arraste ou toque para ajustar." : "Não achamos o endereço no mapa. Toque no local exato.",
      descricao: `${campos.logradouro}, ${campos.numero} – ${campos.cidade}`,
    });
  }

  return (
    <form onSubmit={(evento) => void localizar(evento)} className="grid grid-cols-6 gap-2">
      <div className="col-span-3">
        <CampoTexto
          id="pesquisa-cep"
          rotulo="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          value={campos.cep}
          onChange={(evento) => {
            alterar("cep")(evento.target.value);
            void consultar(evento.target.value);
          }}
          {...(MENSAGEM_CEP[situacao] ? { dica: MENSAGEM_CEP[situacao] ?? undefined } : {})}
          required
        />
      </div>
      <div className="col-span-3">
        <CampoTexto id="pesquisa-numero" rotulo="Número" value={campos.numero} onChange={(evento) => alterar("numero")(evento.target.value)} required />
      </div>
      <div className="col-span-6">
        <CampoTexto id="pesquisa-logradouro" rotulo="Rua" value={campos.logradouro} onChange={(evento) => alterar("logradouro")(evento.target.value)} required />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <CampoTexto id="pesquisa-bairro" rotulo="Bairro" value={campos.bairro} onChange={(evento) => alterar("bairro")(evento.target.value)} required />
      </div>
      <div className="col-span-4 sm:col-span-3">
        <CampoTexto id="pesquisa-cidade" rotulo="Cidade" value={campos.cidade} onChange={(evento) => alterar("cidade")(evento.target.value)} required />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <CampoSelecao id="pesquisa-uf" rotulo="UF" value={campos.uf} onChange={(evento) => ehUf(evento.target.value) && alterar("uf")(evento.target.value)}>
          {UNIDADES_FEDERACAO.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </CampoSelecao>
      </div>
      {erro && (
        <div className="col-span-6">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      )}
      <div className="col-span-6 flex flex-wrap gap-2">
        <Botao type="submit" carregando={localizando} textoCarregando="Localizando…">
          Localizar no mapa
        </Botao>
        <Botao aparencia="discreto" onClick={aoCancelar}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}
